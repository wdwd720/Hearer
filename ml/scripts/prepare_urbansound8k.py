#!/usr/bin/env python3
"""Build a Hearer-format manifest from UrbanSound8K.

Expects a local UrbanSound8K checkout at e.g. ml/datasets/urbansound8k with
the canonical layout:

    <root>/metadata/UrbanSound8K.csv
    <root>/audio/fold{1..10}/*.wav

This script does NOT download UrbanSound8K — see
https://urbansounddataset.weebly.com/.
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
        default=MANIFEST_DIR / "urbansound8k_hearer.jsonl",
    )
    p.add_argument("--strict", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    root: Path = args.dataset_root
    if not ensure_dataset(
        root,
        "UrbanSound8K",
        hint="Download UrbanSound8K from urbansounddataset.weebly.com and unpack into ml/datasets/urbansound8k.",
    ):
        return 1 if args.strict else 0

    meta_csv = root / "metadata" / "UrbanSound8K.csv"
    if not meta_csv.exists():
        warn(f"metadata missing: {meta_csv}")
        return 1 if args.strict else 0

    label_map = build_source_map("urbansound8k")
    info(f"Loaded {len(label_map)} UrbanSound8K → Hearer label mappings.")

    rows: List[Dict[str, Any]] = []
    missing_audio = 0
    skipped_unmapped = 0
    with open(meta_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            source_label = r["class"].strip().lower()
            hearer_label = label_map.get(source_label)
            if not hearer_label:
                skipped_unmapped += 1
                continue
            try:
                fold = int(r["fold"])
            except ValueError:
                fold = 1
            audio_path = root / "audio" / f"fold{fold}" / r["slice_file_name"]
            if not audio_path.exists():
                missing_audio += 1
                if args.strict:
                    warn(f"Audio missing: {audio_path}")
                continue
            split = "train" if fold <= 8 else "val" if fold == 9 else "test"
            try:
                duration = float(r.get("end", 0)) - float(r.get("start", 0))
            except ValueError:
                duration = 0.0
            rows.append(
                {
                    "id": f"urbansound8k_{Path(r['slice_file_name']).stem}",
                    "source": "UrbanSound8K",
                    "source_path": str(audio_path),
                    "source_label": source_label,
                    "hearer_label": hearer_label,
                    "split": split,
                    "fold": fold,
                    "duration_sec": duration,
                    "sample_rate": None,
                    "license": "CC BY-NC 4.0 (UrbanSound8K)",
                    "metadata": {
                        "salience": r.get("salience"),
                        "classID": r.get("classID"),
                    },
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
