# CropGuard

**Offline plant-leaf disease screening that runs entirely on your phone.**
Take a photo or a short video of a leaf. CropGuard works out which of 21 plants it is, then a model on the device identifies the likely condition, says how confident it is, explains what the condition means, and suggests conservative next steps. No upload, no account, no signal needed after the first visit. All of this completely free.

Built for Impact Hacks 2026.

**Data credit:** the models are trained on public datasets made by others: the Bangladesh lemon-leaf dataset, PlantVillage (Hughes & Salathé), iBean (Makerere AI Lab / NaCRRI), PlantDoc, iCassava 2019, rice (Sethy et al.; RiceLeafBD), wheat (John Innes Centre; Holeta, Ethiopia), cotton (two Mendeley sets) and sugarcane (Daphal & Koli). Full citations, licences, what we changed, and per-image manifests are in [DATA_SOURCES.md](DATA_SOURCES.md).

> CropGuard is an AI **screening** tool, not a diagnosis. Results should be confirmed by an agricultural extension office or plant specialist.

---

## The problem

Identifying plant disease early means recognising symptoms from what a leaf looks like. The people who most need that (home gardeners, and smallholder farmers growing the world's staple crops) often don't have an expert nearby, and many photo-ID tools send your images to a server and need a good connection, which fields and orchards often lack.

## What CropGuard does

| | |
|---|---|
| **One button** | "Check a leaf": a plant-identification model picks the right disease model; if it isn't sure, it asks |
| **Lemon model** | 18 lemon-leaf conditions, trained on real orchard photos |
| **Crops model** | 67 conditions across 20 crops: garden favourites (tomato, pepper, bean, squash, potato, strawberry…) and the world's major field crops (corn, wheat, rice, soybean, cotton, sugarcane, cassava) |
| **Photo or video** | Record a few seconds of video, or upload a clip: the app picks the sharpest frames, checks each, and averages them, so one blurry frame can't decide the answer |
| **Several photos** | Check up to 5 photos of the same plant together: combining 3 photos takes crops test accuracy from 92.5% to 98.3% and confident mistakes from 3.2% to 0.2% |
| **Gardener / Farmer mode** | Gardener: plain-language result and simple next steps. Farmer: cause, how it spreads, conditions that favour it, yield impact, a scouting plan and an integrated-management checklist |
| **On-device** | TensorFlow.js in the browser; photos never leave the phone |
| **Offline** | Installable PWA; the app and all three models are cached on first visit |
| **Secured like production software** | Strict CSP with Trusted Types, cross-origin isolation, SHA-256 integrity checks on every model file, HSTS preload, security.txt; see [SECURITY.md](SECURITY.md) |
| **Honest uncertainty** | Below a 70% confidence cut-off (higher for conditions that are easy to confuse) the app says "Not sure" and shows its top guesses, instead of guessing |
| **Photo-quality gate** | Rejects dark, overexposed, leaf-less and unusably blurred photos (or video frames); mildly blurry photos are still checked, with a note, because the model reads them reliably (see the blur table) |
| **Local history** | Scans saved in IndexedDB on the device, each with its model version |

## Architecture

```
Camera / gallery photo   or   video (live or uploaded)
        │                            │
        │                 14 frames sampled → 5 sharpest that pass the gate
        ▼                            ▼
Photo-quality gate ──(fails)──► "The photo needs retaking" + how to fix
        │
        ▼
Plant identification (router-v2, 21 plants) ──(not confident)──► "Which plant is this?" (user picks)
        │                         (video: probabilities averaged over frames, every model)
        ├── Lemon ───────► lemon-v1 (18 classes)
        │                                 │
        └── Any other crop ──► crops-v2 (67 classes, crop must match)
                                          │
                                          ▼
                 Calibrated confidence threshold ──(below)──► "Uncertain result"
                                          │
                                          ▼
          Result + reviewed condition info + next steps (Gardener or Farmer detail) → saved locally
```

Separate disease classifiers, never one merged label space: the datasets have different classes, and **PlantVillage contains no lemon**. A lemon leaf is never routed to the PlantVillage "Orange" class. If a crops-model prediction belongs to a different crop than the plant chosen, the result is forced to "Uncertain". Every result shows the plant with a "Change plant" link that re-checks the same photo.

### Preprocessing contract (training ⇄ browser)

Defined once in `training/shared/preprocessing.py` and mirrored in `src/ml/preprocess.ts`:

1. Decode; JPEGs use the **accurate integer DCT**, as browsers do (TF's fast default shifted borderline predictions by up to 0.17 in our parity test).
2. RGB, alpha dropped.
3. Center-crop to a square (the camera shows exactly this square), then resize to each model's input size (224×224 for plant identification and lemon, 288×288 for the crops model; stored in `metadata.json`), bilinear, half-pixel centres. The crop removes aspect ratio as a shortcut: several lemon classes came from a single camera format.
4. Float32 in [0, 255]. Normalisation (`x / 127.5 − 1`) is a layer **inside** the model, so the browser can't apply the wrong one.

The browser does the bilinear resize on the CPU, which reads only 224×224 (or 288×288) source pixels, instead of uploading a 12-megapixel camera frame to WebGL (which exceeds texture limits on many phones). Tests check it against Python's `tf.image.resize`, and an end-to-end check on the real model matched Python's outputs to 5 decimal places.

## Datasets

**Lemon:** *Large-Scale Lemon Leaf Disease and Pest Image Dataset from Bangladesh*, Mendeley Data, DOI [10.17632/8d9fv6kpt3.2](https://data.mendeley.com/datasets/8d9fv6kpt3/2), CC BY 4.0. Smartphone photos from four lemon-growing regions, labelled and reviewed by agricultural specialists.

**PlantVillage:** [spMohanty/PlantVillage-Dataset](https://github.com/spMohanty/PlantVillage-Dataset) (`raw/color`), 54,305 images, 38 classes, 14 crops. Hughes & Salathé, *An open access repository of images on plant health*, arXiv:1511.08060.

**Field crops and real-world photos:** PlantDoc (real-world photos of garden crops), iCassava 2019, rice (Sethy et al. 2020; RiceLeafBD), wheat (John Innes Centre), cotton (Cotton Leaf Disease with Severity Levels; SAR-CLD-2024) and sugarcane (Daphal & Koli 2022). Citations, licences, links and exactly which files were used are in [DATA_SOURCES.md](DATA_SOURCES.md); `data_manifests/` lists every image.

### Data validation (what we found and did)

<!-- DATA_VALIDATION -->
- **Lemon:** 17,586 images found (17,609 published), 18 classes, 0 corrupt.
- **2,645 byte-identical duplicates removed** (15% of the set; four classes were exactly doubled). Leaving them in would put copies in both train and test and inflate scores.
- Near-duplicates (perceptual hash, invariant to flips/rotations) are grouped so a group never spans splits: 432 groups, 962 images.
- 43 images that appear under two different labels were dropped as label noise.
- Final: 14,898 unique images → train 10,430 / val 2,234 / test 2,234.
- **Camera-format shortcut:** several lemon classes come from a single camera format, so image size alone predicted the class 24% of the time (chance 5.6%). Center-square cropping removes aspect ratio as a cue, and mild resolution jitter during training stops sharpness from identifying the source.
- **PlantVillage:** 54,305 images, 38 classes, 0 corrupt, 21 exact duplicates removed; all images 256×256.
<!-- /DATA_VALIDATION -->

## Model and training

- MobileNetV2, ImageNet weights, RGB input at 224×224 (288×288 for the crops model), transfer learning then fine-tuning (stage 1: head only; stage 2: top layers unfrozen at a 1e-5 learning rate; BatchNorm kept frozen; early stopping on validation loss).
- **Class imbalance:** balanced per-sample class weights, judged by macro F1, not just accuracy.
- **Field-robustness augmentation** (`training/shared/robust.py`): leaves composited small onto cluttered backgrounds, defocus and motion blur, sensor noise, JPEG artefacts, 90° rotations, exposure and white-balance shifts. Each is applied to a random subset of each batch.
- **Outlier exposure** (Hendrycks et al., ICLR 2019): synthetic non-leaf images (noise, textures, gradients, flat colour) are mixed into training with a *uniform* target, teaching the model to be unconfident on things that aren't leaves. The label space is unchanged.
- Reproducible seeds; grouped, stratified 70/15/15 splits; the test split is never used for training, early stopping or threshold choice.
- **Browser-identical pixels** (`training/shared/browser_view.py`): browsers convert photos with a colour profile (Display P3, Adobe RGB, CMYK…) to sRGB and turn phone photos upright using their EXIF tag; TensorFlow does neither. 6,393 affected images (wheat, RiceLeafBD, some PlantDoc, many lemon phone photos) are converted the same way before training and evaluation, so the model learns and is tested on exactly what the app sees. After this fix the app's probabilities match the offline evaluation to within 0.015 even on Display-P3 wheat photos (previously up to 0.33 apart).
- **Hyperparameters chosen on validation** (`training/hp_search.py`): five settings were compared on fast proxy runs (30% of training data, full validation set, clean and blurred, plain and balanced accuracy). Half-strength robustness augmentation was the only change that improved every measure (+0.9 accuracy); label smoothing and lighter class weights raised plain accuracy only by losing balanced accuracy; a higher fine-tuning learning rate hurt blurred accuracy. Extra test-time views (4 or 8 rotations/flips) were no better than the mirror average already used. For lemon, tempered class weights and half-strength augmentation (which includes blur) won on validation: blurred-photo accuracy 67% → 81% with sharp photos unchanged. Every retrained model had to beat the one it replaced on validation before being exported (`training/compare_val.py`).
- **Weak-spot round (v2.3)**: (1) the plant-identification model kept only a random 2,500 training photos per plant, discarding 536 of 2,061 PlantDoc and 439 of 1,023 RiceLeafBD real-world photos; it now fills each plant's quota with field photos first and counts PlantDoc and RiceLeafBD 3x (validation and test sets unchanged). (2) 405 field photos of wheat from the Holeta farm, Ethiopia were added (`training/crops/add_wheat_holeta.py`; existing splits untouched, duplicates dropped). Before this, the models recognised wheat from this unfamiliar farm only 18% of the time (plant identification) and named its condition correctly 34% of the time. (3) Wheat photos count 2x in crops training; repeating PlantDoc and cassava as well made them slightly worse on validation, so only wheat is repeated. Test results, same test set before and after: plant identification 96.5% -> 97.9% (Holeta wheat 18% -> 97%, RiceLeafBD 78% -> 97%, PlantDoc 60% -> 63%); crops model on Holeta wheat 34% -> 90%, PlantDoc unchanged at 77%, cassava 81% -> 79% (no further cassava data met the bar).
- **Second search round** (each candidate on top of the round-1 winner, with a re-run of the current settings to measure run-to-run noise, ~0.3 points): unfreezing more or fewer layers, dropout 0.1/0.4, fewer synthetic non-leaf images, even lighter augmentation, a lower learning rate, and a combination of the best three all stayed within noise. **Input resolution** was the one remaining lever: training and running the crops model at 288×288 instead of 224×224 lets it see small lesions in more detail and improved clean, balanced and blurred validation accuracy by about 1.1 points (the model file is the same size; a check takes about 1.6× longer). For lemon, 288 px was worse (especially on blur), but 1 synthetic non-leaf image per batch instead of 3 improved all six validation scores (`training/lemon/hp_lemon.py`).

### Confidence thresholds

Softmax confidence is not a probability of being right. The app answers when the top result is at least 70% likely (`src/ml/confidence.ts`); below that it says "Uncertain" and shows its top guesses. The tables below report, on the untouched test split, how often each model answers under that rule and how often it is right when it does.

**Per-condition safety bars.** Some conditions are less reliable than others: on the test set, "healthy cassava" was right only half the time it was named, and calling a sick plant healthy is the most harmful mistake the app can make. So each condition gets its own minimum confidence, chosen on the **validation** split as the lowest bar (never below 70%) at which at least 90% of that condition's answers were right (`training/shared/app_rule.py`, stored as `classThresholds` in `metadata.json`). Seven crop conditions and seven lemon conditions get a higher bar; a few with too little validation data (e.g. healthy wheat, wheat powdery mildew) are never named on their own, and the app says "Not sure" instead. The result screen draws the bar that applied.

Each model's `metadata.json` also stores stricter cut-offs calibrated on the **validation** split (the loosest at which ≥99% of accepted predictions were correct). The 70% rule answers far more often at some cost in precision: for the lemon model, 77% of test photos answered at 93% precision, against 45% answered at 99% with the calibrated cut-off.

## Evaluation

<!-- EVALUATION -->
### Lemon

**Lemon model** (`lemon-v1`), held-out test split, 2,234 images:

| Accuracy (as the app scores it) | Raw accuracy (all classes) | Macro F1 | Top-3 | Answers given | Right when answering |
|---|---|---|---|---|---|
| 85.0% | 85.0% | 81.0% | 96.7% | 73.5% | 97.1% |

The app answers when the top result is at least 70% likely, or the condition's own higher bar (see Confidence thresholds); below that it says "Not sure" and shows its top guesses. Scores average each image with its mirror image (test-time augmentation), exactly as the app does.

<details><summary>Per-class results</summary>

| Class | Precision | Recall | F1 | Test images |
|---|---|---|---|---|
| Citrus_Scab | 100.0% | 100.0% | 100.0% | 48 |
| Algal_Leaf_Spot | 99.2% | 100.0% | 99.6% | 130 |
| Lemon_Sooty_Mold | 98.8% | 99.6% | 99.2% | 239 |
| Citrus_Pest | 97.6% | 97.6% | 97.6% | 83 |
| Yellow_Spot | 93.5% | 97.1% | 95.2% | 103 |
| Healthy | 90.7% | 95.1% | 92.8% | 245 |
| Black Spot | 96.7% | 83.8% | 89.8% | 105 |
| Citrus Hindu Mite | 93.3% | 86.4% | 89.7% | 81 |
| Citrus Canker | 90.5% | 85.2% | 87.8% | 223 |
| Curl Leaf | 83.9% | 79.1% | 81.4% | 230 |
| Swallowtail Larval Herbivory (Deficiency) | 67.0% | 87.4% | 75.9% | 151 |
| Greening | 81.3% | 65.6% | 72.6% | 259 |
| Citrus Leafminer | 78.8% | 66.7% | 72.2% | 117 |
| Dry Leaf | 59.1% | 92.9% | 72.2% | 28 |
| Anthracnose | 78.0% | 66.9% | 72.0% | 127 |
| Melanose | 46.7% | 75.0% | 57.5% | 28 |
| Bacterial Blight | 48.0% | 66.7% | 55.8% | 18 ⚠︎ few images |
| Spider Mites | 32.6% | 78.9% | 46.2% | 19 ⚠︎ few images |

</details>

**Lemon stress test**, generated from held-out test images (see `training/stress_test.py`):

| Condition | Accuracy | Confidently wrong |
|---|---|---|
| clean | 86.8% | 4.5% |
| dim light (x0.45) | 80.4% | 7.3% |
| overexposed (x1.6) | 84.9% | 4.8% |
| warm white balance | 86.6% | 5.3% |
| gaussian blur | 84.0% | 3.6% |
| motion blur | 81.5% | 4.8% |
| sensor noise | 77.0% | 7.0% |
| jpeg q=20 | 80.4% | 4.2% |
| low resolution (48px) | 79.8% | 5.0% |
| rotated 90° | 82.9% | 5.3% |
| corner occluded/shadow | 83.8% | 5.9% |
| leaf far away on clutter (55%) | 79.6% | 4.8% |

| Not-a-leaf input | Flagged uncertain |
|---|---|
| uniform colour | 100.0% |
| random noise | 100.0% |
| clutter texture only | 100.0% |
| gradients | 100.0% |

### Garden and field crops

**Crops model** (`crops-v2`), held-out test split, 12,187 images:

| Accuracy (as the app scores it) | Raw accuracy (all classes) | Macro F1 | Top-3 | Answers given | Right when answering |
|---|---|---|---|---|---|
| 93.9% | 92.1% | 89.9% | 98.9% | 90.8% | 97.7% |

The app answers when the top result is at least 70% likely, or the condition's own higher bar (see Confidence thresholds); below that it says "Not sure" and shows its top guesses.

The crops model is always told the plant first (by the plant-identification model, or by you), so the app compares only that plant's conditions: potato late blight no longer competes with tomato late blight. "As the app scores it" assumes the plant was identified correctly; if the model puts less than 20% of its probability on that plant, the app says the leaf doesn't look like it instead of answering. Raw accuracy picks from all classes at once. Scores average each image with its mirror image (test-time augmentation), exactly as the app does.

<details><summary>Per-class results</summary>

| Class | Precision | Recall | F1 | Test images |
|---|---|---|---|---|
| Strawberry___Leaf_scorch | 100.0% | 99.4% | 99.7% | 166 |
| Grape___Leaf_blight_(Isariopsis_Leaf_Spot) | 99.4% | 100.0% | 99.7% | 161 |
| Orange___Haunglongbing_(Citrus_greening) | 100.0% | 99.3% | 99.6% | 826 |
| Soybean___healthy | 98.5% | 99.6% | 99.0% | 774 |
| Grape___Esca_(Black_Measles) | 100.0% | 98.1% | 99.0% | 207 |
| Tomato___Tomato_Yellow_Leaf_Curl_Virus | 98.2% | 98.9% | 98.5% | 809 |
| Raspberry___healthy | 98.4% | 98.4% | 98.4% | 63 |
| Peach___Bacterial_spot | 98.3% | 98.6% | 98.4% | 345 |
| Corn_(maize)___Common_rust_ | 97.9% | 98.4% | 98.2% | 189 |
| Strawberry___healthy | 96.2% | 100.0% | 98.1% | 76 |
| Apple___Black_rot | 96.8% | 98.9% | 97.9% | 93 |
| Squash___Powdery_mildew | 100.0% | 95.7% | 97.8% | 281 |
| Blueberry___healthy | 97.9% | 97.4% | 97.7% | 235 |
| Bean___healthy | 97.6% | 97.6% | 97.6% | 42 |
| Cotton___Herbicide_damage | 97.6% | 97.6% | 97.6% | 42 |
| Cherry_(including_sour)___Powdery_mildew | 100.0% | 94.3% | 97.1% | 158 |
| Grape___healthy | 94.9% | 98.7% | 96.7% | 75 |
| Apple___healthy | 97.6% | 95.3% | 96.4% | 255 |
| Pepper,_bell___healthy | 94.5% | 97.8% | 96.2% | 230 |
| Rice___healthy | 94.9% | 97.4% | 96.1% | 38 |
| Tomato___healthy | 96.3% | 95.5% | 95.9% | 246 |
| Rice___Tungro | 94.9% | 96.8% | 95.8% | 250 |
| Potato___Early_blight | 98.0% | 93.6% | 95.8% | 157 |
| Grape___Black_rot | 97.2% | 94.1% | 95.6% | 185 |
| Bean___Bean_rust | 91.5% | 100.0% | 95.6% | 43 |
| Cherry_(including_sour)___healthy | 95.0% | 95.7% | 95.3% | 138 |
| Sugarcane___Yellow_leaf | 94.7% | 95.9% | 95.3% | 74 |
| Tomato___Spider_mites Two-spotted_spider_mite | 91.2% | 99.6% | 95.2% | 251 |
| Bean___Angular_leaf_spot | 100.0% | 90.7% | 95.1% | 43 |
| Pepper,_bell___Bacterial_spot | 95.5% | 93.1% | 94.3% | 159 |
| Tomato___Bacterial_spot | 95.0% | 93.0% | 94.0% | 328 |
| Potato___Late_blight | 93.5% | 93.5% | 93.5% | 155 |
| Potato___healthy | 95.5% | 91.3% | 93.3% | 23 |
| Tomato___Leaf_Mold | 93.3% | 93.3% | 93.3% | 149 |
| Tomato___Late_blight | 91.8% | 94.3% | 93.0% | 296 |
| Rice___Brown_spot | 92.7% | 93.1% | 92.9% | 233 |
| Apple___Apple_scab | 98.9% | 87.5% | 92.9% | 104 |
| Peach___healthy | 93.5% | 92.1% | 92.8% | 63 |
| Sugarcane___Red_rot | 90.4% | 94.9% | 92.6% | 79 |
| Rice___Bacterial_leaf_blight | 98.2% | 86.7% | 92.1% | 256 |
| Cotton___Leaf_reddening | 96.2% | 87.4% | 91.6% | 87 |
| Tomato___Septoria_leaf_spot | 89.4% | 92.0% | 90.7% | 276 |
| Cassava___Mosaic_disease | 92.3% | 88.0% | 90.1% | 886 |
| Cotton___healthy | 83.5% | 97.6% | 90.0% | 83 |
| Tomato___Target_Spot | 83.1% | 97.6% | 89.8% | 211 |
| Apple___Cedar_apple_rust | 95.6% | 84.3% | 89.6% | 51 |
| Corn_(maize)___healthy | 100.0% | 79.3% | 88.5% | 174 |
| Corn_(maize)___Northern_Leaf_Blight | 94.1% | 81.5% | 87.4% | 157 |
| Sugarcane___Rust | 82.7% | 92.5% | 87.3% | 67 |
| Sugarcane___Mosaic | 97.7% | 76.8% | 86.0% | 56 |
| Tomato___Tomato_mosaic_virus | 94.5% | 78.8% | 86.0% | 66 |
| Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot | 84.8% | 83.8% | 84.3% | 80 |
| Cotton___Leaf_curl_virus | 81.9% | 85.5% | 83.7% | 69 |
| Cotton___Bacterial_blight | 83.3% | 81.8% | 82.6% | 55 |
| Rice___Blast | 82.4% | 81.9% | 82.1% | 160 |
| Tomato___Early_blight | 88.7% | 74.2% | 80.8% | 159 |
| Cotton___Jassids | 72.1% | 91.2% | 80.5% | 34 |
| Wheat___Septoria | 73.4% | 86.6% | 79.5% | 67 |
| Cassava___Green_mottle | 83.9% | 74.8% | 79.1% | 258 |
| Wheat___Brown_rust | 78.9% | 78.9% | 78.9% | 19 ⚠︎ few images |
| Wheat___Yellow_rust | 75.3% | 82.1% | 78.6% | 67 |
| Cassava___Brown_streak_disease | 85.0% | 69.4% | 76.4% | 481 |
| Wheat___healthy | 71.4% | 75.8% | 73.5% | 33 |
| Sugarcane___healthy | 57.3% | 100.0% | 72.8% | 71 |
| Wheat___Powdery_mildew | 54.5% | 75.0% | 63.2% | 24 |
| Cassava___Bacterial_blight | 76.3% | 47.7% | 58.7% | 155 |
| Cassava___healthy | 33.2% | 99.0% | 49.8% | 105 |

</details>

Per dataset, as the app scores it (plant known):

| Test source | Photos | Accuracy | Answers given | Right when answering |
|---|---|---|---|---|
| cassava | 1,885 | 79.0% | 70.5% | 93.0% |
| cotton_severity | 74 | 87.8% | 94.6% | 88.6% |
| ibean | 128 | 96.9% | 96.1% | 98.4% |
| plantdoc | 226 | 77.4% | 56.6% | 88.3% |
| plantvillage | 8,145 | 98.3% | 96.4% | 99.2% |
| rice_sethy | 722 | 93.8% | 94.6% | 95.6% |
| riceleafbd | 215 | 92.1% | 88.4% | 93.7% |
| sarcld | 296 | 91.9% | 92.9% | 95.6% |
| sugarcane | 347 | 92.8% | 89.3% | 97.7% |
| wheat_holeta | 61 | 90.2% | 90.2% | 92.7% |
| wheat_jic | 149 | 77.9% | 73.8% | 88.2% |

### Plant identification (one-button flow)

**Plant identification** (`router-v2`), held-out test split, 8,546 images:

| Accuracy (as the app scores it) | Raw accuracy (all classes) | Macro F1 | Top-3 | Answers given | Right when answering |
|---|---|---|---|---|---|
| 97.9% | 97.9% | 97.6% | 99.8% | 97.8% | 98.9% |

The app answers when the top result is at least 70% likely, or the condition's own higher bar (see Confidence thresholds); below that it says "Not sure" and shows its top guesses. Scores average each image with its mirror image (test-time augmentation), exactly as the app does.

Background-shortcut test: 400 non-lemon test leaves pasted onto field-like clutter were sent to the lemon model 0.0% of the time (clean: 0.0%); 96.0% were routed to the right plant and 3.2% asked the user. When it isn't confident, the app asks which plant it is.

**Crops stress test (flat 67-way scores, before the plant is known)**, generated from held-out test images (see `training/stress_test.py`):

| Condition | Accuracy | Confidently wrong |
|---|---|---|
| clean | 90.0% | 4.0% |
| dim light (x0.45) | 86.5% | 4.9% |
| overexposed (x1.6) | 87.1% | 5.7% |
| warm white balance | 90.4% | 4.4% |
| gaussian blur | 87.9% | 4.5% |
| motion blur | 88.2% | 4.7% |
| sensor noise | 86.8% | 4.7% |
| jpeg q=20 | 87.6% | 5.1% |
| low resolution (48px) | 84.7% | 4.6% |
| rotated 90° | 90.1% | 3.9% |
| corner occluded/shadow | 87.8% | 4.7% |
| leaf far away on clutter (55%) | 86.0% | 3.6% |

| Not-a-leaf input | Flagged uncertain |
|---|---|
| uniform colour | 100.0% |
| random noise | 100.0% |
| clutter texture only | 99.0% |
| gradients | 100.0% |

**Blur robustness, previous garden model vs crops-v2.** Same 1,023 held-out test photos over the 41 classes both models know, each blurred the same way (`training/blur_compare.py`):

| Condition | Previous accuracy | crops-v2 accuracy | Previous confidently wrong | crops-v2 confidently wrong |
|---|---|---|---|---|
| sharp | 95.4% | 96.6% | 1.6% | 1.1% |
| slight defocus (σ1.5) | 95.6% | 96.5% | 1.8% | 0.9% |
| defocus (σ2.5) | 94.8% | 95.1% | 1.8% | 1.5% |
| heavy defocus (σ4) | 90.7% | 91.4% | 3.3% | 2.8% |
| hand shake (9px) | 93.4% | 95.6% | 2.0% | 2.1% |
| hand shake, diagonal (15px) | 81.3% | 93.1% | 4.9% | 2.1% |
| low resolution (48px) | 93.7% | 96.3% | 2.3% | 1.7% |
| blur + low light | 92.1% | 95.0% | 2.7% | 1.4% |

crops-v2 was trained with stronger defocus, four-direction hand-shake blur and low-resolution augmentation. The stress test's background clutter uses a different generator from training, so it is not measuring memorised textures.

**Photo vs video.** 1,005 held-out leaves, each turned into a simulated hand-held clip (14 frames with shifts, zoom, tilt, hand-shake blur on some frames, exposure flicker). The app keeps the 5 sharpest frames that pass the quality gate and averages them (`training/video_eval.py`). A hand-held photo is one random frame of the same clip:

| Input | Accuracy | Answers given | Right when answering | Confidently wrong |
|---|---|---|---|---|
| steady photo | 91.8% | 88.9% | 97.1% | 2.6% |
| hand-held photo | 91.9% | 88.2% | 96.7% | 2.9% |
| hand-held video (app) | 92.8% | 89.7% | 97.2% | 2.5% |

### More than one photo

You can check up to 5 photos of the same plant at once (different leaves, or the same leaf from different angles). Each photo is quality-checked; the usable ones are combined by **geometric mean**, so a condition only scores high if every photo supports it, and when the photos' own answers differ, the app only names an answer that most of them agree on. Both choices were made on the validation split (the arithmetic mean answered far less often; multiplying the probabilities was overconfident). Held-out test photos, random groups of different photos of the same condition (`training/multi_photo_eval.py`):

| Model | Photos | Accuracy | Answers given | Right when answering | Confidently wrong |
|---|---|---|---|---|---|
| crops-v2 | 1 | 93.1% | 89.6% | 97.1% | 2.6% |
| crops-v2 | 2 | 97.5% | 87.4% | 99.7% | 0.3% |
| crops-v2 | 3 | 98.7% | 94.3% | 99.9% | 0.1% |
| crops-v2 | 5 | 99.7% | 96.6% | 100.0% | 0.0% |
| lemon-v1 | 1 | 84.3% | 63.0% | 97.9% | 1.3% |
| lemon-v1 | 2 | 93.7% | 59.6% | 99.7% | 0.2% |
| lemon-v1 | 3 | 98.9% | 69.8% | 100.0% | 0.0% |
| lemon-v1 | 5 | 99.8% | 75.2% | 100.0% | 0.0% |

Two photos of *different* problems on the same crop: the app names an answer for 2.7% of pairs, and a condition shown in neither photo for 0.1%; otherwise it says the photos disagree.

### Leakage audit (is the test set really unseen?)

`training/leakage_audit.py` re-checks every split from scratch, more strictly than the dataset builders: byte-identical files and near-duplicate photos (perceptual hash, flip/rotation invariant, within 4 of 64 bits) shared between train, validation and test. No file and no byte-identical image appears in two splits. Look-alike photos do, so each model is also scored on only the test photos with **no look-alike anywhere in training or validation**:

| Model | Test photos with a look-alike | Accuracy, all test | Accuracy, no look-alike | Right when answering, no look-alike |
|---|---|---|---|---|
| crops-v2 | 4.7% | 93.9% | 93.6% | 97.6% |
| router-v2 | 5.2% | 97.9% | 97.9% | 98.9% |
| lemon-v1 | 33.7% | 85.0% | 83.4% | 96.5% |

Inspected look-alike pairs are different leaves photographed the same way (same background and framing; some rice pairs look like the same plot), not copies, and some pairs even carry different labels. Excluding them changes accuracy by less than 2 points for every model.

### Does the app really run the model?

Random held-out test photos (2 per condition) were put through the **real app in Chrome** (upload, plant identification, result screen) and each answer compared with the offline test evaluation of the same photo:

| Model | Photos | App top-1 accuracy | Offline top-1, same photos | Same answer / "Not sure" decision | Control: labels shuffled |
|---|---|---|---|---|---|
| crops-v2 | 129 | 92.2% | 92.2% | 98.4% | 1.6% |
| crops-v2 new wheat (Holeta) | 24 | 91.7% | 91.7% | 95.8% | 29.2% |
| lemon-v1 | 36 | 77.8% | 80.6% | 100.0% | 8.3% |

With the labels shuffled, the app's answers drop to chance, so they track what is in each photo. The same photo twice gives an identical breakdown (no randomness), and flipping a single bit of a model file makes the app refuse to load it (integrity check), so answers can only come from the shipped models. The wheat row includes 20 photos with a Display P3 colour profile: since training reads browser-identical pixels, the app's probabilities match the offline ones to within 0.000. Remaining decision differences come from plant identification (the offline score assumes the right plant). Wheat has only 5 conditions, so its shuffled-label chance level is ~20%.

<!-- /EVALUATION -->

### Dataset benchmark ≠ field performance

All numbers above come from held-out images **from the same datasets**. The lemon photos come from Bangladeshi orchards; a lemon tree in California differs in cultivar, light, camera and background. **These numbers are not a claim about accuracy on your tree.** Use `training/field_test.py` on your own photos to see how the real pipeline behaves.

## Offline and privacy

- `vite-plugin-pwa` precaches the app shell, fonts, icons, all three `model.json` files, **every weight shard by name** and the metadata files. `npm run build` fails if any model file is missing from the precache manifest (`scripts/verify-sw.mjs`).
- "Ready, and works offline" is shown only after all three models have loaded, passed a self-test (shape, finite outputs, softmax sums to 1) **and** every shard is confirmed present in Cache Storage.
- No backend, no image upload, no analytics, no account. `?netlog=1` turns on a request logger for offline testing.

## Security

Modelled on what production sites ship, following the OWASP Secure Headers Project, Mozilla's HTTP Observatory scoring and RFC 9116. Full threat model: [SECURITY.md](SECURITY.md).

- **Strict Content-Security-Policy** (`security-headers.json`, shipped via `vercel.json` and served by `vite preview` so it is tested): scripts only from this origin, no `eval`, no WebAssembly compilation, **no inline styles**, no plugins, no framing, `base-uri 'none'`, and `connect-src 'self'`, so a photo has nowhere to be sent even if code were injected.
- **Trusted Types enforced** (`require-trusted-types-for 'script'`): the browser refuses to turn any string into HTML or script. The only allowed script URL is the app's own service worker (`src/security/trustedTypes.ts`). This is the defence Google uses against DOM-based XSS.
- **Cross-origin isolation:** COOP `same-origin` + COEP `require-corp` + CORP `same-origin` + `Origin-Agent-Cluster`, so other sites can't embed, read or share a process with the app (Spectre-class side channels).
- **Model integrity:** the build records a SHA-256 hash of every model file inside the content-hashed JS bundle; each file is verified after download and before use. A tampered, truncated or stale cached model is refused (`src/security/integrity.ts`), like Subresource Integrity for model weights.
- **Transport:** HTTPS only, HSTS for two years with `includeSubDomains; preload`, `upgrade-insecure-requests`.
- **Permissions-Policy:** camera for this origin only; microphone, location, motion sensors, payment, USB, Bluetooth, serial, HID, MIDI, screen capture and ad-topics all off. Video is recorded from the camera without audio.
- Plus `nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `X-Permitted-Cross-Domain-Policies: none`, `X-DNS-Prefetch-Control: off`, `X-XSS-Protection: 0` (OWASP's current advice).
- **Camera is released whenever the app is hidden** (app switch, lock screen) and resumes on return.
- **Untrusted files:** non-images and photos over 60 MB are refused before decoding; images over 200 MP after (decompression bombs). Videos are limited to 200 MB and 60 seconds, and frames are capped at 1920 px.
- **Responsible disclosure:** `/.well-known/security.txt` (RFC 9116) and [SECURITY.md](SECURITY.md).
- **Supply chain:** lockfile; `npm audit` before each release (0 known vulnerabilities, development tools included); Dependabot checks npm packages weekly.
- **No backend, no accounts, no analytics, no third-party requests.** Development network logging (`?netlog=1`) does not exist in production builds.
- **Tested:** `tests/security.test.ts` locks the header policy, the Trusted Types rule and the integrity check (a tampered file must be rejected). The end-to-end test runs in real Chrome under the production headers, fails on any CSP violation, and checks that the page is cross-origin isolated and that the browser refuses an injected `innerHTML` string.

## Choosing crops and datasets

**Garden crops** were chosen from the National Gardening Association's list of the most-grown home vegetables (tomatoes 86% of food gardens, then cucumbers, peppers, beans, carrots, squash…).

**Field crops** were chosen from FAO production statistics: sugarcane, maize, wheat and rice are the world's four largest crops by tonnage, followed by potatoes, soybeans and cassava; cotton is the largest non-food crop. Each needed an open, citable dataset of real leaf photos with expert labels and original (non-augmented) images. Barley, sorghum, oil palm and rapeseed were left out: no dataset we found met that bar.
- **Beans:** iBean (expert-annotated by NaCRRI, field smartphone photos, MIT). Its official test split was kept. 1,295 images, 0 duplicates, all 500×500 (no camera-format shortcut).
- **Cucumber: not included.** The available datasets mix augmented copies with ~1,280 originals (half of them fruit, not leaves) and have no accompanying paper. Copies would leak between train and test, so they didn't meet the bar.
- **PlantDoc** (real-world photos for the same crops, CC BY 4.0) is now included: its photos are mapped onto the matching PlantVillage labels and repeated ×2 in training, so ~2,300 real-world photos aren't drowned out by ~38,000 lab photos. Its official test split is kept and reported separately below.
- **Augmented copies are never used.** Several field-crop datasets ship augmented copies alongside the originals; only originals are used, since copies of one photo in both train and test would inflate scores.

## Limitations

- Screening only. Some lemon dataset labels are symptoms rather than causes ("Curl Leaf", "Dry Leaf", "Yellow Spot"), and one combines two causes ("Swallowtail Larval Herbivory / Deficiency"); the app says so on those results.
- Small classes (e.g. Bacterial Blight, Spider Mites) have few unique test images after deduplication, so their per-class scores are noisy.
- PlantVillage images are lab photos on plain backgrounds; real-field accuracy for those crops is lower (see the PlantDoc row above for real-world photos).
- Some field-crop classes have few test images (e.g. several wheat classes), so their per-class scores are noisy. Cotton Fusarium wilt is not detected: the dataset had only 47 original photos.
- The iCassava images have no stated licence; they are used for free, educational purposes with citation (see DATA_SOURCES.md).
- Farmer mode explains management in general, integrated-pest-management terms and points to local extension services; it never names products or doses.
- Advice is deliberately conservative and static; no treatment or pesticide recommendations.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # unit + integration tests
npm run build        # production build + precache verification
npx vite preview &   # serve the build on :4173
npm run test:e2e     # offline acceptance test in real Chrome (airplane mode, photo, camera, video, farmer mode, history, security headers)
```

Training (Python 3.12, Apple Silicon GPU via tensorflow-metal):

```bash
python3 -m venv .venv && .venv/bin/pip install "tensorflow==2.16.2" tensorflow-metal pillow numpy scikit-learn imagehash certifi "setuptools<70"
python3 -m venv .venv-tfjs && .venv-tfjs/bin/pip install tensorflowjs "protobuf==6.31.1"
# lemon: download the zip from Mendeley and unzip into data/lemon_raw/
.venv/bin/python training/lemon/verify_dataset.py
.venv/bin/python training/lemon/prepare_dataset.py
.venv/bin/python training/lemon/train.py
.venv/bin/python training/lemon/evaluate.py
.venv/bin/python training/lemon/export.py
.venv/bin/python training/stress_test.py lemon        # generated field-condition stress test
.venv/bin/python training/field_test.py lemon         # your own photos in data/field_photos/
# crops + plant identification (downloads the field-crop datasets, then builds, trains, evaluates, exports)
.venv/bin/python training/farm/download_datasets.py
.venv/bin/python training/crops/build_dataset.py && .venv/bin/python training/crops/train.py
.venv/bin/python training/crops/evaluate.py && .venv/bin/python training/crops/export.py
.venv/bin/python training/router2/build_dataset.py && .venv/bin/python training/router2/train.py
.venv/bin/python training/router2/evaluate.py && .venv/bin/python training/router2/export.py
.venv/bin/python training/blur_compare.py             # blur robustness vs the previous model
.venv/bin/python scripts/fill_readme.py               # write measured numbers into this README
```

## Install on a phone

The deployed URL must be HTTPS (camera access needs a secure context).

- **iPhone:** open in Safari, wait for "AI ready offline", then Share → Add to Home Screen.
- **Android:** open in Chrome, wait for "AI ready offline", then ⋮ → Install app.

To test offline: open from the home-screen icon, turn on airplane mode, close and reopen the app, then scan.

## Licenses and credits

- Lemon dataset: CC BY 4.0. Cite the Mendeley dataset above.
- PlantVillage: CC BY-SA 3.0 (per the repository's dataset card); cite Hughes & Salathé (2015).
- MobileNetV2: Sandler et al., CVPR 2018 (ImageNet weights via Keras Applications).
- iBean (beans): Makerere AI Lab with NaCRRI, MIT licence (Hugging Face: AI-Lab-Makerere/beans).
- PlantDoc, rice (Sethy et al.; RiceLeafBD), wheat (John Innes Centre; Getachew 2021, Holeta), cotton (two Mendeley sets) and sugarcane (Daphal & Koli): CC BY 4.0. iCassava 2019: licence not stated. Full citations in [DATA_SOURCES.md](DATA_SOURCES.md).
- Typeface: Public Sans, SIL Open Font License, self-hosted via Fontsource. Icons: Phosphor, MIT.
- `tests/e2e/healthy-lemon.jpg` is one image from the lemon dataset (CC BY 4.0), used as the offline test photo.
