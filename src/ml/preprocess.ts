import * as tf from '@tensorflow/tfjs-core'

/**
 * Mirrors training/shared/preprocessing.py exactly:
 *  - RGB (alpha dropped)
 *  - center square crop (side = shorter edge, offsets floor((W-s)/2), floor((H-s)/2)),
 *    then resized to 224x224, bilinear, half-pixel centers
 *    (= tf.image.crop_to_bounding_box + tf.image.resize(method="bilinear"), no antialias)
 *  - float32 in [0, 255]; normalization (x/127.5 - 1) lives inside the model
 *
 * The resize is done here on the CPU rather than with tf.image.resizeBilinear
 * on the full photo: uploading a 12-megapixel camera frame as one WebGL
 * texture exceeds the texture size limit on many phones. Bilinear sampling
 * only reads 4 source pixels per output pixel, so this is cheap and exact.
 */
export const INPUT_SIZE = 224
/** Input resolutions a model may declare in metadata.inputSize (crops-v2 uses 288). */
export const SUPPORTED_SIZES = [224, 288]
const MAX_CANVAS_PIXELS = 16_000_000

/** Bilinear resize of interleaved RGBA (or RGB) bytes to size x size RGB floats. */
export function resizeBilinearRGB(
  src: ArrayLike<number>, w: number, h: number, channels: 3 | 4, size = INPUT_SIZE,
): Float32Array {
  const out = new Float32Array(size * size * 3)
  const sy = h / size, sx = w / size
  for (let y = 0; y < size; y++) {
    const inY = Math.max(0, (y + 0.5) * sy - 0.5)
    const y0 = Math.min(Math.floor(inY), h - 1), y1 = Math.min(y0 + 1, h - 1)
    const fy = inY - y0
    for (let x = 0; x < size; x++) {
      const inX = Math.max(0, (x + 0.5) * sx - 0.5)
      const x0 = Math.min(Math.floor(inX), w - 1), x1 = Math.min(x0 + 1, w - 1)
      const fx = inX - x0
      const a = (y0 * w + x0) * channels, b = (y0 * w + x1) * channels
      const c = (y1 * w + x0) * channels, d = (y1 * w + x1) * channels
      const o = (y * size + x) * 3
      for (let k = 0; k < 3; k++) {
        const top = src[a + k] + (src[b + k] - src[a + k]) * fx
        const bot = src[c + k] + (src[d + k] - src[c + k]) * fx
        out[o + k] = top + (bot - top) * fy
      }
    }
  }
  return out
}

/** Same arithmetic as training's center_square(): integer floor offsets. */
export function centerSquare(w: number, h: number) {
  const s = Math.min(w, h)
  return { sx: Math.floor((w - s) / 2), sy: Math.floor((h - s) / 2), s }
}

/** Reads the center-square pixels at native resolution (EXIF orientation applied by the browser). */
export function readPixels(img: HTMLImageElement | ImageBitmap | HTMLCanvasElement): ImageData {
  const W = 'naturalWidth' in img ? img.naturalWidth : img.width
  const H = 'naturalHeight' in img ? img.naturalHeight : img.height
  const { sx, sy, s } = centerSquare(W, H)
  // iOS Safari draws a blank canvas above ~16.7 MP. Squares wider than the cap
  // (48 MP iPhone photos) are pre-shrunk; at or below it the pipeline is exact.
  const d = Math.min(s, Math.floor(Math.sqrt(MAX_CANVAS_PIXELS)))
  const c = document.createElement('canvas')
  c.width = d
  c.height = d
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = d !== s // a 1:1 copy must not be resampled
  ctx.drawImage(img, sx, sy, s, s, 0, 0, d, d)
  const w = d, h = d
  const data = ctx.getImageData(0, 0, w, h)
  c.width = c.height = 0 // release the full-size backing store promptly (iOS)
  return data
}

export function toInputTensor(source: HTMLImageElement | ImageBitmap | HTMLCanvasElement, size = INPUT_SIZE): tf.Tensor4D {
  const px = readPixels(source)
  const rgb = resizeBilinearRGB(px.data, px.width, px.height, 4, size)
  return tf.tensor4d(rgb, [1, size, size, 3], 'float32')
}
