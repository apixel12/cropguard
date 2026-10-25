"""Independent train/test leakage audit for every shipped model.

The dataset builders keep exact perceptual-hash groups inside one split.
This audit re-checks from scratch, more strictly:
  1. byte-identical files (MD5) shared between splits
  2. near-duplicates: 64-bit pHash (flip/rotation invariant) within Hamming
     distance <= 4 of an image in another split. Found with 4 x 16-bit bands
     (two hashes within distance 4 share at least one band exactly... for <= 3;
     distance 4 is checked inside every band bucket, so all <=3 are guaranteed
     and most 4s are found)
  3. the same file path in two splits
Writes data/leakage_audit.json.

usage: python training/leakage_audit.py
"""
import csv
import hashlib
import json
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import imagehash
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SETS = {"crops-v2": "work_crops", "router-v2": "work_router2", "lemon-v1": "work_lemon"}
MAXD = 4


def fingerprint(path):
    raw = Path(path).read_bytes()
    with Image.open(path) as im:
        t = im.convert("RGB").resize((256, 256))
    T = Image.Transpose
    views = [t, t.transpose(T.FLIP_LEFT_RIGHT)]
    views += [v.transpose(x) for v in views for x in (T.ROTATE_90, T.ROTATE_180, T.ROTATE_270)]
    return path, hashlib.md5(raw).hexdigest(), int(min(str(imagehash.phash(v)) for v in views), 16)


def main():
    cache = {}
    report = {}
    for model, work in SETS.items():
        rows = list(csv.DictReader(open(ROOT / "data" / work / "splits.csv")))
        split_of = defaultdict(set)
        for r in rows:
            split_of[r["path"]].add(r["split"])
        todo = [p for p in split_of if p not in cache]
        with ProcessPoolExecutor() as ex:
            for p, md5, ph in ex.map(fingerprint, todo, chunksize=64):
                cache[p] = (md5, ph)
        same_path = [p for p, s in split_of.items() if len(s) > 1]
        by_md5 = defaultdict(set)
        for p, s in split_of.items():
            by_md5[cache[p][0]] |= {(x, p) for x in s}
        md5_cross = [sorted({p for _, p in v}) for v in by_md5.values() if len({x for x, _ in v}) > 1]
        # near-duplicates across splits via 16-bit bands
        items = [(p, next(iter(s)), cache[p][1]) for p, s in split_of.items()]
        buckets = defaultdict(list)
        for i, (_, _, h) in enumerate(items):
            for b in range(4):
                buckets[(b, (h >> (16 * b)) & 0xFFFF)].append(i)
        pairs = set()
        for idx in buckets.values():
            if len(idx) < 2 or len({items[i][1] for i in idx}) < 2:
                continue
            for a in range(len(idx)):
                for c in range(a + 1, len(idx)):
                    i, j = idx[a], idx[c]
                    if items[i][1] != items[j][1] and bin(items[i][2] ^ items[j][2]).count("1") <= MAXD:
                        pairs.add((min(i, j), max(i, j)))
        near = defaultdict(int)
        for i, j in pairs:
            near["-".join(sorted((items[i][1], items[j][1])))] += 1
        n = {s: sum(1 for x in split_of.values() if s in x) for s in ("train", "val", "test")}
        test_touched = {i for pr in pairs for i in pr if items[i][1] == "test"}
        report[model] = {"images": n, "samePathInTwoSplits": len(same_path), "byteIdenticalAcrossSplits": len(md5_cross),
                         "nearDuplicatePairsAcrossSplits": dict(near), "testImagesWithNearDuplicateElsewhere": len(test_touched),
                         "testShareAffected": len(test_touched) / max(1, n["test"]),
                         "examples": [[items[i][0], items[j][0]] for i, j in list(pairs)[:5]],
                         "testAffected": sorted(items[i][0] for i in test_touched)}
        print(model, json.dumps({k: v for k, v in report[model].items() if k not in ("examples", "testAffected")}), flush=True)
    json.dump(report, open(ROOT / "data" / "leakage_audit.json", "w"), indent=2)


if __name__ == "__main__":
    main()
