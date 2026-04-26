#!/usr/bin/env python3
"""Evaluate a baseline model on the manifest's `test` split."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List

import numpy as np

try:
    import joblib  # type: ignore
    from sklearn.metrics import accuracy_score, classification_report  # type: ignore
except ImportError:  # pragma: no cover
    joblib = None  # type: ignore[assignment]

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from _lib import MANIFEST_DIR, info, read_jsonl, warn  # noqa: E402

# We re-use the feature extractor from train_audio_baseline.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_audio_baseline import extract_features  # type: ignore  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_DIR / "hearer_train_manifest.jsonl",
    )
    p.add_argument(
        "--model",
        type=Path,
        default=Path(__file__).resolve().parent.parent
        / "artifacts"
        / "audio_baseline"
        / "model.pkl",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if joblib is None:
        warn("scikit-learn / joblib not installed.")
        return 1
    if not args.model.exists():
        warn(f"Model not found: {args.model}")
        return 1
    if not args.manifest.exists():
        warn(f"Manifest not found: {args.manifest}")
        return 1

    rows = [r for r in read_jsonl(args.manifest) if r.get("split") == "test"]
    if not rows:
        warn("No 'test' split rows in manifest.")
        return 1

    labels_path = args.model.parent / "labels.json"
    classes: List[str]
    if labels_path.exists():
        with open(labels_path, "r", encoding="utf-8") as f:
            classes = json.load(f)["classes"]
    else:
        classes = sorted({r["hearer_label"] for r in rows})

    feats: List[np.ndarray] = []
    y: List[int] = []
    for r in rows:
        path = Path(r["source_path"])
        if not path.exists():
            continue
        try:
            feats.append(extract_features(path))
        except Exception:  # noqa: BLE001
            continue
        y.append(classes.index(r["hearer_label"]))

    if not feats:
        warn("No usable test rows.")
        return 1
    X = np.stack(feats)
    clf = joblib.load(args.model)
    pred = clf.predict(X)
    acc = float(accuracy_score(y, pred))
    info(f"Test accuracy: {acc:.3f}")
    info(classification_report(y, pred, target_names=classes, zero_division=0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
