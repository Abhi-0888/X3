"""
Module C — Activity Analyst
============================
Pose-estimation engine using MediaPipe Pose to quantify productive movement.

Algorithm:
  1. MediaPipe Pose detects 33 landmarks per person per frame
  2. Track landmark positions over a rolling 30-frame window
  3. Calculate movement score M for each joint set:
       M = Σ_joints √((x_curr - x_prev)² + (y_curr - y_prev)²)
  4. If M < IDLE_THRESHOLD for IDLE_TIMEOUT_SEC → flag worker as "Idle"
  5. Efficiency score = min(100, M / MAX_MOVEMENT * 100)

Output:
  - Annotated frame with skeleton overlays
  - Per-worker efficiency scores, idle flags
"""

import cv2
import numpy as np
import time
import logging
from collections import deque, defaultdict
from dataclasses import dataclass, field

log = logging.getLogger("AECI.ModuleC")

# Joints used for movement scoring (MediaPipe landmark indices)
ACTIVE_JOINTS = [
    15, 16,  # wrists
    13, 14,  # elbows
    11, 12,  # shoulders
    23, 24,  # hips
    25, 26,  # knees
    27, 28,  # ankles
]

POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26),
    (25, 27), (26, 28),
]

@dataclass
class WorkerPoseState:
    track_id: int
    landmark_history: deque = field(default_factory=lambda: deque(maxlen=30))
    movement_scores: deque = field(default_factory=lambda: deque(maxlen=60))
    last_active_time: float = field(default_factory=time.time)
    is_idle: bool = False
    idle_seconds: float = 0.0
    current_movement: float = 0.0
    efficiency_score: float = 75.0

    def update_movement(self, landmarks, idle_threshold: float, idle_timeout: float):
        """Update movement score from new landmarks."""
        if landmarks is None:
            return

        pts = [(lm.x, lm.y) for lm in landmarks]
        self.landmark_history.append(pts)

        if len(self.landmark_history) < 2:
            return

        prev = self.landmark_history[-2]
        curr = self.landmark_history[-1]

        # Calculate Euclidean displacement for active joints
        movement = 0.0
        for j in ACTIVE_JOINTS:
            if j < len(curr) and j < len(prev):
                dx = curr[j][0] - prev[j][0]
                dy = curr[j][1] - prev[j][1]
                movement += np.sqrt(dx * dx + dy * dy)

        self.current_movement = movement * 1000  # scale to 0–100 range
        self.movement_scores.append(self.current_movement)

        # Determine idle state
        avg_movement = np.mean(self.movement_scores) if self.movement_scores else 0
        if avg_movement > idle_threshold:
            self.last_active_time = time.time()
            self.is_idle = False
            self.idle_seconds = 0.0
        else:
            self.idle_seconds = time.time() - self.last_active_time
            self.is_idle = self.idle_seconds > idle_timeout

        # Efficiency score: smooth average of recent movement scores
        MAX_MOVEMENT = 80.0
        self.efficiency_score = round(min(100.0, (avg_movement / MAX_MOVEMENT) * 100), 1)


