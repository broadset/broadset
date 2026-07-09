import type { Layer } from 'ag-psd';

import type { PsdBitmapMask } from './types';

/**
 * Bitmap layer mask encoding helpers (Phase 4.4).
 *
 * ag-psd carries a layer's pixel mask on `Layer.mask` with the alpha
 * channel reachable in two shapes (see `node_modules/ag-psd/dist/psd.d.ts`
 * → `LayerMaskData`):
 *
 *  - `mask.imageData` — RGBA-shaped `{ width, height, data: Uint8ClampedArray }`
 *    where channel 0 carries the actual mask gray. ag-psd's reader
 *    duplicates that gray into channels 1/2 and forces channel 3 to
 *    255 (`setupGrayscale` + `resetAlpha` in `psdReader.js:21,519`),
 *    and its writer reads channel 0 back via `[0]` (`psdWriter.js:617`).
 *  - `mask.canvas` — the same gray rendered through a `<canvas>`.
 *    The browser path; not used by Broadset because the runtime canvas
 *    polyfill is a no-op stub (see `runtime-canvas.ts`).
 *
 * Broadset stores the mask gray as a single base64-encoded
 * `Uint8Array` of length `width * height` — exactly one byte per
 * pixel. That keeps the `.bsp` JSON small and lossless to ag-psd's
 * 8-bpc write path. Higher bit depths are not preserved today (ag-psd
 * itself only accepts 8-bpc on the write side, see
 * `psdWriter.js:218–220`).
 */

const RGBA_STRIDE = 4;
const FULLY_OPAQUE = 0xff;

function isOffscreenCanvasLike(value: unknown): value is {
  readonly getContext: (kind: '2d') => CanvasRenderingContext2D | null;
  readonly width: number;
  readonly height: number;
} {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as { readonly getContext?: unknown };

  return typeof candidate.getContext === 'function';
}

/**
 * Read a single byte per pixel from the RGBA-shaped mask data ag-psd
 * exposes after a successful read. Returns `undefined` when the input
 * is missing or shaped wrong — callers must skip preservation rather
 * than fabricate a partial blob.
 */
function extractAlphaFromImageData(imageData: {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}): Uint8Array | undefined {
  const { width, height, data } = imageData;
  const expected = width * height * RGBA_STRIDE;

  if (data.length < expected) return undefined;

  const out = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    out[i] = data[i * RGBA_STRIDE] ?? 0;
  }

  return out;
}

function extractAlphaFromCanvas(canvas: {
  readonly getContext: (kind: '2d') => CanvasRenderingContext2D | null;
  readonly width: number;
  readonly height: number;
}): Uint8Array | undefined {
  const ctx = canvas.getContext('2d');

  if (ctx === null) return undefined;

  let pixels: ImageData;

  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return undefined;
  }

  return extractAlphaFromImageData({ width: canvas.width, height: canvas.height, data: pixels.data });
}

function bytesToBase64(bytes: Uint8Array): string {
  // Buffer is always available — the package targets node + bundlers
  // that polyfill it (see `_shared/xmp` for the same pattern).
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(raw: string): Uint8Array {
  return new Uint8Array(Buffer.from(raw, 'base64'));
}

/**
 * Convert an ag-psd `Layer.mask` into the Broadset preservation blob
 * shape. Returns `undefined` when the mask carries no usable pixel
 * data (e.g. an empty mask with `defaultColor` only).
 */
export function encodeBitmapMaskFromLayerMask(layerMask: NonNullable<Layer['mask']>): PsdBitmapMask | undefined {
  const width = (layerMask.right ?? 0) - (layerMask.left ?? 0);
  const height = (layerMask.bottom ?? 0) - (layerMask.top ?? 0);

  if (width <= 0 || height <= 0) return undefined;

  let alpha: Uint8Array | undefined;

  if (layerMask.imageData !== undefined) {
    alpha = extractAlphaFromImageData(layerMask.imageData);
  } else if (layerMask.canvas !== undefined && isOffscreenCanvasLike(layerMask.canvas)) {
    alpha = extractAlphaFromCanvas(layerMask.canvas);
  }

  if (alpha === undefined || alpha.length === 0) return undefined;

  return {
    width,
    height,
    raw: bytesToBase64(alpha),
  };
}

/**
 * Inflate the single-byte-per-pixel alpha back into the RGBA-shaped
 * imageData ag-psd's writer expects. Channel 0 carries the mask gray;
 * the writer pulls channel `[0]` via `getMaskChannels` (see
 * `psdWriter.js:617`). Channels 1/2 are also set to the gray so a
 * downstream reader that accidentally interprets the buffer as RGB
 * still shows the mask. Alpha is forced to fully opaque to mirror
 * ag-psd's own `resetAlpha` behaviour after read.
 */
export function decodeBitmapMaskToLayerMask(blob: PsdBitmapMask): NonNullable<Layer['mask']> | undefined {
  const alpha = base64ToBytes(blob.raw);

  if (alpha.length !== blob.width * blob.height) return undefined;

  const data = new Uint8ClampedArray(blob.width * blob.height * RGBA_STRIDE);

  for (let i = 0; i < alpha.length; i++) {
    const v = alpha[i] ?? 0;
    const offset = i * RGBA_STRIDE;

    data[offset] = v;
    data[offset + 1] = v;
    data[offset + 2] = v;
    data[offset + 3] = FULLY_OPAQUE;
  }

  return {
    top: 0,
    left: 0,
    right: blob.width,
    bottom: blob.height,
    imageData: { width: blob.width, height: blob.height, data },
  };
}
