"""Dataset verification, grouped splitting, training, evaluation and export.

Each dataset folder (training/lemon, training/plantvillage) calls into this
module with its own Config so both models share one audited code path.
"""
import csv
import hashlib
import json
import os
import random
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import certifi
import setuptools  # noqa: F401  (distutils shim needed by TF 2.16)
import numpy as np

os.environ.setdefault("SSL_CERT_FILE", certifi.where())  # python.org builds lack CA certs

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "training"))

from shared.seed import SEED, set_seed  # noqa: E402

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


@dataclass
class Config:
    name: str            # e.g. "lemon-v1"
    raw_dir: Path        # folder with one sub-folder per class
    work_dir: Path       # outputs: reports, splits, checkpoints
    dataset_label: str
    license: str
    expected_classes: int
    expected_images: int | None = None
    class_order: list[str] | None = None  # optional canonical order
    head_epochs: int = 8
    finetune_epochs: int = 15
    unfreeze_from: int = 100
    finetune_lr: float = 1e-5  # peak LR for stage 2 (cosine-decayed)
    finetune_patience: int = 4
    init_from: Path | None = None        # warm start from a trained checkpoint
    init_classes: list[str] | None = None  # that checkpoint's class order (rows copied by name)
    batch: int = 32
    class_weights: bool = True
    # balanced weights ** power: 1.0 = fully balanced; 0.5 tempers a 46x spread to ~7x
    class_weight_power: float = 1.0
    dihedral_groups: bool = False  # group flipped/rotated copies as near-duplicates
    robust: bool = True          # field-robustness augmentation (shared/robust.py)
    robust_level: str = "full"   # "full" (lab-style data) or "light" (field photos)
    outlier_per_batch: int = 3   # synthetic non-leaf images per batch, uniform target
    label_smoothing: float = 0.0
    source_repeat: dict | None = None  # e.g. {"plantdoc": 2}: extra copies of hard field sources in train
    dropout: float = 0.25
    train_fraction: float = 1.0  # <1: per-class subsample of train (fast hyperparameter proxies)
    splits_dir: Path | None = None  # where splits.csv lives (default: work_dir)
    cache_dir: Path | None = None   # tf.data cache (default: work_dir/cache)


# ---------------------------------------------------------------- verify
def _find_class_dirs(raw: Path) -> dict[str, list[Path]]:
    """Locate the deepest directory level that holds image files per class."""
    out: dict[str, list[Path]] = defaultdict(list)
    for p in raw.rglob("*"):
        if p.is_file() and p.suffix.lower() in IMG_EXT and not p.name.startswith("."):
            out[p.parent.name].append(p)
    return out


