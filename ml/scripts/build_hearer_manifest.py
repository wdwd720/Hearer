#!/usr/bin/env python3
"""Combine per-dataset manifests into one unified Hearer training manifest.

Usage:

    python ml/scripts/build_hearer_manifest.py --sources esc50 urbansound8k fsd50k
    python ml/scripts/build_hearer_manifest.py --sources esc50 \
        --labels timer_beep siren horn doorbell knock speech_nearby
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import List, Optional, Set

from _lib import (  # type: ignore
    MANIFEST_DIR,
    info,
    read_jsonl,
    warn,
    write_jsonl,
)


SOURCE_FILES = {
    "esc50": "esc50_hearer.jsonl",
    "urbansound8k": "urbansound8k_hearer.jsonl",
    "fsd50k": "fsd50k_hearer.jsonl",
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--sources",
        nargs="+",
        choices=list(SOURCE_FILES.keys()),
        required=True,
    )
    p.add_argument(
        "--labels",
        nargs="*",
        default=None,
        help="Restrict to these Hearer labels (default: keep all).",
    )
    p.add_argument(
        "--output",
        type=Path,
        default=MANIFEST_DIR / "hearer_train_manifest.jsonl",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    keep: Optional[Set[str]] = (
        set(l.strip() for l in args.labels) if args.labels else None
    )

    rows: List[dict] = []
    for src in args.sources:
        path = MANIFEST_DIR / SOURCE_FILES[src]
        if not path.exists():
            warn(f"Per-dataset manifest missing: {path}. Run the matching prepare_*.py first.")
            continue
        loaded = read_jsonl(path)
        info(f"Loaded {len(loaded)} rows from {path}")
        rows.extend(loaded)

    if keep:
        before = len(rows)
        rows = [r for r in rows if r.get("hearer_label") in keep]
        info(f"Filter --labels: {before} → {len(rows)}")

    # Deduplicate by id, keeping the first occurrence.
    seen: Set[str] = set()
    deduped: List[dict] = []
    for r in rows:
        rid = r.get("id")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        deduped.append(r)

    n = write_jsonl(deduped, args.output)
    info(f"Wrote {n} rows → {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
