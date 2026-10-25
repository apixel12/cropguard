"""Lemon hyperparameter search: full-data runs (lemon trains in ~25 min).

Every candidate starts from the same weights as the shipped lemon model and
changes one setting of training/lemon/config.py. Scored afterwards on the
VALIDATION split, clean and blurred (training/val_blur.py) and with
training/compare_val.py. The test split is not touched.

usage: python training/lemon/hp_lemon.py [name ...]
"""
import shutil
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
sys.path.insert(0, str(ROOT / "training" / "lemon"))
from config import CFG  # noqa: E402
from shared.pipeline import evaluate, train  # noqa: E402

OUT = ROOT / "data" / "hp_lemon"
BASE = dict(init_from=ROOT / "data" / "work_lemon" / "prev" / "best.keras", cache_dir=OUT / "cache")
CANDIDATES = {
    "current_replicate": {},
    "unfreeze_all": {"unfreeze_from": 0},
    "unfreeze_100": {"unfreeze_from": 100},
    "dropout_0.1": {"dropout": 0.1},
    "dropout_0.4": {"dropout": 0.4},
    "outlier_1": {"outlier_per_batch": 1},
    "lr_5e-5": {"finetune_lr": 5e-5},
    "lr_2e-4": {"finetune_lr": 2e-4},
    "outlier_1_288": {"outlier_per_batch": 1},  # run with CG_IMG_SIZE=288
}

if __name__ == "__main__":
    for name in sys.argv[1:] or list(CANDIDATES):
        cfg = replace(CFG, work_dir=OUT / name, **BASE, **CANDIDATES[name])
        cfg.work_dir.mkdir(parents=True, exist_ok=True)
        for f in ("splits.csv", "split_report.json"):
            shutil.copy(CFG.work_dir / f, cfg.work_dir / f)
        train(cfg)
        evaluate(cfg)
        print("done", name, flush=True)
