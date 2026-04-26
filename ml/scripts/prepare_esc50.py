#!/usr/bin/env python3
"""Build a Hearer-format manifest from ESC-50.

Expects a local ESC-50 checkout at e.g. ml/datasets/esc50 with the canonical
layout:

    <root>/meta/esc50.csv
    <root>/audio/*.wav

This script does NOT download ESC-50. Clone it from
https://github.com/karoldvl/ESC-50 and pass --dataset-root.
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
    p.add_argument(
        "--dataset-root",
        type=Path,
        required=True,
        help="Path to the local ESC-50 checkout (contains meta/esc50.csv and audio/).",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=MANIFEST_DIR / "esc50_hearer.jsonl",
        help="Output manifest path.",
    )
    p.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero if dataset is missing or any audio file is absent.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    root: Path = args.dataset_root
    if not ensure_dataset(
        root,
        "ESC-50",
        hint="Clone https://github.com/karoldvl/ESC-50 into ml/datasets/esc50.",
    ):
        return 1 if args.strict else 0

    meta_csv = root / "meta" / "esc50.csv"
    audio_dir = root / "audio"
    if not meta_csv.exists():
        warn(f"esc50.csv missing: {meta_csv}")
        return 1 if args.strict else 0

    label_map = build_source_map("esc50")
    info(f"Loaded {len(label_map)} ESC-50 → Hearer label mappings.")

    rows: List[Dict[str, Any]] = []
    missing_audio = 0
    skipped_unmapped = 0
    with open(meta_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            filename = r["filename"]
            source_label = r["category"].strip().lower()
            hearer_label = label_map.get(source_label)
            if not hearer_label:
                skipped_unmapped += 1
                continue
            audio_path = audio_dir / filename
            if not audio_path.exists():
                missing_audio += 1
                if args.strict:
                    warn(f"Audio missing: {audio_path}")
                continue
            try:
                fold = int(r.get("fold", 1) or 1)
            except ValueError:
                fold = 1
            split = "train" if fold in (1, 2, 3) else "val" if fold == 4 else "test"
            rows.append(
                {
                    "id": f"esc50_{Path(filename).stem}",
                    "source": "ESC-50",
                    "source_path": str(audio_path),
                    "source_label": source_label,
                    "hearer_label": hearer_label,
                    "split": split,
                    "fold": fold,
                    "duration_sec": 5.0,
                    "sample_rate": None,
                    "license": "CC BY-NC 3.0 (ESC-50)",
                    "metadata": {
                        "esc50_filename": filename,
                        "target": r.get("target"),
                        "esc10": r.get("esc10"),
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