def verify(cfg: Config) -> None:
    from PIL import Image
    import imagehash

    cfg.work_dir.mkdir(parents=True, exist_ok=True)
    by_class = _find_class_dirs(cfg.raw_dir)
    rows, corrupt, tiny = [], [], []
    md5_seen: dict[str, str] = {}
    exact_dups = []
    for cls, paths in sorted(by_class.items()):
        for p in sorted(paths):
            try:
                with Image.open(p) as im:
                    im.verify()
                with Image.open(p) as im:
                    rgb = im.convert("RGB")
                    w, h = rgb.size
                    thumb = rgb.resize((256, 256))
                    if cfg.dihedral_groups:  # canonical hash over the 8 flips/rotations
                        T = Image.Transpose
                        views = [thumb, thumb.transpose(T.FLIP_LEFT_RIGHT)]
                        views += [v.transpose(t) for v in views for t in (T.ROTATE_90, T.ROTATE_180, T.ROTATE_270)]
                        ph = min(str(imagehash.phash(v)) for v in views)
                    else:
                        ph = str(imagehash.phash(thumb))
            except Exception as e:  # corrupted / unreadable
                corrupt.append({"path": str(p), "error": repr(e)})
                continue
            if min(w, h) < 64:
                tiny.append(str(p))
                continue
            md5 = hashlib.md5(p.read_bytes()).hexdigest()
            if md5 in md5_seen:
                exact_dups.append({"path": str(p), "duplicateOf": md5_seen[md5]})
                continue
            md5_seen[md5] = str(p)
            rows.append({"path": str(p), "label": cls, "phash": ph, "w": w, "h": h})
        print(f"  verified {cls}: {len(paths)}", flush=True)

    # near-duplicate groups: identical perceptual hash => same group
    ph_groups = defaultdict(list)
    for r in rows:
        ph_groups[r["phash"]].append(r)
    cross_label = []
    for gi, (ph, members) in enumerate(ph_groups.items()):
        for r in members:
            r["group"] = f"g{gi}"
        if len({m["label"] for m in members}) > 1:
            cross_label.append([m["path"] for m in members])

    with open(cfg.work_dir / "manifest.csv", "w", newline="") as fh:
        wr = csv.DictWriter(fh, fieldnames=["path", "label", "group", "phash", "w", "h"])
        wr.writeheader()
        wr.writerows(rows)

    counts = Counter(r["label"] for r in rows)
    raw_total = sum(len(v) for v in by_class.values())
    report = {
        "dataset": cfg.dataset_label,
        "rawImagesFound": raw_total,
        "expectedImages": cfg.expected_images,
        "classesFound": len(by_class),
        "expectedClasses": cfg.expected_classes,
        "rawPerClass": {k: len(v) for k, v in sorted(by_class.items())},
        "usablePerClass": dict(sorted(counts.items())),
        "usableTotal": len(rows),
        "corrupt": corrupt,
        "tooSmall": tiny,
        "exactDuplicatesRemoved": len(exact_dups),
        "exactDuplicates": exact_dups[:200],
        "nearDuplicateGroups": sum(1 for m in ph_groups.values() if len(m) > 1),
        "imagesInNearDuplicateGroups": sum(len(m) for m in ph_groups.values() if len(m) > 1),
        "nearDuplicateGroupsSpanningLabels": cross_label[:100],
    }
    json.dump(report, open(cfg.work_dir / "dataset_report.json", "w"), indent=2)
    print(json.dumps({k: v for k, v in report.items() if not isinstance(v, list)}, indent=2))
    if len(by_class) != cfg.expected_classes:
        sys.exit(f"STOP: expected {cfg.expected_classes} classes, found {len(by_class)}")


# ---------------------------------------------------------------- split
def prepare(cfg: Config) -> None:
    rows = list(csv.DictReader(open(cfg.work_dir / "manifest.csv")))
    classes = cfg.class_order or sorted({r["label"] for r in rows})
    assert len(classes) == cfg.expected_classes, classes
    rng = random.Random(SEED)
    groups = defaultdict(list)
    for r in rows:
        groups[r["group"]].append(r)
    # the same picture under two labels is label noise: exclude it, documented
    conflicting = {g for g, m in groups.items() if len({x["label"] for x in m}) > 1}
    dropped = [r["path"] for g in conflicting for r in groups[g]]
    rows = [r for r in rows if r["group"] not in conflicting]
    for g in conflicting:
        del groups[g]
    # group's stratum = majority label; split groups per stratum 70/15/15
    by_stratum = defaultdict(list)
    for g, members in groups.items():
        lab = Counter(m["label"] for m in members).most_common(1)[0][0]
        by_stratum[lab].append(g)
    split_of = {}
    for lab, gs in by_stratum.items():
        rng.shuffle(gs)
        n = len(gs)
        n_te, n_va = round(n * 0.15), round(n * 0.15)
        for g in gs[:n_te]:
            split_of[g] = "test"
        for g in gs[n_te:n_te + n_va]:
            split_of[g] = "val"
        for g in gs[n_te + n_va:]:
            split_of[g] = "train"
    with open(cfg.work_dir / "splits.csv", "w", newline="") as fh:
        wr = csv.writer(fh)
        wr.writerow(["path", "label", "label_idx", "split", "group"])
        for r in rows:
            wr.writerow([r["path"], r["label"], classes.index(r["label"]), split_of[r["group"]], r["group"]])
    summary = defaultdict(Counter)
    for r in rows:
        summary[split_of[r["group"]]][r["label"]] += 1
    out = {"classes": classes, "splits": {s: dict(c) for s, c in summary.items()},
           "totals": {s: sum(c.values()) for s, c in summary.items()},
           "method": "stratified by class; perceptual-hash near-duplicate groups kept within one split",
           "droppedLabelConflicts": dropped}
    json.dump(out, open(cfg.work_dir / "split_report.json", "w"), indent=2)
    print(json.dumps(out["totals"]))


