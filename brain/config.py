"""
AECI AI Brain — Configuration loader
Reads from .env file and provides typed config throughout the brain.
"""
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load .env from brain/ directory
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()  # fallback to cwd

class Config:
    # ── Deployment Mode ──────────────────────────
    MODE: str = os.getenv("AECI_MODE", "replit")           # replit | local | mongodb
    API_URL: str = os.getenv("AECI_API_URL", "http://localhost:8080/api")
    MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017/aeci")

    # ── Video ─────────────────────────────────────
    VIDEO_SOURCE: str | int = os.getenv("VIDEO_SOURCE", "0")
    CAMERA_VIEW: str = os.getenv("CAMERA_VIEW", "auto")

    # ── Model paths ───────────────────────────────
    YOLO_MODEL_PATH: str = os.getenv("YOLO_MODEL_PATH", "assets/custom_yolo.pt")
    PROTOTYPE_IMAGE_PATH: str = os.getenv("PROTOTYPE_IMAGE_PATH", "assets/prototype_house.png")

    # ── Trained model paths (from train.py) ─────
    PROTO_DB_PATH: str = os.getenv("PROTO_DB_PATH", "assets/trained/prototype_database.pkl")
    BASELINES_PATH: str = os.getenv("BASELINES_PATH", "assets/trained/unfinished_baselines.json")
    PPE_CONFIG_PATH: str = os.getenv("PPE_CONFIG_PATH", "assets/trained/ppe_model_config.json")

    # ── Module toggles ────────────────────────────
    MODULE_A_ENABLED: bool = os.getenv("MODULE_A_ENABLED", "true").lower() == "true"
    MODULE_B_ENABLED: bool = os.getenv("MODULE_B_ENABLED", "true").lower() == "true"
    MODULE_C_ENABLED: bool = os.getenv("MODULE_C_ENABLED", "true").lower() == "true"

    # ── Thresholds ────────────────────────────────
    DEVIATION_THRESHOLD: float = float(os.getenv("DEVIATION_THRESHOLD", "5.0"))
    YOLO_CONFIDENCE: float = float(os.getenv("YOLO_CONFIDENCE", "0.45"))
    IDLE_THRESHOLD: float = float(os.getenv("IDLE_THRESHOLD", "15.0"))
    IDLE_TIMEOUT_SEC: int = int(os.getenv("IDLE_TIMEOUT_SEC", "300"))

    # ── Danger zones ──────────────────────────────
    DANGER_ZONES: list = json.loads(
        os.getenv("DANGER_ZONES_JSON",
            '[{"name":"Crane Zone","risk":"critical","polygon":[[50,50],[300,50],[300,200],[50,200]]}]'
        )
    )

    # ── Reporting ─────────────────────────────────
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # ── Brain settings ────────────────────────────
    HEARTBEAT_INTERVAL: float = float(os.getenv("HEARTBEAT_INTERVAL", "1.0"))
    FRAME_SKIP: int = int(os.getenv("FRAME_SKIP", "3"))
    SAVE_DEBUG_FRAMES: bool = os.getenv("SAVE_DEBUG_FRAMES", "false").lower() == "true"
    DEBUG_FRAME_DIR: str = os.getenv("DEBUG_FRAME_DIR", "outputs/debug_frames")

    @classmethod
    def video_source(cls) -> int | str:
        """Return the video source as int (device index) or string (file path)."""
        try:
            return int(cls.VIDEO_SOURCE)
        except (ValueError, TypeError):
            return cls.VIDEO_SOURCE

    @classmethod
    def validate(cls) -> list[str]:
        """Return a list of configuration warnings."""
        warnings = []
        if cls.MODE == "replit" and "your-repl-name" in cls.API_URL:
            warnings.append("AECI_API_URL still has placeholder — set it to your Replit URL")
        if cls.MODE == "mongodb" and cls.MONGODB_URI == "mongodb://localhost:27017/aeci":
            warnings.append("MONGODB_URI is default local — update for Atlas")
        if not Path(cls.PROTOTYPE_IMAGE_PATH).exists():
            warnings.append(f"Prototype image not found: {cls.PROTOTYPE_IMAGE_PATH} — Module A disabled")
        if not Path(cls.YOLO_MODEL_PATH).exists():
            warnings.append(f"Custom YOLO weights not found: {cls.YOLO_MODEL_PATH} — using pretrained yolov8n")
        return warnings

cfg = Config()
