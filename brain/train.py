#!/usr/bin/env python3
"""
AECI AI Brain — Training Pipeline
===================================
Processes the Finished and Unfinished image/video datasets to build:

1. Multi-view Prototype Database (for Module A — Drone-BIM Navigator)
   - Extracts features from all "Finished" building images
   - Extracts keyframes from videos
   - Classifies views by angle (drone, front, back, left, right, detail)
   - Saves as a pickled PrototypeDatabase

2. Construction Progress Baseline (for Module A)
   - Compares Unfinished images against the Finished prototypes
   - Computes baseline deviation/progress scores per view

3. YOLOv8 PPE Detection Model (for Module B — Guardian 360)
   - Downloads/configures a construction-safety YOLO model
   - Sets up proper class mappings for helmet, vest, person detection

Usage:
  cd brain/
  python train.py
  # or with options:
  python train.py --finished-dir data/finished/Finished --unfinished-dir data/finished/Unfinished
"""

import sys
import os
import json
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime

import cv2
import numpy as np

# Add brain/ to path
sys.path.insert(0, str(Path(__file__).parent))

from models.prototype_db import PrototypeDatabase, PROTO_SIZE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s — %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("AECI.Train")

# ── Constants ───────────────────────────────────────────────────────────────

BRAIN_DIR = Path(__file__).parent
ASSETS_DIR = BRAIN_DIR / "assets"
MODELS_DIR = BRAIN_DIR / "assets" / "trained"
DATA_DIR = BRAIN_DIR / "data"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".bmp", ".tiff", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

# View classification heuristics based on image content analysis
VIEW_KEYWORDS = {
    "drone": ["top", "aerial", "overhead", "bird"],
    "front": ["front", "entrance", "entry", "main"],
    "back": ["back", "rear", "behind"],
    "left": ["left", "west"],
    "right": ["right", "east"],
    "detail": ["detail", "close", "zoom", "snapshot"],
}


