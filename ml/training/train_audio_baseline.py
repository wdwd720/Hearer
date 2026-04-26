#!/usr/bin/env python3
"""Train a small CPU-friendly baseline classifier.

This is intentionally lightweight: log-mel feature averages → logistic
regression. It exists to prove the dataset → model → runtime path; it is
not expected to be production-quality.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import List, Tuple

import numpy as np

try:
    import librosa  # type: ignore
except ImportError:
    librosa = None

try:
    import joblib  # type: ignore
    from sklearn.linear_model import LogisticRegression  # type: ignore
    from sklearn.metrics import accuracy_score, classification_report  # type: ignore
except ImportError:  # pragma: no cover
    joblib = None  # type: ignore[assignment]
    LogisticRegression = None  # type: ignore[assignment]
    accuracy_score = None  # type: ignore[assignment]
    classification_report = None  # type: ignore[assignment]

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from _lib import MANIFEST_DIR, info, read_jsonl, warn  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_DIR / "hearer_train_manifest.jsonl",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "artifacts" / "audio_baseline",
    )
    p.add_argument("--max-clips", type=int, default=4000)
    return p.parse_args()


def extract_features(path: Path, sr: int = 16000) -> np.ndarray:
    if librosa is None:
        raise RuntimeError("librosa is not installed. Install ml/requirements.txt.")
    y, file_sr = librosa.load(str(path), sr=sr, mono=True)
    if y.size == 0:
        return np.zeros(64, dtype=np.float32)
    mel = librosa.feature.melspectrogram(y=y, sr=sr, n_mels=64)
    log_mel = librosa.power_to_db(mel)
    return np.mean(log_mel, axis=1).astype(np.float32)


def collect(manifest_path: Path, max_clips: int) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    rows = read_jsonl(manifest_path)
    if max_clips and len(rows) > max_clips:
        rows = rows[:max_clips]
    feats: List[np.ndarray] = []
    labels: List[str] = []
    for r in rows:
        path = Path(r["source_path"])
        if not path.exists():
            continue
        try:
            f = extract_features(path)
        except Exception as e:  # noqa: BLE001
            warn(f"Skipping {path}: {e}")
            continue
        feats.append(f)
        labels.append(r["hearer_label"])
    if not feats:
        raise RuntimeError("No usable rows found.")
    X = np.stack(feats)
    classes = sorted(set(labels))
    y = np.array([classes.index(l) for l in labels], dtype=np.int32)
    return X, y, classes


def main() -> int:
    args = parse_args()
    if librosa is None:
        warn(
            "librosa is not installed. Install ml/requirements.txt before training."
        )
        return 1
    if joblib is None or LogisticRegression is None:
        warn(
            "scikit-learn / joblib are not installed. Install ml/requirements.txt before training."
        )
        return 1

    info(f"Manifest: {args.manifest}")
    X, y, classes = collect(args.manifest, args.max_clips)
    info(f"Collected {X.shape[0]} clips × {X.shape[1]} features over {len(classes)} classes.")
    info(f"Label distribution: {Counter(classes[i] for i in y)}")

    # Naive train/val split — manifest already carries `split`, but we keep
    # this skeleton minimal. Future work: respect official splits.
    rng = np.random.default_rng(seed=42)
    idx = rng.permutation(X.shape[0])
    n_train = int(0.85 * len(idx))
    train_idx, val_idx = idx[:n_train], idx[n_train:]

    clf = LogisticRegression(max_iter=2000, n_jobs=None)
    clf.fit(X[train_idx], y[train_idx])
    pred = clf.predict(X[val_idx])
    acc = float(accuracy_score(y[val_idx], pred))
    report = classification_report(
        y[val_idx], pred, target_names=classes, zero_division=0
    )
    info(f"Validation accuracy: {acc:.3f}")
    info(report)

    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, args.output / "model.pkl")
    with open(args.output / "labels.json", "w", encoding="utf-8") as f:
        json.dump({"classes": classes}, f, indent=2)
    with open(args.output / "metrics.json", "w", encoding="utf-8") as f:
        json.dump({"val_accuracy": acc}, f, indent=2)
    info(f"Wrote artifacts to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
