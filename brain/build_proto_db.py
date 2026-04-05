#!/usr/bin/env python3
"""
Build Prototype Database for Module A
====================================
Creates a multi-view prototype database from existing prototype images.
"""

import sys
import cv2
import numpy as np
from pathlib import Path

# Add brain to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from models.prototype_db import PrototypeDatabase, PrototypeView
except ImportError as e:
    print(f"[ERROR] Cannot import prototype_db: {e}")
    sys.exit(1)

def build_database():
    """Build prototype database from available images."""
    print("[BUILD] Creating prototype database...")
    
    db = PrototypeDatabase()
    assets_dir = Path("assets")
    
    # Look for prototype images
    prototype_files = [
        assets_dir / "prototype_house.png",
        assets_dir / "trained" / "prototype_collage.jpg",
    ]
    
    added = 0
    for i, img_path in enumerate(prototype_files):
        if img_path.exists():
            print(f"[BUILD] Adding {img_path.name}...")
            view_id = f"view_{i:03d}"
            view_label = img_path.stem.replace("prototype_", "").replace("_", "-")
            db.add_image(str(img_path), view_id=view_id, view_label=view_label)
            added += 1
        else:
            print(f"[BUILD] Not found: {img_path}")
    
    if added == 0:
        print("[BUILD] WARNING: No prototype images found!")
        print("[BUILD] Creating demo view from blank image...")
        # Create a blank prototype as fallback
        blank = np.ones((720, 1280, 3), dtype=np.uint8) * 200
        cv2.putText(blank, "PROTOTYPE PLACEHOLDER", (400, 360), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
        db.add_frame(blank, view_id="view_000", view_label="default")
        added = 1
    
    # Save database
    output_path = assets_dir / "trained" / "prototype_database.pkl"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        db.save(str(output_path))
        print(f"[BUILD] Database saved: {output_path}")
        print(f"[BUILD] Total views: {len(db)}")
        
        # Verify by loading
        db2 = PrototypeDatabase.load(str(output_path))
        print(f"[BUILD] Verification: Loaded {len(db2)} views")
        
        return True
    except Exception as e:
        print(f"[ERROR] Failed to save database: {e}")
        return False

if __name__ == "__main__":
    success = build_database()
    sys.exit(0 if success else 1)
