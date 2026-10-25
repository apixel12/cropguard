"""Field-robustness augmentation + outlier exposure (training split only).

Motivation (data/work_plantvillage/stress_test.json, v1 model): accuracy
collapsed on a small leaf in clutter (17%), blur (46%), sensor noise (60%),
and random-noise images were confidently classified 88% of the time.

1. Robust augmentation: each transform is applied to a random subset of the
   batch, so clean images still dominate.
2. Outlier exposure (Hendrycks et al., ICLR 2019): synthetic non-leaf images
   are appended to each batch with a UNIFORM target over the classes, so the
   model learns to be unconfident on inputs that are not leaves. The label
   space is unchanged; such inputs land in the app's "Uncertain" state.

The stress test deliberately uses a different clutter generator from the one
here, so it does not just measure memorised training textures.
"""
import math

import tensorflow as tf

import os

S = int(os.environ.get("CG_IMG_SIZE", 224))  # matches shared/preprocessing.IMG_SIZE


def _mask(b, p):
    return tf.cast(tf.random.uniform([b, 1, 1, 1]) < p, tf.float32)


def _pick(x, y, m):
    return m * y + (1.0 - m) * x


def _gauss_kernel(sigma):
    r = max(1, int(3 * sigma))
    g = [math.exp(-(i * i) / (2 * sigma * sigma)) for i in range(-r, r + 1)]
    s = sum(g)
    g = tf.constant([v / s for v in g], tf.float32)
    k = tf.tensordot(g, g, axes=0)[:, :, None, None]
    return tf.tile(k, [1, 1, 3, 1])


_GK = {s: _gauss_kernel(s) for s in (1.0, 1.8, 2.8, 3.6)}


