#!/usr/bin/env python3
"""
Inspect YOLO model to see class names
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    from ultralytics import YOLO
    
    model_path = Path("assets/trained/construction_ppe_yolov8.pt")
    
    if not model_path.exists():
        print(f"[ERROR] Model not found: {model_path}")
        sys.exit(1)
    
    print(f"[INFO] Loading model: {model_path}")
    model = YOLO(str(model_path))
    
    print("\n" + "="*60)
    print("MODEL CLASS NAMES:")
    print("="*60)
    
    if hasattr(model, 'names'):
        names = model.names
        print(f"\nTotal classes: {len(names)}")
        print("\nClass mappings:")
        for idx, name in names.items():
            print(f"  [{idx}] {name}")
    else:
        print("[WARNING] Model has no 'names' attribute")
    
    # Try to get model info
    print("\n" + "="*60)
    print("MODEL INFO:")
    print("="*60)
    
    try:
        # Run on dummy image to see detection
        import numpy as np
        dummy = np.zeros((640, 480, 3), dtype=np.uint8)
        results = model(dummy, verbose=False)
        if results and len(results) > 0:
            print(f"\nModel can run inference: ✓")
            print(f"Result boxes: {len(results[0].boxes) if results[0].boxes else 0}")
    except Exception as e:
        print(f"[WARNING] Test inference failed: {e}")
    
    print("\n" + "="*60)
    
except ImportError:
    print("[ERROR] ultralytics not installed. Run: pip install ultralytics")
    sys.exit(1)
except Exception as e:
    print(f"[ERROR] {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