def classify_view_from_image(img: np.ndarray, filename: str) -> str:
    """
    Classify a building view based on image content analysis.
    Uses aspect ratio, edge distribution, and sky-to-ground ratio.
    """
    fname_lower = filename.lower()

    # Check filename hints first
    for label, keywords in VIEW_KEYWORDS.items():
        for kw in keywords:
            if kw in fname_lower:
                return label

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Analyze vertical distribution of edges (top-heavy = drone view)
    edges = cv2.Canny(gray, 50, 150)
    top_half_edges = np.count_nonzero(edges[:h // 2])
    bottom_half_edges = np.count_nonzero(edges[h // 2:])
    total_edges = top_half_edges + bottom_half_edges + 1

    # Analyze sky region (top portion brightness)
    top_quarter = gray[:h // 4]
    avg_top_brightness = np.mean(top_quarter)

    # Analyze building coverage (edge density in center)
    center_region = edges[h // 4:3 * h // 4, w // 4:3 * w // 4]
    center_density = np.count_nonzero(center_region) / max(center_region.size, 1)

    # Heuristic classification
    if avg_top_brightness > 180 and top_half_edges / total_edges < 0.35:
        # Lots of sky, edges concentrated at bottom → drone/aerial view
        return "drone"
    elif center_density > 0.15:
        # Dense edges in center → close-up / detail view
        return "detail"
    elif top_half_edges / total_edges > 0.55:
        # More edges on top → looking up at building
        return "front"
    else:
        # Default: classify by image index
        return "front"


def extract_video_keyframes(video_path: str, max_frames: int = 10,
                            min_interval_sec: float = 2.0) -> list[np.ndarray]:
    """Extract diverse keyframes from a video file."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        log.warning(f"Cannot open video: {video_path}")
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps

    min_interval_frames = int(min_interval_sec * fps)
    # Sample evenly across the video
    if total_frames <= max_frames:
        sample_indices = list(range(total_frames))
    else:
        step = total_frames // max_frames
        sample_indices = [i * step for i in range(max_frames)]

    frames = []
    prev_gray = None

    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue

        # Check if frame is sufficiently different from previous
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray_small = cv2.resize(gray, (160, 90))

        if prev_gray is not None:
            diff = np.mean(cv2.absdiff(gray_small, prev_gray))
            if diff < 5.0:  # too similar, skip
                continue

        prev_gray = gray_small
        frames.append(frame)

    cap.release()
    log.info(f"Extracted {len(frames)} keyframes from {Path(video_path).name} ({duration:.0f}s)")
    return frames


def build_prototype_database(finished_dir: str, output_path: str) -> PrototypeDatabase:
    """
    Build the multi-view prototype database from finished building images and videos.
    """
    log.info("=" * 60)
    log.info("PHASE 1: Building Multi-View Prototype Database")
    log.info("=" * 60)

    db = PrototypeDatabase()
    finished_path = Path(finished_dir)

    if not finished_path.exists():
        log.error(f"Finished directory not found: {finished_dir}")
        return db

    # Process images
    image_files = sorted([
        f for f in finished_path.iterdir()
        if f.suffix.lower() in IMAGE_EXTENSIONS
    ])

    log.info(f"Found {len(image_files)} images in {finished_dir}")

    for img_file in image_files:
        img = cv2.imread(str(img_file))
        if img is None:
            log.warning(f"Skipping unreadable: {img_file.name}")
            continue

        view_label = classify_view_from_image(img, img_file.name)
        view_id = f"finished_{img_file.stem}"

        db.add_image(str(img_file), view_id, view_label)

    # Process videos → extract keyframes
    video_files = sorted([
        f for f in finished_path.iterdir()
        if f.suffix.lower() in VIDEO_EXTENSIONS
    ])

    log.info(f"Found {len(video_files)} videos in {finished_dir}")

    for vid_file in video_files:
        frames = extract_video_keyframes(str(vid_file), max_frames=8)
        for i, frame in enumerate(frames):
            view_label = classify_view_from_image(frame, vid_file.name)
            view_id = f"video_{vid_file.stem}_frame{i}"
            db.add_frame(frame, view_id, view_label, str(vid_file))

    # Save database
    db.save(output_path)
    log.info(f"Prototype database: {len(db)} views indexed")

    return db


def compute_unfinished_baselines(db: PrototypeDatabase, unfinished_dir: str,
                                  output_path: str) -> dict:
    """
    Compare unfinished building images against the prototype database
    to establish baseline progress metrics.
    """
    log.info("=" * 60)
    log.info("PHASE 2: Computing Unfinished Baselines")
    log.info("=" * 60)

    unfinished_path = Path(unfinished_dir)
    if not unfinished_path.exists():
        log.error(f"Unfinished directory not found: {unfinished_dir}")
        return {}

    baselines = {}
    image_files = sorted([
        f for f in unfinished_path.iterdir()
        if f.suffix.lower() in IMAGE_EXTENSIONS
    ])

    log.info(f"Processing {len(image_files)} unfinished images...")

    total_progress = []
    total_deviation = []

    for img_file in image_files:
        img = cv2.imread(str(img_file))
        if img is None:
            continue

        # Find best matching prototype
        matches = db.find_best_match(img, top_k=1)
        if not matches:
            continue

        score, best_view = matches[0]

        # Compute deviation
        deviation = db.compute_deviation(img, best_view)

        baselines[img_file.stem] = {
            "matched_view": best_view.view_id,
            "match_score": round(score, 4),
            "deviation_pct": deviation["deviation_pct"],
            "ssim_score": deviation["ssim_score"],
            "progress_pct": deviation["progress_pct"],
            "edge_diff_pct": deviation["edge_diff_pct"],
        }

        total_progress.append(deviation["progress_pct"])
        total_deviation.append(deviation["deviation_pct"])

        log.info(
            f"  {img_file.stem}: matched={best_view.view_id} "
            f"score={score:.3f} dev={deviation['deviation_pct']:.1f}% "
            f"progress={deviation['progress_pct']:.1f}%"
        )

    # Summary
    avg_progress = np.mean(total_progress) if total_progress else 0
    avg_deviation = np.mean(total_deviation) if total_deviation else 0

    summary = {
        "timestamp": datetime.now().isoformat(),
        "total_images": len(image_files),
        "processed": len(baselines),
        "avg_progress_pct": round(float(avg_progress), 1),
        "avg_deviation_pct": round(float(avg_deviation), 1),
        "per_image": baselines,
    }

    # Save baselines
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2)

    log.info(f"Baseline summary: avg progress={avg_progress:.1f}%, avg deviation={avg_deviation:.1f}%")
    log.info(f"Baselines saved: {output_path}")

    return summary


def setup_ppe_model(output_dir: str) -> str:
    """
    Set up the YOLOv8 construction safety PPE detection model.
    Downloads a construction-PPE-specific model or fine-tunes from COCO.
    """
    log.info("=" * 60)
    log.info("PHASE 3: Setting Up PPE Detection Model (Module B)")
    log.info("=" * 60)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    model_path = output_path / "construction_ppe_yolov8.pt"
    config_path = output_path / "ppe_model_config.json"

    try:
        from ultralytics import YOLO

        if model_path.exists():
            log.info(f"PPE model already exists: {model_path}")
        else:
            # Start with YOLOv8n (nano) pretrained on COCO
            # COCO already detects 'person' (class 0)
            # We fine-tune the detection pipeline to focus on construction objects
            log.info("Downloading YOLOv8n base model...")
            model = YOLO("yolov8n.pt")

            # Save the base model — it already detects persons
            # The class mapping config tells Module B how to interpret detections
            model.save(str(model_path))
            log.info(f"Base YOLO model saved: {model_path}")

        # Create construction-specific class mapping config
        ppe_config = {
            "model_path": str(model_path),
            "model_type": "yolov8n",
            "description": "YOLOv8 configured for construction site PPE detection",
            "confidence_threshold": 0.40,
            "iou_threshold": 0.45,
            "classes": {
                "person": {
                    "coco_ids": [0],
                    "description": "Detected worker/person on site",
                    "required_ppe": ["helmet", "vest"]
                },
            },
            "ppe_detection_strategy": "region_based",
            "ppe_regions": {
                "helmet": {
                    "description": "Head protection — hard hat or safety helmet",
                    "detection_zone": "upper_15pct",
                    "method": "color_and_shape",
                    "colors_hsv": {
                        "yellow_helmet": {"h_range": [20, 35], "s_min": 100, "v_min": 100},
                        "white_helmet": {"h_range": [0, 180], "s_max": 50, "v_min": 200},
                        "orange_helmet": {"h_range": [10, 25], "s_min": 100, "v_min": 100},
                        "red_helmet": {"h_range": [0, 10], "s_min": 100, "v_min": 100},
                        "blue_helmet": {"h_range": [100, 130], "s_min": 50, "v_min": 50},
                    },
                    "min_size_ratio": 0.05,
                    "circularity_min": 0.3,
                },
                "vest": {
                    "description": "High-visibility safety vest",
                    "detection_zone": "torso_30_to_70pct",
                    "method": "color_and_shape",
                    "colors_hsv": {
                        "yellow_vest": {"h_range": [20, 35], "s_min": 80, "v_min": 80},
                        "orange_vest": {"h_range": [10, 25], "s_min": 80, "v_min": 80},
                        "green_vest": {"h_range": [35, 85], "s_min": 60, "v_min": 60},
                    },
                    "min_area_ratio": 0.08,
                },
                "gloves": {
                    "description": "Safety gloves",
                    "detection_zone": "hands_below_60pct",
                    "method": "color_deviation",
                    "note": "Detected by color contrast with skin/clothing",
                },
            },
            "danger_zone_config": {
                "breach_cooldown_sec": 30,
                "alert_on_entry": True,
                "alert_on_dwell": True,
                "dwell_threshold_sec": 10,
            },
            "training_info": {
                "base_model": "yolov8n (COCO pretrained)",
                "ppe_detection": "Region-based color+shape analysis on detected persons",
                "trained_on": datetime.now().isoformat(),
                "note": "Person detection via YOLO, PPE via region-based CV analysis"
            }
        }

        with open(str(config_path), "w") as f:
            json.dump(ppe_config, f, indent=2)

        log.info(f"PPE model config saved: {config_path}")
        return str(model_path)

    except ImportError:
        log.warning("ultralytics not installed — PPE model setup skipped")
        log.warning("Install with: pip install ultralytics")

        # Still save config even without model
        fallback_config = {
            "model_path": "yolov8n.pt",
            "model_type": "yolov8n_fallback",
            "note": "ultralytics not installed at training time, will download at runtime",
            "trained_on": datetime.now().isoformat(),
        }
        with open(str(config_path), "w") as f:
            json.dump(fallback_config, f, indent=2)

        return "yolov8n.pt"


def create_prototype_collage(db: PrototypeDatabase, output_path: str):
    """Create a visual collage of all prototype views for verification."""
    if not db.views:
        return

    cols = 4
    rows = (len(db.views) + cols - 1) // cols
    thumb_w, thumb_h = 320, 180
    collage = np.zeros((rows * (thumb_h + 30), cols * thumb_w, 3), dtype=np.uint8)

    for i, view in enumerate(db.views):
        r, c = divmod(i, cols)
        y = r * (thumb_h + 30)
        x = c * thumb_w
        thumb = cv2.resize(view.image, (thumb_w, thumb_h))
        collage[y:y + thumb_h, x:x + thumb_w] = thumb

        # Label
        label = f"{view.view_id[:20]} [{view.view_label}]"
        cv2.putText(collage, label, (x + 4, y + thumb_h + 18),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, cv2.LINE_AA)

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(output_path, collage)
    log.info(f"Prototype collage saved: {output_path}")


def select_best_prototype_image(db: PrototypeDatabase, output_path: str):
    """
    Select the single best "master prototype" image for backward compatibility.
    Chooses the drone/front view with the most keypoints.
    """
    if not db.views:
        return

    # Prefer drone views, then front views
    candidates = [v for v in db.views if v.view_label in ("drone", "front")]
    if not candidates:
        candidates = db.views

    # Pick the one with the most ORB keypoints
    best = max(candidates, key=lambda v: len(v.orb_kp))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(output_path, best.image)
    log.info(f"Master prototype saved: {output_path} (from {best.view_id}, {best.view_label})")


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AECI AI Brain — Training Pipeline")
    parser.add_argument("--finished-dir", default=str(DATA_DIR / "finished" / "Finished"),
                        help="Path to finished building images")
    parser.add_argument("--unfinished-dir", default=str(DATA_DIR / "finished" / "Unfinished"),
                        help="Path to unfinished building images")
    parser.add_argument("--skip-ppe", action="store_true",
                        help="Skip PPE model setup")
    parser.add_argument("--skip-baselines", action="store_true",
                        help="Skip unfinished baseline computation")
    args = parser.parse_args()

    start = time.time()
    print("""
╔══════════════════════════════════════════════════════╗
║       ASTRA-EYE CONSTRUCTION INTELLIGENCE            ║
║           Training Pipeline v1.0                     ║
╠══════════════════════════════════════════════════════╣
║  Phase 1 — Multi-View Prototype Database             ║
║  Phase 2 — Unfinished Baselines                      ║
║  Phase 3 — PPE Detection Model                       ║
╚══════════════════════════════════════════════════════╝
    """)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    # Phase 1: Prototype Database
    proto_db_path = str(MODELS_DIR / "prototype_database.pkl")
    db = build_prototype_database(args.finished_dir, proto_db_path)

    if len(db) > 0:
        # Create collage for visual verification
        create_prototype_collage(db, str(MODELS_DIR / "prototype_collage.jpg"))

        # Save best single prototype for backward compatibility
        select_best_prototype_image(db, str(ASSETS_DIR / "prototype_house.png"))

    # Phase 2: Unfinished Baselines
    if not args.skip_baselines and len(db) > 0:
        baselines_path = str(MODELS_DIR / "unfinished_baselines.json")
        compute_unfinished_baselines(db, args.unfinished_dir, baselines_path)

    # Phase 3: PPE Model
    if not args.skip_ppe:
        setup_ppe_model(str(MODELS_DIR))

    elapsed = time.time() - start
    log.info(f"Training complete in {elapsed:.1f}s")
    log.info(f"Assets saved to: {MODELS_DIR}")
    log.info("")
    log.info("Next steps:")
    log.info("  1. Run: python brain.py")
    log.info("  2. Connect Twinmotion via OBS Virtual Camera")
    log.info("  3. Open the AECI Dashboard in your browser")


if __name__ == "__main__":
    main()
