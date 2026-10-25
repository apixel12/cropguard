"""Background-shortcut test for the plant-identification model.

Lemon photos come from orchards, every other crop mostly from lab or field
sets with their own backgrounds. If the router learned "busy background =
lemon", leaves on clutter would be sent to the lemon model. This pastes
held-out NON-lemon test leaves onto a generated clutter background (a
different generator from training) and counts where they are routed, using
the app's rule: answer when top-1 >= the app's cutoff, otherwise ask the user.

usage: python training/router2/background_test.py [n]
"""
import csv
import json
import re
import sys
from pathlib import Path

import setuptools  # noqa: F401
import numpy as np
import tensorflow as tf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.preprocessing import load_image  # noqa: E402
from shared.seed import set_seed  # noqa: E402

n = int(sys.argv[1]) if len(sys.argv) > 1 else 400
CUTOFF = float(re.search(r"CONFIDENCE_CUTOFF = ([0-9.]+)", (ROOT / "src/ml/confidence.ts").read_text()).group(1))
meta = json.load(open(ROOT / "public/models/router-v2/metadata.json"))
classes = np.array(meta["classes"])
set_seed()
rng = np.random.default_rng(5)
rows = [r for r in csv.DictReader(open(ROOT / "data/work_router2/splits.csv")) if r["split"] == "test" and r["label"] != "Lemon"]
rows = [rows[i] for i in rng.permutation(len(rows))[:n]]
y = np.array([r["label"] for r in rows])
base = np.stack([load_image(tf.constant(r["path"])).numpy() for r in rows])


def clutter(k):
    out = np.zeros((k, 224, 224, 3), np.float32)
    for g, w in ((3, 0.4), (7, 0.3), (15, 0.2), (31, 0.1)):
        out += w * tf.image.resize(rng.uniform(0, 255, (k, g, g, 3)).astype(np.float32), (224, 224), "bilinear").numpy()
    out = (0.5 * out.mean(-1, keepdims=True) + 0.5 * out) * np.array([0.95, 1.0, 0.7], np.float32)
    return out.clip(0, 255)


def on_clutter(x, scale=0.6):
    s = int(224 * scale)
    out, o = clutter(len(x)), (224 - s) // 2
    out[:, o:o + s, o:o + s] = tf.image.resize(x, (s, s)).numpy()
    return out


model = tf.keras.models.load_model(str(ROOT / "data/work_router2/checkpoints/best.keras"))


def route(x):
    p = model.predict(x, batch_size=64, verbose=0)
    if meta.get("tta") == "hflip":
        p = (p + model.predict(x[:, :, ::-1, :].copy(), batch_size=64, verbose=0)) / 2
    pc = meta.get("priorCorrection")
    if pc:
        p = p * np.array(pc["classWeights"]) ** (-pc["alpha"]); p /= p.sum(1, keepdims=True)
    pred, conf = classes[p.argmax(1)], p.max(1) >= CUTOFF
    return {"toLemon": float((conf & (pred == "Lemon")).mean()),
            "correct": float((conf & (pred == y)).mean()),
            "asked": float((~conf).mean()),
            "wrongPlant": float((conf & (pred != y)).mean())}


res = {"n": len(rows), "cutoff": CUTOFF, "clean": route(base), "clutter": route(on_clutter(base))}
print(json.dumps(res, indent=1))
json.dump(res, open(ROOT / "data/work_router2/background_test.json", "w"), indent=2)
