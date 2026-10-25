"""Validation accuracy, clean and blurred, for candidate checkpoints of one model.
Each candidate uses its own prior correction (from its metrics.json). VALIDATION only.

usage: python training/val_blur.py data/work_lemon data/work_lemon_c
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


def gauss(s):
    r = int(3 * s); g = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s * s)); g /= g.sum()
    return np.repeat(np.outer(g, g)[:, :, None, None], 3, 2).astype(np.float32)


def motion(k):
    m = np.zeros((k, k), np.float32); m[k // 2, :] = 1 / k
    return np.repeat(m[:, :, None, None], 3, 2)


CONDS = {"clean": None, "defocus σ2.5": gauss(2.5), "hand shake 9px": motion(9)}

dirs = [Path(d) for d in sys.argv[1:]]
rows = [r for r in csv.DictReader(open(dirs[0] / "splits.csv")) if r["split"] == "val"]
y = np.array([int(r["label_idx"]) for r in rows])
for d in dirs:
    m = tf.keras.models.load_model(str(d / "checkpoints" / "best.keras"))
    n = m.input_shape[1]
    ds = tf.data.Dataset.from_tensor_slices([r["path"] for r in rows]).map(lambda p: load_image(p, n), num_parallel_calls=8).batch(64)
    pc = json.load(open(d / "metrics.json")).get("priorCorrection")
    line = f"{str(d):24s}"
    for name, k in CONDS.items():
        out = []
        for x in ds:
            if k is not None:  # kernels defined at 224; same physical blur at other sizes
                kk = k if n == 224 else (gauss(2.5 * n / 224) if name.startswith("defocus") else motion(int(round(9 * n / 224)) | 1))
                x = tf.nn.depthwise_conv2d(x, kk, [1, 1, 1, 1], "SAME")
            out.append(((m(x, training=False) + m(tf.reverse(x, [2]), training=False)) / 2).numpy())
        p = np.concatenate(out)
        if pc:
            p = p * np.array(pc["classWeights"]) ** (-pc["alpha"]); p /= p.sum(1, keepdims=True)
        a = p.argmax(1)
        bal = np.mean([(a[y == c] == c).mean() for c in np.unique(y)])
        line += f" | {name}: acc {(a == y).mean():.4f} bal {bal:.4f}"
    print(line, flush=True)
