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
WORK = D / "work_router"
CAP = {"train": 2500, "val": 500, "test": 600}
CROP_NAME = {"Pepper,_bell": "Bell pepper", "Corn_(maize)": "Corn", "Cherry_(including_sour)": "Cherry"}

rows = []
for r in csv.DictReader(open(D / "work_lemon" / "splits.csv")):
    rows.append({"path": r["path"], "crop": "Lemon", "split": r["split"], "group": "L" + r["group"], "source": "lemon"})
seen = set()
for r in csv.DictReader(open(D / "work_garden" / "splits.csv")):
    if r["path"] in seen:  # garden splits repeat some train rows; one copy is enough here
        continue
    seen.add(r["path"])
    key = r["label"].split("___")[0]
    rows.append({"path": r["path"], "crop": CROP_NAME.get(key, key), "split": r["split"], "group": "G" + r["group"], "source": r["source"]})

rng = random.Random(SEED)
rng.shuffle(rows)
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
        w.writerow([r["path"], r["crop"], classes.index(r["crop"]), r["split"], r["group"], r["source"]])
report = {"classes": classes, "totals": dict(Counter(r["split"] for r in kept)),
          "perPlant": {c: {s: count[(c, s)] for s in CAP} for c in classes}, "capPerPlant": CAP,
          "method": "labels = plant; split inherited from source datasets; per-plant caps"}
json.dump(report, open(WORK / "split_report.json", "w"), indent=2)
print(json.dumps(report["totals"]), len(classes), "plants:", classes)
