"""Blur robustness: previous garden model (garden-v1) vs crops-v2.

Both models see identical, generated perturbations of the same held-out
crops-v2 test images, restricted to the classes garden-v1 knows, so the
comparison is like for like. Uses each model's own TTA / prior correction and
scores within the (known) plant, exactly as the app does.

usage: python training/blur_compare.py [per_class]
"""
import csv
import json
import sys
from pathlib import Path

import setuptools  # noqa: F401
import numpy as np
import tensorflow as tf

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
from shared.preprocessing import load_image  # noqa: E402
from shared.seed import set_seed  # noqa: E402
from shared.app_rule import condition_on_crop, crop_mass_min  # noqa: E402

per_class = int(sys.argv[1]) if len(sys.argv) > 1 else 25
OLD = (ROOT / "data/work_garden/checkpoints/best.keras", ROOT / "training/archive/garden-v1.metadata.json")
NEW = (ROOT / "data/work_crops/checkpoints/best.keras", ROOT / "public/models/crops-v2/metadata.json")

set_seed()
rng = np.random.default_rng(11)
old_meta, new_meta = json.load(open(OLD[1])), json.load(open(NEW[1]))
shared = [c for c in old_meta["classes"] if c in new_meta["classes"]]
by = {}
for r in csv.DictReader(open(ROOT / "data/work_crops/splits.csv")):
    if r["split"] == "test" and r["label"] in shared:
        by.setdefault(r["label"], []).append(r)
sample = [r for c in shared for r in rng.permutation(by.get(c, []))[:per_class].tolist()]
y = np.array([r["label"] for r in sample])
paths = [r["path"] for r in sample]
print(f"{len(sample)} held-out images over {len(shared)} shared classes (each model at its own input size)", flush=True)


def gauss(x, s):
    s = s * x.shape[1] / 224  # same physical blur at any input size
    r = int(3 * s)
    g = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s * s)); g /= g.sum()
    k = np.outer(g, g)[:, :, None, None].repeat(3, 2).astype(np.float32)
    return tf.nn.depthwise_conv2d(x, k, [1, 1, 1, 1], "SAME").numpy()


def motion(x, k, diag=False):
    k = int(round(k * x.shape[1] / 224)) | 1
    ker = np.zeros((k, k), np.float32)
    if diag:
        np.fill_diagonal(ker, 1 / k)
    else:
        ker[k // 2, :] = 1 / k
    ker = ker[:, :, None, None].repeat(3, 2)
    return tf.nn.depthwise_conv2d(x, ker, [1, 1, 1, 1], "SAME").numpy()


def lowres(x, r):
    n = x.shape[1]
    r = r * n // 224
    return tf.image.resize(tf.image.resize(x, (r, r), "area"), (n, n), "bilinear").numpy()


COND = {
    "sharp": lambda x: x,
    "slight defocus (σ1.5)": lambda x: gauss(x, 1.5),
    "defocus (σ2.5)": lambda x: gauss(x, 2.5),
    "heavy defocus (σ4)": lambda x: gauss(x, 4.0),
    "hand shake (9px)": lambda x: motion(x, 9),
    "hand shake, diagonal (15px)": lambda x: motion(x, 15, diag=True),
    "low resolution (48px)": lambda x: lowres(x, 48),
    "blur + low light": lambda x: gauss(x, 2.0) * 0.5,
}


def run(ckpt, meta_path):
    meta = json.load(open(meta_path))
    m = tf.keras.models.load_model(str(ckpt))
    n = m.input_shape[1]
    base = np.stack([load_image(tf.constant(p), n).numpy() for p in paths])
    cls = np.array(meta["classes"])
    out = {}
    for name, fn in COND.items():
        x = fn(base).astype(np.float32)
        p = m.predict(x, batch_size=64, verbose=0)
        if meta.get("tta") == "hflip":
            p = (p + m.predict(x[:, :, ::-1, :].copy(), batch_size=64, verbose=0)) / 2
        pc = meta.get("priorCorrection")
        if pc:
            p = p * np.array(pc["classWeights"]) ** (-pc["alpha"]); p /= p.sum(1, keepdims=True)
        # as the app uses both models: the plant is known, score within it
        p, inside = condition_on_crop(p, list(cls), np.array([c.split("___")[0] for c in y]), crop_mass_min())
        pred = cls[p.argmax(1)]
        conf = inside & (p.max(1) >= 0.7)
        ok = pred == y
        out[name] = {"accuracy": float(ok.mean()), "answered": float(conf.mean()),
                     "rightWhenAnswered": float(ok[conf].mean()) if conf.any() else None,
                     "confidentWrongRate": float((conf & ~ok).mean())}
        print(f"{meta['modelVersion']:10s} {name:30s} acc {ok.mean():.3f}  confident-wrong {(conf & ~ok).mean():.3f}", flush=True)
    return out


res = {"images": len(sample), "classes": len(shared), "cutoff": 0.7,
       "garden-v1": run(*OLD), "crops-v2": run(*NEW)}
json.dump(res, open(ROOT / "data/work_crops/blur_compare.json", "w"), indent=2)
print("saved data/work_crops/blur_compare.json")
