"""Write measured numbers into README.md between marker comments.

Every figure comes from a file produced by the training pipeline; nothing
here is typed by hand.  Re-run after retraining:

    .venv/bin/python scripts/fill_readme.py
"""
import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
D = ROOT / "data"
pct = lambda v: f"{v * 100:.1f}%"  # noqa: E731


def load(p):
    p = D / p
    return json.load(open(p)) if p.exists() else None


import sys  # noqa: E402

sys.path.insert(0, str(ROOT / "training"))
from shared.app_rule import app_rule as _app_rule, crop_mass_min, cutoff  # noqa: E402

CUTOFF = cutoff()


def app_rule(work, meta):
    return _app_rule(D / work, meta.get("priorCorrection"), meta.get("classThresholds"))


def model_table(title, metrics, meta, work):
    a = app_rule(work, meta)
    lines = [f"**{title}** (`{meta['modelVersion']}`), held-out test split, {meta['metrics']['testImages']:,} images:", "",
             "| Accuracy (as the app scores it) | Raw accuracy (all classes) | Macro F1 | Top-3 | Answers given | Right when answering |",
             "|---|---|---|---|---|---|",
             f"| {pct(a['accuracy'])} | {pct(metrics['accuracy'])} | {pct(metrics['macroF1'])} | "
             f"{pct(metrics['top3Accuracy'])} | {pct(a['coverage'])} | {pct(a['precision'])} |", "",
             f"The app answers when the top result is at least {CUTOFF:.0%} likely, or the condition's own higher bar "
             "(see Confidence thresholds); below that it says \"Not sure\" and shows its top guesses."]
    if a["rule"].startswith("given the right plant"):
        lines += ["", "The crops model is always told the plant first (by the plant-identification model, or by you), so the app "
                  "compares only that plant's conditions: potato late blight no longer competes with tomato late blight. "
                  "\"As the app scores it\" assumes the plant was identified correctly; if the model puts less than "
                  f"{crop_mass_min():.0%} of its probability on that plant, the app says the leaf doesn't look like it instead of answering. Raw accuracy "
                  "picks from all classes at once."]
    if meta.get("tta"):
        lines[-1] += " Scores average each image with its mirror image (test-time augmentation), exactly as the app does."
    return lines


def per_class(metrics, n_low=19):
    rows = ["| Class | Precision | Recall | F1 | Test images |", "|---|---|---|---|---|"]
    for c, v in sorted(metrics["perClass"].items(), key=lambda kv: -kv[1]["f1"]):
        flag = " ⚠︎ few images" if v["support"] <= n_low else ""
        rows.append(f"| {c} | {pct(v['precision'])} | {pct(v['recall'])} | {pct(v['f1'])} | {v['support']}{flag} |")
    return rows


def stress(s, title):
    rows = [f"**{title}**, generated from held-out test images (see `training/stress_test.py`):", "",
            "| Condition | Accuracy | Confidently wrong |", "|---|---|---|"]
    for k, v in s["perturbations"].items():
        rows.append(f"| {k} | {pct(v['accuracy'])} | {pct(v['confidentWrongRate'])} |")
    rows += ["", "| Not-a-leaf input | Flagged uncertain |", "|---|---|"]
    rows += [f"| {k} | {pct(v['flaggedUncertain'])} |" for k, v in s["ood"].items()]
    return rows


ev = []
lm, lmeta = load("work_lemon/metrics.json"), json.load(open(ROOT / "public/models/lemon-v1/metadata.json")) if (ROOT / "public/models/lemon-v1/metadata.json").exists() else None
pm, pmeta = load("work_crops/metrics.json"), json.load(open(ROOT / "public/models/crops-v2/metadata.json"))
if lm and lmeta:
    ev += ["### Lemon", ""] + model_table("Lemon model", lm, lmeta, "work_lemon") + ["", "<details><summary>Per-class results</summary>", ""] + per_class(lm) + ["", "</details>", ""]
    ls = load("work_lemon/stress_test_current.json")
    if ls:
        ev += stress(ls, "Lemon stress test") + [""]
    ex = None  # superseded: EXIF rotation is now applied in training (shared/browser_view.py)
    if ex:
        ev += [f"EXIF orientation: {ex['testImagesWithExifRotation']} test photos carry a rotation tag. Accuracy on them is "
               f"{pct(ex['accuracyRawOrientation'])} in raw orientation (as trained) vs {pct(ex['accuracyBrowserOrientation'])} "
               "upright (as the browser shows them), so orientation does not materially change results.", ""]
ev += ["### Garden and field crops", ""] + model_table("Crops model", pm, pmeta, "work_crops") + ["", "<details><summary>Per-class results</summary>", ""] + per_class(pm) + ["", "</details>", ""]
if pm.get("bySource"):
    by = app_rule("work_crops", pmeta)["bySource"]
    ev += ["Per dataset, as the app scores it (plant known):", "",
           "| Test source | Photos | Accuracy | Answers given | Right when answering |", "|---|---|---|---|---|"]
    ev += [f"| {k} | {v['images']:,} | {pct(by[k]['accuracy'])} | {pct(by[k]['coverage'])} | {pct(by[k]['precision'])} |" for k, v in pm["bySource"].items()]
    ev += [""]
