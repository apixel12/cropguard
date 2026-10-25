import sys
from config import CFG
from shared.pipeline import train
if "--no-class-weights" in sys.argv:
    CFG.class_weights = False
train(CFG)
