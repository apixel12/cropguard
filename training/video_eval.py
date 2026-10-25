"""Photo vs video accuracy, simulating the app's video path on held-out photos.

For each held-out test leaf, a hand-held clip is simulated: 14 frames with
small random shifts, zoom and tilt, motion blur on some frames (hand shake)
and exposure flicker. Then exactly what the app does (src/ml/frames.ts):
keep the 5 sharpest frames that pass the quality gate (Laplacian variance on
a 160 px grey copy), average their predictions (mirror TTA + prior
correction), score within the known plant, apply per-condition cut-offs.

Compared with: a steady photo (the clean test image) and a single hand-held
photo (one random frame of the same clip, which is what a shaky snapshot is).

usage: python training/video_eval.py crops|lemon [per_class]
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
from shared.app_rule import condition_on_crop, crop_mass_min, cutoff  # noqa: E402
import os  # noqa: E402
_mid = {"crops": "crops-v2", "lemon": "lemon-v1"}[sys.argv[1]]
os.environ["CG_IMG_SIZE"] = str(json.load(open(ROOT / "public/models" / _mid / "metadata.json"))["inputSize"][0])
from shared.preprocessing import IMG_SIZE as S, load_image  # noqa: E402
from shared.seed import set_seed  # noqa: E402

name = sys.argv[1]
per_class = int(sys.argv[2]) if len(sys.argv) > 2 else 15
work, mid = {"crops": ("work_crops", "crops-v2"), "lemon": ("work_lemon", "lemon-v1")}[name]
meta = json.load(open(ROOT / "public/models" / mid / "metadata.json"))
classes = meta["classes"]
TH = np.array([max(cutoff(), meta.get("classThresholds", {}).get(c, 0)) for c in classes])
FRAMES, BEST, GATE = 14, 5, 3.0

set_seed()
rng = np.random.default_rng(21)
rows = [r for r in csv.DictReader(open(ROOT / "data" / work / "splits.csv")) if r["split"] == "test"]
by = {}
for r in rows:
    by.setdefault(r["label"], []).append(r)
sample = [r for c in classes for r in rng.permutation(by.get(c, []))[:per_class].tolist()]
y = np.array([int(r["label_idx"]) for r in sample])
base = np.stack([load_image(tf.constant(r["path"])).numpy() for r in sample])
model = tf.keras.models.load_model(str(ROOT / "data" / work / "checkpoints" / "best.keras"))
print(f"{len(sample)} held-out leaves, {per_class}/class, {FRAMES} frames each", flush=True)


def motion(x, k, angle):
    ker = np.zeros((k, k), np.float32)
    c = k // 2
    for i in range(k):
        t = i - c
        ker[int(round(c + t * np.sin(angle))), int(round(c + t * np.cos(angle)))] = 1
    ker /= ker.sum()
    return tf.nn.depthwise_conv2d(x[None], np.repeat(ker[:, :, None, None], 3, 2), [1, 1, 1, 1], "SAME")[0].numpy()


def frame(img):
    """One hand-held frame: shift/zoom/tilt, sometimes motion blur, exposure flicker."""
    s = rng.uniform(0.93, 1.07)
    ang = np.deg2rad(rng.uniform(-6, 6))
    tx, ty = rng.uniform(-0.05, 0.05, 2) * S
    a, b = s * np.cos(ang), s * np.sin(ang)
    cx = cy = S // 2
    # inverse affine for ImageProjectiveTransformV3 (output -> input)
    det = a * a + b * b
    ia, ib = a / det, b / det
    t = [ia, ib, -(ia * (cx + tx) + ib * (cy + ty)) + cx, -ib, ia, -(-ib * (cx + tx) + ia * (cy + ty)) + cy, 0, 0]
    f = tf.raw_ops.ImageProjectiveTransformV3(images=img[None], transforms=np.array([t], np.float32), output_shape=[S, S],
                                              interpolation="BILINEAR", fill_mode="REFLECT", fill_value=0.0)[0].numpy()
    if rng.random() < 0.45:  # hand shake during this frame
        f = motion(f, int(rng.choice([5, 9, 13, 17])), rng.uniform(0, np.pi))
    return np.clip(f * rng.uniform(0.85, 1.15), 0, 255).astype(np.float32)


def sharpness(f):
    """The app's quality-gate metric: Laplacian variance on a 160 px grey copy."""
    g = tf.image.resize(f[None], (160, 160), "area")[0].numpy() @ np.array([0.299, 0.587, 0.114])
    lap = g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]
    return lap.var()


def probs(x):
    p = (model.predict(x, batch_size=64, verbose=0) + model.predict(x[:, :, ::-1].copy(), batch_size=64, verbose=0)) / 2
    pc = meta.get("priorCorrection")
    if pc:
        p = p * np.array(pc["classWeights"]) ** (-pc["alpha"])
        p /= p.sum(1, keepdims=True)
    return p


def decide(p):
    inside = np.ones(len(p), bool)
    if all("___" in c for c in classes):
        p, inside = condition_on_crop(p, classes, np.array([classes[i].split("___")[0] for i in y]), crop_mass_min())
    a = p.argmax(1)
    conf = inside & (p.max(1) >= TH[a])
    ok = a == y
    return {"accuracy": float(ok.mean()), "answered": float(conf.mean()),
            "rightWhenAnswered": float(ok[conf].mean()), "confidentlyWrong": float((conf & ~ok).mean())}


# one clip at a time: all clips at once is ~17 GB and corrupted the batch predictions
P, sharp = [], []
for i, img in enumerate(base):
    clip = np.stack([frame(img) for _ in range(FRAMES)]).astype(np.float32)
    P.append(probs(clip))
    sharp.append([sharpness(f) for f in clip])
    if i % 200 == 0:
        print(f"  {i}/{len(base)} clips", flush=True)
P, sharp = np.stack(P), np.array(sharp)
video = []
for i in range(len(base)):
    order = np.argsort(-sharp[i])
    keep = [j for j in order if sharp[i, j] >= GATE][:BEST] or [order[0]]
    video.append(P[i, keep].mean(0))
one = P[np.arange(len(base)), rng.integers(0, FRAMES, len(base))]
res = {"leaves": len(base), "framesPerClip": FRAMES, "framesUsed": BEST,
       "steady photo": decide(probs(base.astype(np.float32))),
       "hand-held photo": decide(one),
       "hand-held video (app)": decide(np.stack(video))}
for k in ("steady photo", "hand-held photo", "hand-held video (app)"):
    v = res[k]
    print(f"{k:24s} accuracy {v['accuracy']:.3f}  answered {v['answered']:.3f}  right-when-answered {v['rightWhenAnswered']:.3f}  "
          f"confidently-wrong {v['confidentlyWrong']:.3f}", flush=True)
json.dump(res, open(ROOT / "data" / work / "video_eval.json", "w"), indent=2)
