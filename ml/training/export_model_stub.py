#!/usr/bin/env python3
"""Stub: write a model manifest the runtime can pick up later.

Actual conversion to ONNX / TFLite / TensorFlow.js is a follow-up. For now
this writes a small JSON file enumerating the trained classes so the
frontend's `LocalTrainedModelAdapterStub` can show "model present".
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from _lib import info, warn  # type: ignore  # noqa: E402


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--artifacts",
        type=Path,
        default=Path(__file__).resolve().parent.parent
        / "artifacts"
        / "audio_baseline",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    labels_path = args.artifacts / "labels.json"
    metrics_path = args.artifacts / "metrics.json"
    if not labels_path.exists():
        warn(f"labels.json missing at {labels_path} — train a model first.")
        return 1
    with open(labels_path, "r", encoding="utf-8") as f:
        labels = json.load(f).get("classes", [])
    metrics = {}
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            metrics = json.load(f)
    manifest = {
        "name": "audio_baseline",
        "kind": "rule_based_or_baseline_pkl",
        "labels": labels,
        "metrics": metrics,
        "future_export": [
            "onnx (recommended)",
            "tflite",
            "tensorflow.js (browser)",
        ],
    }
    out = args.artifacts / "model_manifest.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    info(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
