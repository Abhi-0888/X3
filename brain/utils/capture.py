"""
Twinmotion Capture Utility
===========================
Provides multiple methods to capture frames from Twinmotion:

1. OBS Virtual Camera  — Best quality, requires OBS running with Virtual Camera enabled
2. Direct Window Capture — Captures Twinmotion window directly (no OBS needed)
3. Screen Region Capture — Captures a specific screen region
4. Video File            — Replay from a recorded .mp4 file

Usage in .env:
  VIDEO_SOURCE=obs           → OBS Virtual Camera (auto-detect camera index)
  VIDEO_SOURCE=twinmotion    → Direct window capture (finds Twinmotion window)
  VIDEO_SOURCE=screen        → Full screen capture
  VIDEO_SOURCE=0             → Camera index 0
  VIDEO_SOURCE=path/to/file  → Video file
"""

import logging
import time
import re
from pathlib import Path

import cv2
import numpy as np

log = logging.getLogger("AECI.Capture")

# Try to import optional screen capture libraries
try:
    import mss
    _HAS_MSS = True
except ImportError:
    _HAS_MSS = False

try:
    import win32gui
    import win32ui
    import win32con
    import win32api
    _HAS_WIN32 = True
except ImportError:
    _HAS_WIN32 = False


def find_twinmotion_window() -> int:
    """Find the Twinmotion window handle."""
    if not _HAS_WIN32:
        log.warning("pywin32 not installed — cannot find Twinmotion window")
        return 0

    target_hwnd = 0

    def enum_callback(hwnd, results):
        nonlocal target_hwnd
        if win32gui.IsWindowVisible(hwnd):
            title = win32gui.GetWindowText(hwnd)
            title_lower = title.lower()
            if "twinmotion" in title_lower:
                target_hwnd = hwnd
                log.info(f"Found Twinmotion window: '{title}' (hwnd={hwnd})")

    win32gui.EnumWindows(enum_callback, None)

    if target_hwnd == 0:
        log.warning("Twinmotion window not found. Is Twinmotion running?")

    return target_hwnd


def find_obs_virtual_camera() -> int:
    """Find the OBS Virtual Camera device index."""
    log.info("Scanning for OBS Virtual Camera...")

    for idx in range(10):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        if cap.isOpened():
            # Try to read a frame to verify it's a real device
            ret, frame = cap.read()
            cap.release()
            if ret and frame is not None:
                log.info(f"  Camera index {idx}: active (frame {frame.shape})")
                # On most systems, OBS Virtual Camera appears as index 1 or higher
                # We return the first camera that works after index 0
                # (index 0 is usually the built-in webcam)
            else:
                log.debug(f"  Camera index {idx}: opened but no frame")
        else:
            break

    # Return -1 if not found, let the caller try indices
    return -1


