"""Extract the iBean parquet files (Hugging Face: AI-Lab-Makerere/beans) into
data/ibean/raw/<class>/<split>_<n>.jpg.

Hardened: class folder names come from a fixed allowlist, never from strings
inside the downloaded file, so a tampered file cannot write outside raw/.
"""
import io
import json
from pathlib import Path

import pyarrow.parquet as pq
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / "data" / "ibean"
ALLOWED = ("angular_leaf_spot", "bean_rust", "healthy")

for split in ("train", "validation", "test"):
    table = pq.read_table(ROOT / f"{split}.parquet")
    names = json.loads(table.schema.metadata[b"huggingface"])["info"]["features"]["labels"]["names"]
    if tuple(names) != ALLOWED:
        raise SystemExit(f"unexpected label set {names}; refusing to extract")
    data = table.to_pydict()
    for i, (img, lab) in enumerate(zip(data["image"], data["labels"])):
        raw = img["bytes"]
        Image.open(io.BytesIO(raw)).verify()  # must be a real image
        out = ROOT / "raw" / ALLOWED[int(lab)] / f"{split}_{i:04d}.jpg"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(raw)
print("extracted to", ROOT / "raw")
