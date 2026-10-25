import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.pipeline import Config  # noqa: E402

CFG = Config(
    name="router-v2",
    raw_dir=ROOT / "data" / "work_router2",
    work_dir=ROOT / "data" / "work_router2",
    dataset_label="Plant identification across all supported crops: lemon + crops-v2 datasets, labels = plant",
    license="See DATA_SOURCES.md; model released CC BY-SA 3.0",
    expected_classes=21,
    head_epochs=1,
    finetune_epochs=5,
    unfreeze_from=100,
    finetune_lr=3e-5,
    finetune_patience=2,
    robust_level="full",  # clutter + blur: background must not reveal the plant
    init_from=ROOT / "data" / "work_router2" / "prev" / "best.keras",  # previous router-v2
    init_classes=json.load(open(ROOT / "data" / "work_router2" / "split_report.json"))["classes"],
)
MODEL_OUT = ROOT / "public" / "models" / "router-v2"
