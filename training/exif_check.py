"""Does EXIF orientation matter? Browsers display (and the app analyzes)
photos upright per their EXIF tag; tf.io.decode_jpeg ignores the tag, so
training saw ~26% of lemon images in raw sensor orientation. This evaluates
the held-out test set both ways and reports the gap.

usage: python training/exif_check.py lemon
"""
import setuptools  # noqa: F401
import csv
import json
import sys
from pathlib import Path

import numpy as np
import tensorflow as tf
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
from shared.preprocessing import load_image, resize_tensor  # noqa: E402

name = sys.argv[1] if len(sys.argv) > 1 else "lemon"
work = ROOT / "data" / f"work_{name}"
rows = [r for r in csv.DictReader(open(work / "splits.csv")) if r["split"] == "test"]
rotated = [r for r in rows if Image.open(r["path"]).getexif().get(274, 1) != 1]
model = tf.keras.models.load_model(str(work / "checkpoints" / "best.keras"))


def as_browser(path):  # EXIF-transposed, like <img> in a browser
    im = ImageOps.exif_transpose(Image.open(path).convert("RGB"))
    return resize_tensor(tf.constant(np.asarray(im))).numpy()


y = np.array([int(r["label_idx"]) for r in rotated])
raw = np.stack([load_image(tf.constant(r["path"])).numpy() for r in rotated])
upright = np.stack([as_browser(r["path"]) for r in rotated])
acc_raw = float((model.predict(raw, verbose=0).argmax(1) == y).mean())
acc_up = float((model.predict(upright, verbose=0).argmax(1) == y).mean())
out = {"testImagesWithExifRotation": len(rotated), "of": len(rows),
       "accuracyRawOrientation": acc_raw, "accuracyBrowserOrientation": acc_up,
       "gap": acc_raw - acc_up}
json.dump(out, open(work / "exif_check.json", "w"), indent=2)
print(json.dumps(out, indent=2))
