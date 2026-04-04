#!/usr/bin/env python3
"""
AECI — Live Twinmotion Processing Test
========================================
Captures 10 frames from Twinmotion, processes through Module A and B,
saves annotated results, and prints a summary. Quick validation that
the full pipeline works end-to-end with live data.
"""

import sys
import time
import logging
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))

from config import Config as cfg
from modules.module_a import DroneBIMNavigator
from modules.module_b import Guardian360
from utils.capture import TwinmotionCapture

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("AECI.LiveTest")

OUTPUT_DIR = Path(__file__).parent / "outputs" / "live_test"


def main():
    print("""
╔══════════════════════════════════════════════════════╗
║       AECI — Live Twinmotion Processing Test         ║
╚══════════════════════════════════════════════════════╝
    """)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Init capture
    source = cfg.video_source()
    log.info(f"Opening capture: {source}")
    cap = TwinmotionCapture(str(source))

    if not cap.isOpened():
        log.error("Cannot open capture source!")
        return 1

    # Init modules
    log.info("Loading Module A...")
    module_a = DroneBIMNavigator(
        prototype_path=cfg.PROTOTYPE_IMAGE_PATH,
        deviation_threshold=cfg.DEVIATION_THRESHOLD,
        proto_db_path=cfg.PROTO_DB_PATH,
        baselines_path=cfg.BASELINES_PATH,
    )

    log.info("Loading Module B...")
    module_b = Guardian360(
        yolo_model_path=cfg.YOLO_MODEL_PATH,
        danger_zones=cfg.DANGER_ZONES,
        confidence_threshold=cfg.YOLO_CONFIDENCE,
    )

    # Process 10 frames
    NUM_FRAMES = 10
    log.info(f"Processing {NUM_FRAMES} live frames...")

    results = []
    for i in range(NUM_FRAMES):
        ret, frame = cap.read()
        if not ret or frame is None:
            log.warning(f"Frame {i+1}: capture failed")
            time.sleep(0.1)
            continue

        t0 = time.time()

        # Module A
        result_a = module_a.process(frame)
        t_a = time.time() - t0

        # Module B
        t1 = time.time()
        result_b = module_b.process(frame)
        t_b = time.time() - t1

        total_ms = (time.time() - t0) * 1000

        dev = result_a["deviation_pct"]
        progress = result_a["progress_pct"]
        ssim = result_a.get("ssim_score", 0)
        view = result_a.get("matched_view", "N/A")
        workers = len(result_b.get("workers", []))
        safety = result_b.get("safety_score", 100)
        zones_a = len(result_a["anomaly_zones"])
        alerts_a = len(result_a["alerts"])

        log.info(
            f"Frame {i+1:2d}: dev={dev:5.1f}% progress={progress:5.1f}% "
            f"ssim={ssim:.3f} workers={workers} safety={safety:.0f}% "
            f"[{total_ms:.0f}ms]"
        )

        results.append({
            "frame": i + 1,
            "deviation_pct": dev,
            "progress_pct": progress,
            "ssim_score": ssim,
            "matched_view": view,
            "zones": zones_a,
            "workers": workers,
            "safety_score": safety,
            "processing_ms": round(total_ms, 1),
        })

        # Save first and last annotated frames
        if i == 0 or i == NUM_FRAMES - 1:
            cv2.imwrite(str(OUTPUT_DIR / f"live_frame_{i+1}_raw.jpg"), frame)
            cv2.imwrite(str(OUTPUT_DIR / f"live_frame_{i+1}_module_a.jpg"), result_a["annotated_frame"])
            if result_b.get("annotated_frame") is not None:
                cv2.imwrite(str(OUTPUT_DIR / f"live_frame_{i+1}_module_b.jpg"), result_b["annotated_frame"])

        time.sleep(0.2)  # ~5fps processing rate

    cap.release()

    # Summary
    if results:
        avg_dev = np.mean([r["deviation_pct"] for r in results])
        avg_prog = np.mean([r["progress_pct"] for r in results])
        avg_ms = np.mean([r["processing_ms"] for r in results])

        print(f"\n{'=' * 60}")
        print("LIVE TEST RESULTS")
        print("=" * 60)
        print(f"  Frames processed: {len(results)}/{NUM_FRAMES}")
        print(f"  Avg deviation:    {avg_dev:.1f}%")
        print(f"  Avg progress:     {avg_prog:.1f}%")
        print(f"  Avg processing:   {avg_ms:.0f}ms/frame")
        print(f"  Output saved to:  {OUTPUT_DIR}")
        print("=" * 60)
        print("  STATUS: LIVE PIPELINE WORKING")
        print("=" * 60)
    else:
        print("  No frames captured!")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
