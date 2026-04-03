"""
AECI Data Uplink
================
Sends brain data to either:
  1. The AECI Express API server (Replit or local) via HTTP POST
  2. MongoDB directly (for external deployments without the Node server)

The uplink handles:
  - Heartbeat metrics (every HEARTBEAT_INTERVAL seconds)
  - Processed frames (base64-encoded JPEG for live feed display)
  - New alerts (insertted into alert log)
  - Mode switching (replit / local / mongodb)
"""

import base64
import json
import time
import logging
import threading
from datetime import datetime, UTC
from typing import Any

import cv2
import numpy as np
import requests

log = logging.getLogger("AECI.Uplink")


class AECIUplink:
    """Manages real-time data uplink from the brain to the dashboard."""

    def __init__(self, mode: str, api_url: str, mongodb_uri: str):
        """
        mode: "replit" | "local" | "mongodb"
        api_url: Base URL of the Express API (with /api suffix)
        mongodb_uri: MongoDB connection string
        """
        self.mode = mode
        self.api_url = api_url.rstrip("/")
        self.mongodb_uri = mongodb_uri
        self._session = requests.Session()
        self._session.headers.update({"Content-Type": "application/json"})
        self._mongo_client = None
        self._db = None
        self._lock = threading.Lock()

        if mode == "mongodb":
            self._init_mongodb()
        else:
            log.info(f"Uplink mode: {mode} → {api_url}")

    def _init_mongodb(self):
        try:
            from pymongo import MongoClient
            self._mongo_client = MongoClient(self.mongodb_uri, serverSelectionTimeoutMS=5000)
            self._mongo_client.admin.command("ping")
            self._db = self._mongo_client["aeci"]
            log.info(f"MongoDB connected: {self.mongodb_uri}")
        except Exception as e:
            log.error(f"MongoDB connection failed: {e}. Falling back to HTTP API.")
            self.mode = "local"

    # ── Public API ─────────────────────────────────────────────────────────

    def send_heartbeat(self, metrics: dict):
        """
        Send current site metrics (called every HEARTBEAT_INTERVAL seconds).
        metrics = {
            safety_score, deviation_pct, progress_pct, team_efficiency,
            active_workers, idle_workers, deviation_count,
            module_a_active, module_b_active, module_c_active,
            camera_view, timestamp
        }
        """
        payload = {**metrics, "timestamp": datetime.now(UTC).isoformat()}
        self._send("heartbeat", payload)

    def send_frame(self, frame: np.ndarray, quality: int = 75) -> bool:
        """
        Send a processed frame (JPEG base64) to the live feed endpoint.
        Returns True if successful.
        """
        _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
        b64 = base64.b64encode(jpeg.tobytes()).decode("utf-8")
        payload = {
            "frame_b64": b64,
            "timestamp": datetime.now(UTC).isoformat(),
        }
        return self._send("frame", payload)

    def send_alert(self, alert: dict) -> bool:
        """
        Send a new alert (deviation, PPE violation, zone breach, idle worker).
        alert = { type, severity, title, message, zone, module }
        """
        payload = {**alert, "timestamp": datetime.now(UTC).isoformat()}
        return self._send("alert", payload)

    def send_scan_result(self, scan: dict) -> bool:
        """Send a Module A scan result with anomalies."""
        return self._send("scan", scan)

    def send_batch_metrics(self, heartbeat, frame, new_alerts):
        """Convenience: send all data types in one call."""
        self.send_heartbeat(heartbeat)
        if frame is not None:
            self.send_frame(frame)
        for alert in new_alerts:
            self.send_alert(alert)

    # ── Internal dispatch ──────────────────────────────────────────────────

    def _send(self, endpoint: str, payload: dict) -> bool:
        with self._lock:
            if self.mode == "mongodb":
                return self._send_mongodb(endpoint, payload)
            else:
                return self._send_http(endpoint, payload)

    def _send_http(self, endpoint: str, payload: dict) -> bool:
        url = f"{self.api_url}/ingest/{endpoint}"
        try:
            resp = self._session.post(url, json=payload, timeout=3)
            if resp.status_code not in (200, 201):
                log.warning(f"HTTP {resp.status_code} from {url}: {resp.text[:200]}")
                return False
            return True
        except requests.exceptions.ConnectionError:
            log.error(f"Cannot reach API server at {self.api_url}. Is it running?")
            return False
        except requests.exceptions.Timeout:
            log.warning(f"Timeout sending to {url}")
            return False
        except Exception as e:
            log.error(f"Uplink error: {e}")
            return False

    def _send_mongodb(self, endpoint: str, payload: dict) -> bool:
        if self._db is None:
            return False
        try:
            if endpoint == "heartbeat":
                # site_metrics: single document, always replace
                self._db.site_metrics.replace_one({}, payload, upsert=True)
            elif endpoint == "frame":
                # live_frame: single document, always replace
                self._db.live_frame.replace_one({}, payload, upsert=True)
            elif endpoint == "alert":
                # alerts: append
                self._db.alerts.insert_one(payload)
            elif endpoint == "scan":
                # scans: append
                self._db.drone_scans.insert_one(payload)
            return True
        except Exception as e:
            log.error(f"MongoDB write error ({endpoint}): {e}")
            return False

    def test_connection(self) -> tuple[bool, str]:
        """Test the configured uplink connection. Returns (success, message)."""
        if self.mode == "mongodb":
            try:
                self._mongo_client.admin.command("ping")
                return True, f"MongoDB connected: {self.mongodb_uri}"
            except Exception as e:
                return False, f"MongoDB failed: {e}"
        else:
            try:
                resp = self._session.get(f"{self.api_url}/healthz", timeout=5)
                if resp.status_code == 200:
                    return True, f"API server connected: {self.api_url}"
                return False, f"API server returned {resp.status_code}"
            except Exception as e:
                return False, f"API server unreachable: {e}"
