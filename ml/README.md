# Hearer ML / dataset spine

Hearer is a glasses-first runtime. **The runtime does not depend on any
dataset.** This folder exists so we can train and evaluate audio classifiers
offline and later swap them into the runtime through the model adapter
boundary.

```
ml/
  hearer_labels.yaml          # Hearer label taxonomy (V1)
  requirements.txt            # numpy, pandas, pyyaml, soundfile, librosa,
                              #   scikit-learn, joblib
  datasets/                   # local dataset checkouts (gitignored)
    esc50/                    # ESC-50 — recommended first dataset
    urbansound8k/             # UrbanSound8K
    fsd50k/                   # FSD50K
  manifests/                  # generated unified manifests (gitignored)
  scripts/
    build_hearer_manifest.py
    prepare_esc50.py
    prepare_urbansound8k.py
    prepare_fsd50k.py
    validate_manifest.py
    summarize_manifest.py
    export_label_map.py
  training/
    README.md
    train_audio_baseline.py
    eval_audio_baseline.py
    export_model_stub.py
  notebooks/
    README.md
```

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate           # or .venv\Scripts\activate on Windows
pip install -r ml/requirements.txt

# 1. Place datasets locally:
#    ml/datasets/esc50          (clone from https://github.com/karoldvl/ESC-50)
#    ml/datasets/urbansound8k   (download from urbansounddataset.weebly.com)
#    ml/datasets/fsd50k         (download from zenodo.org/record/4060432)
# 2. Build per-dataset manifests:
python ml/scripts/prepare_esc50.py --dataset-root ml/datasets/esc50
python ml/scripts/prepare_urbansound8k.py --dataset-root ml/datasets/urbansound8k
python ml/scripts/prepare_fsd50k.py --dataset-root ml/datasets/fsd50k
# 3. Combine + summarise:
python ml/scripts/build_hearer_manifest.py --sources esc50 urbansound8k
python ml/scripts/summarize_manifest.py --manifest ml/manifests/hearer_train_manifest.jsonl
# 4. (Optional) Train a baseline:
python ml/training/train_audio_baseline.py --manifest ml/manifests/hearer_train_manifest.jsonl
```

The `prepare_*` scripts handle missing files gracefully — if a dataset is
not present, they print a clear message and exit 0 (or non-zero with
`--strict`).

## Manifest format

JSONL, one row per clip:

```json
{
  "id": "esc50_1-100032-A-0",
  "source": "ESC-50",
  "source_path": "datasets/esc50/audio/1-100032-A-0.wav",
  "source_label": "siren",
  "hearer_label": "siren",
  "split": "train",
  "fold": 1,
  "duration_sec": 5.0,
  "sample_rate": null,
  "license": "CC BY-NC 3.0 (ESC-50)",
  "metadata": {}
}
```

The unified manifest preserves official folds where possible to avoid
leaking the same source clip across train/val/test.

## Exported label map for the runtime

`ml/scripts/export_label_map.py` writes a TypeScript file at
`src/audio/hearerLabelMap.generated.ts` so the runtime can show / route
labels by category and default priority without parsing YAML at runtime.

The runtime never imports anything else from `ml/`.