class TwinmotionCapture:
    """
    Unified capture interface for Twinmotion frames.
    Supports OBS Virtual Camera, direct window capture, screen capture, and video files.
    """

    def __init__(self, source: str = "0"):
        self.source = source
        self._cap = None           # cv2.VideoCapture
        self._sct = None           # mss screen capture
        self._hwnd = 0             # window handle
        self._mode = "opencv"      # "opencv" | "window" | "screen"
        self._monitor = None       # screen region for mss
        self._frame_count = 0

        self._init_source(source)

    def _init_source(self, source: str):
        """Initialize the appropriate capture method based on source string."""
        source_lower = source.strip().lower()

        # ── OBS Virtual Camera ─────────────────────────────────────────────
        if source_lower == "obs":
            log.info("Initializing OBS Virtual Camera capture...")
            # Try camera indices 0-5, prefer non-zero (built-in webcam is usually 0)
            for idx in [1, 2, 3, 4, 5, 0]:
                cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                if cap.isOpened():
                    ret, frame = cap.read()
                    if ret and frame is not None:
                        log.info(f"OBS Virtual Camera found at index {idx}")
                        self._cap = cap
                        self._mode = "opencv"
                        self._configure_capture()
                        return
                    cap.release()
            log.error("OBS Virtual Camera not found. Make sure OBS is running with Virtual Camera started.")
            # Fall through to try direct window capture
            source_lower = "twinmotion"

        # ── Direct Twinmotion Window Capture ───────────────────────────────
        if source_lower == "twinmotion":
            log.info("Initializing direct Twinmotion window capture...")
            self._hwnd = find_twinmotion_window()
            if self._hwnd:
                self._mode = "window"
                log.info("Direct window capture ready")
                return
            else:
                log.warning("Falling back to screen capture...")
                source_lower = "screen"

        # ── Screen Capture ─────────────────────────────────────────────────
        if source_lower == "screen":
            if _HAS_MSS:
                self._sct = mss.mss()
                # Capture primary monitor
                self._monitor = self._sct.monitors[1]  # Primary monitor
                self._mode = "screen"
                log.info(f"Screen capture ready: {self._monitor['width']}x{self._monitor['height']}")
                return
            else:
                log.error("mss not installed for screen capture. Install with: pip install mss")

        # ── Camera Index ───────────────────────────────────────────────────
        if source_lower.isdigit():
            idx = int(source_lower)
            log.info(f"Opening camera index {idx}...")
            self._cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
            if self._cap.isOpened():
                self._mode = "opencv"
                self._configure_capture()
                log.info(f"Camera {idx} opened successfully")
                return
            else:
                log.error(f"Cannot open camera index {idx}")
                self._cap = None

        # ── Video File ─────────────────────────────────────────────────────
        if Path(source).exists():
            log.info(f"Opening video file: {source}")
            self._cap = cv2.VideoCapture(source)
            if self._cap.isOpened():
                self._mode = "opencv"
                fps = self._cap.get(cv2.CAP_PROP_FPS)
                total = int(self._cap.get(cv2.CAP_PROP_FRAME_COUNT))
                log.info(f"Video file opened: {fps:.0f}fps, {total} frames")
                return
            else:
                log.error(f"Cannot open video file: {source}")

        # ── Last resort: try as camera index 0 ────────────────────────────
        if self._cap is None and self._sct is None and self._hwnd == 0:
            log.warning("No capture source initialized. Trying camera 0 as last resort...")
            self._cap = cv2.VideoCapture(0)
            self._mode = "opencv"

    def _configure_capture(self):
        """Set capture resolution."""
        if self._cap:
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    def read(self) -> tuple[bool, np.ndarray | None]:
        """
        Read a single frame. Returns (success, frame) like cv2.VideoCapture.read().
        """
        self._frame_count += 1

        if self._mode == "opencv" and self._cap:
            return self._cap.read()

        elif self._mode == "window" and self._hwnd:
            return self._capture_window()

        elif self._mode == "screen" and self._sct:
            return self._capture_screen()

        return False, None

    def _capture_window(self) -> tuple[bool, np.ndarray | None]:
        """
        Capture the Twinmotion window using PrintWindow API.
        PrintWindow captures the window content even when it's behind other windows.
        On first capture, brings Twinmotion to the foreground.
        """
        if not _HAS_WIN32 or not self._hwnd:
            return False, None

        try:
            # Check if window still exists
            if not win32gui.IsWindow(self._hwnd):
                log.warning("Twinmotion window closed. Trying to find it again...")
                self._hwnd = find_twinmotion_window()
                if not self._hwnd:
                    return False, None

            # Bring Twinmotion to foreground on first capture
            if self._frame_count <= 1:
                try:
                    win32gui.SetForegroundWindow(self._hwnd)
                    log.info("Brought Twinmotion to foreground")
                    import time as _time
                    _time.sleep(0.5)
                except Exception:
                    pass  # May fail if our process doesn't have focus

            # Get window rect (screen coordinates) for mss-based capture
            # This is more reliable than BitBlt for GPU-rendered windows like Twinmotion
            rect = win32gui.GetWindowRect(self._hwnd)
            x, y, x2, y2 = rect
            w = x2 - x
            h = y2 - y

            if w <= 0 or h <= 0:
                return False, None

            # Use mss for screen-region capture of the window area
            # This reliably captures GPU-rendered content (DirectX/OpenGL)
            if _HAS_MSS:
                if self._sct is None:
                    self._sct = mss.mss()

                monitor = {"left": x, "top": y, "width": w, "height": h}
                screenshot = self._sct.grab(monitor)
                img = np.array(screenshot)
                frame = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
            else:
                # Fallback to Win32 BitBlt
                hwnd_dc = win32gui.GetWindowDC(self._hwnd)
                mfc_dc = win32ui.CreateDCFromHandle(hwnd_dc)
                save_dc = mfc_dc.CreateCompatibleDC()

                bitmap = win32ui.CreateBitmap()
                bitmap.CreateCompatibleBitmap(mfc_dc, w, h)
                save_dc.SelectObject(bitmap)

                # Use PrintWindow for better GPU window capture
                import ctypes
                PW_RENDERFULLCONTENT = 0x00000002
                ctypes.windll.user32.PrintWindow(self._hwnd, save_dc.GetSafeHdc(), PW_RENDERFULLCONTENT)

                bmp_info = bitmap.GetInfo()
                bmp_bits = bitmap.GetBitmapBits(True)

                img = np.frombuffer(bmp_bits, dtype=np.uint8)
                img = img.reshape((bmp_info["bmHeight"], bmp_info["bmWidth"], 4))

                win32gui.DeleteObject(bitmap.GetHandle())
                save_dc.DeleteDC()
                mfc_dc.DeleteDC()
                win32gui.ReleaseDC(self._hwnd, hwnd_dc)

                frame = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

            # Resize to standard resolution
            if frame.shape[1] != 1280 or frame.shape[0] != 720:
                frame = cv2.resize(frame, (1280, 720))

            return True, frame

        except Exception as e:
            if self._frame_count % 100 == 0:  # Don't spam logs
                log.error(f"Window capture error: {e}")
            return False, None

    def _capture_screen(self) -> tuple[bool, np.ndarray | None]:
        """Capture screen using mss."""
        if not self._sct or not self._monitor:
            return False, None

        try:
            screenshot = self._sct.grab(self._monitor)
            frame = np.array(screenshot)
            frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)

            # Resize to standard resolution
            if frame.shape[1] != 1280 or frame.shape[0] != 720:
                frame = cv2.resize(frame, (1280, 720))

            return True, frame

        except Exception as e:
            log.error(f"Screen capture error: {e}")
            return False, None

    def isOpened(self) -> bool:
        """Check if capture is ready."""
        if self._mode == "opencv":
            return self._cap is not None and self._cap.isOpened()
        elif self._mode == "window":
            return self._hwnd != 0 and _HAS_WIN32
        elif self._mode == "screen":
            return self._sct is not None
        return False

    def get(self, prop_id: int):
        """Get capture property (compatible with cv2.VideoCapture)."""
        if self._mode == "opencv" and self._cap:
            return self._cap.get(prop_id)
        elif prop_id == cv2.CAP_PROP_FRAME_WIDTH:
            return 1280
        elif prop_id == cv2.CAP_PROP_FRAME_HEIGHT:
            return 720
        elif prop_id == cv2.CAP_PROP_FPS:
            return 30
        return 0

    def set(self, prop_id: int, value):
        """Set capture property (compatible with cv2.VideoCapture)."""
        if self._mode == "opencv" and self._cap:
            return self._cap.set(prop_id, value)
        return False

    def release(self):
        """Release capture resources."""
        if self._cap:
            self._cap.release()
        if self._sct:
            self._sct.close()
        self._hwnd = 0
        log.info("Capture released")


def list_available_cameras(max_check: int = 10) -> list[dict]:
    """List all available camera devices."""
    cameras = []
    for idx in range(max_check):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        if cap.isOpened():
            ret, frame = cap.read()
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            fps = cap.get(cv2.CAP_PROP_FPS)
            cap.release()
            cameras.append({
                "index": idx,
                "resolution": f"{w}x{h}",
                "fps": fps,
                "has_frames": ret,
            })
    return cameras
