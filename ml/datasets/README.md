# Datasets

Place local dataset checkouts in this folder. Nothing here is committed to
git; the prepare scripts read from local paths and write unified manifests
to `ml/manifests/`.

Recommended order:

1. **ESC-50** — `ml/datasets/esc50/` (clone https://github.com/karoldvl/ESC-50). Small, balanced, 5s clips, 50 classes.
2. **UrbanSound8K** — `ml/datasets/urbansound8k/` (download from <https://urbansounddataset.weebly.com>). Good for siren / car horn / engine.
3. **FSD50K** — `ml/datasets/fsd50k/` (download from <https://zenodo.org/record/4060432>). Big AudioSet-style label space; covers doorbell / smoke alarm / beeps.

Hearer does **not** auto-download these. Most are gated by license or size.
