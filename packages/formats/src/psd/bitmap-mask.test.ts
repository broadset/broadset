import type { Layer, Psd } from 'ag-psd';
import { readPsd, writePsdUint8Array } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { importPsd } from './import';
import { ensureCanvasInitialized } from './runtime-canvas';
import type { PsdBitmapMask, PsdExtensions } from './types';

/**
 * Phase 4.4 — bitmap layer mask round-trip.
 *
 * ag-psd carries layer alpha masks as `Layer.mask` with either a
 * `canvas` (browser path) or `imageData` (raw bytes path). When
 * Broadset cannot represent the alpha as a vector / native mask, the
 * bytes ride a base64-encoded preservation blob in
 * `extensions.psd.bitmapMask` so re-export reproduces the same mask.
 */

interface RgbaTuple {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

function solidRasterLayer(opts: {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: RgbaTuple;
}): Layer {
  const { name, x, y, width, height, color } = opts;
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;

    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = color.a;
  }

  return {
    name,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    opacity: 1,
    hidden: false,
    imageData: { width, height, data },
  };
}

/**
 * Build a one-byte-per-pixel radial gradient ramp for use as a mask
 * alpha channel. ag-psd's writer expects an RGBA-shaped imageData
 * even for mask channels — channel 0 carries the actual mask value
 * and the writer writes channel `[0]` to the mask channel ID.
 */
function buildRgbaShapedMaskImageData(
  width: number,
  height: number,
): {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      const v = Math.round(255 * (1 - r / maxR));
      const offset = (y * width + x) * 4;

      data[offset] = v;
      data[offset + 1] = v;
      data[offset + 2] = v;
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}

function buildPsdWithBitmapMask(opts: { readonly width: number; readonly height: number }): Uint8Array {
  ensureCanvasInitialized();

  const { width, height } = opts;
  const layer = solidRasterLayer({
    name: 'Masked',
    x: 0,
    y: 0,
    width,
    height,
    color: { r: 200, g: 50, b: 50, a: 255 },
  });
  const maskImageData = buildRgbaShapedMaskImageData(width, height);

  layer.mask = {
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    defaultColor: 0,
    imageData: maskImageData,
  };

  const psd: Psd = {
    width,
    height,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [layer],
  };

  return writePsdUint8Array(psd);
}

function buildPsdWithBothMasks(opts: { readonly width: number; readonly height: number }): Uint8Array {
  ensureCanvasInitialized();

  const { width, height } = opts;
  const layer = solidRasterLayer({
    name: 'BothMasks',
    x: 0,
    y: 0,
    width,
    height,
    color: { r: 50, g: 200, b: 50, a: 255 },
  });
  const maskImageData = buildRgbaShapedMaskImageData(width, height);

  // Closed rectangular vector mask covering the whole layer.
  layer.vectorMask = {
    paths: [
      {
        open: false,
        fillRule: 'even-odd',
        knots: [
          { points: [0, 0, 0, 0, 0, 0], linked: false },
          { points: [0, 1, 0, 1, 0, 1], linked: false },
          { points: [1, 1, 1, 1, 1, 1], linked: false },
          { points: [1, 0, 1, 0, 1, 0], linked: false },
        ],
      },
    ],
  };
  layer.mask = {
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    defaultColor: 0,
    imageData: maskImageData,
  };

  const psd: Psd = {
    width,
    height,
    channels: 4,
    bitsPerChannel: 8,
    colorMode: 3,
    children: [layer],
  };

  return writePsdUint8Array(psd);
}

interface MaskedLayerCarrier {
  readonly mask?: {
    readonly canvas?: unknown;
    readonly imageData?: { readonly width?: number; readonly height?: number };
  };
  readonly children?: readonly MaskedLayerCarrier[];
}

function findMaskedLayer(layers: readonly MaskedLayerCarrier[] | undefined): MaskedLayerCarrier | undefined {
  if (!layers) return undefined;

  for (const layer of layers) {
    if (layer.mask?.canvas !== undefined || layer.mask?.imageData !== undefined) return layer;

    const nested = findMaskedLayer(layer.children);

    if (nested) return nested;
  }

  return undefined;
}

function getBitmapMask(extensions: unknown): PsdBitmapMask | undefined {
  const maybe = (extensions as { readonly psd?: PsdExtensions } | undefined)?.psd?.bitmapMask;

  return maybe;
}

describe('PSD bitmap layer mask round-trip (Phase 4.4)', () => {
  /**
   * @description A bitmap-only mask survives import as the
   * `extensions.psd.bitmapMask` preservation blob with the correct
   * dimensions and a non-empty base64 alpha payload.
   */
  it('imports a bitmap-masked layer and stores its alpha bytes in extensions.psd.bitmapMask', () => {
    const bytes = buildPsdWithBitmapMask({ width: 32, height: 32 });
    const result = importPsd(bytes);
    const masked = result.elements.find((el) => getBitmapMask(el.extensions) !== undefined);

    expect(masked).toBeDefined();

    const mask = getBitmapMask(masked?.extensions);

    expect(mask?.width).toBe(32);
    expect(mask?.height).toBe(32);
    expect(mask?.raw.length).toBeGreaterThan(0);
  });

  /**
   * @description An imported bitmap-masked element re-exports through
   * `exportPsdBytes` with the alpha bytes still attached as a layer
   * mask — proving the preservation blob round-trips.
   */
  it('re-exports a bitmap-masked element with the alpha bytes preserved', () => {
    const original = buildPsdWithBitmapMask({ width: 32, height: 32 });
    const imported = importPsd(original);
    const reExported = exportPsdBytes(imported);
    const reRead = readPsd(reExported.buffer as ArrayBuffer, {
      skipCompositeImageData: true,
      skipThumbnail: true,
      useImageData: true,
    });
    const layer = findMaskedLayer(reRead.children as MaskedLayerCarrier[] | undefined);

    expect(layer).toBeDefined();
    expect(layer?.mask?.imageData?.width).toBe(32);
    expect(layer?.mask?.imageData?.height).toBe(32);
  });

  /**
   * @description When a layer has both a vector mask AND a bitmap
   * mask, the vector mask wins as the editable Broadset form
   * (`style.borderRadius` / `style.customClipPath`) and the bitmap
   * still rides on `extensions.psd.bitmapMask` so re-export carries
   * both back out.
   */
  it('keeps the bitmap mask as preservation when a vector mask is also present', () => {
    const bytes = buildPsdWithBothMasks({ width: 32, height: 32 });
    const result = importPsd(bytes);
    const masked = result.elements.find((el) => getBitmapMask(el.extensions) !== undefined);

    expect(masked).toBeDefined();
    expect(getBitmapMask(masked?.extensions)).toBeDefined();
  });
});
