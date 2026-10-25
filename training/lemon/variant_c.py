"""Lemon variant C: the shipped lemon config (tempered class weights) plus
half-strength robustness augmentation, which includes defocus/motion blur.
Lemon was trained with "light" augmentation (no blur) and was confidently
wrong on 12.6% of blurred stress-test photos. Trained into data/work_lemon_c;
kept only if it wins on VALIDATION (clean and blurred)."""
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
sys.path.insert(0, str(ROOT / "training" / "lemon"))
from config import CFG  # noqa: E402
from shared.pipeline import evaluate, train  # noqa: E402

C = replace(CFG, work_dir=ROOT / "data" / "work_lemon_c", robust_level="medium",
            init_from=ROOT / "data" / "work_lemon" / "prev" / "best.keras")

if __name__ == "__main__":
    train(C) if sys.argv[1:] == ["train"] else evaluate(C)
