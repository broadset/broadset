import { rgbColor } from '@broadset/model';
import pixelmatch from 'pixelmatch';
import { describe, expect, it } from 'vitest';

import { rasterisePdfPage } from './_test-helpers/render-pdf';
import { exportPdfBytes } from './index';
import { makeCanvas, makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Visual rendering regression. Each test exports a Broadset document
 * to PDF, rasterises the first page via pdfjs-dist + @napi-rs/canvas,
 * and asserts pixel-level properties of the rendered output.
 *
 * The structural test suites (XMP / OCG / OutputIntent / operator
 * presence) catch BYTE-LEVEL regressions but cannot detect
 * "exporter produces valid PDF that renders nothing visible" — the
 * single most user-facing failure mode. This suite plugs that gap.
 *
 * Pixelmatch is used for cross-pixel comparisons. Threshold is
 * deliberately lenient (5% mismatch) because rasterisation is
 * inherently slightly nondeterministic across pdfjs versions and
 * canvas implementations; the goal is to catch CATASTROPHIC
 * regressions (entire page blank, wrong colour, wrong position),
 * not microscopic differences.
 */

const PIXEL_THRESHOLD = 0.1; // per-pixel similarity threshold
const ALLOWED_MISMATCH_RATIO = 0.05; // 5% of pixels may differ

function fractionOfMismatchedPixels(actual: Uint8Array, expected: Uint8Array, width: number, height: number): number {
  const diff = new Uint8Array(width * height * 4);
  const mismatchedCount = pixelmatch(actual, expected, diff, width, height, {
    threshold: PIXEL_THRESHOLD,
    includeAA: false,
  });

  return mismatchedCount / (width * height);
}

function fractionOfNonWhitePixels(pixels: Uint8Array): number {
  let nonWhiteCount = 0;
  const totalPixels = pixels.length / 4;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 255;
    const g = pixels[i + 1] ?? 255;
    const b = pixels[i + 2] ?? 255;
    const a = pixels[i + 3] ?? 0;

    if (a > 0 && (r < 250 || g < 250 || b < 250)) nonWhiteCount += 1;
  }

  return nonWhiteCount / totalPixels;
}

function fractionOfPixelsMatchingColour(
  pixels: Uint8Array,
  target: { readonly r: number; readonly g: number; readonly b: number },
  tolerance: number,
): number {
  let matchCount = 0;
  const totalPixels = pixels.length / 4;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;

    if (
      Math.abs(r - target.r) <= tolerance &&
      Math.abs(g - target.g) <= tolerance &&
      Math.abs(b - target.b) <= tolerance
    ) {
      matchCount += 1;
    }
  }

  return matchCount / totalPixels;
}

