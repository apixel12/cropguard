"""Hyperparameter search for the crops model, on fast proxies.

Every candidate trains on the same 30% per-class subsample of the training
split (1 head epoch + 3 fine-tune epochs, same warm start) and is scored on
the FULL validation split, clean and blurred, scored the way the app scores
(mirror TTA, prior correction, plant known). The test split is not touched.

usage: python training/hp_search.py [name ...]   (default: all candidates)
"""
import csv
import json
import sys
from dataclasses import replace
from pathlib import Path

import setuptools  # noqa: F401
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
sys.path.insert(0, str(ROOT / "training" / "crops"))
from config import CFG  # noqa: E402
from shared.app_rule import condition_on_crop, crop_mass_min  # noqa: E402
from shared.pipeline import train  # noqa: E402

HP = ROOT / "data" / "hp"
PROXY = dict(splits_dir=CFG.work_dir, cache_dir=HP / "cache", train_fraction=0.3,
             head_epochs=1, finetune_epochs=3, finetune_patience=3)
CANDIDATES = {
    "baseline": {},
    "label_smoothing": {"label_smoothing": 0.1},
    "medium_aug": {"robust_level": "medium"},
    "lr_1e-4": {"finetune_lr": 1e-4},
    "class_weight_0.25": {"class_weight_power": 0.25},
    "medium+ls": {"robust_level": "medium", "label_smoothing": 0.1},
    "medium+ls+cw0.25": {"robust_level": "medium", "label_smoothing": 0.1, "class_weight_power": 0.25},
    # round 2: everything on top of the round-1 winner (medium augmentation)
    "medium_aug_replicate": {"robust_level": "medium"},  # same as medium_aug: measures run-to-run noise
    "m_unfreeze_all": {"robust_level": "medium", "unfreeze_from": 0},
    "m_unfreeze_100": {"robust_level": "medium", "unfreeze_from": 100},
    "m_dropout_0.1": {"robust_level": "medium", "dropout": 0.1},
    "m_dropout_0.4": {"robust_level": "medium", "dropout": 0.4},
    "m_outlier_1": {"robust_level": "medium", "outlier_per_batch": 1},
    "light_aug": {"robust_level": "light"},
    "m_lr_2.5e-5": {"robust_level": "medium", "finetune_lr": 2.5e-5},
    # round 3
    "combo_u100_lr2.5_d0.4": {"robust_level": "medium", "unfreeze_from": 100, "finetune_lr": 2.5e-5, "dropout": 0.4},
    "res_288": {"robust_level": "medium"},  # run with CG_IMG_SIZE=288 (see main)
    # round 4 (after adding the Holeta wheat photos; 288 px via the crops config)
    "r4_baseline": {"robust_level": "medium"},
    "r4_hard_repeat": {"robust_level": "medium",
                       "source_repeat": {"plantdoc": 2, "cassava": 2, "wheat_jic": 2, "wheat_holeta": 2}},
}


def score(name):
    import tensorflow as tf
    from shared.preprocessing import load_image
    from shared.pipeline import evaluate  # noqa: F401
    work = HP / name
    classes = json.load(open(CFG.work_dir / "split_report.json"))["classes"]
    rows = [r for r in csv.DictReader(open(CFG.work_dir / "splits.csv")) if r["split"] == "val"]
    y = np.array([int(r["label_idx"]) for r in rows])
    m = tf.keras.models.load_model(str(work / "checkpoints" / "best.keras"))
    hist = json.load(open(work / "history.json"))
    w = np.array([hist["classWeights"][str(i)] for i in range(len(classes))])
    crops = np.array([classes[i].split("___")[0] for i in y])
    ds = tf.data.Dataset.from_tensor_slices([r["path"] for r in rows]).map(load_image, num_parallel_calls=8).batch(64)

    def probs(transform):
        out = []
        for x in ds:
            x = transform(x)
            out.append((m(x, training=False) + m(tf.reverse(x, [2]), training=False)).numpy() / 2)
        return np.concatenate(out)

    def blur(x):
        k = np.exp(-np.arange(-6, 7) ** 2 / (2 * 2.0 ** 2)); k = np.outer(k, k); k /= k.sum()
        return tf.nn.depthwise_conv2d(x, np.repeat(k[:, :, None, None], 3, 2).astype(np.float32), [1, 1, 1, 1], "SAME")

    res = {}
    for cond, fn in (("clean", lambda x: x), ("blurred", blur)):
        p = probs(fn)
        best = None
        for a in np.round(np.arange(0, 1.61, 0.1), 2):  # prior correction alpha, as evaluate() picks it
            q = p * w ** (-a); q /= q.sum(1, keepdims=True)
            q, _ = condition_on_crop(q, classes, crops, crop_mass_min())
            acc = float((q.argmax(1) == y).mean())
            bal = float(np.mean([(q.argmax(1)[y == c] == c).mean() for c in np.unique(y)]))
            if best is None or acc > best[0]:
                best = (acc, a, bal)
        res[cond] = {"accuracy": best[0], "alpha": float(best[1]), "balancedAccuracy": best[2]}
    # per-source clean accuracy (plant known), for the hard field sources
    src = np.array([r["source"] for r in rows])
    p = probs(lambda x: x)
    q = p * w ** (-res["clean"]["alpha"]); q /= q.sum(1, keepdims=True)
    q, _ = condition_on_crop(q, classes, crops, crop_mass_min())
    res["bySource"] = {s: float((q.argmax(1)[src == s] == y[src == s]).mean()) for s in sorted(set(src))}
    res["trainAccLast"] = hist["stage2"]["accuracy"][-1]
    print(name, json.dumps(res), flush=True)
    return res


def main():
    rescore = "--score-only" in sys.argv
    names = [n for n in sys.argv[1:] if not n.startswith("--")] or list(CANDIDATES)
    out_f = HP / "results.json"
    results = json.load(open(out_f)) if out_f.exists() else {}
    for name in names:
        proxy = dict(PROXY)
        from shared.preprocessing import IMG_SIZE
        if IMG_SIZE != 224:  # resolution runs need their own cache
            proxy["cache_dir"] = HP / f"cache_{IMG_SIZE}"
        if CANDIDATES[name].get("source_repeat"):  # a different training list needs its own cache
            proxy["cache_dir"] = HP / f"cache_{IMG_SIZE}_{name}"
        cfg = replace(CFG, name=f"hp-{name}", work_dir=HP / name, **proxy, **CANDIDATES[name])
        cfg.work_dir.mkdir(parents=True, exist_ok=True)
        if not rescore:
            train(cfg)
        results[name] = score(name)
        json.dump(results, open(out_f, "w"), indent=2)


if __name__ == "__main__":
    main()
