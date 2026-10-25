"""Build the garden-v1 dataset: PlantVillage + PlantDoc + iBean.

Why these three (see README "Garden crops"):
  * PlantVillage: 38 classes, lab photos, the existing base.
  * PlantDoc (Singh et al., CODS-COMAD 2020, CC BY 4.0): real-world photos of
    the same garden crops; mapped onto PlantVillage labels where the disease
    is the same, so the model learns from garden-like pictures, not just lab
    shots. Images were web-scraped, so we dedupe against PlantVillage and
    map only exact matches.
  * iBean (Makerere AI Lab; annotated by NaCRRI plant-health experts; MIT):
    field photos of beans, the #4 home-garden vegetable (NGA survey).

Splits: PlantVillage reuses its existing grouped split; PlantDoc and iBean
keep their OFFICIAL test sets (comparable with published results); their
train sets are split 90/10 into train/val. Near-duplicate groups (perceptual
hash) spanning sources are forced into a single split, test taking priority.
PlantDoc train rows are repeated x4 so ~2k garden photos aren't drowned out by
~38k lab photos (each repeat gets different augmentation).
"""
import csv
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
import imagehash  # noqa: E402
from PIL import Image  # noqa: E402

from shared.seed import SEED  # noqa: E402

D = ROOT / "data"
WORK = D / "work_garden"
PLANTDOC_REPEAT = 4

# PlantDoc folder -> PlantVillage label. Only exact disease matches; anything
# without a same-disease PlantVillage class is dropped (listed in the report).
PLANTDOC_MAP = {
    "Apple Scab Leaf": "Apple___Apple_scab",
    "Apple leaf": "Apple___healthy",
    "Apple rust leaf": "Apple___Cedar_apple_rust",
    "Bell_pepper leaf": "Pepper,_bell___healthy",
    "Bell_pepper leaf spot": "Pepper,_bell___Bacterial_spot",
    "Blueberry leaf": "Blueberry___healthy",
    "Cherry leaf": "Cherry_(including_sour)___healthy",
    "Corn Gray leaf spot": "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot",
    "Corn leaf blight": "Corn_(maize)___Northern_Leaf_Blight",
    "Corn rust leaf": "Corn_(maize)___Common_rust_",
    "Peach leaf": "Peach___healthy",
    "Potato leaf early blight": "Potato___Early_blight",
    "Potato leaf late blight": "Potato___Late_blight",
    "Raspberry leaf": "Raspberry___healthy",
    "Soyabean leaf": "Soybean___healthy",
    "Squash Powdery mildew leaf": "Squash___Powdery_mildew",
    "Strawberry leaf": "Strawberry___healthy",
    "Tomato Early blight leaf": "Tomato___Early_blight",
    "Tomato Septoria leaf spot": "Tomato___Septoria_leaf_spot",
    "Tomato leaf": "Tomato___healthy",
    "Tomato leaf bacterial spot": "Tomato___Bacterial_spot",
    "Tomato leaf late blight": "Tomato___Late_blight",
    "Tomato leaf mosaic virus": "Tomato___Tomato_mosaic_virus",
    "Tomato leaf yellow virus": "Tomato___Tomato_Yellow_Leaf_Curl_Virus",
    "Tomato mold leaf": "Tomato___Leaf_Mold",
    "Tomato two spotted spider mites leaf": "Tomato___Spider_mites Two-spotted_spider_mite",
    "grape leaf": "Grape___healthy",
    "grape leaf black rot": "Grape___Black_rot",
}
IBEAN_MAP = {"angular_leaf_spot": "Bean___Angular_leaf_spot", "bean_rust": "Bean___Bean_rust", "healthy": "Bean___healthy"}
IMG = {".jpg", ".jpeg", ".png"}