def _motion_kernels():
    """Hand-shake blur: horizontal, vertical and both diagonals, 3 lengths."""
    ks = []
    for n in (7, 11, 15):
        line = tf.ones([n]) / n
        h = tf.reshape(tf.linalg.diag(tf.zeros([n])) + tf.pad(line[None], [[n // 2, n - n // 2 - 1], [0, 0]]), [n, n])
        d = tf.linalg.diag(line)
        for k in (h, tf.transpose(h), d, tf.reverse(d, [1])):
            ks.append(tf.tile(k[:, :, None, None], [1, 1, 3, 1]))
    return ks


_MK = _motion_kernels()


def _blur(x, k):
    return tf.nn.depthwise_conv2d(x, k, [1, 1, 1, 1], "SAME")


def train_texture(b):
    """Blurred blocky colour noise with an earthy/foliage tint."""
    g = tf.random.uniform([], 4, 24, tf.int32)
    t = tf.random.uniform([b, g, g, 3], 20, 235)
    gray = tf.reduce_mean(t, -1, keepdims=True)
    t = 0.65 * gray + 0.35 * t  # desaturate: soil/mulch/foliage, not confetti
    tint = tf.concat([tf.random.uniform([b, 1, 1, 1], 0.7, 1.1),
                      tf.random.uniform([b, 1, 1, 1], 0.75, 1.15),
                      tf.random.uniform([b, 1, 1, 1], 0.45, 0.85)], -1)
    t = tf.image.resize(t * tint, (S, S), "bicubic")
    return tf.clip_by_value(t, 0, 255)


def _composite_on_clutter(x):
    b = tf.shape(x)[0]
    s = tf.cast(tf.random.uniform([], 0.42, 0.88) * S, tf.int32)
    small = tf.image.resize(x, (s, s))
    oy = tf.random.uniform([], 0, S - s + 1, tf.int32)
    ox = tf.random.uniform([], 0, S - s + 1, tf.int32)
    padded = tf.pad(small, [[0, 0], [oy, S - s - oy], [ox, S - s - ox], [0, 0]])
    inside = tf.pad(tf.ones([b, s, s, 1]), [[0, 0], [oy, S - s - oy], [ox, S - s - ox], [0, 0]])
    return inside * padded + (1 - inside) * train_texture(b)


def _jpeg(x):
    def one(img):
        q = tf.random.uniform([], 15, 85, tf.int32)
        return tf.cast(tf.image.adjust_jpeg_quality(tf.cast(img, tf.uint8), q), tf.float32)
    return tf.map_fn(one, x, fn_output_signature=tf.float32)


def robust_augment(x, level="full"):
    """x: float32 [B,224,224,3] in [0,255].

    level="full": all transforms (for lab-style datasets such as PlantVillage).
    level="light": no clutter compositing, blur or resolution loss. For field
    photos (the lemon set) where lesions are small spots; those transforms
    destroyed the detail the model needs and caused underfitting.
    """
    full = level in ("full", "medium")
    sc = 0.5 if level == "medium" else 1.0  # medium: same transforms, half as often
    b = tf.shape(x)[0]
    # 90° rotations (leaves are photographed at any orientation)
    k = tf.random.uniform([], 0, 4, tf.int32)
    x = _pick(x, tf.image.rot90(x, k), _mask(b, 0.5))
    # leaf further away on a cluttered background
    if full:
        x = _pick(x, _composite_on_clutter(x), _mask(b, 0.3 * sc))
    # exposure and white balance
    gain = tf.random.uniform([b, 1, 1, 1], 0.45, 1.6)
    x = _pick(x, x * gain, _mask(b, 0.4))
    wb = tf.random.uniform([b, 1, 1, 3], 0.8, 1.2)
    x = _pick(x, x * wb, _mask(b, 0.35))
    x = tf.clip_by_value(x, 0, 255)
    # defocus blur
    if full:
        # v2: more and stronger blur, for phone photos taken in the field
        idx = tf.random.uniform([], 0, 4, tf.int32)
        blurred = tf.switch_case(idx, [lambda s=s: _blur(x, _GK[s]) for s in (1.0, 1.8, 2.8, 3.6)])
        x = _pick(x, blurred, _mask(b, 0.22 * sc))
        # motion blur: 4 directions x 3 lengths
        mi = tf.random.uniform([], 0, len(_MK), tf.int32)
        moved = tf.switch_case(mi, [lambda k=k: tf.nn.depthwise_conv2d(x, k, [1, 1, 1, 1], "SAME") for k in _MK])
        x = _pick(x, moved, _mask(b, 0.20 * sc))
        # low resolution
        r = tf.random.uniform([], 40 * S // 224, 112 * S // 224, tf.int32)
        low = tf.image.resize(tf.image.resize(x, (r, r), "area"), (S, S), "bilinear")
        x = _pick(x, low, _mask(b, 0.15 * sc))
    # sensor noise
    if not full:  # light: mild resolution jitter so sharpness doesn't identify the source camera
        r = tf.random.uniform([], S * 4 // 7, S, tf.int32)
        low = tf.image.resize(tf.image.resize(x, (r, r), "area"), (S, S), "bilinear")
        x = _pick(x, low, _mask(b, 0.4))
    sd = tf.random.uniform([b, 1, 1, 1], 3, 25 if full else 12)
    x = _pick(x, x + tf.random.normal(tf.shape(x)) * sd, _mask(b, 0.2 * (sc if full else 1.0)))
    x = tf.clip_by_value(x, 0, 255)
    # compression artefacts
    x = _pick(x, _jpeg(x), _mask(b, 0.15))
    return x


def outlier_batch(n):
    """Synthetic non-leaf images: noise, textures, gradients, flat colour."""
    kind = tf.random.uniform([], 0, 4, tf.int32)

    def noise():
        g = tf.random.uniform([], 16, 225, tf.int32)
        return tf.image.resize(tf.random.uniform([n, g, g, 3], 0, 255), (S, S), "nearest")

    def tex():
        return train_texture(n)

    def grad():
        a = tf.random.uniform([n, 1, 1, 3], 0, 255)
        c = tf.random.uniform([n, 1, 1, 3], 0, 255)
        t = tf.reshape(tf.linspace(0.0, 1.0, S), [1, 1, S, 1])
        g = a + (c - a) * t
        g = tf.tile(g, [1, S, 1, 1])
        return tf.image.rot90(g, tf.random.uniform([], 0, 4, tf.int32))

    def flat():
        return tf.tile(tf.random.uniform([n, 1, 1, 3], 0, 255), [1, S, S, 1]) + tf.random.normal([n, S, S, 3]) * 4

    x = tf.switch_case(kind, [noise, tex, grad, flat])
    return tf.clip_by_value(x, 0, 255)