# ---------------------------------------------------------------- data
def _datasets(cfg: Config):
    import tensorflow as tf
    from shared.preprocessing import augmenter, load_image

    sd = cfg.splits_dir or cfg.work_dir
    rows = list(csv.DictReader(open(sd / "splits.csv")))
    missing = [r["path"] for r in rows if not os.path.exists(r["path"])]
    if missing:  # fail fast, not halfway through an epoch
        raise SystemExit(f"{len(missing)} images missing (e.g. {missing[0]}). Run scripts/extract_data.sh first.")
    classes = json.load(open(sd / "split_report.json"))["classes"]
    if cfg.train_fraction < 1:
        import random
        rng = random.Random(SEED)
        by = defaultdict(list)
        for r in rows:
            if r["split"] == "train":
                by[r["label"]].append(r)
        keep = set()
        for lab, rs in sorted(by.items()):
            rng.shuffle(rs)
            keep |= {id(r) for r in rs[:max(20, round(len(rs) * cfg.train_fraction))]}
        rows = [r for r in rows if r["split"] != "train" or id(r) in keep]
    from shared.preprocessing import IMG_SIZE
    cache = cfg.cache_dir or (cfg.work_dir / "cache")
    if IMG_SIZE != 224 and not cache.name.endswith(f"_{IMG_SIZE}"):
        cache = cache.parent / f"{cache.name}_{IMG_SIZE}"  # never reuse a cache made at another size
    cache.mkdir(parents=True, exist_ok=True)
    aug = augmenter()

    def make(split, training):
        sel = [r for r in rows if r["split"] == split]
        if training and cfg.source_repeat:
            sel = [r for r in sel for _ in range(cfg.source_repeat.get(r.get("source", ""), 1))]
        paths = [r["path"] for r in sel]
        labels = np.array([int(r["label_idx"]) for r in sel])
        ds = tf.data.Dataset.from_tensor_slices((paths, labels))
        ds = ds.map(lambda p, y: (tf.cast(load_image(p), tf.uint8), y),
                    num_parallel_calls=tf.data.AUTOTUNE)
        ds = ds.cache(str(cache / split))
        if training:
            ds = ds.shuffle(4096, seed=SEED, reshuffle_each_iteration=True)
        ds = ds.batch(cfg.batch)
        ds = ds.map(lambda x, y: (tf.cast(x, tf.float32), y))
        if training:
            ds = ds.map(lambda x, y: (tf.clip_by_value(aug(x, training=True), 0, 255), y),
                        num_parallel_calls=tf.data.AUTOTUNE)
        return ds.prefetch(tf.data.AUTOTUNE), labels

    return classes, make


# ---------------------------------------------------------------- model
def build_model(n_classes: int, dropout: float = 0.25):
    import tensorflow as tf
    L = tf.keras.layers
    from shared.preprocessing import IMG_SIZE as N
    inp = L.Input((N, N, 3), name="image")  # float32 RGB [0,255]
    x = L.Rescaling(1 / 127.5, offset=-1.0, name="normalize")(inp)
    base = tf.keras.applications.MobileNetV2(include_top=False, weights="imagenet",
                                             input_shape=(N, N, 3), pooling="avg")
    base.trainable = False
    x = base(x, training=False)  # BatchNorm stays in inference mode
    x = L.Dropout(dropout)(x)
    out = L.Dense(n_classes, activation="softmax", name="probs")(x)
    return tf.keras.Model(inp, out, name="cropguard"), base