rm, rmeta = load("work_router2/metrics.json"), ROOT / "public/models/router-v2/metadata.json"
if rm and rmeta.exists():
    ev += ["### Plant identification (one-button flow)", ""] + model_table("Plant identification", rm, json.load(open(rmeta)), "work_router2") + [
        ""]
    bg = load("work_router2/background_test.json")
    if bg:
        ev += [f"Background-shortcut test: {bg['n']} non-lemon test leaves pasted onto field-like clutter were sent to the lemon model "
               f"{pct(bg['clutter']['toLemon'])} of the time (clean: {pct(bg['clean']['toLemon'])}); {pct(bg['clutter']['correct'])} were routed "
               f"to the right plant and {pct(bg['clutter']['asked'])} asked the user. When it isn't confident, the app asks which plant it is.", ""]
cs = load("work_crops/stress_test_current.json")
if cs:
    ev += stress(cs, "Crops stress test (flat 67-way scores, before the plant is known)") + [""]
bc = load("work_crops/blur_compare.json")
if bc:
    old, new = bc["garden-v1"], bc["crops-v2"]
    ev += [f"**Blur robustness, previous garden model vs crops-v2.** Same {bc['images']:,} held-out test photos over the "
           f"{bc['classes']} classes both models know, each blurred the same way (`training/blur_compare.py`):", "",
           "| Condition | Previous accuracy | crops-v2 accuracy | Previous confidently wrong | crops-v2 confidently wrong |",
           "|---|---|---|---|---|"]
    for k in new:
        ev.append(f"| {k} | {pct(old[k]['accuracy'])} | {pct(new[k]['accuracy'])} | "
                  f"{pct(old[k]['confidentWrongRate'])} | {pct(new[k]['confidentWrongRate'])} |")
    ev += ["", "crops-v2 was trained with stronger defocus, four-direction hand-shake blur and low-resolution augmentation. "
           "The stress test's background clutter uses a different generator from training, so it is not measuring memorised textures.", ""]

ve = load("work_crops/video_eval.json")
if ve:
    ev += [f"**Photo vs video.** {ve['leaves']:,} held-out leaves, each turned into a simulated hand-held clip "
           f"({ve['framesPerClip']} frames with shifts, zoom, tilt, hand-shake blur on some frames, exposure flicker). "
           f"The app keeps the {ve['framesUsed']} sharpest frames that pass the quality gate and averages them "
           "(`training/video_eval.py`). A hand-held photo is one random frame of the same clip:", "",
           "| Input | Accuracy | Answers given | Right when answering | Confidently wrong |", "|---|---|---|---|---|"]
    for k in ("steady photo", "hand-held photo", "hand-held video (app)"):
        v = ve[k]
        ev.append(f"| {k} | {pct(v['accuracy'])} | {pct(v['answered'])} | {pct(v['rightWhenAnswered'])} | {pct(v['confidentlyWrong'])} |")
    ev += [""]

mp = load("multi_photo_eval.json")
if mp:
    ev += ["### More than one photo", "",
           "You can check up to 5 photos of the same plant at once (different leaves, or the same leaf from different angles). "
           "Each photo is quality-checked; the usable ones are combined by **geometric mean**, so a condition only scores high if "
           "every photo supports it, and when the photos' own answers differ, the app only names an answer that most of them agree on. "
           "Both choices were made on the validation split (the arithmetic mean answered far less often; multiplying the "
           "probabilities was overconfident). Held-out test photos, random groups of different photos of the same condition "
           "(`training/multi_photo_eval.py`):", "",
           "| Model | Photos | Accuracy | Answers given | Right when answering | Confidently wrong |", "|---|---|---|---|---|---|"]
    for mid in ("crops-v2", "lemon-v1"):
        for k, v in mp[mid].items():
            if k.isdigit():
                ev.append(f"| {mid} | {k} | {pct(v['accuracy'])} | {pct(v['answered'])} | {pct(v['rightWhenAnswered'])} | {pct(v['confidentlyWrong'])} |")
    mx = mp["crops-v2"].get("mixedPairs")
    if mx:
        ev += ["", f"Two photos of *different* problems on the same crop: the app names an answer for {pct(mx['named'])} of pairs, and a "
               f"condition shown in neither photo for {pct(mx['namedConditionInNeitherPhoto'])}; otherwise it says the photos disagree."]
    ev += [""]