def scan(folder: Path):
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMG and not p.name.startswith("."))


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    rows, report = [], {"dropped": Counter(), "corrupt": [], "unmappedPlantDocFolders": []}

    # PlantVillage: reuse verified manifest + existing grouped split
    pv = {r["path"]: r for r in csv.DictReader(open(D / "work_plantvillage" / "splits.csv"))}
    for r in pv.values():
        rows.append({"path": r["path"], "label": r["label"], "split": r["split"], "source": "plantvillage"})

    # PlantDoc: official train/test folders
    pd_root = next((D / "plantdoc_raw").glob("PlantDoc-Dataset*"), None)
    if pd_root is None:
        print("PlantDoc not present: building PlantVillage + iBean only")
    for split_dir, split in ((("train", "train"), ("test", "test")) if pd_root else ()):
        for folder in sorted((pd_root / split_dir).iterdir()):
            if not folder.is_dir():
                continue
            label = PLANTDOC_MAP.get(folder.name)
            if label is None:
                report["unmappedPlantDocFolders"].append(folder.name)
                report["dropped"][f"plantdoc:{folder.name}"] += len(scan(folder))
                continue
            for p in scan(folder):
                rows.append({"path": str(p), "label": label, "split": split, "source": "plantdoc"})

    # iBean: official train/validation/test
    for p in scan(D / "ibean" / "raw"):
        split = {"train": "train", "validation": "val", "test": "test"}[p.name.split("_")[0]]
        rows.append({"path": str(p), "label": IBEAN_MAP[p.parent.name], "split": split, "source": "ibean"})

    # verify non-PlantVillage images (PlantVillage was verified earlier), hash all
    md5_seen, keep = {}, []
    for r in rows:
        try:
            if r["source"] != "plantvillage":
                with Image.open(r["path"]) as im:
                    im.verify()
            with Image.open(r["path"]) as im:
                rgb = im.convert("RGB")
                r["phash"] = str(imagehash.phash(rgb.resize((256, 256))))
        except Exception as e:
            report["corrupt"].append(r["path"] + " " + repr(e))
            continue
        md5 = hashlib.md5(Path(r["path"]).read_bytes()).hexdigest()
        if md5 in md5_seen:
            report["dropped"]["exact-duplicate"] += 1
            continue
        md5_seen[md5] = r["path"]
        keep.append(r)
    rows = keep

    # near-duplicate groups across sources; conflicting labels dropped; test wins
    groups = defaultdict(list)
    for r in rows:
        groups[r["phash"]].append(r)
    cross = {"plantdoc~plantvillage": 0}
    final = []
    for g, members in groups.items():
        if len({m["label"] for m in members}) > 1:
            report["dropped"]["label-conflict-near-duplicate"] += len(members)
            continue
        if len({m["source"] for m in members}) > 1:
            cross["plantdoc~plantvillage"] += 1
        split = "test" if any(m["split"] == "test" for m in members) else ("val" if any(m["split"] == "val" for m in members) else "train")
        for m in members:
            m["split"], m["group"] = split, g
            final.append(m)

    # PlantDoc / iBean train -> 90/10 train/val by group (iBean already has val)
    pd_groups = sorted({m["group"] for m in final if m["source"] == "plantdoc" and m["split"] == "train"})
    rng.shuffle(pd_groups)
    pd_val = set(pd_groups[: len(pd_groups) // 10])
    for m in final:
        if m["source"] == "plantdoc" and m["split"] == "train" and m["group"] in pd_val:
            m["split"] = "val"

    classes = sorted({m["label"] for m in final})
    out = []
    for m in final:
        reps = PLANTDOC_REPEAT if (m["source"] == "plantdoc" and m["split"] == "train") else 1
        out += [m] * reps
    with open(WORK / "splits.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["path", "label", "label_idx", "split", "group", "source"])
        for m in out:
            wr.writerow([m["path"], m["label"], classes.index(m["label"]), m["split"], m["group"], m["source"]])

    summary = defaultdict(Counter)
    for m in final:
        summary[f"{m['source']}:{m['split']}"][m["label"]] += 1
    split_report = {"classes": classes,
                    "totals": dict(Counter(m["split"] for m in final)),
                    "bySourceSplit": {k: sum(v.values()) for k, v in sorted(summary.items())},
                    "perClassBySourceSplit": {k: dict(v) for k, v in sorted(summary.items())},
                    "plantdocTrainRepeat": PLANTDOC_REPEAT,
                    "crossSourceNearDuplicateGroups": cross,
                    "dropped": dict(report["dropped"]),
                    "unmappedPlantDocFolders": report["unmappedPlantDocFolders"],
                    "corrupt": report["corrupt"],
                    "method": "PlantVillage grouped split reused; PlantDoc/iBean official test kept; near-duplicate groups across sources kept in one split (test wins)",
                    "droppedLabelConflicts": []}
    json.dump(split_report, open(WORK / "split_report.json", "w"), indent=2)
    print(json.dumps({k: v for k, v in split_report.items() if k not in ("perClassBySourceSplit", "classes")}, indent=2))
    print(len(classes), "classes")


if __name__ == "__main__":
    main()
