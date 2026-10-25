import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.pipeline import Config  # noqa: E402

# Official repo: github.com/spMohanty/PlantVillage-Dataset, raw/color
CFG = Config(
    name="plantvillage-v2",
    raw_dir=ROOT / "data" / "plantvillage_repo" / "raw" / "color",
    work_dir=ROOT / "data" / "work_plantvillage",
    dataset_label="PlantVillage (spMohanty/PlantVillage-Dataset, raw/color)",
    license="CC BY-SA 3.0 (PlantVillage)",
    expected_classes=38,
    expected_images=54305,
    head_epochs=4,
    finetune_epochs=10,
)
MODEL_OUT = ROOT / "public" / "models" / "plantvillage-v2"
