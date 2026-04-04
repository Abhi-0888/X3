"""
Multi-View Prototype Database
==============================
Stores feature embeddings and reference images for all viewpoints of the
finished building. At runtime, incoming frames are matched against this
database to find the closest prototype view, enabling accurate structural
deviation detection from any camera angle.

Features stored per view:
  - ORB keypoints & descriptors  (geometric matching / homography)
  - Color histogram              (fast coarse view retrieval)
  - SIFT descriptors             (robust perspective-invariant matching)
  - Edge map                     (structural outline comparison)
  - Resized reference image      (for SSIM / pixel-diff)
"""

import pickle
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger("AECI.PrototypeDB")

# Standard size all prototypes are stored at
PROTO_SIZE = (1280, 720)


@dataclass
class PrototypeView:
    """A single prototype viewpoint with pre-computed features."""
    view_id: str                          # e.g. "finished_Image1"
    view_label: str                       # e.g. "front", "drone", "left", "detail"
    image_path: str                       # original file path
    image: np.ndarray = field(repr=False) # resized BGR image
    gray: np.ndarray = field(repr=False)  # grayscale
    edges: np.ndarray = field(repr=False) # Canny edge map
    hist: np.ndarray = field(repr=False)  # color histogram (flattened)
    orb_kp: list = field(repr=False, default_factory=list)
    orb_des: Optional[np.ndarray] = field(repr=False, default=None)
    sift_kp: list = field(repr=False, default_factory=list)
    sift_des: Optional[np.ndarray] = field(repr=False, default=None)


