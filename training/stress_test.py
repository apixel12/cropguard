"""Stress-test a trained model on generated test data.

Builds perturbed copies of HELD-OUT test images (never used in training) to
mimic field conditions, plus synthetic out-of-distribution (OOD) inputs,
and measures accuracy, macro F1, and how the calibrated uncertainty
threshold behaves (coverage / precision of "confident" answers).

usage: python training/stress_test.py crops|lemon|router2 [per_class] [checkpoint] [tag]
"""
import csv
import json
import sys
from pathlib import Path

import setuptools  # noqa: F401  (provides distutils shim TF 2.16 needs)
import numpy as np
import tensorflow as tf
from sklearn.metrics import f1_score

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
import os  # noqa: E402
_mid = {"crops": "crops-v2", "lemon": "lemon-v1", "router2": "router-v2"}[sys.argv[1]]
os.environ["CG_IMG_SIZE"] = str(json.load(open(ROOT / "public/models" / _mid / "metadata.json"))["inputSize"][0])
from shared.preprocessing import IMG_SIZE as S, load_image  # noqa: E402
from shared.seed import set_seed  # noqa: E402

name = sys.argv[1]
per_class = int(sys.argv[2]) if len(sys.argv) > 2 else 20
work = ROOT / "data" / f"work_{name}"
meta_dir = {"crops": "crops-v2", "lemon": "lemon-v1", "router2": "router-v2"}[name]  # current shipped versions
meta = json.load(open(ROOT / "public" / "models" / meta_dir / "metadata.json"))
# the app's actual answer rule (src/ml/confidence.ts), not the calibrated metadata thresholds
import re  # noqa: E402
CUTOFF = float(re.search(r"CONFIDENCE_CUTOFF = ([0-9.]+)", (ROOT / "src/ml/confidence.ts").read_text()).group(1))
T = {"confidence": CUTOFF, "margin": 0.0, "rule": "top-1 probability >= cutoff, as in the app"}
classes = meta["classes"]

set_seed()
rng = np.random.default_rng(7)
rows = [r for r in csv.DictReader(open(work / "splits.csv")) if r["split"] == "test"]
by = {}
for r in rows:
    by.setdefault(r["label"], []).append(r)
sample = [r for c in classes for r in rng.permutation(by.get(c, []))[:per_class].tolist()]
paths = [r["path"] for r in sample]
y = np.array([int(r["label_idx"]) for r in sample])
print(f"{len(sample)} held-out images, {per_class}/class", flush=True)

ckpt = Path(sys.argv[3]) if len(sys.argv) > 3 else work / "checkpoints" / "best.keras"
tag = sys.argv[4] if len(sys.argv) > 4 else "current"
model = tf.keras.models.load_model(str(ckpt))
print("checkpoint", ckpt)


def predict(x):
    """Same inference as the app: hflip test-time augmentation if the metadata says so."""
    p = model.predict(x, batch_size=64, verbose=0)
    if meta.get("tta") == "hflip":
        p = (p + model.predict(x[:, :, ::-1, :].copy(), batch_size=64, verbose=0)) / 2
    pc = meta.get("priorCorrection")
    if pc:  # logit adjustment, as in the app
        p = p * np.array(pc["classWeights"]) ** (-pc["alpha"])
        p = p / p.sum(1, keepdims=True)
    return p
base = np.stack([load_image(tf.constant(p)).numpy() for p in paths])  # [N,S,S,3] 0..255


def texture(n):
    """Clutter for TESTING: multi-octave value noise + dark twig-like streaks.
    Deliberately a different generator from training (shared/robust.py)."""
    out = np.zeros((n, S, S, 3), np.float32)
    for g, w in ((3, 0.4), (7, 0.3), (15, 0.2), (31, 0.1)):
        o = rng.uniform(0, 255, (n, g, g, 3)).astype(np.float32)
        out += w * tf.image.resize(o, (S, S), "bilinear").numpy()
    out = 0.5 * out.mean(-1, keepdims=True) + 0.5 * out
    out *= np.array([0.95, 1.0, 0.7], np.float32)
    for i in range(n):
        for _ in range(rng.integers(3, 9)):
            if rng.random() < 0.5:
                y0 = rng.integers(0, S - 4); out[i, y0:y0 + rng.integers(2, 5), :] *= 0.45
            else:
                x0 = rng.integers(0, S - 4); out[i, :, x0:x0 + rng.integers(2, 5)] *= 0.45
    return out.clip(0, 255)


def jpeg(x, q):
    return np.stack([tf.cast(tf.io.decode_jpeg(tf.io.encode_jpeg(tf.cast(i, tf.uint8), quality=q)), tf.float32)
                     .numpy() for i in x])


def motion_blur(x, k=9):
    ker = np.zeros((k, k, 3, 1), np.float32)
    ker[k // 2, :, :, 0] = 1 / k
    return tf.nn.depthwise_conv2d(x, ker, [1, 1, 1, 1], "SAME").numpy()


def gauss_blur(x, s=2.5):
    r = int(3 * s)
    g = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * s * s))
    g /= g.sum()
    k = np.outer(g, g)[:, :, None, None].repeat(3, 2).astype(np.float32)
    return tf.nn.depthwise_conv2d(x, k, [1, 1, 1, 1], "SAME").numpy()


