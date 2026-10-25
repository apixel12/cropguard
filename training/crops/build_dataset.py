"""Build the crops-v2 dataset: every non-lemon crop in one disease model.

Sources (all open-licence research datasets; see DATA_SOURCES.md):
  PlantVillage   38 classes, lab photos            (existing grouped split reused)
  iBean           3 bean classes, field photos     (official split kept)
  PlantDoc       real-world photos mapped onto PlantVillage labels (official test kept)
  iCassava 2019   5 cassava classes                 (official split kept)
  Rice           Sethy et al. 2020 + RiceLeafBD
  Wheat          John Innes Centre (Zenodo 7307816)
  Cotton         Cotton severity set (originals) + SAR-CLD-2024 (originals)
  Sugarcane      Daphal & Koli 2022

Safeguards, in order:
  * every non-PlantVillage image is opened and verified; corrupt files dropped
  * byte-identical duplicates removed
  * near-duplicates grouped with a flip/rotation-invariant perceptual hash;
    a group never spans splits (test wins), and groups whose members carry
    different labels are dropped as label noise
  * datasets without an official split are split 70/15/15 by group,
    stratified by label
  * source balance: PlantDoc training rows repeated x2 so real-world photos
    aren't drowned out by ~38k lab photos; healthy cotton from the severity
    set is capped so "which camera" can't stand in for "healthy"
  * classes with too few originals to test honestly are excluded (cotton
    Fusarium wilt: 47 photos) and listed in the report
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
FR = D / "farm_raw"
WORK = D / "work_crops"
IMG = {".jpg", ".jpeg", ".png"}
PLANTDOC_REPEAT = 2  # x4 let PlantDoc's noisy labels pull PlantVillage accuracy down
COTTON_SEVERITY_HEALTHY_CAP = 300

sys.path.insert(0, str(ROOT / "training" / "garden"))
from build_dataset import PLANTDOC_MAP  # noqa: E402  (same exact-match mapping)

RICE = {"Bacterialblight": "Rice___Bacterial_leaf_blight", "Blast": "Rice___Blast", "Brownspot": "Rice___Brown_spot",
        "Tungro": "Rice___Tungro"}
RICE_BD = {"Bacterial Leaf Blight": "Rice___Bacterial_leaf_blight", "Brown Spot": "Rice___Brown_spot",
           "Tungro Virus": "Rice___Tungro", "Healthy Leaf": "Rice___healthy"}
WHEAT = {"YellowRust": "Wheat___Yellow_rust", "BrownRust": "Wheat___Brown_rust", "Septoria": "Wheat___Septoria",
         "Mildew": "Wheat___Powdery_mildew", "Healthy": "Wheat___healthy"}
COTTON_SEV = {"bacterial blight": "Cotton___Bacterial_blight", "curl virus": "Cotton___Leaf_curl_virus",
              "healthy": "Cotton___healthy"}  # 'fussarium wilt' excluded: too few originals
COTTON_SAR = {"Bacterial Blight": "Cotton___Bacterial_blight", "Curl Virus": "Cotton___Leaf_curl_virus",
              "Healthy Leaf": "Cotton___healthy", "Leaf Hopper Jassids": "Cotton___Jassids",
              "Leaf Redding": "Cotton___Leaf_reddening", "Herbicide Growth Damage": "Cotton___Herbicide_damage"}
SUGARCANE = {"Healthy": "Sugarcane___healthy", "Mosaic": "Sugarcane___Mosaic", "RedRot": "Sugarcane___Red_rot",
             "Rust": "Sugarcane___Rust", "Yellow": "Sugarcane___Yellow_leaf"}
CASSAVA = {"cbb": "Cassava___Bacterial_blight", "cbsd": "Cassava___Brown_streak_disease", "cgm": "Cassava___Green_mottle",
           "cmd": "Cassava___Mosaic_disease", "healthy": "Cassava___healthy"}


def images(folder: Path):
    return sorted(p for p in folder.rglob("*") if p.suffix.lower() in IMG and not p.name.startswith("."))


def norm(s: str) -> str:
    return s.strip().lower()


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    rows = []
    excluded = Counter()

    def add(path, label, split, source):
        rows.append({"path": str(path), "label": label, "split": split, "source": source})

    # PlantVillage + iBean: reuse the garden build's verified, grouped split
    for r in csv.DictReader(open(D / "work_garden" / "splits.csv")):
        if r["source"] in ("plantvillage", "ibean"):
            add(r["path"], r["label"], r["split"], r["source"])
    seen = set()
    rows = [r for r in rows if not (r["path"] in seen or seen.add(r["path"]))]  # garden rows can repeat

    # PlantDoc: official train/test
    pd = next((D / "plantdoc_raw").glob("PlantDoc-Dataset*"))
    for split in ("train", "test"):
        for folder in sorted((pd / split).iterdir()):
            if folder.is_dir():
                if folder.name in PLANTDOC_MAP:
                    for p in images(folder):
                        add(p, PLANTDOC_MAP[folder.name], split, "plantdoc")
                else:
                    excluded[f"plantdoc:{folder.name}"] += len(images(folder))

    # iCassava: official train/validation/test
    for p in images(FR / "cassava"):
        split = {"train": "train", "validation": "val", "test": "test"}[p.parent.parent.name]
        add(p, CASSAVA[p.parent.name], split, "cassava")

    auto = []  # datasets without an official split

    def collect(folder, mapping, source, key=lambda p: p.parent.name, cap=None):
        counts = Counter()
        for p in images(folder):
            k = next((v for c, v in mapping.items() if norm(c) == norm(key(p))), None)
            if k is None:
                excluded[f"{source}:{key(p)}"] += 1
                continue
            if cap and k in cap and counts[k] >= cap[k]:
                excluded[f"{source}:{key(p)} (source-balance cap)"] += 1
                continue
            counts[k] += 1
            auto.append({"path": str(p), "label": k, "source": source})

    collect(FR / "rice_sethy", RICE, "rice_sethy")
    collect(FR / "rice_riceleafbd", RICE_BD, "riceleafbd")
    collect(FR / "wheat", WHEAT, "wheat_jic", key=lambda p: "".join(ch for ch in p.stem if not ch.isdigit()))
    collect(FR / "cotton", COTTON_SEV, "cotton_severity",
            key=lambda p: next(x for x in p.parts[::-1] if norm(x) in {norm(c) for c in COTTON_SEV} | {"fussarium wilt"}),
            cap={"Cotton___healthy": COTTON_SEVERITY_HEALTHY_CAP})
    collect(FR / "cotton_sarcld", COTTON_SAR, "sarcld")
    collect(FR / "sugarcane", SUGARCANE, "sugarcane")
    for r in auto:
        r["split"] = None
    rows += auto

    # verify, hash, exact-dedupe
    md5_seen, keep, corrupt = {}, [], []
    for r in rows:
        try:
            if r["source"] != "plantvillage":
                with Image.open(r["path"]) as im:
                    im.verify()
            with Image.open(r["path"]) as im:
                t = im.convert("RGB").resize((256, 256))
            T = Image.Transpose
            views = [t, t.transpose(T.FLIP_LEFT_RIGHT)]
            views += [v.transpose(x) for v in views for x in (T.ROTATE_90, T.ROTATE_180, T.ROTATE_270)]
            r["phash"] = min(str(imagehash.phash(v)) for v in views)
        except Exception as e:
            corrupt.append(f"{r['path']}: {e!r}")
            continue
        md5 = hashlib.md5(Path(r["path"]).read_bytes()).hexdigest()
        if md5 in md5_seen:
            excluded["exact-duplicate"] += 1
            continue
        md5_seen[md5] = 1
        keep.append(r)

    # near-duplicate groups; label conflicts dropped; fixed splits win (test first)
    groups = defaultdict(list)
    for r in keep:
        groups[r["phash"]].append(r)
    final, auto_groups = [], defaultdict(list)
    for g, members in groups.items():
        if len({m["label"] for m in members}) > 1:
            excluded["label-conflict-near-duplicate"] += len(members)
            continue
        fixed = [m["split"] for m in members if m["split"]]
        split = "test" if "test" in fixed else "val" if "val" in fixed else "train" if fixed else None
        for m in members:
            m["group"] = g
            m["split"] = split
        if split is None:
            auto_groups[members[0]["label"]].append(members)
        else:
            final += members

    # 70/15/15 by group, stratified by label
    for label, gs in sorted(auto_groups.items()):
        rng.shuffle(gs)
        n = len(gs)
        n_te, n_va = round(n * 0.15), round(n * 0.15)
        for i, members in enumerate(gs):
            s = "test" if i < n_te else "val" if i < n_te + n_va else "train"
            for m in members:
                m["split"] = s
                final.append(m)

    # PlantDoc train -> 90/10 train/val by group
    pd_groups = sorted({m["group"] for m in final if m["source"] == "plantdoc" and m["split"] == "train"})
    rng.shuffle(pd_groups)
    pd_val = set(pd_groups[: len(pd_groups) // 10])
    for m in final:
        if m["source"] == "plantdoc" and m["split"] == "train" and m["group"] in pd_val:
            m["split"] = "val"

    classes = sorted({m["label"] for m in final})
    with open(WORK / "splits.csv", "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["path", "label", "label_idx", "split", "group", "source"])
        for m in final:
            reps = PLANTDOC_REPEAT if (m["source"] == "plantdoc" and m["split"] == "train") else 1
            for _ in range(reps):
                w.writerow([m["path"], m["label"], classes.index(m["label"]), m["split"], m["group"], m["source"]])

    per = defaultdict(Counter)
    for m in final:
        per[m["label"]][m["split"]] += 1
    report = {"classes": classes, "classCount": len(classes),
              "totals": dict(Counter(m["split"] for m in final)),
              "bySource": {s: dict(Counter(m["split"] for m in final if m["source"] == s)) for s in sorted({m["source"] for m in final})},
              "perClass": {c: dict(v) for c, v in sorted(per.items())},
              "excluded": dict(excluded), "corrupt": corrupt[:50], "corruptCount": len(corrupt),
              "plantdocTrainRepeat": PLANTDOC_REPEAT, "cottonSeverityHealthyCap": COTTON_SEVERITY_HEALTHY_CAP,
              "method": "fixed official splits kept; others 70/15/15 by flip/rotation-invariant near-duplicate group, stratified; test wins on cross-split groups",
              "droppedLabelConflicts": []}
    json.dump(report, open(WORK / "split_report.json", "w"), indent=2)
    print(json.dumps({k: report[k] for k in ("classCount", "totals", "bySource", "excluded", "corruptCount")}, indent=1))


if __name__ == "__main__":
    main()