def train(cfg: Config) -> None:
    import tensorflow as tf
    from sklearn.utils.class_weight import compute_class_weight
    from shared.robust import outlier_batch, robust_augment

    set_seed()
    classes, make = _datasets(cfg)
    n = len(classes)
    train_ds, y_train = make("train", True)
    val_ds, _ = make("val", False)
    cw = None
    w_vec = tf.ones([n])
    if cfg.class_weights:
        w = compute_class_weight("balanced", classes=np.arange(n), y=y_train)
        w = w ** cfg.class_weight_power
        cw = {i: float(v) for i, v in enumerate(w)}
        w_vec = tf.constant(w, tf.float32)

    def to_train(x, y):
        if cfg.robust:
            x = robust_augment(x, cfg.robust_level)
        yo = tf.one_hot(y, n)
        sw = tf.gather(w_vec, y)
        if cfg.outlier_per_batch:
            k = cfg.outlier_per_batch
            x = tf.concat([x, outlier_batch(k)], 0)
            yo = tf.concat([yo, tf.fill([k, n], 1.0 / n)], 0)
            sw = tf.concat([sw, tf.ones([k])], 0)
        return x, yo, sw

    train_ds = train_ds.map(to_train, num_parallel_calls=tf.data.AUTOTUNE).prefetch(tf.data.AUTOTUNE)
    val_ds = val_ds.map(lambda x, y: (x, tf.one_hot(y, n)))
    model, base = build_model(len(classes), cfg.dropout)
    if cfg.init_from:
        # Warm start: copy backbone weights and, for classes the old model
        # already knew, their output-layer rows (matched by name).
        old = tf.keras.models.load_model(str(cfg.init_from))
        base.set_weights(old.get_layer(base.name).get_weights())
        ow, ob = old.get_layer("probs").get_weights()
        nw, nb = model.get_layer("probs").get_weights()
        for j, c in enumerate(classes):
            if c in (cfg.init_classes or []):
                i = cfg.init_classes.index(c)
                nw[:, j], nb[j] = ow[:, i], ob[i]
        model.get_layer("probs").set_weights([nw, nb])
        print(f"warm start from {cfg.init_from}: {sum(c in (cfg.init_classes or []) for c in classes)}/{len(classes)} class rows copied", flush=True)
    ck = cfg.work_dir / "checkpoints"
    ck.mkdir(exist_ok=True)
    best = str(ck / "best.keras")
    cbs = lambda pat: [
        tf.keras.callbacks.ModelCheckpoint(best, monitor="val_loss", save_best_only=True),
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=pat, restore_best_weights=True),
        tf.keras.callbacks.CSVLogger(str(cfg.work_dir / "history.csv"), append=True),
    ]
    metrics = [tf.keras.metrics.CategoricalAccuracy(name="accuracy"),
               tf.keras.metrics.TopKCategoricalAccuracy(3, name="top3")]
    (cfg.work_dir / "history.csv").unlink(missing_ok=True)

    print("Stage 1: head only", flush=True)
    loss = tf.keras.losses.CategoricalCrossentropy(label_smoothing=cfg.label_smoothing)
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3), loss=loss, metrics=metrics)
    h1 = model.fit(train_ds, validation_data=val_ds, epochs=cfg.head_epochs,
                   callbacks=cbs(3), verbose=2)

    print(f"Stage 2: fine-tune layers >= {cfg.unfreeze_from}", flush=True)
    base.trainable = True
    for layer in base.layers[: cfg.unfreeze_from]:
        layer.trainable = False
    for layer in base.layers:  # keep BN statistics frozen
        if isinstance(layer, tf.keras.layers.BatchNormalization):
            layer.trainable = False
    steps = int(tf.data.experimental.cardinality(train_ds).numpy())
    steps = steps if steps > 0 else 300
    lr = tf.keras.optimizers.schedules.CosineDecay(cfg.finetune_lr, decay_steps=steps * cfg.finetune_epochs, alpha=0.05)
    model.compile(optimizer=tf.keras.optimizers.Adam(lr), loss=loss, metrics=metrics)
    h2 = model.fit(train_ds, validation_data=val_ds, epochs=cfg.finetune_epochs,
                   callbacks=cbs(cfg.finetune_patience), verbose=2)
    model.save(str(ck / "final.keras"))
    json.dump({"stage1": h1.history, "stage2": h2.history, "classWeights": cw,
               "robust": cfg.robust, "robustLevel": cfg.robust_level, "outlierPerBatch": cfg.outlier_per_batch},
              open(cfg.work_dir / "history.json", "w"), indent=2, default=float)


