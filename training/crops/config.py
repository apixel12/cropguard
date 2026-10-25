import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# v2.2: 288x288 input won the validation search (training/hp_search.py, res_288: +1.1 points on
# clean/balanced/blurred accuracy). Must be set before shared.preprocessing is imported.
os.environ.setdefault("CG_IMG_SIZE", "288")
sys.path.insert(0, str(ROOT / "training"))
from shared.pipeline import Config  # noqa: E402

# One disease model for every non-lemon crop: garden crops + field crops.
CFG = Config(
    name="crops-v2",
    raw_dir=ROOT / "data" / "work_crops",  # built by build_dataset.py
    work_dir=ROOT / "data" / "work_crops",
    dataset_label="PlantVillage + PlantDoc + iBean + iCassava + Sethy rice + RiceLeafBD + JIC wheat + cotton (severity, SAR-CLD-2024) + sugarcane (Daphal & Koli)",
    license="PlantVillage CC BY-SA 3.0; others CC BY 4.0 / MIT (see DATA_SOURCES.md); model released CC BY-SA 3.0",
    expected_classes=67,
    head_epochs=1,
    finetune_epochs=7,
    unfreeze_from=40,
    finetune_lr=5e-5,
    finetune_patience=3,
    # v2.1: half-strength robustness augmentation won the validation search
    # (training/hp_search.py: +0.9 accuracy, balanced and blurred accuracy up too)
    robust_level="medium",
    # 67 classes from 86 to 3,977 training photos: fully balanced weights (0.23-10.6)
    # made the model over-predict rare classes and cost PlantVillage 13 points
    class_weight_power=0.5,
    # v2.3: repeat wheat photos 2x in training. Round 4 (validation): repeating wheat lifted
    # wheat +6 to +8 points; repeating PlantDoc and cassava as well slightly hurt them, so only wheat.
    source_repeat={"wheat_jic": 2, "wheat_holeta": 2},
    # warm start from the previous crops model (all 67 classes), backed up in prev/
    init_from=ROOT / "data" / "work_crops" / "prev_288" / "best.keras",  # current shipped crops model
    init_classes=json.load(open(ROOT / "data" / "work_crops" / "split_report.json"))["classes"],
)
MODEL_OUT = ROOT / "public" / "models" / "crops-v2"
