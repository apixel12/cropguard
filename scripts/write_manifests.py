"""Write data_manifests/*.csv.gz: every image each model was trained/tested on.

One row per unique image: file (relative to data/), label, split, source.
The images themselves are not redistributed; see DATA_SOURCES.md.

    .venv/bin/python scripts/write_manifests.py
"""
import csv
import gzip
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data"
OUT = ROOT / "data_manifests"
SETS = {"crops_splits": "work_crops", "plant_identification_splits": "work_router2", "lemon_splits": "work_lemon"}

for name, work in SETS.items():
    src = D / work / "splits.csv"
    if not src.exists():
        print("skip", name)
        continue
    seen, n = set(), 0
    with gzip.open(OUT / f"{name}.csv.gz", "wt", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "label", "split", "source"])
        for r in csv.DictReader(open(src)):
            if r["path"] in seen:  # training repeats (PlantDoc x4) listed once
                continue
            seen.add(r["path"])
            w.writerow([str(Path(r["path"]).resolve().relative_to(D.resolve())), r["label"], r["split"], r.get("source", work[5:])])
            n += 1
    print(f"{name}: {n:,} images")
