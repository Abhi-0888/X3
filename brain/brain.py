#!/usr/bin/env python3
"""
AECI AI Brain — Main Orchestrator
===================================
Run this script LOCALLY on your machine (with GPU/webcam access).
It captures the Twinmotion feed via OBS Virtual Camera, runs all three
AI modules in a pipeline, and sends results to the AECI dashboard.

Usage:
  1. Start Twinmotion and set up OBS Virtual Camera
  2. Copy .env.example → .env and configure
  3. python brain.py
  4. Open the AECI dashboard in your browser

Keyboard shortcuts (when preview window is open):
  Q     — quit
  A     — toggle Module A (Drone-BIM)
  B     — toggle Module B (Guardian)
  C     — toggle Module C (Analyst)
  D     — switch to Drone view (Module A mode)
  1-5   — switch camera (1=Front, 2=Back, 3=Top, 4=Left, 5=Right)
  R     — reset / clear database (Production Mode)
  T     — enable Test Mode (uses seeded DB data)
  S     — save current frame as new prototype
  H     — toggle HUD
"""

import sys
import os
import time
import threading
import base64
import json
import logging
import signal
from pathlib import Path
from datetime import datetime, UTC

import cv2
import numpy as np

# ── Add brain/ to path ────────────────────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from config import cfg
from modules.module_a import DroneBIMNavigator
from modules.module_b import Guardian360
from modules.module_c import ActivityAnalyst
from utils.uplink import AECIUplink

# ── Logging setup ─────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("AECI.Brain")


