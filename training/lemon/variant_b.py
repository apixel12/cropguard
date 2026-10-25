"""Lemon variant B: same as training/lemon/config.py but class weights tempered
(power 0.5). Trained into data/work_lemon_b; the better of A and B on the
VALIDATION split is exported (see training/lemon/pick.py)."""
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
sys.path.insert(0, str(ROOT / "training" / "lemon"))
from config import CFG  # noqa: E402
from shared.pipeline import evaluate, train  # noqa: E402

B = replace(CFG, name="lemon-v1", work_dir=ROOT / "data" / "work_lemon_b", class_weight_power=0.5)

if __name__ == "__main__":
    train(B) if sys.argv[1:] == ["train"] else evaluate(B)
