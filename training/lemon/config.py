import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.pipeline import Config  # noqa: E402

# Mendeley Data, DOI 10.17632/8d9fv6kpt3.2 — the user downloads the zip into data/lemon_raw
CFG = Config(
    name="lemon-v1",
    raw_dir=ROOT / "data" / "lemon_raw",
    work_dir=ROOT / "data" / "work_lemon",
    dataset_label="Large-Scale Lemon Leaf Disease and Pest Image Dataset from Bangladesh "
                  "(Mendeley Data, DOI 10.17632/8d9fv6kpt3.2)",
    license="CC BY 4.0",
    expected_classes=18,
    expected_images=17609,
    dihedral_groups=True,
    head_epochs=1,
    finetune_epochs=15,
    unfreeze_from=40,
    finetune_lr=1e-4,
    finetune_patience=5,
    # v1.2: half-strength robustness augmentation (includes blur) won on validation:
    # blurred-photo accuracy 67% -> 81%, sharp photos unchanged (training/lemon/variant_c.py)
    robust_level="medium",
    # v1.3: 1 synthetic non-leaf image per batch (was 3) won the lemon search on all six
    # validation scores (training/lemon/hp_lemon.py); 288 px input was worse for lemon
    outlier_per_batch=1,
    # v1.1: tempered class weights won on validation (training/lemon/variant_b.py vs this config)
    class_weight_power=0.5,
    # warm start from the previous lemon model, backed up in prev/
    init_from=ROOT / "data" / "work_lemon" / "prev" / "best.keras",
    init_classes=json.load(open(ROOT / "data" / "work_lemon" / "split_report.json"))["classes"],
)
FOCUS = ["Healthy", "Citrus Canker", "Greening", "Curl Leaf"]
MODEL_OUT = ROOT / "public" / "models" / "lemon-v1"
