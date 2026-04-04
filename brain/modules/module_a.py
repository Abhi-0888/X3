"""
Module A — Drone-BIM Navigator (Enhanced Multi-View)
=====================================================
Compares live Twinmotion drone feed against a multi-view prototype database
of the finished building. Supports matching from any camera angle.

Algorithm:
  1. Match incoming frame against all prototype views (histogram + ORB)
  2. Select best-matching view for current camera angle
  3. Compute structural deviation using SSIM + pixel diff + edge comparison
  4. Identify anomaly zones with structural element classification
  5. Track construction progress as similarity to finished state

Output:
  - Annotated frame with red anomaly highlights
  - deviation_pct, anomaly_zones list, alert log entries
  - progress_pct based on structural similarity to finished prototype
"""

import cv2
import numpy as np
from pathlib import Path
import json
import time
import logging

log = logging.getLogger("AECI.ModuleA")

# Import multi-view prototype database
try:
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from models.prototype_db import PrototypeDatabase, PROTO_SIZE
    _HAS_PROTO_DB = True
except ImportError:
    _HAS_PROTO_DB = False
    log.warning("PrototypeDatabase not available — falling back to single-image mode")


class DroneBIMNavigator:
    """Module A: Structural deviation detection via multi-view BIM comparison."""

    def __init__(self, prototype_path: str, deviation_threshold: float = 5.0,
                 proto_db_path: str = "", baselines_path: str = ""):
        self.deviation_threshold = deviation_threshold
        self.prototype_gray = None
        self.prototype_color = None
        self.orb = cv2.ORB_create(nfeatures=2000)
        self.bf_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

        # Feature keypoints/descriptors from prototype (pre-computed once)
        self._proto_kp = None
        self._proto_des = None

        # Multi-view prototype database (trained)
        self._proto_db: PrototypeDatabase | None = None
        self._last_matched_view = None
        self._match_cache_frame_count = 0
        self._match_cache_interval = 10  # re-match every N frames

        # Progress tracking
        self._baseline_progress: float | None = None
        self._today_progress: float = 0.0
        self._baselines: dict = {}

        # Load trained prototype database if available
        self._load_proto_db(proto_db_path)

        # Load baselines
        self._load_baselines(baselines_path)

        # Fallback: load single prototype image
        if self._proto_db is None or len(self._proto_db) == 0:
            self._load_prototype(prototype_path)

    def _load_proto_db(self, path: str):
        """Load the trained multi-view prototype database."""
        if not _HAS_PROTO_DB:
            return
        if not path:
            # Try default path
            default = Path(__file__).parent.parent / "assets" / "trained" / "prototype_database.pkl"
            if default.exists():
                path = str(default)
            else:
                return

        p = Path(path)
        if not p.exists():
            log.info(f"Prototype DB not found: {path} — will use single-image mode")
            return

        try:
            self._proto_db = PrototypeDatabase.load(path)
            log.info(f"Multi-view prototype DB loaded: {len(self._proto_db)} views")
        except Exception as e:
            log.error(f"Failed to load prototype DB: {e}")

    def _load_baselines(self, path: str):
        """Load precomputed unfinished baselines."""
        if not path:
            default = Path(__file__).parent.parent / "assets" / "trained" / "unfinished_baselines.json"
            if default.exists():
                path = str(default)
            else:
                return
        p = Path(path)
        if p.exists():
            try:
                with open(path) as f:
                    self._baselines = json.load(f)
                avg = self._baselines.get("avg_progress_pct", 0)
                self._baseline_progress = avg
                log.info(f"Baselines loaded: avg progress={avg}%")
            except Exception as e:
                log.warning(f"Could not load baselines: {e}")

    def _load_prototype(self, path: str):
        """Load and pre-compute features for the BIM prototype image (fallback)."""
        p = Path(path)
        if not p.exists():
            log.warning(f"Prototype image not found: {path}. Module A running in demo mode.")
            return

        img = cv2.imread(str(p))
        if img is None:
            log.error(f"Could not decode prototype image: {path}")
            return

        self.prototype_color = img
        self.prototype_gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        self._proto_kp, self._proto_des = self.orb.detectAndCompute(self.prototype_gray, None)
        log.info(f"Prototype loaded: {path} | {len(self._proto_kp)} keypoints")

    def set_baseline(self, progress: float):
        """Set yesterday's progress baseline for delta calculation."""
        self._baseline_progress = progress

    def process(self, frame: np.ndarray) -> dict:
        """
        Process a single drone frame.
        Returns:
            {
                annotated_frame: np.ndarray,
                deviation_pct: float,
                anomaly_zones: list[dict],
                progress_pct: float,
                progress_delta: float,
                alerts: list[dict],
                matched_view: str,
                ssim_score: float,
            }
        """
        result = {
            "annotated_frame": frame.copy(),
            "deviation_pct": 0.0,
            "anomaly_zones": [],
            "progress_pct": self._today_progress,
            "progress_delta": 0.0,
            "alerts": [],
            "matches_found": 0,
            "matched_view": "",
            "ssim_score": 0.0,
        }

        # ── Multi-view mode (trained prototype DB) ─────────────────────────
        if self._proto_db is not None and len(self._proto_db) > 0:
            return self._process_multiview(frame, result)

        # ── Single-image fallback mode ─────────────────────────────────────
        if self.prototype_gray is None or self._proto_des is None:
            self._today_progress = self._estimate_progress_from_frame(frame)
            result["progress_pct"] = self._today_progress
            result["annotated_frame"] = self._draw_demo_overlay(frame)
            return result

        return self._process_single_prototype(frame, result)

    def _process_multiview(self, frame: np.ndarray, result: dict) -> dict:
        """Process frame using multi-view prototype database."""
        self._match_cache_frame_count += 1

        # Find best matching prototype view (re-match periodically)
        if (self._last_matched_view is None or
                self._match_cache_frame_count % self._match_cache_interval == 0):
            matches = self._proto_db.find_best_match(frame, top_k=1)
            if matches:
                score, best_view = matches[0]
                self._last_matched_view = best_view
                result["matched_view"] = best_view.view_id
            else:
                result["annotated_frame"] = self._draw_demo_overlay(frame)
                return result

        if self._last_matched_view is None:
            return result

        proto_view = self._last_matched_view
        result["matched_view"] = proto_view.view_id

        # Compute structural deviation
        deviation = self._proto_db.compute_deviation(frame, proto_view)
        deviation_pct = deviation["deviation_pct"]
        result["deviation_pct"] = deviation_pct
        result["ssim_score"] = deviation["ssim_score"]

        # ── Annotate anomaly zones ────────────────────────────────────────
        annotated = frame.copy()
        anomaly_zones = []
        h, w = PROTO_SIZE[1], PROTO_SIZE[0]
        total_pixels = h * w

        for i, cnt in enumerate(deviation["anomaly_contours"]):
            area = cv2.contourArea(cnt)
            if area < 500:
                continue

            x, y, cw, ch = cv2.boundingRect(cnt)
            zone_pct = (area / total_pixels) * 100

            world_x = round(x / w * 30.0, 2)
            world_y = round(y / h * 20.0, 2)

            element_type = self._classify_element_by_zone(x, y, cw, ch, w, h)
            element_id = f"{element_type.upper()[:3]}-{chr(65 + (i % 26))}{(i // 26) + 1}"
            zone_label = f"Zone-{(i % 4) + 1}"

            severity = ("critical" if zone_pct > 3 else "high" if zone_pct > 1.5
                        else "medium" if zone_pct > 0.5 else "low")

            zone_data = {
                "element_id": element_id,
                "element_type": element_type,
                "zone": zone_label,
                "deviation_pct": round(zone_pct, 2),
                "severity": severity,
                "world_coords": {"x": world_x, "y": 0.0, "z": world_y},
                "description": f"{element_type.capitalize()} deviation: {zone_pct:.1f}% mismatch vs {proto_view.view_label} prototype"
            }
            anomaly_zones.append(zone_data)

            # Scale contour back to frame dimensions
            frame_h, frame_w = frame.shape[:2]
            scale_x = frame_w / PROTO_SIZE[0]
            scale_y = frame_h / PROTO_SIZE[1]
            scaled_cnt = (cnt.astype(np.float32) * np.array([scale_x, scale_y])).astype(np.int32)
            scaled_x = int(x * scale_x)
            scaled_y = int(y * scale_y)
            scaled_cw = int(cw * scale_x)
            scaled_ch = int(ch * scale_y)

            color = {"critical": (0, 0, 220), "high": (0, 50, 200),
                     "medium": (0, 140, 220), "low": (0, 200, 220)}.get(severity, (0, 0, 200))
            overlay = annotated.copy()
            cv2.drawContours(overlay, [scaled_cnt], -1, color, cv2.FILLED)
            cv2.addWeighted(overlay, 0.35, annotated, 0.65, 0, annotated)
            cv2.rectangle(annotated, (scaled_x, scaled_y),
                         (scaled_x + scaled_cw, scaled_y + scaled_ch), color, 2)
            label = f"{element_id} {zone_pct:.1f}%"
            cv2.putText(annotated, label, (scaled_x + 4, scaled_y - 6),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        # Progress from SSIM
        self._today_progress = deviation["progress_pct"]
        result["progress_pct"] = self._today_progress
        result["anomaly_zones"] = anomaly_zones

        if self._baseline_progress is not None:
            result["progress_delta"] = round(self._today_progress - self._baseline_progress, 1)

        # HUD
        self._draw_hud(annotated, deviation_pct, len(anomaly_zones),
                       proto_view.view_label, deviation["ssim_score"])
        result["annotated_frame"] = annotated

        # ── Alert generation ──────────────────────────────────────────────
        if deviation_pct > self.deviation_threshold:
            result["alerts"].append({
                "type": "DEVIATION",
                "severity": "critical" if deviation_pct > 15 else "high",
                "title": f"Structural Deviation — {deviation_pct:.1f}% Anomaly",
                "message": (f"Module A: {deviation_pct:.1f}% deviation from {proto_view.view_label} "
                           f"prototype (SSIM: {deviation['ssim_score']:.2f}). "
                           f"{len(anomaly_zones)} anomaly zone(s) detected."),
                "zone": "Site-Wide",
                "module": "A"
            })

        for zone in anomaly_zones:
            if zone["severity"] in ("critical", "high"):
                result["alerts"].append({
                    "type": "DEVIATION",
                    "severity": zone["severity"],
                    "title": f"Structural Anomaly — {zone['element_id']}",
                    "message": zone["description"],
                    "zone": zone["zone"],
                    "module": "A"
                })

        return result

    def _process_single_prototype(self, frame: np.ndarray, result: dict) -> dict:
        """Fallback: single prototype image comparison (original algorithm)."""
        frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        kp_live, des_live = self.orb.detectAndCompute(frame_gray, None)

        if des_live is None or len(des_live) < 10:
            log.debug("Not enough keypoints in live frame")
            return result

        # ── Feature matching ──────────────────────────────────────────────
        matches = self.bf_matcher.match(des_live, self._proto_des)
        matches = sorted(matches, key=lambda x: x.distance)
        good_matches = matches[:min(150, len(matches))]
        result["matches_found"] = len(good_matches)

        if len(good_matches) < 10:
            log.debug("Too few good matches to compute homography")
            return result

        # ── Homography: live frame → prototype perspective ────────────────
        src_pts = np.float32([kp_live[m.queryIdx].pt for m in good_matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([self._proto_kp[m.trainIdx].pt for m in good_matches]).reshape(-1, 1, 2)

        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)

        if H is None:
            log.debug("Homography computation failed")
            return result

        # ── Warp live → prototype space ───────────────────────────────────
        h, w = self.prototype_gray.shape
        warped = cv2.warpPerspective(frame, H, (w, h))
        warped_gray = cv2.cvtColor(warped, cv2.COLOR_BGR2GRAY)

        # ── Pixel-diff deviation map ──────────────────────────────────────
        diff = cv2.absdiff(warped_gray, self.prototype_gray)
        _, thresh = cv2.threshold(diff, 40, 255, cv2.THRESH_BINARY)

        # Morphological cleanup: remove noise, dilate real anomalies
        kernel = np.ones((7, 7), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        thresh = cv2.dilate(thresh, kernel, iterations=2)

        total_pixels = h * w
        anomaly_pixels = np.count_nonzero(thresh)
        deviation_pct = (anomaly_pixels / total_pixels) * 100

        result["deviation_pct"] = round(deviation_pct, 2)

        # ── Annotate anomaly zones on the original frame ──────────────────
        annotated = frame.copy()
        anomaly_zones = []

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for i, cnt in enumerate(contours):
            area = cv2.contourArea(cnt)
            if area < 500:
                continue

            x, y, cw, ch = cv2.boundingRect(cnt)
            zone_pct = (area / total_pixels) * 100

            world_x = round(x / w * 30.0, 2)
            world_y = round(y / h * 20.0, 2)

            element_type = self._classify_element_by_zone(x, y, cw, ch, w, h)
            element_id = f"{element_type.upper()[:3]}-{chr(65 + (i % 26))}{(i // 26) + 1}"
            zone_label = f"Zone-{(i % 4) + 1}"

            severity = ("critical" if zone_pct > 3 else "high" if zone_pct > 1.5
                        else "medium" if zone_pct > 0.5 else "low")

            zone_data = {
                "element_id": element_id,
                "element_type": element_type,
                "zone": zone_label,
                "deviation_pct": round(zone_pct, 2),
                "severity": severity,
                "world_coords": {"x": world_x, "y": 0.0, "z": world_y},
                "description": f"{element_type.capitalize()} deviation detected: {zone_pct:.1f}% area mismatch in {zone_label}"
            }
            anomaly_zones.append(zone_data)

            color = {"critical": (0, 0, 220), "high": (0, 50, 200),
                     "medium": (0, 140, 220), "low": (0, 200, 220)}.get(severity, (0, 0, 200))
            overlay = annotated.copy()
            cv2.drawContours(overlay, [cnt], -1, color, cv2.FILLED)
            cv2.addWeighted(overlay, 0.35, annotated, 0.65, 0, annotated)
            cv2.rectangle(annotated, (x, y), (x + cw, y + ch), color, 2)
            label = f"{element_id} {zone_pct:.1f}%"
            cv2.putText(annotated, label, (x + 4, y - 6),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        self._draw_hud(annotated, deviation_pct, len(anomaly_zones))

        result["annotated_frame"] = annotated
        result["anomaly_zones"] = anomaly_zones

        match_pct = max(0.0, 100.0 - deviation_pct * 2)
        self._today_progress = round(match_pct, 1)
        result["progress_pct"] = self._today_progress

        if self._baseline_progress is not None:
            result["progress_delta"] = round(self._today_progress - self._baseline_progress, 1)

        if deviation_pct > self.deviation_threshold:
            result["alerts"].append({
                "type": "DEVIATION",
                "severity": "critical" if deviation_pct > 15 else "high",
                "title": f"Structural Deviation — {deviation_pct:.1f}% Anomaly",
                "message": f"Module A: {deviation_pct:.1f}% pixel deviation from BIM prototype. {len(anomaly_zones)} anomaly zone(s) detected.",
                "zone": "Site-Wide",
                "module": "A"
            })

        for zone in anomaly_zones:
            if zone["severity"] in ("critical", "high"):
                result["alerts"].append({
                    "type": "DEVIATION",
                    "severity": zone["severity"],
                    "title": f"Structural Anomaly — {zone['element_id']}",
                    "message": zone["description"],
                    "zone": zone["zone"],
                    "module": "A"
                })

        return result

    def _classify_element_by_zone(self, x, y, w_box, h_box, frame_w, frame_h) -> str:
        """Classify detected anomaly as column/wall/beam/slab based on position."""
        cx, cy = x + w_box / 2, y + h_box / 2
        aspect = w_box / max(h_box, 1)

        if cy < frame_h * 0.3:
            return "slab"
        if aspect > 3:
            return "beam"
        if aspect < 0.4:
            return "column"
        if cx < frame_w * 0.15 or cx > frame_w * 0.85:
            return "column"
        return "wall"

    def _estimate_progress_from_frame(self, frame: np.ndarray) -> float:
        """Demo mode: estimate progress from frame brightness (more built = more pixels filled)."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray)
        return round(min(100.0, max(20.0, (mean_brightness / 255.0) * 80 + 20)), 1)

    def _draw_demo_overlay(self, frame: np.ndarray) -> np.ndarray:
        annotated = frame.copy()
        cv2.putText(annotated, "MODULE A: NO PROTOTYPE — DEMO MODE",
                    (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 180, 255), 2, cv2.LINE_AA)
        return annotated

    def _draw_hud(self, frame: np.ndarray, deviation_pct: float, anomaly_count: int,
                  view_label: str = "", ssim: float = 0.0):
        """Draw a HUD overlay on the frame with Module A status."""
        h, w = frame.shape[:2]
        # Semi-transparent bottom bar
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, h - 50), (w, h), (10, 10, 20), cv2.FILLED)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

        color = (0, 60, 220) if deviation_pct > self.deviation_threshold else (50, 200, 50)
        status = "DEVIATION DETECTED" if deviation_pct > self.deviation_threshold else "NOMINAL"

        hud_text = f"MODULE A | DEV: {deviation_pct:.1f}% | ZONES: {anomaly_count} | {status}"
        if view_label:
            hud_text += f" | VIEW: {view_label.upper()}"
        if ssim > 0:
            hud_text += f" | SSIM: {ssim:.2f}"

        cv2.putText(frame, hud_text,
                    (10, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)
