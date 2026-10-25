import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.pipeline import Config  # noqa: E402

CFG = Config(
    name="garden-v1",
    raw_dir=ROOT / "data" / "work_garden",  # built by build_dataset.py
    work_dir=ROOT / "data" / "work_garden",
    dataset_label="PlantVillage (lab) + PlantDoc (real-world, mapped to PlantVillage labels) + iBean (bean field photos)",
    license="PlantVillage CC BY-SA 3.0; PlantDoc CC BY 4.0; iBean MIT",
    expected_classes=41,
    head_epochs=2,
    finetune_epochs=6,
    unfreeze_from=40,
    finetune_lr=5e-5,
    finetune_patience=3,
    robust_level="full",
    init_from=ROOT / "data" / "work_plantvillage" / "checkpoints" / "best.keras",
    init_classes=json.load(open(ROOT / "public" / "models" / "plantvillage-v2" / "metadata.json"))["classes"],
)
MODEL_OUT = ROOT / "public" / "models" / "garden-v1"  # retired; class list kept in training/archive/