def shrink_on_clutter(x, scale):  # leaf further away, surrounded by clutter
    s = int(S * scale)
    small = tf.image.resize(x, (s, s)).numpy()
    out = texture(len(x))
    o = (S - s) // 2
    out[:, o:o + s, o:o + s] = small
    return out


def lowres(x, r=48):
    return tf.image.resize(tf.image.resize(x, (r, r), "area"), (S, S), "bilinear").numpy()


def warm_shift(x):  # golden-hour / tungsten white balance
    return (x * np.array([1.18, 1.0, 0.78], np.float32)).clip(0, 255)


def rotate90(x):
    return np.rot90(x, 1, axes=(1, 2)).copy()


def occlude(x):  # finger/shadow covering a corner
    x = x.copy()
    x[:, :S * 90 // 224, :S * 90 // 224] *= 0.15
    return x


def noise(x, sd=18):
    return (x + rng.normal(0, sd, x.shape)).clip(0, 255).astype(np.float32)


PERTURB = {
    "clean": lambda x: x,
    "dim light (x0.45)": lambda x: x * 0.45,
    "overexposed (x1.6)": lambda x: (x * 1.6).clip(0, 255),
    "warm white balance": warm_shift,
    "gaussian blur": gauss_blur,
    "motion blur": motion_blur,
    "sensor noise": noise,
    "jpeg q=20": lambda x: jpeg(x, 20),
    "low resolution (48px)": lowres,
    "rotated 90°": rotate90,
    "corner occluded/shadow": occlude,
    "leaf far away on clutter (55%)": lambda x: shrink_on_clutter(x, 0.55),
}


def summarize(probs, y_true):
    pred = probs.argmax(1)
    srt = np.sort(probs, 1)
    conf = (srt[:, -1] >= T["confidence"]) & (srt[:, -1] - srt[:, -2] >= T["margin"])
    corr = pred == y_true
    return {
        "accuracy": float(corr.mean()),
        "macroF1": float(f1_score(y_true, pred, average="macro", zero_division=0)),
        "confidentCoverage": float(conf.mean()),
        "confidentPrecision": float(corr[conf].mean()) if conf.any() else None,
        "confidentWrongRate": float((conf & ~corr).mean()),  # the dangerous case
    }


results = {}
for pname, fn in PERTURB.items():
    x = fn(base).astype(np.float32)
    probs = predict(x)
    results[pname] = summarize(probs, y)
    r = results[pname]
    print(f"{pname:34s} acc {r['accuracy']:.3f}  F1 {r['macroF1']:.3f}  "
          f"confident {r['confidentCoverage']:.2f}  prec|conf {r['confidentPrecision'] or 0:.3f}  "
          f"confident-wrong {r['confidentWrongRate']:.3f}", flush=True)

# --- out-of-distribution: nothing here is a supported leaf
n = 200
ood = {
    "uniform colour": np.repeat(np.repeat(rng.uniform(0, 255, (n, 1, 1, 3)), S, 1), S, 2),
    "random noise": rng.uniform(0, 255, (n, S, S, 3)),
    "clutter texture only": texture(n),
    "gradients": np.stack([np.dstack([np.linspace(a, b, S)[None].repeat(S, 0) for a, b in
                                      rng.uniform(0, 255, (3, 2))]) for _ in range(n)]),
}
ood_res = {}
for oname, x in ood.items():
    probs = predict(x.astype(np.float32))
    srt = np.sort(probs, 1)
    conf = (srt[:, -1] >= T["confidence"]) & (srt[:, -1] - srt[:, -2] >= T["margin"])
    top = np.bincount(probs.argmax(1), minlength=len(classes))
    ood_res[oname] = {"flaggedUncertain": float(1 - conf.mean()),
                      "falseConfidentRate": float(conf.mean()),
                      "mostCommonPrediction": classes[int(top.argmax())]}
    print(f"OOD {oname:24s} flagged uncertain {1 - conf.mean():.2f}   "
          f"(most common guess: {classes[int(top.argmax())]})", flush=True)

out = {"model": meta["modelVersion"], "thresholds": T, "images": len(sample),
       "perturbations": results, "ood": ood_res,
       "note": "Generated stress data from held-out test images; not a substitute for real field photos."}
json.dump(out, open(work / f"stress_test_{tag}.json", "w"), indent=2)
print("saved", work / f"stress_test_{tag}.json")

# --- dump 100 downscaled (160px, as checkQuality does) RGBA samples per set for the TS quality gate
gate_dir = work / f"gate_samples_{tag}"
gate_dir.mkdir(exist_ok=True)
sets = {k: fn(base[:: max(1, len(base) // 100)][:100]) for k, fn in PERTURB.items()}
sets.update({f"OOD {k}": v[:100] for k, v in ood.items()})
index = {}
for i, (k, x) in enumerate(sets.items()):
    s = tf.image.resize(np.asarray(x, np.float32), (160, 160), "area").numpy().clip(0, 255).astype(np.uint8)
    rgba = np.concatenate([s, np.full(s.shape[:3] + (1,), 255, np.uint8)], -1)
    rgba.tofile(gate_dir / f"{i}.bin")
    index[k] = {"file": f"{i}.bin", "n": len(s)}
json.dump(index, open(gate_dir / "index.json", "w"))
print("gate samples written")
