#!/usr/bin/env python3
"""Validate a Hearer manifest.

Checks:
  - every row has an id, source, source_path, hearer_label
  - every hearer_label exists in hearer_labels.yaml
  - every source_path exists on disk (counted, not failed unless --strict)
  - prints class counts
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

from _lib import (  # type: ignore
    MANIFEST_DIR,
    info,
    load_labels,
    read_jsonl,
    warn,
)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_DIR / "hearer_train_manifest.jsonl",
    )
    p.add_argument("--strict", action="store_true")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.manifest.exists():
        warn(f"Manifest not found: {args.manifest}")
        return 1

    labels_yaml = load_labels()
    valid_labels = set(labels_yaml.get("labels", {}).keys())

    rows = read_jsonl(args.manifest)
    info(f"Validating {len(rows)} rows in {args.manifest}")

    missing_files = 0
    bad_label = 0
    bad_id = 0
    label_counts: Counter[str] = Counter()
    source_counts: Counter[str] = Counter()
    split_counts: Counter[str] = Counter()

    for i, r in enumerate(rows):
        rid: Optional[str] = r.get("id")
        if not rid:
            bad_id += 1
            warn(f"Row {i}: missing id.")
        label = r.get("hearer_label")
        if not label or label not in valid_labels:
            bad_label += 1
            if args.strict:
                warn(f"Row {i}: unknown hearer_label '{label}'.")
        else:
            label_counts[label] += 1
        source_counts[r.get("source", "unknown")] += 1
        split_counts[r.get("split", "unknown")] += 1
        path = r.get("source_path")
        if path and not Path(path).exists():
            missing_files += 1

    info("Class counts:")
    for k, v in label_counts.most_common():
        info(f"  {k:24s} {v}")
    info(f"Sources: {dict(source_counts)}")
    info(f"Splits:  {dict(split_counts)}")
    info(f"Missing files: {missing_files}")
    info(f"Bad labels:    {bad_label}")
    info(f"Bad ids:       {bad_id}")

    if args.strict and (missing_files > 0 or bad_label > 0 or bad_id > 0):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
