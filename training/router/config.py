import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.pipeline import Config  # noqa: E402

CFG = Config(
    name="router-v1",
    raw_dir=ROOT / "data" / "work_router",
    work_dir=ROOT / "data" / "work_router",
    dataset_label="Plant identification: lemon dataset + garden dataset (PlantVillage, iBean), labels = plant",
    license="Lemon CC BY 4.0; PlantVillage CC BY-SA 3.0; iBean MIT",
    expected_classes=16,
    head_epochs=4,
    finetune_epochs=4,
    unfreeze_from=100,
    finetune_lr=3e-5,
    finetune_patience=2,
    robust_level="full",  # clutter compositing: background must not reveal the plant
)
MODEL_OUT = ROOT / "public" / "models" / "router-v1"  # retired; class list kept in training/archive/