class ActivityAnalyst:
    """Module C: MediaPipe pose-based labor efficiency analyzer."""

    def __init__(self, idle_threshold: float = 15.0, idle_timeout_sec: int = 300):
        self.idle_threshold = idle_threshold
        self.idle_timeout = idle_timeout_sec
        self._pose = None
        self._mp_drawing = None
        self._mp_pose = None
        self._worker_states: dict[int, WorkerPoseState] = {}
        self._next_id = 0
        self._frame_count = 0

        self._init_mediapipe()

    def _init_mediapipe(self):
        try:
            import mediapipe as mp
            self._mp_pose = mp.solutions.pose
            self._mp_drawing = mp.solutions.drawing_utils
            self._pose = self._mp_pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                min_detection_confidence=0.5,
                min_tracking_confidence=0.5,
            )
            log.info("MediaPipe Pose initialized")
        except ImportError:
            log.error("mediapipe not installed. Run: pip install mediapipe")
        except Exception as e:
            log.error(f"MediaPipe init failed: {e}")

    def process(self, frame: np.ndarray) -> dict:
        """
        Process one frame through Module C.
        Returns:
            {
                annotated_frame: np.ndarray,
                workers: list[dict],  # per-worker efficiency data
                team_score: float,
                idle_workers: list[dict],
                alerts: list[dict]
            }
        """
        self._frame_count += 1
        annotated = frame.copy()
        alerts: list[dict] = []
        worker_results: list[dict] = []

        if self._pose is None:
            self._draw_hud(annotated, 0.0, 0, 0)
            return {
                "annotated_frame": annotated,
                "workers": [],
                "team_score": 0.0,
                "idle_workers": [],
                "alerts": [],
            }

        # MediaPipe expects RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        pose_results = self._pose.process(rgb)
        rgb.flags.writeable = True

        # MediaPipe Pose detects one person per frame by default
        # For multi-person, we'd need YOLO bboxes + per-crop pose estimation
        # This implementation tracks one "dominant" worker per frame region
        landmarks = pose_results.pose_landmarks

        if landmarks:
            # Assign / reuse the ID 0 for single-person mode
            # In multi-person setup, use YOLO bboxes to assign IDs
            worker_id = 0
            if worker_id not in self._worker_states:
                self._worker_states[worker_id] = WorkerPoseState(track_id=worker_id)

            state = self._worker_states[worker_id]
            state.update_movement(landmarks.landmark, self.idle_threshold, self.idle_timeout)

            # Draw skeleton
            self._draw_skeleton(annotated, landmarks, state)

            worker_results.append({
                "track_id": worker_id,
                "efficiency_score": state.efficiency_score,
                "movement_score": round(state.current_movement, 1),
                "is_idle": state.is_idle,
                "idle_seconds": int(state.idle_seconds),
            })

            # Idle alert
            if state.is_idle and int(state.idle_seconds) % 60 == 0 and state.idle_seconds > 0:
                alerts.append({
                    "type": "IDLE_WORKER",
                    "severity": "medium",
                    "title": f"Idle Worker — ID:{worker_id}",
                    "message": f"Worker has been idle for {int(state.idle_seconds // 60)}min {int(state.idle_seconds % 60)}s. Movement score: {state.current_movement:.1f}.",
                    "zone": "Current View",
                    "module": "C"
                })

        # Purge stale workers not seen in 10 seconds
        now = time.time()
        stale = [wid for wid, s in self._worker_states.items() if now - s.last_active_time > 10]
        for wid in stale:
            del self._worker_states[wid]

        # Team-level metrics
        if worker_results:
            team_score = round(np.mean([w["efficiency_score"] for w in worker_results]), 1)
            idle_workers = [w for w in worker_results if w["is_idle"]]
        else:
            team_score = 0.0
            idle_workers = []

        self._draw_hud(annotated, team_score, len(worker_results), len(idle_workers))

        return {
            "annotated_frame": annotated,
            "workers": worker_results,
            "team_score": team_score,
            "idle_workers": idle_workers,
            "alerts": alerts,
        }

    def _draw_skeleton(self, frame: np.ndarray, landmarks, state: WorkerPoseState):
        """Draw MediaPipe skeleton on frame with color-coded efficiency."""
        h, w = frame.shape[:2]

        # Color: green = high efficiency, amber = medium, red = idle
        if state.is_idle:
            joint_color = (0, 60, 220)
            conn_color = (0, 80, 180)
        elif state.efficiency_score > 70:
            joint_color = (50, 220, 50)
            conn_color = (30, 180, 30)
        else:
            joint_color = (0, 165, 255)
            conn_color = (0, 140, 220)

        # Get pixel coords for all landmarks
        pts = {}
        for i, lm in enumerate(landmarks.landmark):
            if lm.visibility > 0.5:
                pts[i] = (int(lm.x * w), int(lm.y * h))

        # Draw connections
        for a, b in POSE_CONNECTIONS:
            if a in pts and b in pts:
                cv2.line(frame, pts[a], pts[b], conn_color, 2, cv2.LINE_AA)

        # Draw joints
        for i, pt in pts.items():
            if i in ACTIVE_JOINTS:
                cv2.circle(frame, pt, 5, joint_color, -1)
            else:
                cv2.circle(frame, pt, 3, (200, 200, 200), -1)

        # Efficiency label above head
        if 0 in pts:
            hx, hy = pts[0]
            status = "IDLE" if state.is_idle else f"EFF:{state.efficiency_score:.0f}%"
            label_color = (0, 60, 220) if state.is_idle else joint_color
            cv2.putText(frame, status, (hx - 30, hy - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, label_color, 1, cv2.LINE_AA)

    def _draw_hud(self, frame, team_score, worker_count, idle_count):
        h, w = frame.shape[:2]
        overlay = frame.copy()
        cv2.rectangle(overlay, (0, h - 50), (w, h), (10, 10, 20), cv2.FILLED)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        color = (50, 210, 50) if team_score > 70 else (0, 165, 255) if team_score > 50 else (0, 60, 220)
        cv2.putText(frame,
                    f"MODULE C | EFFICIENCY: {team_score:.0f}% | WORKERS: {worker_count} | IDLE: {idle_count}",
                    (10, h - 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv2.LINE_AA)