# ---------------------------------------------------------------- evaluate
def evaluate(cfg: Config, focus: list[str] | None = None) -> None:
    import tensorflow as tf
    from shared.metrics import calibrate_thresholds_stepped, full_report

    classes, make = _datasets(cfg)
    model = tf.keras.models.load_model(str(cfg.work_dir / "checkpoints" / "best.keras"))
    out = {}
    for split in ("val", "test"):
        ds, y = make(split, False)
        # test-time augmentation: average the prediction with its mirror image.
        # The browser does exactly the same (metadata "tta": "hflip").
        probs = (model.predict(ds, verbose=0)
                 + model.predict(ds.map(lambda x, _y: (tf.reverse(x, [2]), _y)), verbose=0)) / 2
        np.save(cfg.work_dir / f"probs_{split}.npy", probs)
        out[split] = (y, probs)
    yv, pv = out["val"]
    yt, pt = out["test"]
    # Post-hoc logit adjustment (Menon et al., ICLR 2021): class-weighted
    # training over-predicts rare classes; dividing probabilities by
    # weight**alpha undoes that. alpha is chosen on VALIDATION to maximise the
    # mean of macro F1 and balanced accuracy: macro F1 alone picked 1.2, which
    # cut Bacterial Blight recall from 61% to 22%. Shipped in metadata so the
    # browser applies the identical correction.
    from sklearn.metrics import balanced_accuracy_score, f1_score
    hist = json.load(open(cfg.work_dir / "history.json"))
    cw = hist.get("classWeights")
    prior = None
    if cw:
        w = np.array([cw[str(i)] if str(i) in cw else cw[i] for i in range(len(classes))], np.float64)

        def adjust(p, a):
            q = p * w ** (-a)
            return q / q.sum(1, keepdims=True)

        def objective(a):
            pred = adjust(pv, a).argmax(1)
            return 0.5 * f1_score(yv, pred, average="macro") + 0.5 * balanced_accuracy_score(yv, pred)

        alpha = max(np.round(np.arange(0, 1.61, 0.1), 2), key=objective)
        if alpha > 0:
            pv, pt = adjust(pv, alpha), adjust(pt, alpha)
            prior = {"alpha": float(alpha), "classWeights": w.tolist(),
                     "method": "p * w**-alpha, renormalised (logit adjustment)"}
    report = full_report(yt, pt, classes)
    thr = calibrate_thresholds_stepped(yv, pv)
    if thr is None:
        sys.exit("STOP: no threshold reaches even 90% precision on validation; do not ship this model")
    # how thresholds behave on the untouched test set (reported, not tuned)
    srt = np.sort(pt, 1)
    acc = (srt[:, -1] >= thr["confidence"]) & (srt[:, -1] - srt[:, -2] >= thr["margin"])
    thr["testCoverage"] = float(acc.mean())
    thr["testPrecisionAccepted"] = float((pt.argmax(1) == yt)[acc].mean()) if acc.any() else None

    cm = np.array(report["confusionMatrix"])
    confusions = []
    for i in range(len(classes)):
        for j in range(len(classes)):
            if i != j and cm[i, j] > 0:
                confusions.append({"true": classes[i], "predicted": classes[j], "count": int(cm[i, j])})
    confusions.sort(key=lambda d: -d["count"])
    report["topConfusions"] = confusions[:25]
    if focus:
        report["focus"] = {
            c: {"asTruthMisclassifiedAs": [d for d in confusions if d["true"] == c][:5],
                "falsePositivesFrom": [d for d in confusions if d["predicted"] == c][:5]}
            for c in focus if c in classes
        }
    report["thresholds"] = thr
    rows_all = list(csv.DictReader(open(cfg.work_dir / "splits.csv")))
    test_rows = [r for r in rows_all if r["split"] == "test"]
    if test_rows and "source" in test_rows[0]:
        src = np.array([r["source"] for r in test_rows])
        srt_t = np.sort(pt, 1)
        conf_t = (srt_t[:, -1] >= thr["confidence"]) & (srt_t[:, -1] - srt_t[:, -2] >= thr["margin"])
        corr_t = pt.argmax(1) == yt
        report["bySource"] = {
            s_: {"images": int((src == s_).sum()), "accuracy": float(corr_t[src == s_].mean()),
                 "top3Accuracy": float(np.mean([yt[i] in np.argsort(-pt[i])[:3] for i in np.where(src == s_)[0]])),
                 "confidentCoverage": float(conf_t[src == s_].mean()),
                 "precisionWhenConfident": float(corr_t[(src == s_) & conf_t].mean()) if (conf_t & (src == s_)).any() else None}
            for s_ in sorted(set(src))}
    report["priorCorrection"] = prior
    report["split"] = "test (held out; never used for training, early stopping or threshold tuning)"
    json.dump(report, open(cfg.work_dir / "metrics.json", "w"), indent=2)
    print(json.dumps({k: report[k] for k in ("accuracy", "top3Accuracy", "macroF1", "weightedF1")}, indent=2))
    print("thresholds", thr)


