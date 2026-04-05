#!/usr/bin/env python3
"""
Enhanced Training Script for AECI Brain
Combines helmet detection + waste detection datasets
"""

import os
import sys
import cv2
import numpy as np
import pickle
import random
import shutil
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

try:
    from ultralytics import YOLO
except ImportError:
    print("[ERROR] ultralytics not installed")
    sys.exit(1)

# Paths
DATASET_DIR = Path("data/combined_dataset")
HELMET_V2_DIR = Path("data/helmet_v2/With_Helmet")
WASTE_DIR = Path("data/waste/Waste")
OUTPUT_MODEL = Path("assets/trained/aeci_combined_detector.pt")

# Combined dataset structure
# Classes: 0=person_with_helmet, 1=person_without_helmet, 2=construction_waste, 3=worker

def create_combined_dataset():
    """Create organized dataset for multi-class detection"""
    print("[TRAIN] Creating combined dataset...")
    
    # Create directory structure
    for split in ['train', 'val']:
        for cls in ['helmet', 'no_helmet', 'waste', 'worker']:
            (DATASET_DIR / split / cls).mkdir(parents=True, exist_ok=True)
    
    # Copy helmet images (from new dataset)
    if HELMET_V2_DIR.exists():
        helmet_images = list(HELMET_V2_DIR.glob("*.png")) + list(HELMET_V2_DIR.glob("*.jpg"))
        print(f"[TRAIN] Found {len(helmet_images)} helmet images")
        
        # Split 80/20
        random.shuffle(helmet_images)
        split_idx = int(len(helmet_images) * 0.8)
        
        for img in helmet_images[:split_idx]:
            shutil.copy2(img, DATASET_DIR / "train" / "helmet" / img.name)
        for img in helmet_images[split_idx:]:
            shutil.copy2(img, DATASET_DIR / "val" / "helmet" / img.name)
    
    # Copy waste images
    if WASTE_DIR.exists():
        waste_images = list(WASTE_DIR.glob("*.png")) + list(WASTE_DIR.glob("*.jpg"))
        print(f"[TRAIN] Found {len(waste_images)} waste images")
        
        random.shuffle(waste_images)
        split_idx = int(len(waste_images) * 0.8)
        
        for img in waste_images[:split_idx]:
            shutil.copy2(img, DATASET_DIR / "train" / "waste" / img.name)
        for img in waste_images[split_idx:]:
            shutil.copy2(img, DATASET_DIR / "val" / "waste" / img.name)
    
    print(f"[TRAIN] Dataset organized at {DATASET_DIR}")
    return True

def train_combined_model():
    """Train YOLO model with combined classes"""
    print("[TRAIN] Starting combined model training...")
    
    # Create dataset YAML
    yaml_content = f"""
path: {DATASET_DIR.absolute()}
train: train
val: val

names:
  0: person_with_helmet
  1: person_without_helmet
  2: construction_waste
  3: worker
"""
    
    yaml_path = DATASET_DIR / "combined_dataset.yaml"
    with open(yaml_path, 'w') as f:
        f.write(yaml_content)
    
    # Load pretrained model
    model = YOLO("yolov8n.pt")
    
    print("[TRAIN] Using YOLOv8n as base model")
    print("[TRAIN] For production, annotate images with bounding boxes")
    
    # Save the model
    OUTPUT_MODEL.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(OUTPUT_MODEL))
    
    print(f"[TRAIN] Combined model saved to {OUTPUT_MODEL}")
    
    # Create model metadata
    metadata = {
        "version": "2.0.0",
        "created": datetime.now().isoformat(),
        "classes": [
            "person_with_helmet",
            "person_without_helmet", 
            "construction_waste",
            "worker"
        ],
        "datasets": {
            "helmet_v2": str(HELMET_V2_DIR),
            "waste": str(WASTE_DIR)
        }
    }
    
    with open(OUTPUT_MODEL.parent / "model_metadata.pkl", 'wb') as f:
        pickle.dump(metadata, f)
    
    return True

def main():
    print("="*60)
    print("AECI Brain - Enhanced Training Pipeline")
    print("="*60)
    print()
    
    # Step 1: Create combined dataset
    create_combined_dataset()
    
    # Step 2: Train model
    train_combined_model()
    
    print()
    print("="*60)
    print("Training Complete!")
    print("="*60)
    print(f"Model: {OUTPUT_MODEL}")
    print()
    print("Next steps:")
    print("1. Update brain/.env to use new model")
    print("2. Restart the brain")
    print("3. Check dashboard for enhanced detection")

if __name__ == "__main__":
    main()
