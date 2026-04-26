"""Shared helpers for Hearer dataset scripts."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None  # noqa: F841 — error message is raised lazily.


REPO_ROOT = Path(__file__).resolve().parents[2]
ML_ROOT = REPO_ROOT / "ml"
LABELS_YAML = ML_ROOT / "hearer_labels.yaml"
MANIFEST_DIR = ML_ROOT / "manifests"


def load_labels() -> Dict[str, Any]:
    """Load and cache the Hearer label taxonomy."""
    if yaml is None:
        sys.exit(
            "Hearer label loader needs pyyaml. Install ml/requirements.txt or run `pip install pyyaml`."
        )
    with open(LABELS_YAML, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict) or "labels" not in data:
        sys.exit(f"hearer_labels.yaml is malformed at {LABELS_YAML}")
    return data


def build_source_map(source_key: str) -> Dict[str, str]:
    """Return a mapping {source_label_lowercase: hearer_label} for a source."""
    labels = load_labels()
    out: Dict[str, str] = {}
    for hearer_label, spec in labels["labels"].items():
        sources = (spec or {}).get("sourceMappings") or {}
        srcs = sources.get(source_key) or []
        for src in srcs:
            if not src:
                continue
            out[str(src).strip().lower()] = hearer_label
    return out


def write_jsonl(rows: Iterable[Dict[str, Any]], path: Path) -> int:
    """Write JSONL atomically; return number of rows."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    count = 0
    with open(tmp, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    os.replace(tmp, path)
    return count


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
    return out


def warn(msg: str) -> None:
    print(f"[hearer] {msg}", file=sys.stderr)


def info(msg: str) -> None:
    print(f"[hearer] {msg}")


def ensure_dataset(root: Path, name: str, hint: Optional[str] = None) -> bool:
    if root.exists():
        return True
    warn(f"{name} dataset not found at {root}.")
    if hint:
        warn(hint)
    return False
