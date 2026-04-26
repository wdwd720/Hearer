#!/usr/bin/env python3
"""Build a Hearer-format manifest from FSD50K.

Expects a local FSD50K checkout at e.g. ml/datasets/fsd50k with:

    <root>/FSD50K.ground_truth/dev.csv
    <root>/FSD50K.ground_truth/eval.csv
    <root>/FSD50K.dev_audio/*.wav
    <root>/FSD50K.eval_audio/*.wav

This script does NOT download FSD50K — see
https://zenodo.org/record/4060432.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from typing import Any, Dict, List

from _lib import (  # type: ignore
    MANIFEST_DIR,
    build_source_map,
    ensure_dataset,
    info,
    warn,
    write_jsonl,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dataset-root", type=Path, required=True)
    p.add_argument(
        "--output",
        type=Path,
        default=MANIFEST_DIR / "fsd50k_hearer.jsonl",
    )
    p.add_argument("--strict", action="store_true")
    return p.parse_args()


def _load_csv(path: Path) -> List[Dict[str, str]]:
    if not path.exists():
        return []
    out: List[Dict[str, str]] = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            out.append(r)
    return out


def main() -> int:
    args = parse_args()
    root: Path = args.dataset_root
    if not ensure_dataset(
        root,
        "FSD50K",
        hint="Download FSD50K from zenodo.org/record/4060432 and unpack into ml/datasets/fsd50k.",
    ):
        return 1 if args.strict else 0

    label_map = build_source_map("fsd50k")
    info(f"Loaded {len(label_map)} FSD50K → Hearer label mappings.")

    splits = [
        ("dev", root / "FSD50K.ground_truth" / "dev.csv", root / "FSD50K.dev_audio"),
        ("eval", root / "FSD50K.ground_truth" / "eval.csv", root / "FSD50K.eval_audio"),
    ]

    rows: List[Dict[str, Any]] = []
    missing_audio = 0
    skipped_unmapped = 0
    for split_name, csv_path, audio_dir in splits:
        rows_in = _load_csv(csv_path)
        if not rows_in:
            warn(f"{split_name} ground-truth CSV missing: {csv_path}")
            continue
        for r in rows_in:
            fname = r.get("fname") or r.get("filename") or ""
            labels_raw = r.get("labels") or r.get("category") or ""
            label_list = [
                lbl.strip().lower() for lbl in labels_raw.split(",") if lbl.strip()
            ]
            hearer_label = None
            chosen = None
            for lbl in label_list:
                mapped = label_map.get(lbl)
                if mapped:
                    hearer_label = mapped
                    chosen = lbl
                    break
            if not hearer_label:
                skipped_unmapped += 1
                continue
            audio_path = audio_dir / f"{fname}.wav"
            if not audio_path.exists():
                missing_audio += 1
                if args.strict:
                    warn(f"Audio missing: {audio_path}")
                continue
            split = (
                "train" if split_name == "dev" else "test"
            )  # FSD50K dev = train+val; test = eval
            rows.append(
                {
                    "id": f"fsd50k_{fname}",
                    "source": "FSD50K",
                    "source_path": str(audio_path),
                    "source_label": chosen,
                    "hearer_label": hearer_label,
                    "split": split,
                    "fold": None,
                    "duration_sec": None,
                    "sample_rate": None,
                    "license": "CC-BY (FSD50K)",
                    "metadata": {"all_labels": label_list},
                }
            )

    n = write_jsonl(rows, args.output)
    info(f"Wrote {n} rows → {args.output}")
    if skipped_unmapped:
        info(f"Skipped {skipped_unmapped} clips with no Hearer label mapping.")
    if missing_audio:
        warn(f"{missing_audio} audio files missing on disk.")
    return 1 if (args.strict and missing_audio > 0) else 0


if __name__ == "__main__":
    sys.exit(main())
