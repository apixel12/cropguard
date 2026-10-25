"""Plant-identification ("router") dataset: which model should see this leaf?

Classes are plants, not diseases: Lemon + the 15 garden crops. Every image
keeps the split it already has in its source dataset (lemon / garden), so
near-duplicate groups never cross train/test. Training images are capped per
plant so tomato (~12k) doesn't drown out raspberry (~300).
"""
import csv
import json
import random
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.seed import SEED  # noqa: E402

D = ROOT / "data"
WORK = D / "work_router2"
CAP = {"train": 2500, "val": 500, "test": 600}
CROP_NAME = {"Pepper,_bell": "Bell pepper", "Corn_(maize)": "Corn", "Cherry_(including_sour)": "Cherry"}

rows = []
for r in csv.DictReader(open(D / "work_lemon" / "splits.csv")):
    rows.append({"path": r["path"], "crop": "Lemon", "split": r["split"], "group": "L" + r["group"], "source": "lemon"})
seen = set()
for r in csv.DictReader(open(D / "work_crops" / "splits.csv")):
    if r["path"] in seen:  # garden splits repeat some train rows; one copy is enough here
        continue
    seen.add(r["path"])
    key = r["label"].split("___")[0]
    rows.append({"path": r["path"], "crop": CROP_NAME.get(key, key), "split": r["split"], "group": "G" + r["group"], "source": r["source"]})

rng = random.Random(SEED)
rng.shuffle(rows)
# v2.2: real-world photos are the hard cases, but the random per-plant cap kept only 1,525 of
# 2,061 PlantDoc and 584 of 1,023 RiceLeafBD training photos. Fill each plant's TRAINING cap
# with field photos first (stable order otherwise); val/test selection is unchanged.
FIELD_FIRST = {"plantdoc": 0, "riceleafbd": 1, "wheat_jic": 1, "wheat_holeta": 1, "cassava": 2, "sarcld": 2, "lemon": 3}
train_rows = sorted((r for r in rows if r["split"] == "train"), key=lambda r: FIELD_FIRST.get(r["source"], 9))
rows = train_rows + [r for r in rows if r["split"] != "train"]
PLANTDOC_REPEAT = 3  # real-world photos (PlantDoc, RiceLeafBD) count 3x in training
kept, count = [], Counter()
for r in rows:
    k = (r["crop"], r["split"])
    if count[k] < CAP[r["split"]]:
        count[k] += 1
        kept.append(r)

classes = sorted({r["crop"] for r in kept})
WORK.mkdir(parents=True, exist_ok=True)
with open(WORK / "splits.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["path", "label", "label_idx", "split", "group", "source"])
    for r in kept:
        reps = PLANTDOC_REPEAT if (r["source"] in ("plantdoc", "riceleafbd") and r["split"] == "train") else 1
        for _ in range(reps):
            w.writerow([r["path"], r["crop"], classes.index(r["crop"]), r["split"], r["group"], r["source"]])
report = {"classes": classes, "totals": dict(Counter(r["split"] for r in kept)),
          "perPlant": {c: {s: count[(c, s)] for s in CAP} for c in classes}, "capPerPlant": CAP,
          "plantdocTrainRepeat": PLANTDOC_REPEAT,
          "method": "labels = plant; split inherited from source datasets; per-plant caps filled with field photos first (train only)"}
json.dump(report, open(WORK / "split_report.json", "w"), indent=2)
print(json.dumps(report["totals"]), len(classes), "plants:", classes)
