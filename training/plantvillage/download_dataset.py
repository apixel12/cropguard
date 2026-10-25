import subprocess
from config import CFG, ROOT
repo = ROOT / "data" / "plantvillage_repo"
if not repo.exists():
    subprocess.check_call(["git", "clone", "--depth", "1", "--filter=blob:none", "--sparse",
                           "https://github.com/spMohanty/PlantVillage-Dataset.git", str(repo)])
    subprocess.check_call(["git", "sparse-checkout", "set", "raw/color"], cwd=repo)
print("found", CFG.raw_dir)
