"""
Module A — Drone-BIM Navigator
==============================
Compares live Twinmotion drone feed against the BIM "Ground Truth" prototype image.

Algorithm:
  1. Extract keypoints from both live frame and prototype using ORB (fast) or SIFT (accurate)
  2. Match features using BFMatcher → compute homography H (live → prototype perspective)
  3. Warp live frame into prototype's perspective
  4. cv2.absdiff(warped_live, prototype) → find pixel-level structural deviations
  5. Threshold difference image → anomaly mask → % of total pixels
  6. If anomaly_pct > DEVIATION_THRESHOLD → trigger DEVIATION alert

Output:
  - Annotated frame with red anomaly highlights
  - deviation_pct, anomaly_zones list, alert log entries
"""

import cv2
import numpy as np
from pathlib import Path
import time
import logging

log = logging.getLogger("AECI.ModuleA")


class DroneBIMNavigator:
    """Module A: Structural deviation detection via BIM comparison."""

    def __init__(self, prototype_path: str, deviation_threshold: float = 5.0):
        self.deviation_threshold = deviation_threshold
        self.prototype_gray = None
        self.prototype_color = None
        self.orb = cv2.ORB_create(nfeatures=2000)
        self.bf_matcher = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

        # Feature keypoints/descriptors from prototype (pre-computed once)
        self._proto_kp = None
        self._proto_des = None

        # Progress tracking (compare against yesterday baseline)
        self._baseline_progress: float | None = None
        self._today_progress: float = 0.0

        self._load_prototype(prototype_path)

    def _load_prototype(self, path: str):
        """Load and pre-compute features for the BIM prototype image."""
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
                annotated_frame: np.ndarray,  # frame with red anomaly zones drawn
                deviation_pct: float,
                anomaly_zones: list[dict],
                progress_pct: float,
                progress_delta: float,
                alerts: list[dict]
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
        }

        if self.prototype_gray is None or self._proto_des is None:
            # No prototype loaded — demo mode, estimate progress from frame brightness
            self._today_progress = self._estimate_progress_from_frame(frame)
            result["progress_pct"] = self._today_progress
            result["annotated_frame"] = self._draw_demo_overlay(frame)
            return result

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

        # Find contours of anomaly regions
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for i, cnt in enumerate(contours):
            area = cv2.contourArea(cnt)
            if area < 500:  # skip tiny noise
                continue

            x, y, cw, ch = cv2.boundingRect(cnt)
            zone_pct = (area / total_pixels) * 100

            # Map to BIM world coordinates (placeholder without real BIM JSON)
            world_x = round(x / w * 30.0, 2)   # site is ~30m wide
            world_y = round(y / h * 20.0, 2)   # site is ~20m deep

            # Determine element type from zone location (top = beams/slabs, sides = walls, corners = columns)
            element_type = self._classify_element_by_zone(x, y, cw, ch, w, h)
            element_id = f"{element_type.upper()[:3]}-{chr(65 + (i % 26))}{(i // 26) + 1}"
            zone_label = f"Zone-{(i % 4) + 1}"

            severity = "critical" if zone_pct > 3 else "high" if zone_pct > 1.5 else "medium" if zone_pct > 0.5 else "low"

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

            # Draw on frame: red overlay for critical/high, amber for medium, yellow for low
            color = {"critical": (0, 0, 220), "high": (0, 50, 200), "medium": (0, 140, 220), "low": (0, 200, 220)}.get(severity, (0, 0, 200))
            overlay = annotated.copy()
            cv2.drawContours(overlay, [cnt], -1, color, cv2.FILLED)
            cv2.addWeighted(overlay, 0.35, annotated, 0.65, 0, annotated)
            cv2.rectangle(annotated, (x, y), (x + cw, y + ch), color, 2)
            label = f"{element_id} {zone_pct:.1f}%"
            cv2.putText(annotated, label, (x + 4, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        # Add deviation score HUD
        self._draw_hud(annotated, deviation_pct, len(anomaly_zones))

        result["annotated_frame"] = annotated
        result["anomaly_zones"] = anomaly_zones

        # ── Progress estimation ────────────────────────────────────────────
        # Progress = how much of the frame matches the completed prototype
        match_pct = max(0.0, 100.0 - deviation_pct * 2)
        self._today_progress = round(match_pct, 1)
        result["progress_pct"] = self._today_progress

        if self._baseline_progress is not None:
            result["progress_delta"] = round(self._today_progress - self._baseline_progress, 1)

        # ── Alert generation ───────────────────────────────────────────────
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
                    "message": f"{zone['description']}",
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

    def _draw_hud(self, frame: np.ndarray, deviation_pct: float, anomaly_count: int):
        """Draw a HUD overlay on the frame with Module A status."""
        h, w = frame.shape[:2]
        # Semi-transparent bottom bar
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, h - 50), (w, h), (10, 10, 20), cv2.FILLED)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)

        color = (0, 60, 220) if deviation_pct > self.deviation_threshold else (50, 200, 50)
        status = "DEVIATION DETECTED" if deviation_pct > self.deviation_threshold else "NOMINAL"
        cv2.putText(frame, f"MODULE A | DEV: {deviation_pct:.1f}% | ZONES: {anomaly_count} | {status}",
                    (10, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)
