"""Mendeley Data blocks scripted downloads for this dataset, so this script
only checks that the manually downloaded archive has been extracted.

1. Open https://data.mendeley.com/datasets/8d9fv6kpt3/2
2. Click "Download All" (zip)
3. Unzip into data/lemon_raw/  (any nesting is fine; class = image's parent folder)
"""
from config import CFG
import sys
if not CFG.raw_dir.exists() or not any(CFG.raw_dir.rglob("*.jp*g")):
    sys.exit(__doc__)
print("found", CFG.raw_dir)
