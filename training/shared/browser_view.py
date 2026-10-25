"""Make training see each photo exactly as a browser shows it.

Browsers (a) convert images with an embedded colour profile (Display P3,
Adobe RGB, CMYK...) to sRGB before a canvas reads them, and (b) rotate
photos upright according to their EXIF orientation tag. TensorFlow does
neither. The app therefore saw different pixels from the ones the model was
trained and tested on for ~1.7% of images (wheat, RiceLeafBD, some PlantDoc)
and for phone photos with a rotation tag (many lemon photos).

This writes one corrected copy per affected image (data/browser_view/) and a
map from original path to copy. shared/preprocessing.load_image swaps the copy
in, so training, evaluation and every test script read browser-identical
pixels while splits.csv and the data manifests keep the original paths.

usage: python training/shared/browser_view.py   (re-run after rebuilding a dataset)
"""
import csv
import hashlib
import io
import json
import os
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageCms, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "browser_view"
MAP = OUT / "map.json"
SPLITS = ["work_crops", "work_router2", "work_lemon"]


def fix(path: str):
    """Return (path, copy) if the browser would show different pixels, else (path, None)."""
    try:
        im = Image.open(path)
        icc = im.info.get("icc_profile")
        orient = im.getexif().get(0x0112, 1)
        desc = None
        if icc:
            desc = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(icc))).strip()
        needs_colour = bool(icc) and "sRGB" not in (desc or "")
        if not needs_colour and orient in (None, 1):
            return path, None
        fmt = im.format
        if needs_colour:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            im = ImageCms.profileToProfile(im if im.mode in ("RGB", "CMYK") else im.convert("RGB"), src,
                                           ImageCms.createProfile("sRGB"), outputMode="RGB")
        else:
            im = im.convert("RGB")
        if orient not in (None, 1):
            im.info["exif"] = Image.open(path).info.get("exif", b"")
            src_im = Image.open(path)
            im = ImageOps.exif_transpose(src_im).convert("RGB") if not needs_colour else _rotate(im, orient)
        h = hashlib.sha1(path.encode()).hexdigest()[:16]
        if fmt == "JPEG":  # keep JPEG small; q97, no chroma subsampling: differences ~1 level
            dst = OUT / f"{h}.jpg"
            im.save(dst, quality=97, subsampling=0)
        else:
            dst = OUT / f"{h}.png"
            im.save(dst)
        return path, str(dst)
    except Exception as e:  # unreadable: leave as is (dataset build already verified files)
        return path, f"ERROR {e!r}"


def _rotate(im, orient):
    """EXIF orientation -> upright, for an image already converted to sRGB."""
    T = Image.Transpose
    ops = {2: [T.FLIP_LEFT_RIGHT], 3: [T.ROTATE_180], 4: [T.FLIP_TOP_BOTTOM], 5: [T.TRANSPOSE],
           6: [T.ROTATE_270], 7: [T.TRANSVERSE], 8: [T.ROTATE_90]}
    for op in ops.get(orient, []):
        im = im.transpose(op)
    return im


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    paths = set()
    for w in SPLITS:
        f = ROOT / "data" / w / "splits.csv"
        if f.exists():
            paths |= {r["path"] for r in csv.DictReader(open(f))}
    paths = sorted(p for p in paths if os.path.exists(p))
    mapping, errors = {}, []
    with ProcessPoolExecutor() as ex:
        for p, dst in ex.map(fix, paths, chunksize=64):
            if dst and dst.startswith("ERROR"):
                errors.append((p, dst))
            elif dst:
                mapping[p] = dst
    json.dump(mapping, open(MAP, "w"), indent=0)
    print(f"{len(paths)} images checked, {len(mapping)} browser-corrected copies, {len(errors)} errors", errors[:3])


if __name__ == "__main__":
    main()
