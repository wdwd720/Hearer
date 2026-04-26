# Hearer training baseline

CPU-friendly. Reads a unified manifest produced by
`ml/scripts/build_hearer_manifest.py`, computes log-mel spectrogram features
with `librosa`, and trains a small `scikit-learn` classifier as a baseline.

```
python -m venv .venv
source .venv/bin/activate
pip install -r ml/requirements.txt
python ml/training/train_audio_baseline.py \
    --manifest ml/manifests/hearer_train_manifest.jsonl \
    --output ml/artifacts/audio_baseline
```

Artifacts produced:

```
ml/artifacts/audio_baseline/
  model.pkl
  labels.json
  metrics.json
```

Then evaluate:

```
python ml/training/eval_audio_baseline.py \
    --manifest ml/manifests/hearer_train_manifest.jsonl \
    --model ml/artifacts/audio_baseline/model.pkl
```

To wire a trained model into the runtime, run
`ml/training/export_model_stub.py`. It writes a model-manifest JSON the
frontend's `LocalTrainedModelAdapterStub` will eventually load. Real ONNX /
TFLite / TensorFlow.js conversion is a follow-up.
