"""
Module B — 360° Guardian
========================
Multi-camera PPE detection and buffer zone safety enforcement.

Sub-system 1 — PPE Detection:
  - YOLOv8 detects: person, helmet, vest (hi-vis), gloves
  - For each detected person: check if required PPE items overlap their bounding box
  - If PPE missing → PPE_VIOLATION alert

Sub-system 2 — Buffer Zone Engine:
  - Danger zones defined as polygons in pixel-coordinate space
  - For each detected worker centroid (cx, cy):
    - cv2.pointPolygonTest(polygon, (cx, cy), False) > 0 → breach
  - If breach → ZONE_BREACH alert

Output:
  - Annotated frame with YOLO bboxes, skeleton overlays, zone overlays
  - safety_score, workers_detected, violations list, zone_breaches list
"""

import cv2
import numpy as np
import time
import logging
from pathlib import Path
from dataclasses import dataclass, field

log = logging.getLogger("AECI.ModuleB")

# Labels expected from YOLO model
PPE_CLASSES = {
    "helmet": ["helmet", "hard_hat", "hardhat", "head_protection"],
    "vest": ["vest", "hi_vis", "safety_vest", "high_visibility"],
    "person": ["person", "worker", "unsafe_worker"],
    "gloves": ["gloves", "safety_gloves"],
}

@dataclass
class Worker:
    track_id: int
    bbox: tuple[int, int, int, int]   # x1, y1, x2, y2
    centroid: tuple[int, int]
    has_helmet: bool = False
    has_vest: bool = False
    has_gloves: bool = True           # assumed unless explicitly detected absent
    in_danger_zone: str | None = None
    confidence: float = 0.0

    @property
    def missing_ppe(self) -> list[str]:
        items = []
        if not self.has_helmet: items.append("helmet")
        if not self.has_vest: items.append("vest")
        return items

    @property
    def is_compliant(self) -> bool:
        return self.has_helmet and self.has_vest

    @property
    def severity(self) -> str:
        if not self.has_helmet: return "critical"
        if not self.has_vest: return "high"
        return "compliant"


