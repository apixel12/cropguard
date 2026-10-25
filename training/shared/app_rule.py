"""How a model behaves under the app's real answer rule.

The app (src/ml/confidence.ts) answers when the top class, after mirror TTA
and prior correction, is at least CONFIDENCE_CUTOFF likely; otherwise it says
"Uncertain". This measures that rule on the held-out test split from the
probabilities evaluate() saved, so README and the About screen report what
the app actually does rather than the stricter calibrated thresholds.
"""
import csv
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]


def cutoff() -> float:
    src = (ROOT / "src/ml/confidence.ts").read_text()
    return float(re.search(r"CONFIDENCE_CUTOFF = ([0-9.]+)", src).group(1))


def crop_mass_min() -> float:
    src = (ROOT / "src/ml/plantVillageClassifier.ts").read_text()
    return float(re.search(r"CROP_MASS_MIN = ([0-9.]+)", src).group(1))


def condition_on_crop(p: np.ndarray, classes: list[str], crops: np.ndarray, floor: float):
    """As the app does once the plant is known: keep that plant's classes and
    renormalise; leaves with less than `floor` mass on the plant stay uncertain."""
    of = np.array([c.split("___")[0] for c in classes])
    mask = of[None, :] == crops[:, None]
    mass = (p * mask).sum(1)
    q = np.where(mask, p, 0) / np.maximum(mass, 1e-12)[:, None]
    return q, mass >= floor


def _probs(work_dir: Path, split: str, prior: dict | None):
    import json
    p = np.load(work_dir / f"probs_{split}.npy")
    if prior:
        p = p * np.array(prior["classWeights"]) ** (-prior["alpha"])
        p = p / p.sum(1, keepdims=True)
    rows = [r for r in csv.DictReader(open(work_dir / "splits.csv")) if r["split"] == split]
    assert len(rows) == len(p), f"{len(rows)} {split} rows vs {len(p)} saved predictions"
    y = np.array([int(r["label_idx"]) for r in rows])
    classes = json.load(open(work_dir / "split_report.json"))["classes"]
    inside = np.ones(len(y), bool)
    if all("___" in k for k in classes):
        p, inside = condition_on_crop(p, classes, np.array([classes[i].split("___")[0] for i in y]), crop_mass_min())
    return p, inside, y, rows, classes


PER_CLASS_PRECISION = 0.90


def class_thresholds(work_dir: Path, prior: dict | None, target: float = PER_CLASS_PRECISION) -> dict:
    """Per-condition cut-offs, chosen on VALIDATION: the lowest confidence
    (never below the app's cutoff) at which that condition's answers were at
    least `target` precise. A condition that never gets there on validation
    (too few or too confusable photos) gets 1.01: the app always says
    "Not sure" rather than name it. Stops weak classes (e.g. healthy cassava)
    from giving false reassurance."""
    p, inside, y, _, classes = _probs(work_dir, "val", prior)
    a, conf = p.argmax(1), p.max(1)
    out = {}
    for k, c in enumerate(classes):
        out[c] = 1.01
        for t in np.round(np.arange(cutoff(), 0.991, 0.01), 2):
            sel = (a == k) & inside & (conf >= t)
            if sel.sum() < 5:
                break
            if (y[sel] == k).mean() >= target:
                out[c] = float(t)
                break
    return out


def app_rule(work_dir: Path, prior: dict | None, thresholds: dict | None = None) -> dict:
    p, inside, y, rows, classes = _probs(work_dir, "test", prior)
    c = cutoff()
    t = np.array([max(c, (thresholds or {}).get(k, c)) for k in classes])
    a = p.argmax(1)
    conf, ok = inside & (p.max(1) >= t[a]), a == y
    rule = "top-1 >= cutoff"
    if all("___" in k for k in classes):
        rule = f"given the right plant: within-plant probabilities, plant mass >= {crop_mass_min()}, top-1 >= cutoff"
    if thresholds:
        rule += f"; per-condition cut-offs for {PER_CLASS_PRECISION:.0%} validation precision"
    src = np.array([r.get("source", "") for r in rows])
    return {"cutoff": c, "rule": rule, "accuracy": float(ok.mean()), "coverage": float(conf.mean()), "precision": float(ok[conf].mean()),
            "bySource": {s: {"accuracy": float(ok[src == s].mean()), "coverage": float(conf[src == s].mean()),
                             "precision": float(ok[(src == s) & conf].mean()) if (conf & (src == s)).any() else None}
                         for s in sorted(set(src)) if s}}
