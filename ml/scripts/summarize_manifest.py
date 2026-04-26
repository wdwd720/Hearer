#!/usr/bin/env python3
"""Summarise a Hearer manifest by source / label / split."""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from _lib import MANIFEST_DIR, info, read_jsonl, warn  # type: ignore


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
        default=MANIFEST_DIR / "summary.json",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    if not args.manifest.exists():
        warn(f"Manifest not found: {args.manifest}")
        return 1

    rows = read_jsonl(args.manifest)
    by_label = Counter(r.get("hearer_label", "unknown") for r in rows)
    by_source = Counter(r.get("source", "unknown") for r in rows)
    by_split = Counter(r.get("split", "unknown") for r in rows)
    summary = {
        "manifest": str(args.manifest),
        "rows": len(rows),
        "by_label": dict(by_label),
        "by_source": dict(by_source),
        "by_split": dict(by_split),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    info(f"Wrote {args.output}")
    info(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