describe('PDF visual regression — exporter produces visible content', () => {
  /**
   * @description An empty document MUST rasterise to an essentially
   * white page (no spurious painted content from the exporter chrome).
   */
  it('renders an empty document as a blank page', async () => {
    const doc = makeDocument({ id: 'visual-empty' });
    const bytes = await exportPdfBytes(doc);
    const rendered = await rasterisePdfPage(bytes, { scale: 1 });

    expect(fractionOfNonWhitePixels(rendered.pixels)).toBeLessThan(0.01);
  });

  /**
   * @description A document with a solid red rectangle MUST
   * rasterise with at least 5% red pixels in the rendered image.
   * Catches the exporter-emits-no-fill regression class.
   */
  it('renders a red rectangle with red pixels in the rasterised output', async () => {
    const doc = makeDocument({
      id: 'visual-red-rect',
      canvas: makeCanvas({ width: 100, height: 60, unit: 'mm' }),
      elements: [
        makeElement('rectangle', {
          id: 'red-rect',
          position: { x: 20, y: 10 },
          width: 60,
          height: 40,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#ff0000') },
          }),
        }),
      ],
    });
    const bytes = await exportPdfBytes(doc);
    const rendered = await rasterisePdfPage(bytes, { scale: 1 });
    // Tolerate 30 channel units to account for anti-aliasing on the
    // rectangle edges + rasteriser colour-space rounding.
    const redRatio = fractionOfPixelsMatchingColour(rendered.pixels, { r: 255, g: 0, b: 0 }, 30);

    expect(redRatio).toBeGreaterThan(0.05);
  });

  /**
   * @description The same document exported twice MUST render
   * pixel-identical output. Proves the exporter is deterministic at
   * the visual level even if the byte stream contains incidentally
   * different formatting (date stamps, ID hashes).
   */
  it('renders identical pixels for two exports of the same document', async () => {
    const doc = makeDocument({
      id: 'visual-deterministic',
      canvas: makeCanvas({ width: 80, height: 80, unit: 'mm' }),
      elements: [
        makeElement('rectangle', {
          id: 'rect-a',
          position: { x: 10, y: 10 },
          width: 30,
          height: 30,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#0080c8') },
          }),
        }),
      ],
    });
    const firstBytes = await exportPdfBytes(doc);
    const secondBytes = await exportPdfBytes(doc);
    const firstRender = await rasterisePdfPage(firstBytes, { scale: 1 });
    const secondRender = await rasterisePdfPage(secondBytes, { scale: 1 });

    expect(secondRender.width).toBe(firstRender.width);
    expect(secondRender.height).toBe(firstRender.height);

    const mismatch = fractionOfMismatchedPixels(
      firstRender.pixels,
      secondRender.pixels,
      firstRender.width,
      firstRender.height,
    );

    expect(mismatch).toBeLessThan(ALLOWED_MISMATCH_RATIO);
  });

  /**
   * @description An ellipse element MUST rasterise to a recognisable
   * ellipse — the path math (Bézier curve approximation of the
   * ellipse perimeter) is an easy place to introduce silent
   * regressions. Verifies actual curved fill appears.
   */
  it('renders an ellipse as a filled curved shape', async () => {
    const doc = makeDocument({
      id: 'visual-ellipse',
      canvas: makeCanvas({ width: 80, height: 80, unit: 'mm' }),
      elements: [
        makeElement('ellipse', {
          id: 'ellipse-a',
          position: { x: 20, y: 20 },
          width: 40,
          height: 40,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#0000ff') },
          }),
        }),
      ],
    });
    const bytes = await exportPdfBytes(doc);
    const rendered = await rasterisePdfPage(bytes, { scale: 1 });
    const blueRatio = fractionOfPixelsMatchingColour(rendered.pixels, { r: 0, g: 0, b: 255 }, 30);

    // An ellipse in a 40mm bounding box covers ~π/4 ≈ 78.5% of the
    // bounding rectangle. With anti-aliasing edges and rendering
    // imprecision, expect at least 4% of TOTAL page pixels to match.
    expect(blueRatio).toBeGreaterThan(0.04);
  });

  /**
   * @description Element rotation MUST produce visibly rotated output.
   * A 45° rotated rectangle should paint diagonal pixels that an
   * unrotated rectangle would not. Catches the rotation-CTM regression
   * class where the exporter "supports" rotation in the data model
   * but never emits the matrix.
   */
  it('renders rotation visibly distinct from unrotated output', async () => {
    const baseDoc = makeDocument({
      id: 'visual-rotate-base',
      canvas: makeCanvas({ width: 80, height: 80, unit: 'mm' }),
      elements: [
        makeElement('rectangle', {
          id: 'rect-base',
          position: { x: 20, y: 20 },
          width: 40,
          height: 40,
          rotation: 0,
          style: makeStyle({
            fill: { kind: 'solid', color: rgbColor('#000000') },
          }),
        }),
      ],
    });
    const rotatedDoc = {
      ...baseDoc,
      elements: baseDoc.elements.map((el) => ({ ...el, rotation: 45 })),
    };
    const baseRender = await rasterisePdfPage(await exportPdfBytes(baseDoc), { scale: 1 });
    const rotatedRender = await rasterisePdfPage(await exportPdfBytes(rotatedDoc), { scale: 1 });
    const mismatch = fractionOfMismatchedPixels(
      baseRender.pixels,
      rotatedRender.pixels,
      baseRender.width,
      baseRender.height,
    );

    // Rotation changes a substantial fraction of pixels — well above
    // the 5% deterministic-render tolerance.
    expect(mismatch).toBeGreaterThan(0.05);
  });
});
