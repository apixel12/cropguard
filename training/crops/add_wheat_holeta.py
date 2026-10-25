"""Add the Holeta wheat photos (Mendeley 10.17632/wgd66f8n6h.1) WITHOUT reshuffling.

Rebuilding the whole dataset would re-split the existing wheat photos, letting images the
current model trained on drift into the test set. Instead every existing row keeps its
split; new photos are verified, de-duplicated against everything already in the dataset
(MD5 and flip/rotation-invariant perceptual hash) and split 70/15/15 by near-duplicate
group, stratified by label. The plant-identification splits get the same rows.

usage: python training/crops/add_wheat_holeta.py
"""
import csv
import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

import imagehash
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))
from shared.seed import SEED  # noqa: E402

D = ROOT / "data"
SRC = D / "farm_raw" / "wheat_holeta"
LABELS = {"stripe_rust": "Wheat___Yellow_rust", "Healthy": "Wheat___healthy", "septoria": "Wheat___Septoria"}
CROPS, ROUTER = D / "work_crops", D / "work_router2"


def fingerprint(p):
    with Image.open(p) as im:
        im.verify()
    with Image.open(p) as im:
        t = im.convert("RGB").resize((256, 256))
    T = Image.Transpose
    views = [t, t.transpose(T.FLIP_LEFT_RIGHT)]
    views += [v.transpose(x) for v in views for x in (T.ROTATE_90, T.ROTATE_180, T.ROTATE_270)]
    return hashlib.md5(Path(p).read_bytes()).hexdigest(), min(str(imagehash.phash(v)) for v in views)


def main():
    rows = list(csv.DictReader(open(CROPS / "splits.csv")))
    if any(r["source"] == "wheat_holeta" for r in rows):
        sys.exit("already added")
    classes = json.load(open(CROPS / "split_report.json"))["classes"]
    existing_md5, existing_ph = set(), set()
    for p in {r["path"] for r in rows if r["label"].startswith("Wheat")}:
        m, h = fingerprint(p)
        existing_md5.add(m); existing_ph.add(h)
    new, dropped = [], Counter()
    for folder, label in LABELS.items():
        for p in sorted((SRC).rglob("*")):
            if p.parent.name != folder or p.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            try:
                m, h = fingerprint(p)
            except Exception:
                dropped["corrupt"] += 1; continue
            if m in existing_md5 or h in existing_ph:
                dropped["duplicate of an existing image"] += 1; continue
            existing_md5.add(m); existing_ph.add(h)
            new.append({"path": str(p), "label": label, "group": "H" + h, "source": "wheat_holeta"})
    # near-duplicate groups within the new photos, then 70/15/15 per label
    rng = random.Random(SEED)
    groups = defaultdict(list)
    for r in new:
        groups[(r["label"], r["group"])].append(r)
    by_label = defaultdict(list)
    for (lab, _), g in groups.items():
        by_label[lab].append(g)
    for lab, gs in sorted(by_label.items()):
        rng.shuffle(gs)
        n = len(gs); n_te = n_va = round(n * 0.15)
        for i, g in enumerate(gs):
            for r in g:
                r["split"] = "test" if i < n_te else "val" if i < n_te + n_va else "train"
    for f, plant in ((CROPS, False), (ROUTER, True)):
        with open(f / "splits.csv", "a", newline="") as fh:
            w = csv.writer(fh)
            for r in new:
                if plant:
                    rc = json.load(open(ROUTER / "split_report.json"))["classes"]
                    w.writerow([r["path"], "Wheat", rc.index("Wheat"), r["split"], r["group"], r["source"]])
                else:
                    w.writerow([r["path"], r["label"], classes.index(r["label"]), r["split"], r["group"], r["source"]])
    rep = json.load(open(CROPS / "split_report.json"))
    rep["wheatHoleta"] = {"added": dict(Counter((r["label"], r["split"]) for r in new).items().__iter__()) if False else
                          {f"{k[0]}|{k[1]}": v for k, v in Counter((r["label"], r["split"]) for r in new).items()},
                          "dropped": dict(dropped), "method": "existing rows keep their split; new photos split 70/15/15 by group"}
    json.dump(rep, open(CROPS / "split_report.json", "w"), indent=2)
    print(f"added {len(new)}; dropped {dict(dropped)}")
    print(Counter((r["label"].split("___")[1], r["split"]) for r in new))


if __name__ == "__main__":
    main()
