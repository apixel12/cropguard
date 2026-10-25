"""Run the lemon model on YOUR OWN photos (e.g. your lemon tree) and report.

These photos are a robustness check of the real pipeline, not training data,
and nothing here assigns them disease labels. Put JPEG/PNG/HEIC-converted
photos in data/field_photos/ and run:

    .venv/bin/python training/field_test.py [model-dir-name]

For each photo it reports the top-3 predictions and whether the app would
show a confident result or "Uncertain" (same preprocessing and the same
calibrated thresholds as the exported metadata). The app's photo-quality
gate runs only in the browser, so check rejected photos on the phone.
Output: data/field_photos/report.md
"""
import setuptools  # noqa: F401  (distutils shim TF 2.16 needs)
import json
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
from PIL import Image, ImageOps  # noqa: E402
from shared.preprocessing import resize_tensor  # noqa: E402

name = sys.argv[1] if len(sys.argv) > 1 else "lemon"
work = ROOT / "data" / f"work_{name}"
meta = json.load(open(ROOT / "public" / "models" / f"{name}-v1" / "metadata.json"))
T = meta["thresholds"]
classes = meta["classes"]
photos_dir = ROOT / "data" / "field_photos"
photos = sorted(p for p in photos_dir.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
if not photos:
    sys.exit(f"Put your photos (JPG/PNG) in {photos_dir} first.")

model = tf.keras.models.load_model(str(work / "checkpoints" / "best.keras"))
rows = []
for p in photos:
    # phone photos carry EXIF orientation; the browser shows them upright, so do the same
    x = resize_tensor(tf.constant(np.asarray(ImageOps.exif_transpose(Image.open(p).convert("RGB")))))
    probs = model.predict(x[None], verbose=0)[0]
    if meta.get("tta") == "hflip":  # same inference as the app
        probs = (probs + model.predict(tf.reverse(x, [1])[None], verbose=0)[0]) / 2
    pc = meta.get("priorCorrection")
    if pc:  # logit adjustment, as in the app
        probs = probs * np.array(pc["classWeights"]) ** (-pc["alpha"])
        probs = probs / probs.sum()
    order = np.argsort(-probs)[:3]
    top1, top2 = probs[order[0]], probs[order[1]]
    confident = top1 >= T["confidence"] and (top1 - top2) >= T["margin"]
    rows.append((p.name, confident, [(classes[i], float(probs[i])) for i in order]))

lines = [f"# Field test · {meta['modelVersion']} · {len(rows)} photos",
         "",
         f"Threshold: confidence ≥ {T['confidence']}, margin ≥ {T['margin']} (calibrated on validation data).",
         "",
         "| Photo | App would show | Top-3 (model confidence) |",
         "|---|---|---|"]
for n, c, top in rows:
    shown = top[0][0] if c else "Uncertain"
    lines.append(f"| {n} | {shown} | " + "; ".join(f"{k} {v:.0%}" for k, v in top) + " |")
conf = sum(c for _, c, _ in rows)
lines += ["", f"Confident on {conf}/{len(rows)}; uncertain on {len(rows) - conf}/{len(rows)}.",
          "", "Note: these photos are unlabeled; treat this as a robustness and pipeline check, not an accuracy measurement."]
(photos_dir / "report.md").write_text("\n".join(lines))
print("\n".join(lines))
