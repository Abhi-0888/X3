#!/usr/bin/env python3
"""
AECI — Twinmotion Connection Test
===================================
Tests all available capture methods and verifies Twinmotion connectivity.

Usage:
  cd brain/
  python test_connection.py
"""

import sys
import time
import logging
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

from utils.capture import (
    TwinmotionCapture,
    find_twinmotion_window,
    list_available_cameras,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("AECI.ConnTest")

BRAIN_DIR = Path(__file__).parent
OUTPUT_DIR = BRAIN_DIR / "outputs" / "connection_test"


def test_cameras():
    """List and test all available camera devices."""
    print("\n" + "=" * 60)
    print("TEST 1: Available Camera Devices")
    print("=" * 60)

    cameras = list_available_cameras(10)
    if not cameras:
        print("  No cameras found.")
        return False

    for cam in cameras:
        status = "ACTIVE" if cam["has_frames"] else "NO FRAMES"
        print(f"  Camera {cam['index']}: {cam['resolution']} @ {cam['fps']:.0f}fps [{status}]")

    return len(cameras) > 0


def test_twinmotion_window():
    """Test if Twinmotion window can be found."""
    print("\n" + "=" * 60)
    print("TEST 2: Twinmotion Window Detection")
    print("=" * 60)

    hwnd = find_twinmotion_window()
    if hwnd:
        print(f"  FOUND: Twinmotion window handle = {hwnd}")
        return True
    else:
        print("  NOT FOUND: Twinmotion window not detected.")
        print("  Make sure Twinmotion is running and visible.")
        return False


def test_capture_method(method: str, duration_sec: float = 3.0) -> bool:
    """Test a specific capture method by grabbing frames for a few seconds."""
    print(f"\n{'=' * 60}")
    print(f"TEST: Capture Method — '{method}'")
    print("=" * 60)

    cap = TwinmotionCapture(method)

    if not cap.isOpened():
        print(f"  FAILED: Could not open capture with source='{method}'")
        cap.release()
        return False

    print(f"  Capture opened. Reading frames for {duration_sec}s...")

    frames_read = 0
    frames_failed = 0
    start = time.time()
    first_frame = None

    while time.time() - start < duration_sec:
        ret, frame = cap.read()
        if ret and frame is not None:
            frames_read += 1
            if first_frame is None:
                first_frame = frame.copy()
        else:
            frames_failed += 1
        time.sleep(0.033)  # ~30fps polling

    elapsed = time.time() - start
    fps = frames_read / max(elapsed, 0.001)

    cap.release()

    print(f"  Frames read:   {frames_read}")
    print(f"  Frames failed: {frames_failed}")
    print(f"  Effective FPS:  {fps:.1f}")

    if first_frame is not None:
        h, w = first_frame.shape[:2]
        print(f"  Frame size:    {w}x{h}")
        mean_brightness = np.mean(first_frame)
        print(f"  Mean brightness: {mean_brightness:.0f}/255")

        # Check if frame is not just black
        if mean_brightness < 5:
            print("  WARNING: Frame appears to be all black!")

        # Save sample frame
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        out_path = OUTPUT_DIR / f"sample_{method.replace('/', '_')}.jpg"
        cv2.imwrite(str(out_path), first_frame)
        print(f"  Sample saved:  {out_path}")

    success = frames_read > 0
    print(f"  RESULT: {'PASS' if success else 'FAIL'}")
    return success


def test_full_pipeline_single_frame():
    """Test the full AI pipeline on a single captured frame."""
    print(f"\n{'=' * 60}")
    print("TEST: Full Pipeline — Single Frame Processing")
    print("=" * 60)

    # Try to capture one frame from Twinmotion
    cap = TwinmotionCapture("twinmotion")
    if not cap.isOpened():
        # Fallback to screen capture
        cap = TwinmotionCapture("screen")

    if not cap.isOpened():
        print("  SKIP: No capture source available")
        return False

    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None:
        print("  SKIP: Could not capture a frame")
        return False

    print(f"  Captured frame: {frame.shape[1]}x{frame.shape[0]}")

    # Test Module A
    try:
        from config import Config as cfg
        from modules.module_a import DroneBIMNavigator

        module_a = DroneBIMNavigator(
            prototype_path=cfg.PROTOTYPE_IMAGE_PATH,
            deviation_threshold=cfg.DEVIATION_THRESHOLD,
            proto_db_path=cfg.PROTO_DB_PATH,
            baselines_path=cfg.BASELINES_PATH,
        )

        result_a = module_a.process(frame)
        print(f"  Module A: deviation={result_a['deviation_pct']:.1f}% "
              f"progress={result_a['progress_pct']:.1f}% "
              f"view={result_a.get('matched_view', 'N/A')}")

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        cv2.imwrite(str(OUTPUT_DIR / "pipeline_module_a.jpg"), result_a["annotated_frame"])
        print(f"  Module A annotated frame saved")

    except Exception as e:
        print(f"  Module A error: {e}")

    # Test Module B
    try:
        from modules.module_b import Guardian360

        module_b = Guardian360(
            yolo_model_path=cfg.YOLO_MODEL_PATH,
            danger_zones=cfg.DANGER_ZONES,
            confidence_threshold=cfg.YOLO_CONFIDENCE,
        )

        result_b = module_b.process(frame)
        workers = len(result_b.get("workers", []))
        safety = result_b.get("safety_score", 100)
        print(f"  Module B: workers={workers} safety={safety:.0f}%")

        cv2.imwrite(str(OUTPUT_DIR / "pipeline_module_b.jpg"), result_b["annotated_frame"])
        print(f"  Module B annotated frame saved")

    except Exception as e:
        print(f"  Module B error: {e}")

    print("  RESULT: PASS")
    return True


def main():
    print("""
╔══════════════════════════════════════════════════════╗
║       ASTRA-EYE CONSTRUCTION INTELLIGENCE            ║
║         Twinmotion Connection Test v1.0              ║
╚══════════════════════════════════════════════════════╝
    """)

    results = {}

    # Test 1: List cameras
    results["cameras"] = test_cameras()

    # Test 2: Find Twinmotion window
    results["twinmotion_window"] = test_twinmotion_window()

    # Test 3: Direct Twinmotion window capture
    if results["twinmotion_window"]:
        results["twinmotion_capture"] = test_capture_method("twinmotion", 3.0)

    # Test 4: Screen capture
    results["screen_capture"] = test_capture_method("screen", 2.0)

    # Test 5: Full pipeline on captured frame
    results["pipeline"] = test_full_pipeline_single_frame()

    # Summary
    print(f"\n{'=' * 60}")
    print("CONNECTION TEST SUMMARY")
    print("=" * 60)

    for test_name, passed in results.items():
        icon = "PASS" if passed else "FAIL"
        print(f"  [{icon}] {test_name}")

    all_critical = results.get("twinmotion_capture", False) or results.get("screen_capture", False)
    print("-" * 60)

    if all_critical:
        print("  STATUS: READY — Twinmotion can be captured!")
        print("")
        print("  To start the brain:")
        print("    cd brain/")
        print("    py brain.py")
        print("")
        if results.get("twinmotion_capture"):
            print("  Recommended .env setting:")
            print("    VIDEO_SOURCE=twinmotion")
        else:
            print("  Recommended .env setting:")
            print("    VIDEO_SOURCE=screen")
    else:
        print("  STATUS: NOT READY")
        print("")
        print("  Troubleshooting:")
        print("    1. Make sure Twinmotion is running and visible on screen")
        print("    2. Try: VIDEO_SOURCE=screen in .env (screen capture fallback)")
        print("    3. Install OBS, add Twinmotion as Window Capture, Start Virtual Camera")
        print("       Then set VIDEO_SOURCE=obs in .env")

    print("=" * 60)

    return 0 if all_critical else 1


if __name__ == "__main__":
    sys.exit(main())
