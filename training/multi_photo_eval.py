"""More than one photo: does combining photos of the same plant help?

Uses the saved held-out TEST predictions (same TTA + prior correction as the
app). For each condition, random groups of k different test photos of that
condition stand in for "several photos of one sick plant". Each group is
combined exactly as the app does (src/ml/classify.ts): geometric mean, the
plant known, per-condition cut-offs, and the majority rule for photos that
disagree. Mixed groups (different conditions of the same crop) check that
the app doesn't invent a compromise answer.

The combining method (geometric mean vs arithmetic mean vs product) and the
majority rule were chosen on the VALIDATION split; this reports TEST.

usage: python training/multi_photo_eval.py
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "training"))
from shared.app_rule import _probs, cutoff  # noqa: E402

GROUPS_PER_CONDITION = 30


def geo(P):
    L = np.log(np.clip(P, 1e-9, 1)).mean(0)
    q = np.exp(L - L.max())
    return q / q.sum()


def decide(p, inside, g, th):
    q = geo(p[g])
    a = q.argmax()
    tops = p[g].argmax(1)
    split = len(set(tops)) > 1 and (tops == a).sum() * 2 <= len(g)
    return a, bool(inside[g].mean() >= 0.5 and q[a] >= th[a] and not split)


out = {}
for mid, work in (("crops-v2", "work_crops"), ("lemon-v1", "work_lemon")):
    rng = np.random.default_rng(0)
    meta = json.load(open(ROOT / "public/models" / mid / "metadata.json"))
    p, inside, y, _, classes = _probs(ROOT / "data" / work, "test", meta.get("priorCorrection"))
    th = np.array([max(cutoff(), meta.get("classThresholds", {}).get(c, 0)) for c in classes])
    by = {}
    for i, t in enumerate(y):
        by.setdefault(t, []).append(i)
    res = {}
    for k in (1, 2, 3, 5):
        r = [(t,) + decide(p, inside, rng.choice(idx, k, replace=False), th)
             for t, idx in by.items() if len(idx) >= k for _ in range(GROUPS_PER_CONDITION)]
        ok = np.array([a == t for t, a, _ in r])
        named = np.array([n for _, _, n in r])
        res[str(k)] = {"accuracy": float(ok.mean()), "answered": float(named.mean()),
                       "rightWhenAnswered": float(ok[named].mean()), "confidentlyWrong": float((named & ~ok).mean())}
        print(f"{mid} {k} photo(s): " + "  ".join(f"{a} {v:.3f}" for a, v in res[str(k)].items()), flush=True)
    if mid == "crops-v2":
        crop = np.array([c.split("___")[0] for c in classes])
        keys = list(by)
        mixed = []
        for _ in range(3000):
            t1 = rng.choice(keys)
            others = [t for t in keys if crop[t] == crop[t1] and t != t1]
            if others:
                t2 = rng.choice(others)
                g = np.array([rng.choice(by[t1]), rng.choice(by[t2])])
                a, n = decide(p, inside, g, th)
                mixed.append((n, n and a not in (t1, t2)))
        m = np.array(mixed)
        res["mixedPairs"] = {"named": float(m[:, 0].mean()), "namedConditionInNeitherPhoto": float(m[:, 1].mean())}
        print("mixed pairs:", res["mixedPairs"])
    out[mid] = res
json.dump(out, open(ROOT / "data" / "multi_photo_eval.json", "w"), indent=2)
