"""Decide whether a retrained model replaces the shipped one: VALIDATION only.

Compares saved validation predictions (mirror TTA, from evaluate()) of
candidates, each with its own prior correction, scored as the app scores
(plant known for the crops model): accuracy and balanced accuracy.

usage: python training/compare_val.py data/work_crops/prev data/work_crops
       python training/compare_val.py data/work_lemon/prev data/work_lemon data/work_lemon_b
"""
import csv
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
from shared.app_rule import condition_on_crop, crop_mass_min  # noqa: E402


def score(d: Path, splits: Path):
    p = np.load(d / "probs_val.npy")
    pc = json.load(open(d / "metrics.json")).get("priorCorrection")
    if pc:
        p = p * np.array(pc["classWeights"]) ** (-pc["alpha"])
        p /= p.sum(1, keepdims=True)
    rows = [r for r in csv.DictReader(open(splits / "splits.csv")) if r["split"] == "val"]
    y = np.array([int(r["label_idx"]) for r in rows])
    classes = json.load(open(splits / "split_report.json"))["classes"]
    if all("___" in c for c in classes):
        p, _ = condition_on_crop(p, classes, np.array([classes[i].split("___")[0] for i in y]), crop_mass_min())
    a = p.argmax(1)
    acc = float((a == y).mean())
    bal = float(np.mean([(a[y == c] == c).mean() for c in np.unique(y)]))
    src = np.array([r.get("source", "") for r in rows])
    BY[str(d)] = {k: float((a[src == k] == y[src == k]).mean()) for k in ("plantdoc", "wheat_jic", "wheat_holeta", "cassava", "riceleafbd") if (src == k).any()}
    return acc, bal


BY = {}


if __name__ == "__main__":
    dirs = [Path(x) for x in sys.argv[1:]]
    splits = next((x for x in dirs if (x / "splits.csv").exists()), dirs[0].parent)
    res = {str(d): score(d, splits) for d in dirs}
    for d, (acc, bal) in res.items():
        print(f"{d:28s} val accuracy {acc:.4f}  balanced {bal:.4f}  mean {(acc + bal) / 2:.4f}")
    for d, v in BY.items():
        print(f"{d:28s} " + "  ".join(f"{k} {x:.3f}" for k, x in v.items()))
    best = max(res, key=lambda k: sum(res[k]))
    print("BEST:", best)