class Guardian360:
    """Module B: Real-time PPE detection + Buffer Zone enforcement."""

    def __init__(
        self,
        yolo_model_path: str,
        danger_zones: list[dict],
        confidence_threshold: float = 0.45,
    ):
        self.confidence = confidence_threshold
        self.danger_zones = danger_zones
        self._zone_polys: list[tuple[str, str, np.ndarray]] = []
        self._model = None
        self._track_history: dict[int, list] = {}

        self._load_model(yolo_model_path)
        self._compile_zones(danger_zones)

    def _load_model(self, path: str):
        try:
            from ultralytics import YOLO
            p = Path(path)

            # Try trained model first, then custom path, then pretrained
            trained_model = Path(__file__).parent.parent / "assets" / "trained" / "construction_ppe_yolov8.pt"
            if trained_model.exists():
                model_path = str(trained_model)
                log.info(f"Using trained construction PPE model: {model_path}")
            elif p.exists():
                model_path = str(p)
            else:
                model_path = "yolov8n.pt"
                log.warning(f"Custom YOLO weights not found at {path}. Using pretrained yolov8n.")

            self._model = YOLO(model_path)
            log.info(f"YOLO model loaded: {model_path}")

            # Load PPE config if available
            self._load_ppe_config()
        except ImportError:
            log.error("ultralytics not installed. Run: pip install ultralytics")
        except Exception as e:
            log.error(f"Failed to load YOLO model: {e}")

    def _load_ppe_config(self):
        """Load the trained PPE detection configuration."""
        config_path = Path(__file__).parent.parent / "assets" / "trained" / "ppe_model_config.json"
        if config_path.exists():
            try:
                import json
                with open(config_path) as f:
                    self._ppe_config = json.load(f)
                log.info("PPE detection config loaded (region-based helmet/vest analysis)")
            except Exception as e:
                log.warning(f"Could not load PPE config: {e}")
                self._ppe_config = {}
        else:
            self._ppe_config = {}

    def _compile_zones(self, zones: list[dict]):
        """Pre-compile danger zone polygons as numpy arrays."""
        self._zone_polys = []
        for zone in zones:
            try:
                pts = np.array(zone["polygon"], dtype=np.int32)
                self._zone_polys.append((zone["name"], zone.get("risk", "high"), pts))
            except (KeyError, TypeError) as e:
                log.warning(f"Invalid zone definition: {e}")

    def process(self, frame: np.ndarray) -> dict:
        """
        Process one camera frame through Module B.
        Returns:
            {
                annotated_frame: np.ndarray,
                workers: list[Worker],
                safety_score: float,
                violations: list[dict],
                zone_breaches: list[dict],
                alerts: list[dict]
            }
        """
        annotated = frame.copy()

        # Draw danger zone overlays first (behind worker boxes)
        self._draw_danger_zones(annotated)

        workers: list[Worker] = []
        violations: list[dict] = []
        zone_breaches: list[dict] = []
        alerts: list[dict] = []

        if self._model is None:
            # Demo mode: no model, show stub
            self._draw_hud(annotated, 100.0, 0, 0)
            return {
                "annotated_frame": annotated,
                "workers": [],
                "safety_score": 100.0,
                "violations": [],
                "zone_breaches": [],
                "alerts": [],
            }

        # ── YOLO inference ────────────────────────────────────────────────
        results = self._model.track(frame, persist=True, conf=self.confidence, verbose=False)

        if not results or results[0].boxes is None:
            self._draw_hud(annotated, 100.0, 0, 0)
            return {
                "annotated_frame": annotated,
                "workers": [],
                "safety_score": 100.0,
                "violations": [],
                "zone_breaches": [],
                "alerts": [],
            }

        boxes = results[0].boxes
        names = results[0].names

        # Parse all detections into typed lists
        persons = []
        ppe_items = []

        for box in boxes:
            cls_id = int(box.cls[0])
            cls_name = names[cls_id].lower()
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            track_id = int(box.id[0]) if box.id is not None else -1

            # Classify as person or PPE item
            if any(cls_name in labels for labels in [PPE_CLASSES["person"]]):
                persons.append({
                    "track_id": track_id, "bbox": (x1, y1, x2, y2),
                    "centroid": ((x1 + x2) // 2, (y1 + y2) // 2), "conf": conf
                })
            elif any(cls_name in labels for labels in [PPE_CLASSES["helmet"]]):
                ppe_items.append({"type": "helmet", "bbox": (x1, y1, x2, y2)})
            elif any(cls_name in labels for labels in [PPE_CLASSES["vest"]]):
                ppe_items.append({"type": "vest", "bbox": (x1, y1, x2, y2)})
            elif any(cls_name in labels for labels in [PPE_CLASSES["gloves"]]):
                ppe_items.append({"type": "gloves", "bbox": (x1, y1, x2, y2)})

        # ── PPE Association: link PPE items to persons ─────────────────────
        for person in persons:
            px1, py1, px2, py2 = person["bbox"]
            worker = Worker(
                track_id=person["track_id"],
                bbox=person["bbox"],
                centroid=person["centroid"],
                confidence=person["conf"],
            )

            # Method 1: Check if YOLO-detected PPE items overlap this person
            for ppe in ppe_items:
                overlap = self._iou_upper(ppe["bbox"], (px1, py1, px2, py2))
                if overlap > 0.1:
                    if ppe["type"] == "helmet":
                        worker.has_helmet = True
                    elif ppe["type"] == "vest":
                        worker.has_vest = True
                    elif ppe["type"] == "gloves":
                        worker.has_gloves = True

            # Method 2: Region-based color/shape analysis (when YOLO lacks PPE classes)
            if not worker.has_helmet or not worker.has_vest:
                helmet_det, vest_det = self._detect_ppe_by_region(frame, (px1, py1, px2, py2))
                if helmet_det and not worker.has_helmet:
                    worker.has_helmet = True
                if vest_det and not worker.has_vest:
                    worker.has_vest = True

            # ── Buffer Zone check ─────────────────────────────────────────
            cx, cy = worker.centroid
            for zone_name, zone_risk, zone_poly in self._zone_polys:
                dist = cv2.pointPolygonTest(zone_poly, (float(cx), float(cy)), False)
                if dist >= 0:
                    worker.in_danger_zone = zone_name
                    zone_breach = {
                        "worker_track_id": worker.track_id,
                        "zone_name": zone_name,
                        "risk_level": zone_risk,
                        "centroid": (cx, cy),
                        "timestamp": time.time(),
                    }
                    zone_breaches.append(zone_breach)
                    alerts.append({
                        "type": "ZONE_BREACH",
                        "severity": zone_risk,
                        "title": f"Danger Zone Breach — {zone_name}",
                        "message": f"Worker (ID:{worker.track_id}) entered restricted {zone_name}. Risk: {zone_risk.upper()}.",
                        "zone": zone_name,
                        "module": "B"
                    })
                    break

            workers.append(worker)

            # ── PPE Violation alert ───────────────────────────────────────
            if worker.missing_ppe:
                violation = {
                    "worker_track_id": worker.track_id,
                    "missing_items": worker.missing_ppe,
                    "severity": worker.severity,
                    "centroid": worker.centroid,
                    "timestamp": time.time(),
                }
                violations.append(violation)
                alerts.append({
                    "type": "PPE_VIOLATION",
                    "severity": worker.severity,
                    "title": f"PPE Violation — Worker ID:{worker.track_id}",
                    "message": f"Missing PPE: {', '.join(worker.missing_ppe).upper()}. Detected on current camera.",
                    "zone": "Current View",
                    "module": "B"
                })

            # ── Draw worker annotation ─────────────────────────────────────
            self._draw_worker(annotated, worker)

        # ── Safety score calculation ───────────────────────────────────────
        total = len(workers) or 1
        compliant = sum(1 for w in workers if w.is_compliant)
        ppe_score = (compliant / total) * 100
        zone_score = max(0, 100 - len(zone_breaches) * 20)
        safety_score = ppe_score * 0.6 + zone_score * 0.4

        self._draw_hud(annotated, safety_score, len(workers), len(violations))

        return {
            "annotated_frame": annotated,
            "workers": workers,
            "safety_score": round(safety_score, 1),
            "violations": violations,
            "zone_breaches": zone_breaches,
            "alerts": alerts,
        }

    def _detect_ppe_by_region(self, frame: np.ndarray, person_bbox: tuple) -> tuple[bool, bool]:
        """
        Region-based PPE detection using color analysis within the person bounding box.
        Analyzes head region for hard hat colors, torso region for hi-vis vest colors.
        Returns (has_helmet, has_vest).
        """
        px1, py1, px2, py2 = person_bbox
        ph = py2 - py1
        pw = px2 - px1
        if ph < 30 or pw < 15:
            return False, False

        h, w = frame.shape[:2]
        # Clamp to frame bounds
        px1, py1 = max(0, px1), max(0, py1)
        px2, py2 = min(w, px2), min(h, py2)

        # ── Helmet detection: analyze top 20% of person bbox ──────────────
        head_y2 = py1 + int(ph * 0.20)
        head_region = frame[py1:head_y2, px1:px2]
        has_helmet = False

        if head_region.size > 0:
            hsv_head = cv2.cvtColor(head_region, cv2.COLOR_BGR2HSV)

            # Check for common hard hat colors
            helmet_masks = [
                # Yellow helmet (most common)
                cv2.inRange(hsv_head, np.array([20, 100, 100]), np.array([35, 255, 255])),
                # White helmet
                cv2.inRange(hsv_head, np.array([0, 0, 200]), np.array([180, 50, 255])),
                # Orange helmet
                cv2.inRange(hsv_head, np.array([10, 100, 100]), np.array([25, 255, 255])),
                # Red helmet
                cv2.inRange(hsv_head, np.array([0, 100, 100]), np.array([10, 255, 255])),
                # Blue helmet
                cv2.inRange(hsv_head, np.array([100, 50, 50]), np.array([130, 255, 255])),
            ]

            for mask in helmet_masks:
                ratio = np.count_nonzero(mask) / max(mask.size, 1)
                if ratio > 0.15:  # >15% of head region matches helmet color
                    has_helmet = True
                    break

        # ── Vest detection: analyze torso (30%–70% of person height) ──────
        torso_y1 = py1 + int(ph * 0.30)
        torso_y2 = py1 + int(ph * 0.70)
        torso_region = frame[torso_y1:torso_y2, px1:px2]
        has_vest = False

        if torso_region.size > 0:
            hsv_torso = cv2.cvtColor(torso_region, cv2.COLOR_BGR2HSV)

            # Check for hi-vis vest colors
            vest_masks = [
                # Bright yellow/lime vest
                cv2.inRange(hsv_torso, np.array([20, 80, 80]), np.array([35, 255, 255])),
                # Orange vest
                cv2.inRange(hsv_torso, np.array([10, 80, 80]), np.array([25, 255, 255])),
                # Green vest
                cv2.inRange(hsv_torso, np.array([35, 60, 60]), np.array([85, 255, 255])),
            ]

            for mask in vest_masks:
                ratio = np.count_nonzero(mask) / max(mask.size, 1)
                if ratio > 0.10:  # >10% of torso matches vest color
                    has_vest = True
                    break

        return has_helmet, has_vest

    def _iou_upper(self, ppe_bbox, person_bbox) -> float:
        """Calculate overlap between PPE item and person's upper third (head/chest area)."""
        px1, py1, px2, py2 = person_bbox
        # Restrict person to upper 50% for helmet/vest check
        upper_py2 = py1 + (py2 - py1) * 0.5
        ix1 = max(ppe_bbox[0], px1)
        iy1 = max(ppe_bbox[1], py1)
        ix2 = min(ppe_bbox[2], px2)
        iy2 = min(ppe_bbox[3], upper_py2)
        if ix2 < ix1 or iy2 < iy1:
            return 0.0
        inter = (ix2 - ix1) * (iy2 - iy1)
        ppe_area = (ppe_bbox[2] - ppe_bbox[0]) * (ppe_bbox[3] - ppe_bbox[1])
        return inter / max(ppe_area, 1)

    def _draw_worker(self, frame: np.ndarray, worker: Worker):
        x1, y1, x2, y2 = worker.bbox
        cx, cy = worker.centroid

        if worker.in_danger_zone:
            color = (0, 0, 240)   # red = zone breach
        elif not worker.is_compliant:
            color = (0, 100, 230) # orange-red = PPE violation
        else:
            color = (50, 210, 50) # green = compliant

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
        cv2.circle(frame, (cx, cy), 5, color, -1)

        # Label
        ppe_label = ""
        if not worker.has_helmet: ppe_label += "NO HELMET "
        if not worker.has_vest: ppe_label += "NO VEST "
        if worker.in_danger_zone: ppe_label += f"!ZONE: {worker.in_danger_zone}"
        if not ppe_label: ppe_label = "COMPLIANT"

        label = f"W{worker.track_id}: {ppe_label.strip()}"
        label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)[0]
        cv2.rectangle(frame, (x1, y1 - label_size[1] - 8), (x1 + label_size[0] + 6, y1), color, cv2.FILLED)
        cv2.putText(frame, label, (x1 + 3, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)

    def _draw_danger_zones(self, frame: np.ndarray):
        for zone_name, zone_risk, pts in self._zone_polys:
            color = (0, 0, 200) if zone_risk == "critical" else (0, 140, 230) if zone_risk == "high" else (0, 200, 200)
            overlay = frame.copy()
            cv2.fillPoly(overlay, [pts], color)
            cv2.addWeighted(overlay, 0.18, frame, 0.82, 0, frame)
            cv2.polylines(frame, [pts], True, color, 2)
            cv2.putText(frame, f"ZONE: {zone_name}", (pts[0][0] + 5, pts[0][1] + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

    def _draw_hud(self, frame, safety_score, worker_count, violation_count):
        h, w = frame.shape[:2]
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, h - 50), (w, h), (10, 10, 20), cv2.FILLED)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        color = (50, 210, 50) if safety_score > 85 else (0, 165, 255) if safety_score > 70 else (0, 60, 220)
        cv2.putText(frame,
                    f"MODULE B | SAFETY: {safety_score:.0f}% | WORKERS: {worker_count} | VIOLATIONS: {violation_count}",
                    (10, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)