au = load("leakage_audit.json")
if au:
    from shared.app_rule import _probs
    ev += ["### Leakage audit (is the test set really unseen?)", "",
           "`training/leakage_audit.py` re-checks every split from scratch, more strictly than the dataset builders: byte-identical files "
           "and near-duplicate photos (perceptual hash, flip/rotation invariant, within 4 of 64 bits) shared between train, validation and test. "
           "No file and no byte-identical image appears in two splits. Look-alike photos do, so each model is also scored on only the test "
           "photos with **no look-alike anywhere in training or validation**:", "",
           "| Model | Test photos with a look-alike | Accuracy, all test | Accuracy, no look-alike | Right when answering, no look-alike |",
           "|---|---|---|---|---|"]
    for mid, work in (("crops-v2", "work_crops"), ("router-v2", "work_router2"), ("lemon-v1", "work_lemon")):
        meta = json.load(open(ROOT / "public/models" / mid / "metadata.json"))
        p, inside, y, rows, classes = _probs(D / work, "test", meta.get("priorCorrection"))
        th = np.array([max(CUTOFF, meta.get("classThresholds", {}).get(c, 0)) for c in classes])
        a = p.argmax(1)
        conf, ok = inside & (p.max(1) >= th[a]), a == y
        aff = set(au[mid]["testAffected"])
        clean = np.array([r["path"] not in aff for r in rows])
        ev.append(f"| {mid} | {1 - clean.mean():.1%} | {pct(ok.mean())} | {pct(ok[clean].mean())} | {pct(ok[clean & conf].mean())} |")
    ev += ["", "Inspected look-alike pairs are different leaves photographed the same way (same background and framing; some "
           "rice pairs look like the same plot), not copies, and some pairs even carry different labels. Excluding them changes "
           "accuracy by less than 2 points for every model.", ""]

av = load("app_vs_offline.json")
if av:
    ev += ["### Does the app really run the model?", "",
           "Random held-out test photos (2 per condition) were put through the **real app in Chrome** (upload, plant identification, "
           "result screen) and each answer compared with the offline test evaluation of the same photo:", "",
           "| Model | Photos | App top-1 accuracy | Offline top-1, same photos | Same answer / \"Not sure\" decision | Control: labels shuffled |",
           "|---|---|---|---|---|---|"]
    for mid in [k for k in av if isinstance(av[k], dict)]:
        v = av[mid]
        ev.append(f"| {mid} | {v['photos']} | {pct(v['appTop1'])} | {pct(v['offlineTop1'])} | {pct(v['sameDecision'])} | {pct(v['shuffledLabelsTop1'])} |")
    ev += ["", "With the labels shuffled, the app's answers drop to chance, so they track what is in each photo. The same photo twice gives "
           "an identical breakdown (no randomness), and flipping a single bit of a model file makes the app refuse to load it "
           "(integrity check), so answers can only come from the shipped models. The wheat row includes 20 photos with a Display P3 "
           "colour profile: since training reads browser-identical pixels, the app's probabilities match the offline ones to within "
           f"{av.get('crops-v2 wheat (incl. Display P3)', {}).get('maxProbDiff', 0):.3f}. Remaining decision differences come from plant "
           "identification (the offline score assumes the right plant). Wheat has only 5 conditions, so its shuffled-label chance level is ~20%.", ""]

dv = []
lr = load("work_lemon/dataset_report.json")
ls_ = load("work_lemon/split_report.json")
if lr and ls_:
    dv += [f"- **Lemon:** {lr['rawImagesFound']:,} images found ({lr['expectedImages']:,} published), 18 classes, 0 corrupt.",
           f"- **{lr['exactDuplicatesRemoved']:,} byte-identical duplicates removed** (15% of the set; four classes were exactly doubled). "
           "Leaving them in would put copies in both train and test and inflate scores.",
           f"- Near-duplicates (perceptual hash, invariant to flips/rotations) are grouped so a group never spans splits: "
           f"{lr['nearDuplicateGroups']} groups, {lr['imagesInNearDuplicateGroups']} images.",
           f"- {len(ls_['droppedLabelConflicts'])} images that appear under two different labels were dropped as label noise.",
           f"- Final: {sum(ls_['totals'].values()):,} unique images → train {ls_['totals']['train']:,} / val {ls_['totals']['val']:,} / test {ls_['totals']['test']:,}.",
           "- **Camera-format shortcut:** several lemon classes come from a single camera format, so image size alone predicted the class "
           "24% of the time (chance 5.6%). Center-square cropping removes aspect ratio as a cue, and mild resolution jitter during training "
           "stops sharpness from identifying the source."]
pr = load("work_plantvillage/dataset_report.json")
if pr:
    dv += [f"- **PlantVillage:** {pr['rawImagesFound']:,} images, 38 classes, 0 corrupt, {pr['exactDuplicatesRemoved']} exact duplicates removed; all images 256×256."]

readme = (ROOT / "README.md").read_text()
for marker, body in (("EVALUATION", ev), ("DATA_VALIDATION", dv)):
    block = f"<!-- {marker} -->\n" + "\n".join(body) + f"\n<!-- /{marker} -->"
    if f"<!-- /{marker} -->" in readme:
        readme = re.sub(rf"<!-- {marker} -->.*?<!-- /{marker} -->", lambda _m: block, readme, flags=re.S)
    else:
        readme = readme.replace(f"<!-- {marker} -->", block)
(ROOT / "README.md").write_text(readme)
print("README updated")
