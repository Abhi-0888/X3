#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  AECI AI Brain — One-click Setup Script
#  Run: bash setup.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║       ASTRA-EYE CONSTRUCTION INTELLIGENCE            ║"
echo "║              Brain Setup v1.0                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Check Python version ──────────────────────────────────────────────────
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
REQUIRED_MAJOR=3
REQUIRED_MINOR=10

python3 -c "
import sys
v = sys.version_info
if v.major < 3 or (v.major == 3 and v.minor < 10):
    print(f'ERROR: Python 3.10+ required, found {v.major}.{v.minor}')
    sys.exit(1)
print(f'Python version: {v.major}.{v.minor}.{v.micro} OK')
"

# ── Create virtual environment ────────────────────────────────────────────
echo "Creating virtual environment in brain/venv..."
python3 -m venv venv
source venv/bin/activate

# ── Upgrade pip ───────────────────────────────────────────────────────────
echo "Upgrading pip..."
pip install --upgrade pip --quiet

# ── Install dependencies ──────────────────────────────────────────────────
echo "Installing dependencies from requirements.txt..."
pip install -r requirements.txt

# Attempt GPU-accelerated PyTorch if CUDA available
if command -v nvidia-smi &> /dev/null; then
    echo "NVIDIA GPU detected. Installing CUDA-enabled PyTorch..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 --quiet
else
    echo "No GPU detected. Using CPU PyTorch (slower inference)."
    pip install torch torchvision torchaudio --quiet
fi

# ── Create directory structure ────────────────────────────────────────────
echo "Creating output directories..."
mkdir -p assets outputs outputs/debug_frames

# ── Copy .env if not exists ───────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo ""
    echo ">>> IMPORTANT: Edit brain/.env with your settings before running brain.py <<<"
    echo "    - Set AECI_API_URL to your Replit/local API URL"
    echo "    - Set AECI_MODE (replit / local / mongodb)"
    echo "    - Set VIDEO_SOURCE (0 = OBS Virtual Camera)"
    echo ""
fi

# ── Download default YOLOv8 weights ──────────────────────────────────────
if [ ! -f "assets/custom_yolo.pt" ]; then
    echo "No custom YOLO weights found. Downloading pretrained yolov8n.pt..."
    python3 -c "
from ultralytics import YOLO
import shutil
m = YOLO('yolov8n.pt')
shutil.copy('yolov8n.pt', 'assets/custom_yolo.pt')
print('Default weights saved to assets/custom_yolo.pt')
print('Replace with your Datature-trained weights for best accuracy.')
"
fi

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║                Setup Complete!                       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Open OBS Studio → Start Virtual Camera"
echo "  2. Open Twinmotion and switch to the view you want to capture"
echo "  3. Edit brain/.env (AECI_API_URL, VIDEO_SOURCE, etc.)"
echo "  4. Capture your 'Ground Truth' prototype screenshot:"
echo "       Set Twinmotion to drone view → press S in the brain window"
echo "  5. Run the brain:"
echo "       source venv/bin/activate"
echo "       python brain.py"
echo ""
echo "  Keys (while running):"
echo "    Q = Quit    A/B/C = Toggle modules"
echo "    D = Drone view    1-5 = Camera views (Front/Back/Top/Left/Right)"
echo "    S = Save current frame as BIM prototype"
echo "    R = Reset database (Production Mode)"
echo ""