class PrototypeDatabase:
    """
    Manages a collection of PrototypeView objects.
    Supports:
      - Adding views from images
      - Finding the best-matching view for a query frame
      - Serialization to / from disk (pickle)
    """

    def __init__(self):
        self.views: list[PrototypeView] = []
        self._orb = cv2.ORB_create(nfeatures=3000)
        self._sift = cv2.SIFT_create(nfeatures=2000)
        self._bf_orb = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=False)
        self._bf_sift = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)

    # ── Building the database ──────────────────────────────────────────────

    def add_image(self, image_path: str, view_id: str, view_label: str = "auto"):
        """Load an image, extract features, add to database."""
        img = cv2.imread(image_path)
        if img is None:
            log.warning(f"Could not read image: {image_path}")
            return
        self._add_from_array(img, image_path, view_id, view_label)

    def add_frame(self, frame: np.ndarray, view_id: str, view_label: str = "auto",
                  image_path: str = ""):
        """Add a frame (numpy array) directly."""
        self._add_from_array(frame, image_path, view_id, view_label)

    def _add_from_array(self, img: np.ndarray, image_path: str,
                        view_id: str, view_label: str):
        resized = cv2.resize(img, PROTO_SIZE)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        # Edge map
        edges = cv2.Canny(gray, 50, 150)

        # Color histogram (H, S channels in HSV — robust to lighting)
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        hist_h = cv2.calcHist([hsv], [0], None, [64], [0, 180])
        hist_s = cv2.calcHist([hsv], [1], None, [64], [0, 256])
        hist_v = cv2.calcHist([hsv], [2], None, [64], [0, 256])
        hist = np.concatenate([hist_h, hist_s, hist_v]).flatten()
        cv2.normalize(hist, hist)

        # ORB features
        orb_kp, orb_des = self._orb.detectAndCompute(gray, None)
        orb_kp_serializable = [
            {"pt": kp.pt, "size": kp.size, "angle": kp.angle,
             "response": kp.response, "octave": kp.octave, "class_id": kp.class_id}
            for kp in (orb_kp or [])
        ]

        # SIFT features
        sift_kp, sift_des = self._sift.detectAndCompute(gray, None)
        sift_kp_serializable = [
            {"pt": kp.pt, "size": kp.size, "angle": kp.angle,
             "response": kp.response, "octave": kp.octave, "class_id": kp.class_id}
            for kp in (sift_kp or [])
        ]

        view = PrototypeView(
            view_id=view_id,
            view_label=view_label,
            image_path=image_path,
            image=resized,
            gray=gray,
            edges=edges,
            hist=hist,
            orb_kp=orb_kp_serializable,
            orb_des=orb_des,
            sift_kp=sift_kp_serializable,
            sift_des=sift_des,
        )

        self.views.append(view)
        kp_count = len(orb_kp_serializable) + len(sift_kp_serializable)
        log.info(f"Added view '{view_id}' ({view_label}) — {kp_count} keypoints")

    # ── Querying ────────────────────────────────────────────────────────────

    def find_best_match(self, frame: np.ndarray, top_k: int = 3) -> list[tuple[float, PrototypeView]]:
        """
        Find the top-K best matching prototype views for a query frame.
        Returns list of (score, PrototypeView) sorted by descending score.
        Score is a combined metric (0–1) from histogram + ORB matches.
        """
        if not self.views:
            return []

        resized = cv2.resize(frame, PROTO_SIZE)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        # Query histogram
        hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
        hist_h = cv2.calcHist([hsv], [0], None, [64], [0, 180])
        hist_s = cv2.calcHist([hsv], [1], None, [64], [0, 256])
        hist_v = cv2.calcHist([hsv], [2], None, [64], [0, 256])
        q_hist = np.concatenate([hist_h, hist_s, hist_v]).flatten()
        cv2.normalize(q_hist, q_hist)

        # Query ORB
        q_orb_kp, q_orb_des = self._orb.detectAndCompute(gray, None)

        scores = []
        for view in self.views:
            # Histogram similarity (Bhattacharyya — lower is better, convert to similarity)
            hist_dist = cv2.compareHist(
                q_hist.astype(np.float32), view.hist.astype(np.float32),
                cv2.HISTCMP_BHATTACHARYYA
            )
            hist_score = max(0.0, 1.0 - hist_dist)

            # ORB feature matching score
            orb_score = 0.0
            if q_orb_des is not None and view.orb_des is not None and len(q_orb_des) > 2 and len(view.orb_des) > 2:
                matches = self._bf_orb.knnMatch(q_orb_des, view.orb_des, k=2)
                good = 0
                for m_pair in matches:
                    if len(m_pair) == 2:
                        m, n = m_pair
                        if m.distance < 0.75 * n.distance:
                            good += 1
                orb_score = min(1.0, good / 80.0)  # normalize: 80+ good matches = 1.0

            # Combined score (histogram 40%, ORB 60%)
            combined = hist_score * 0.4 + orb_score * 0.6
            scores.append((combined, view))

        scores.sort(key=lambda x: x[0], reverse=True)
        return scores[:top_k]

    def compute_deviation(self, frame: np.ndarray, proto_view: PrototypeView) -> dict:
        """
        Compute structural deviation between a live frame and a prototype view.
        Uses SSIM + edge comparison + pixel diff for robust detection.
        Returns:
            {
                deviation_pct: float,
                ssim_score: float,
                edge_diff_pct: float,
                diff_mask: np.ndarray,
                anomaly_contours: list,
                progress_pct: float,
            }
        """
        resized = cv2.resize(frame, PROTO_SIZE)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        # ── 1. SSIM (Structural Similarity Index) ──────────────────────────
        ssim_val = self._compute_ssim(gray, proto_view.gray)

        # ── 2. Pixel-level absolute difference ─────────────────────────────
        diff = cv2.absdiff(gray, proto_view.gray)
        _, thresh = cv2.threshold(diff, 35, 255, cv2.THRESH_BINARY)
        kernel = np.ones((7, 7), np.uint8)
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        thresh = cv2.dilate(thresh, kernel, iterations=2)

        h, w = gray.shape
        total_px = h * w
        anomaly_px = np.count_nonzero(thresh)
        pixel_dev_pct = (anomaly_px / total_px) * 100

        # ── 3. Edge-based structural comparison ────────────────────────────
        live_edges = cv2.Canny(gray, 50, 150)
        edge_diff = cv2.absdiff(live_edges, proto_view.edges)
        edge_diff_pct = (np.count_nonzero(edge_diff) / total_px) * 100

        # ── 4. Combined deviation score ────────────────────────────────────
        # Weight: SSIM 40%, pixel diff 35%, edge diff 25%
        ssim_dev = (1.0 - ssim_val) * 100  # convert similarity to deviation
        deviation_pct = ssim_dev * 0.40 + pixel_dev_pct * 0.35 + edge_diff_pct * 0.25

        # ── 5. Find anomaly contours ───────────────────────────────────────
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        significant_contours = [c for c in contours if cv2.contourArea(c) > 500]

        # ── 6. Progress estimation ─────────────────────────────────────────
        # Progress = how structurally similar the live frame is to the finished prototype
        progress_pct = round(max(0.0, min(100.0, ssim_val * 100)), 1)

        return {
            "deviation_pct": round(deviation_pct, 2),
            "ssim_score": round(ssim_val, 4),
            "edge_diff_pct": round(edge_diff_pct, 2),
            "pixel_diff_pct": round(pixel_dev_pct, 2),
            "diff_mask": thresh,
            "anomaly_contours": significant_contours,
            "progress_pct": progress_pct,
        }

    @staticmethod
    def _compute_ssim(img1: np.ndarray, img2: np.ndarray, win_size: int = 11) -> float:
        """Compute SSIM between two grayscale images (same size)."""
        C1 = (0.01 * 255) ** 2
        C2 = (0.03 * 255) ** 2

        img1 = img1.astype(np.float64)
        img2 = img2.astype(np.float64)

        mu1 = cv2.GaussianBlur(img1, (win_size, win_size), 1.5)
        mu2 = cv2.GaussianBlur(img2, (win_size, win_size), 1.5)

        mu1_sq = mu1 ** 2
        mu2_sq = mu2 ** 2
        mu1_mu2 = mu1 * mu2

        sigma1_sq = cv2.GaussianBlur(img1 ** 2, (win_size, win_size), 1.5) - mu1_sq
        sigma2_sq = cv2.GaussianBlur(img2 ** 2, (win_size, win_size), 1.5) - mu2_sq
        sigma12 = cv2.GaussianBlur(img1 * img2, (win_size, win_size), 1.5) - mu1_mu2

        ssim_map = ((2 * mu1_mu2 + C1) * (2 * sigma12 + C2)) / \
                   ((mu1_sq + mu2_sq + C1) * (sigma1_sq + sigma2_sq + C2))

        return float(np.mean(ssim_map))

    # ── Persistence ─────────────────────────────────────────────────────────

    def save(self, path: str):
        """Save the database to a pickle file."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)

        # Convert PrototypeView objects to serializable dicts
        data = []
        for v in self.views:
            data.append({
                "view_id": v.view_id,
                "view_label": v.view_label,
                "image_path": v.image_path,
                "image": v.image,
                "gray": v.gray,
                "edges": v.edges,
                "hist": v.hist,
                "orb_kp": v.orb_kp,
                "orb_des": v.orb_des,
                "sift_kp": v.sift_kp,
                "sift_des": v.sift_des,
            })

        with open(path, "wb") as f:
            pickle.dump({"version": 2, "views": data}, f, protocol=pickle.HIGHEST_PROTOCOL)

        log.info(f"Prototype database saved: {path} ({len(self.views)} views, {p.stat().st_size / 1024 / 1024:.1f} MB)")

    @classmethod
    def load(cls, path: str) -> "PrototypeDatabase":
        """Load a database from a pickle file."""
        db = cls()
        p = Path(path)
        if not p.exists():
            log.warning(f"Prototype DB not found: {path}")
            return db

        with open(path, "rb") as f:
            raw = pickle.load(f)

        if raw.get("version", 1) < 2:
            log.warning("Old prototype DB version, re-training recommended")
            return db

        for d in raw["views"]:
            # Reconstruct ORB keypoints from serialized form
            orb_kp_cv = [
                cv2.KeyPoint(
                    x=kp["pt"][0], y=kp["pt"][1], size=kp["size"],
                    angle=kp["angle"], response=kp["response"],
                    octave=kp["octave"], class_id=kp["class_id"]
                )
                for kp in d["orb_kp"]
            ]
            sift_kp_cv = [
                cv2.KeyPoint(
                    x=kp["pt"][0], y=kp["pt"][1], size=kp["size"],
                    angle=kp["angle"], response=kp["response"],
                    octave=kp["octave"], class_id=kp["class_id"]
                )
                for kp in d["sift_kp"]
            ]

            view = PrototypeView(
                view_id=d["view_id"],
                view_label=d["view_label"],
                image_path=d["image_path"],
                image=d["image"],
                gray=d["gray"],
                edges=d["edges"],
                hist=d["hist"],
                orb_kp=d["orb_kp"],
                orb_des=d["orb_des"],
                sift_kp=d["sift_kp"],
                sift_des=d["sift_des"],
            )
            # Store cv2 keypoints for runtime matching
            view._cv2_orb_kp = orb_kp_cv
            view._cv2_sift_kp = sift_kp_cv
            db.views.append(view)

        log.info(f"Prototype database loaded: {path} ({len(db.views)} views)")
        return db

    def __len__(self):
        return len(self.views)

    def __repr__(self):
        labels = [v.view_label for v in self.views]
        return f"PrototypeDatabase({len(self.views)} views: {', '.join(set(labels))})"
