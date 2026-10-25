import json

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
    precision_score,
    recall_score,
    top_k_accuracy_score,
)


def full_report(y_true, probs, classes):
    y_pred = probs.argmax(1)
    p, r, f, s = precision_recall_fscore_support(
        y_true, y_pred, labels=range(len(classes)), zero_division=0
    )
    return {
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "top3Accuracy": float(
            top_k_accuracy_score(y_true, probs, k=3, labels=range(len(classes)))
        ),
        "macroPrecision": float(precision_score(y_true, y_pred, average="macro", zero_division=0)),
        "macroRecall": float(recall_score(y_true, y_pred, average="macro", zero_division=0)),
        "macroF1": float(f1_score(y_true, y_pred, average="macro", zero_division=0)),
        "weightedF1": float(f1_score(y_true, y_pred, average="weighted", zero_division=0)),
        "perClass": {
            c: {"precision": float(p[i]), "recall": float(r[i]), "f1": float(f[i]), "support": int(s[i])}
            for i, c in enumerate(classes)
        },
        "confusionMatrix": confusion_matrix(y_true, y_pred, labels=range(len(classes))).tolist(),
    }


def calibrate_thresholds_stepped(y_true, probs, targets=(0.99, 0.97, 0.95, 0.90)):
    """Strictest reachable target wins; the target used is recorded, never invented."""
    for t in targets:
        r = calibrate_thresholds(y_true, probs, t)
        if r:
            return r
    return None


def calibrate_thresholds(y_true, probs, target_precision=0.99):
    """Pick the loosest (confidence, margin) pair whose accepted predictions on
    the VALIDATION set reach target precision, maximising coverage."""
    srt = np.sort(probs, 1)
    top1, margin = srt[:, -1], srt[:, -1] - srt[:, -2]
    correct = probs.argmax(1) == y_true
    best = None
    for c in np.arange(0.50, 0.995, 0.01):
        for m in np.arange(0.0, 0.9, 0.02):
            acc = (top1 >= c) & (margin >= m)
            if acc.sum() < 20:
                continue
            prec = correct[acc].mean()
            cov = acc.mean()
            if prec >= target_precision and (best is None or cov > best["coverage"]):
                best = {"confidence": round(float(c), 2), "margin": round(float(m), 2),
                        "precisionAccepted": float(prec), "coverage": float(cov),
                        "targetPrecision": target_precision, "calibratedOn": "validation"}
    return best


def dump(obj, path):
    with open(path, "w") as fh:
        json.dump(obj, fh, indent=2)
