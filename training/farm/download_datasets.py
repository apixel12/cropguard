"""Download the farm-crop datasets into data/farm_raw/<name>/.

Every source is a public research dataset with an open licence; see
DATA_SOURCES.md. File URLs are resolved through the Mendeley / Zenodo APIs
at run time so they always point at the official files. Only ORIGINAL
images are used: where a dataset ships augmented copies (cotton), the
originals-only archive is chosen, because augmented copies of the same
photo would leak between train and test.
"""
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import certifi
import ssl

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "farm_raw"
CTX = ssl.create_default_context(cafile=certifi.where())
# Mendeley rejects urllib's default user agent with 403; identify like a normal client
_opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=CTX))
_opener.addheaders = [("User-Agent", "Mozilla/5.0 (CropGuard dataset fetcher)")]
urllib.request.install_opener(_opener)

MENDELEY = {  # name: (dataset id, version, filename to fetch)
    "rice_sethy": ("fwcj7stb8r", 2, "Rice Leaf Disease Images.7z"),
    "rice_riceleafbd": ("kx9rx8p2mz", 1, "Original Images.zip"),
    "cotton": ("74jsdxtmx2", 3, "Cotton-Original.zip"),
    "cotton_sarcld": ("b3jy2p6k8w", 2, "Original Dataset.zip"),  # SAR-CLD-2024, originals only
    "sugarcane": ("9424skmnrk", 1, "Sugarcane Leaf Disease Dataset.rar"),
    # Getachew, Holeta wheat farm, Ethiopia; field photos sorted with plant pathologists; CC BY 4.0
    "wheat_holeta": ("wgd66f8n6h", 1, "wheat_leaf.rar"),
}
CASSAVA = "https://storage.googleapis.com/emcassavadata/cassavaleafdata.zip"  # TFDS 'cassava' source
WHEAT_ZENODO = "7307816"  # John Innes Centre, wheat disease (small), CC BY 4.0


def get(url, dest: Path):
    if dest.exists() and dest.stat().st_size > 0:
        print("have", dest.name)
        return
    print("downloading", dest.name, flush=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    # curl, not urllib: Mendeley's file host rejects urllib's default user agent (403)
    subprocess.check_call(["curl", "-sfL", "--retry", "5", "-C", "-", "-o", str(tmp), url])
    tmp.rename(dest)


def extract(archive: Path, into: Path):
    marker = into / ".extracted"
    if marker.exists():
        return
    into.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(["bsdtar", "-xf", str(archive), "-C", str(into)])  # zip / 7z / rar
    marker.touch()


def main(only=None):
    """only: optional list of dataset names (run several processes in parallel)."""
    OUT.mkdir(parents=True, exist_ok=True)
    want = lambda n: not only or n in only  # noqa: E731
    for name, (ds, ver, fname) in MENDELEY.items():
        if not want(name):
            continue
        files = json.load(urllib.request.urlopen(
            f"https://data.mendeley.com/public-api/datasets/{ds}/files?folder_id=root&version={ver}"))
        f = next(x for x in files if x["filename"] == fname)
        arc = OUT / f"{name}{Path(fname).suffix}"
        get(f["content_details"]["download_url"], arc)
        extract(arc, OUT / name)

    if want("cassava"):
        arc = OUT / "cassava.zip"
        get(CASSAVA, arc)
        extract(arc, OUT / "cassava")
    if not want("wheat"):
        print("done")
        return

    rec = json.load(urllib.request.urlopen(f"https://zenodo.org/api/records/{WHEAT_ZENODO}"))
    wdir = OUT / "wheat"
    wdir.mkdir(exist_ok=True)
    for f in rec["files"]:
        get(f["links"]["self"], wdir / Path(f["key"]).name)
    print("done")


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or None))