# ---------------------------------------------------------------- export
def export(cfg: Config, out_dir: Path) -> None:
    import tensorflow as tf
    from shared.preprocessing import IMG_SIZE, NORMALIZATION

    model = tf.keras.models.load_model(str(cfg.work_dir / "checkpoints" / "best.keras"))
    sm = cfg.work_dir / "savedmodel"
    model.export(str(sm))
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.glob("*.bin"):
        f.unlink()
    conv = ROOT / ".venv-tfjs" / "bin" / "tensorflowjs_converter"
    subprocess.check_call([str(conv), "--input_format=tf_saved_model",
                           "--output_format=tfjs_graph_model",
                           "--signature_name=serving_default",
                           str(sm), str(out_dir)])
    m = json.load(open(cfg.work_dir / "metrics.json"))
    split = json.load(open(cfg.work_dir / "split_report.json"))
    meta = {
        "modelVersion": cfg.name,
        "architecture": "MobileNetV2",
        "format": "tfjs_graph_model",
        "inputSize": [IMG_SIZE, IMG_SIZE],
        "inputShape": [1, IMG_SIZE, IMG_SIZE, 3],
        "colorMode": "RGB",
        "dataset": cfg.dataset_label,
        "classCount": len(split["classes"]),
        "classes": split["classes"],
        "normalization": NORMALIZATION,
        "trainingDate": date.today().isoformat(),
        "thresholds": m["thresholds"],
        "metrics": {k: m[k] for k in ("accuracy", "top3Accuracy", "macroPrecision", "macroRecall",
                                       "macroF1", "weightedF1")} | {"evaluatedOn": "held-out test split",
                                                                    "testImages": split["totals"].get("test")},
        "license": cfg.license,
        "tta": "hflip",  # average of the image and its horizontal mirror
    }
    if m.get("priorCorrection"):
        meta["priorCorrection"] = m["priorCorrection"]
    from shared.app_rule import app_rule, class_thresholds
    meta["classThresholds"] = class_thresholds(cfg.work_dir, m.get("priorCorrection"))
    rule = app_rule(cfg.work_dir, m.get("priorCorrection"), meta["classThresholds"])
    meta["metrics"]["appRule"] = {k: rule[k] for k in ("cutoff", "rule", "accuracy", "coverage", "precision")}
    json.dump(meta, open(out_dir / "metadata.json", "w"), indent=2)
    print("exported", out_dir, sorted(os.listdir(out_dir)))