class AECIBrain:
    """Main brain orchestrator — runs all modules on the live feed."""

    CAMERA_VIEWS = {
        "1": "front", "2": "back", "3": "top", "4": "left", "5": "right", "d": "drone"
    }

    def __init__(self):
        self.running = False
        self.current_view = cfg.CAMERA_VIEW   # "drone" | "front" | ... | "auto"
        self.frame_count = 0
        self.last_heartbeat = 0.0
        self.sent_alerts: set[str] = set()    # deduplication by content hash
        self.show_hud = True

        # Module enable toggles (can be toggled at runtime)
        self.mod_a = cfg.MODULE_A_ENABLED
        self.mod_b = cfg.MODULE_B_ENABLED
        self.mod_c = cfg.MODULE_C_ENABLED

        # Current metrics state
        self.state = {
            "safety_score": 100.0,
            "deviation_pct": 0.0,
            "progress_pct": 0.0,
            "team_efficiency": 0.0,
            "active_workers": 0,
            "idle_workers": 0,
            "deviation_count": 0,
            "ppe_violations": 0,
            "zone_breaches": 0,
            "module_a_active": self.mod_a,
            "module_b_active": self.mod_b,
            "module_c_active": self.mod_c,
            "camera_view": self.current_view,
            "brain_version": "1.0.0",
            "mode": "production",  # "test" | "production"
        }

        self._setup_dirs()
        self._print_banner()

        # ── Validate config ───────────────────────────────────────────────
        warnings = cfg.validate()
        for w in warnings:
            log.warning(f"Config: {w}")

        # ── Init uplink ───────────────────────────────────────────────────
        self.uplink = AECIUplink(cfg.MODE, cfg.API_URL, cfg.MONGODB_URI)
        ok, msg = self.uplink.test_connection()
        if ok:
            log.info(f"Uplink: {msg}")
        else:
            log.error(f"Uplink: {msg}")
            log.warning("Brain will run without dashboard connection. Check your .env settings.")

        # ── Init AI modules ───────────────────────────────────────────────
        log.info("Loading Module A — Drone-BIM Navigator...")
        self.module_a = DroneBIMNavigator(
            prototype_path=cfg.PROTOTYPE_IMAGE_PATH,
            deviation_threshold=cfg.DEVIATION_THRESHOLD,
        )

        log.info("Loading Module B — 360° Guardian...")
        self.module_b = Guardian360(
            yolo_model_path=cfg.YOLO_MODEL_PATH,
            danger_zones=cfg.DANGER_ZONES,
            confidence_threshold=cfg.YOLO_CONFIDENCE,
        )

        log.info("Loading Module C — Activity Analyst...")
        self.module_c = ActivityAnalyst(
            idle_threshold=cfg.IDLE_THRESHOLD,
            idle_timeout_sec=cfg.IDLE_TIMEOUT_SEC,
        )

        # ── Init video capture ────────────────────────────────────────────
        source = cfg.video_source()
        log.info(f"Opening video source: {source}")
        self.cap = cv2.VideoCapture(source)

        if not self.cap.isOpened():
            log.error(f"Cannot open video source: {source}")
            log.info("Tips:")
            log.info("  • OBS: Click 'Start Virtual Camera' in OBS")
            log.info("  • Camera index: Try VIDEO_SOURCE=1 or VIDEO_SOURCE=2 in .env")
            log.info("  • File: Set VIDEO_SOURCE=path/to/twinmotion_recording.mp4")
            sys.exit(1)

        # Set capture properties
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        fps = self.cap.get(cv2.CAP_PROP_FPS)
        log.info(f"Camera: {int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
                 f"{int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))} @ {fps:.0f}fps")

    # ── Main loop ─────────────────────────────────────────────────────────

    def run(self):
        self.running = True
        log.info("Brain running. Press Q to quit, A/B/C to toggle modules.")

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)

        while self.running:
            ret, frame = self.cap.read()
            if not ret:
                log.warning("Frame read failed. Retrying...")
                time.sleep(0.1)
                continue

            self.frame_count += 1

            # Process only every Nth frame to save CPU
            if self.frame_count % cfg.FRAME_SKIP != 0:
                continue

            try:
                self._process_frame(frame)
            except Exception as e:
                log.error(f"Frame processing error: {e}", exc_info=True)

            # Handle keyboard input (if preview window is open)
            key = cv2.waitKey(1) & 0xFF
            if key != 255:
                self._handle_key(chr(key) if key < 128 else str(key))

        self._cleanup()

    def _process_frame(self, frame: np.ndarray):
        """Run all enabled modules on a single frame and uplink results."""
        all_alerts = []
        composite = frame.copy()
        h, w = frame.shape[:2]

        # ── Module A: Drone-BIM (only when drone view is active) ──────────
        if self.mod_a and self._is_drone_view():
            result_a = self.module_a.process(frame)
            composite = result_a["annotated_frame"]
            self.state["deviation_pct"] = result_a["deviation_pct"]
            self.state["deviation_count"] = len(result_a["anomaly_zones"])
            self.state["progress_pct"] = result_a["progress_pct"]
            all_alerts.extend(result_a["alerts"])

        # ── Module B: Guardian (all camera views) ─────────────────────────
        if self.mod_b:
            result_b = self.module_b.process(composite)
            composite = result_b["annotated_frame"]
            self.state["safety_score"] = result_b["safety_score"]
            self.state["active_workers"] = len(result_b["workers"])
            self.state["ppe_violations"] = len(result_b["violations"])
            self.state["zone_breaches"] = len(result_b["zone_breaches"])
            all_alerts.extend(result_b["alerts"])

        # ── Module C: Analyst ─────────────────────────────────────────────
        if self.mod_c:
            result_c = self.module_c.process(composite)
            composite = result_c["annotated_frame"]
            self.state["team_efficiency"] = result_c["team_score"]
            self.state["idle_workers"] = len(result_c["idle_workers"])
            all_alerts.extend(result_c["alerts"])

        # ── Brain status overlay ──────────────────────────────────────────
        if self.show_hud:
            self._draw_brain_hud(composite)

        # ── Show preview window ───────────────────────────────────────────
        cv2.imshow("AECI Brain — Live Feed (Press Q to quit)", composite)

        # ── Save debug frame ──────────────────────────────────────────────
        if cfg.SAVE_DEBUG_FRAMES and self.frame_count % 30 == 0:
            debug_path = Path(cfg.DEBUG_FRAME_DIR)
            debug_path.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(debug_path / f"frame_{self.frame_count:06d}.jpg"), composite)

        # ── Uplink: send frame ─────────────────────────────────────────────
        self.uplink.send_frame(composite, quality=70)

        # ── Uplink: heartbeat (throttled) ─────────────────────────────────
        now = time.time()
        if now - self.last_heartbeat >= cfg.HEARTBEAT_INTERVAL:
            self.state["camera_view"] = self.current_view
            self.state["module_a_active"] = self.mod_a
            self.state["module_b_active"] = self.mod_b
            self.state["module_c_active"] = self.mod_c
            self.uplink.send_heartbeat(self.state)
            self.last_heartbeat = now

        # ── Uplink: new alerts (deduplication) ────────────────────────────
        for alert in all_alerts:
            key = f"{alert.get('type','')}-{alert.get('title','')}"
            if key not in self.sent_alerts:
                self.sent_alerts.add(key)
                self.uplink.send_alert(alert)
                # Auto-clear after 5 minutes so re-alerts can fire
                threading.Timer(300, lambda k=key: self.sent_alerts.discard(k)).start()
                log.info(f"ALERT [{alert.get('severity','?').upper()}] {alert.get('title','')}")

    # ── Keyboard handling ─────────────────────────────────────────────────

    def _handle_key(self, key: str):
        key = key.lower()
        if key == 'q':
            self.running = False
        elif key == 'a':
            self.mod_a = not self.mod_a
            log.info(f"Module A (Drone-BIM): {'ON' if self.mod_a else 'OFF'}")
        elif key == 'b':
            self.mod_b = not self.mod_b
            log.info(f"Module B (Guardian): {'ON' if self.mod_b else 'OFF'}")
        elif key == 'c':
            self.mod_c = not self.mod_c
            log.info(f"Module C (Analyst): {'ON' if self.mod_c else 'OFF'}")
        elif key == 'h':
            self.show_hud = not self.show_hud
        elif key == 'd':
            self._switch_view("drone")
        elif key in self.CAMERA_VIEWS:
            self._switch_view(self.CAMERA_VIEWS[key])
        elif key == 'r':
            self._reset_database()
        elif key == 't':
            self.state["mode"] = "test"
            log.info("Switched to TEST MODE")
            self.uplink.send_heartbeat({**self.state, "mode": "test"})
        elif key == 's':
            self._save_prototype()

    def _switch_view(self, view: str):
        self.current_view = view
        self.state["camera_view"] = view
        log.info(f"Camera view: {view.upper()}")
        self.uplink.send_heartbeat(self.state)

    def _is_drone_view(self) -> bool:
        if self.current_view == "auto":
            return True   # always run Module A in auto mode
        return self.current_view == "drone"

    def _reset_database(self):
        log.info("Resetting database (Production Mode)...")
        try:
            import requests
            resp = requests.post(f"{cfg.API_URL}/admin/reset", json={"confirm": True}, timeout=5)
            if resp.status_code == 200:
                log.info("Database reset complete.")
                self.sent_alerts.clear()
            else:
                log.warning(f"Reset failed: {resp.text}")
        except Exception as e:
            log.error(f"Reset error: {e}")

    def _save_prototype(self):
        ret, frame = self.cap.read()
        if ret:
            p = Path("assets/prototype_house.png")
            p.parent.mkdir(exist_ok=True)
            cv2.imwrite(str(p), frame)
            log.info(f"Saved current frame as prototype: {p}")
            self.module_a._load_prototype(str(p))

    # ── HUD overlay ───────────────────────────────────────────────────────

    def _draw_brain_hud(self, frame: np.ndarray):
        h, w = frame.shape[:2]

        # Top-left: AECI branding + timestamp
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, 0), (400, 36), (10, 12, 20), cv2.FILLED)
        cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
        ts = datetime.now().strftime("%H:%M:%S")
        cv2.putText(frame, f"AECI BRAIN v1.0 | {self.current_view.upper()} | {ts}",
                    (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (50, 220, 100), 1, cv2.LINE_AA)

        # Top-right: module status pills
        mods = [
            ("A", self.mod_a), ("B", self.mod_b), ("C", self.mod_c)
        ]
        for i, (label, active) in enumerate(mods):
            x = w - 120 + i * 38
            color = (50, 200, 50) if active else (80, 80, 80)
            cv2.circle(frame, (x, 18), 12, color, cv2.FILLED)
            cv2.putText(frame, label, (x - 5, 23),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)

    # ── Shutdown ──────────────────────────────────────────────────────────

    def _shutdown(self, sig=None, frame=None):
        log.info("Shutdown signal received...")
        self.running = False

    def _cleanup(self):
        log.info("Releasing resources...")
        self.cap.release()
        cv2.destroyAllWindows()
        # Send offline heartbeat
        self.state["module_a_active"] = False
        self.state["module_b_active"] = False
        self.state["module_c_active"] = False
        try:
            self.uplink.send_heartbeat({**self.state, "brain_online": False})
        except Exception:
            pass
        log.info("AECI Brain stopped.")

    # ── Banner ────────────────────────────────────────────────────────────

    def _print_banner(self):
        print("""
╔══════════════════════════════════════════════════════╗
║       ASTRA-EYE CONSTRUCTION INTELLIGENCE            ║
║              AI Brain v1.0                           ║
╠══════════════════════════════════════════════════════╣
║  Module A — Drone-BIM Navigator                      ║
║  Module B — 360° Guardian (YOLOv8 PPE)               ║
║  Module C — Activity Analyst (MediaPipe Pose)        ║
╚══════════════════════════════════════════════════════╝
        """)
        print(f"  Mode:      {cfg.MODE}")
        print(f"  API URL:   {cfg.API_URL}")
        print(f"  Camera:    {cfg.video_source()}")
        print(f"  View:      {cfg.CAMERA_VIEW}")
        print()

    @staticmethod
    def _setup_dirs():
        Path("outputs").mkdir(exist_ok=True)
        Path("assets").mkdir(exist_ok=True)


# ── Entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AECI AI Brain")
    parser.add_argument("--mode", choices=["replit", "local", "mongodb"],
                        help="Override AECI_MODE from .env")
    parser.add_argument("--api-url", help="Override AECI_API_URL from .env")
    parser.add_argument("--view", choices=["drone", "front", "back", "top", "left", "right", "auto"],
                        help="Initial camera view")
    parser.add_argument("--no-display", action="store_true",
                        help="Run headless (no preview window)")
    args = parser.parse_args()

    if args.mode:
        cfg.MODE = args.mode
    if args.api_url:
        cfg.API_URL = args.api_url
    if args.view:
        cfg.CAMERA_VIEW = args.view

    brain = AECIBrain()
    brain.run()
