# Data sources, credits and licences

CropGuard's models were trained on public datasets created by other people.
None of the images were collected by this project. This file credits them in
full, states their licences, and says exactly what we did with them.

The raw images are **not** re-hosted here (about 4.5 GB in total). Download
them from the original sources below; the files in `data_manifests/` list
exactly which images were used in which split, so the work can be reproduced
and checked against the originals.

## 1. Lemon leaves

- **Title:** Large-Scale Lemon Leaf Disease and Pest Image Dataset from Bangladesh (version 2)
- **Publisher:** Mendeley Data. Authors as listed on the dataset page.
- **DOI / link:** [10.17632/8d9fv6kpt3.2](https://data.mendeley.com/datasets/8d9fv6kpt3/2)
- **Licence:** CC BY 4.0
- **Used for:** the lemon disease model (`lemon-v1`) and the "Lemon" class of the plant-identification model (`router-v1`).
- **What we changed:**
  - We removed 2,645 byte-identical duplicate images.
  - We dropped 43 images that appeared under two different labels.
  - We grouped near-duplicates so no group spans train and test.
  - We center-cropped images to squares and resized them to 224×224 for training.
  - Class names are the dataset's own.

## 2. PlantVillage (garden crops)

- **Citation:** Hughes, D. P., & Salathé, M. (2015). *An open access repository of images on plant health to enable the development of mobile disease diagnostics.* arXiv:1511.08060.
- **Related:** Mohanty, S. P., Hughes, D. P., & Salathé, M. (2016). *Using deep learning for image-based plant disease detection.* Frontiers in Plant Science, 7, 1419.
- **Link:** [github.com/spMohanty/PlantVillage-Dataset](https://github.com/spMohanty/PlantVillage-Dataset) (`raw/color`)
- **Licence:** CC BY-SA 3.0 (as stated on the repository's dataset card)
- **Used for:** the garden disease model (`garden-v1`) and the garden-crop classes of `router-v1`.
- **What we changed:** we removed 21 exact duplicates, used grouped stratified splits, and resized images to 224×224.
- **Share-alike:** because PlantVillage is share-alike, we release the models trained on it (`public/models/garden-v1`, `public/models/router-v1`) under **CC BY-SA 3.0** as well, with this attribution.

## 3. iBean (beans)

- **Creators:** Makerere AI Lab, with annotation by experts from Uganda's National Crops Resources Research Institute (NaCRRI)
- **Links:** [github.com/AI-Lab-Makerere/ibean](https://github.com/AI-Lab-Makerere/ibean) · [huggingface.co/datasets/AI-Lab-Makerere/beans](https://huggingface.co/datasets/AI-Lab-Makerere/beans)
- **Licence:** MIT
- **Used for:** the three bean classes of `garden-v1` and the "Bean" class of `router-v1`. The official train/validation/test split was kept.

## 4. PlantDoc (real-world photos of garden crops)

- **Citation:** Singh, D., Jain, N., Jain, P., Kayal, P., Kumawat, S., & Batra, N. (2020). *PlantDoc: A Dataset for Visual Plant Disease Detection.* CODS-COMAD 2020.
- **Link:** [github.com/pratikkayal/PlantDoc-Dataset](https://github.com/pratikkayal/PlantDoc-Dataset) · **Licence:** CC BY 4.0
- **Used for:** real-field photos mapped onto the matching PlantVillage classes (exact disease matches only), in `crops-v2` and `router-v2`. The official test split was kept.

## 5. iCassava 2019 (cassava)

- **Citation:** Mwebaze, E., Gebru, T., Frome, A., Nsumba, S., & Tusubira, J. (2019). *iCassava 2019 Fine-Grained Visual Categorization Challenge.* arXiv:1908.02900. Makerere University AI Lab and NaCRRI, Uganda.
- **Link:** TensorFlow Datasets `cassava` ([source archive](https://storage.googleapis.com/emcassavadata/cassavaleafdata.zip)); original home: the 2019 Kaggle "Cassava Disease Classification" challenge (FGVC6, CVPR 2019).
- **Licence: not stated.** Neither the TensorFlow Datasets card nor the public challenge page states a licence for the images. They are used here for free, non-commercial, educational purposes with full citation. If the creators' terms require otherwise, the cassava classes will be removed.
- **Used for:** 5 cassava classes, official train/validation/test split kept.

## 6. Rice

- **Sethy et al.:** Sethy, P. K., Barpanda, N. K., Rath, A. K., & Behera, S. K. (2020). *Deep feature based rice leaf disease identification using support vector machine.* Computers and Electronics in Agriculture, 175, 105527. Data: Mendeley Data, DOI [10.17632/fwcj7stb8r.2](https://data.mendeley.com/datasets/fwcj7stb8r/2). CC BY 4.0.
- **RiceLeafBD:** *A Real-Field Image Dataset for Rice Leaf Disease Detection and Classification in Bangladesh.* Mendeley Data, DOI [10.17632/kx9rx8p2mz.1](https://data.mendeley.com/datasets/kx9rx8p2mz/1). CC BY 4.0. Original (non-augmented) images only.

## 7. Wheat

- **Source:** John Innes Centre, *Wheat Disease Dataset (small)*, Zenodo, record [7307816](https://zenodo.org/records/7307816). CC BY 4.0. Contact for the full set: James Brown, John Innes Centre.
- **Used for:** yellow rust, brown rust, septoria, powdery mildew and healthy wheat (999 images).
- **Holeta wheat (added in v2.2):** Getachew, H. (2021). *Wheat Leaf Dataset.* Mendeley Data, DOI [10.17632/wgd66f8n6h.1](https://data.mendeley.com/datasets/wgd66f8n6h/1). CC BY 4.0. 407 field photos from the Holeta wheat farm, Ethiopia (Canon EOS 5D Mark III), sorted into healthy, stripe rust and septoria with plant pathologists. Used for yellow (stripe) rust, septoria and healthy wheat; 2 photos that duplicated existing images were dropped. Added without re-splitting the existing data (`training/crops/add_wheat_holeta.py`), so no previously trained-on photo entered the test set.
- **Considered and not used:** *Wheat nitrogen deficiency and leaf rust* (Arya & Singh 2020, CC BY 4.0): backgrounds were removed, so only two classes would have black backgrounds, a shortcut a model could learn instead of the disease. A 14,155-image "Wheat Plant Diseases" compilation (Zenodo 15056570): sourced from unnamed Kaggle sets with no stated labelling. *Winter Wheat Leaf Images*: non-commercial licence and about nitrogen, not disease.

## 8. Cotton

- **Cotton Leaf Disease Dataset with Severity Levels:** Mendeley Data, DOI [10.17632/74jsdxtmx2.3](https://data.mendeley.com/datasets/74jsdxtmx2/3). CC BY 4.0. Only the *Cotton-Original* archive was used (no augmented copies); healthy images capped at 300 so no single source dominates a class. Fusarium wilt was **excluded**: only 47 original photos, too few to test honestly.
- **SAR-CLD-2024:** *A Comprehensive Dataset for Cotton Leaf Disease Detection.* Mendeley Data, DOI [10.17632/b3jy2p6k8w.2](https://data.mendeley.com/datasets/b3jy2p6k8w/2); described in *Data in Brief* (2024). CC BY 4.0. Only the *Original Dataset* archive was used. "Leaf Variegation" was not used.

## 9. Sugarcane

- **Source:** Daphal, S. D., & Koli, S. M. (2022). *Sugarcane Leaf Disease Dataset.* Mendeley Data, DOI [10.17632/9424skmnrk.1](https://data.mendeley.com/datasets/9424skmnrk/1). CC BY 4.0.

## Methods and other work we relied on

- **MobileNetV2:** Sandler, M., Howard, A., Zhu, M., Zhmoginov, A., & Chen, L.-C. (2018). *MobileNetV2: Inverted Residuals and Linear Bottlenecks.* CVPR. ImageNet-pretrained weights via Keras Applications.
- **Outlier exposure:** Hendrycks, D., Mazeika, M., & Dietterich, T. (2019). *Deep Anomaly Detection with Outlier Exposure.* ICLR.
- **Logit adjustment:** Menon, A. K., et al. (2021). *Long-tail learning via logit adjustment.* ICLR.
- **Which crops to support:** National Gardening Association survey of the most-grown home vegetables.
- **Not used:** cucumber datasets (augmented copies were mixed with the originals) and cotton Fusarium wilt (too few photos). See the README.

## Data manifests

`data_manifests/*.csv.gz` (gzip-compressed CSV) list every image used, one row each: `file, label, split, source`.

| File | What it covers |
|---|---|
| `lemon_splits.csv.gz` | lemon model: 14,898 unique images |
| `garden_splits.csv.gz` | garden model: 55,579 images (PlantVillage + iBean) |
| `plant_identification_splits.csv.gz` | plant-identification model: 40,500 images |

Paths are relative to each dataset's own folder layout (`lemon/…`, `plantvillage/raw/color/…`, `ibean/…`).
