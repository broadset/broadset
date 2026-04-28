import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes, exportPsdBytesAsyncWithPreflight } from './export';
import { importPsd } from './import';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 4.5 — PSD text rotation through ag-psd's text-transform field.
 *
 * Pre-Phase-4.5 behaviour: rotated text exported at axis-aligned
 * bounds and surfaced a preflight warning. Post-Phase-4.5: the
 * exporter writes the rotation into the ag-psd `text.transform`
 * 6-element affine matrix `[xx, xy, yx, yy, tx, ty]` so Photoshop /
 * ag-psd reads back a visually rotated text layer; the importer
 * decomposes the matrix back into `BroadsetElement.rotation`; and
 * the preflight warning about rotated text is removed.
 */

const TEXT_ROTATION_DEG = 30;
const TEXT_ROTATION_RAD = (TEXT_ROTATION_DEG * Math.PI) / 180;
const TRANSFORM_TOLERANCE = 4;
const ROUND_TRIP_ROTATION_TOLERANCE = 1;

function makeRotatedTextElement(rotation: number): ReturnType<typeof makeElement> {
  return makeElement('text', {
    id: 'text-rot',
    name: 'Rotated Text',
    position: { x: 40, y: 40 },
    width: 120,
    height: 40,
    rotation,
    content: 'Hello PSD',
  });
}

describe('PSD text rotation (Phase 4.5)', () => {
  /**
   * @description Rotated text MUST emit a non-identity 6-element
   * `text.transform` whose `[xx, xy, yx, yy]` corner matches the
   * rotation matrix `[cos, sin, -sin, cos]`. Captures the exporter
   * contract that Phase 4.5 introduces.
   */
  it('exports a rotated text element through ag-psd text-transform', () => {
    const doc = makeDocument({ elements: [makeRotatedTextElement(TEXT_ROTATION_DEG)] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    const textLayer = psd.children?.[0];

    expect(textLayer?.text?.transform).toBeDefined();
    expect(textLayer?.text?.transform).toHaveLength(6);

    const transform = textLayer?.text?.transform ?? [];
    const [a, b, c, d] = transform;
    const cos = Math.cos(TEXT_ROTATION_RAD);
    const sin = Math.sin(TEXT_ROTATION_RAD);

    expect(a ?? 0).toBeCloseTo(cos, TRANSFORM_TOLERANCE);
    expect(b ?? 0).toBeCloseTo(sin, TRANSFORM_TOLERANCE);
    expect(c ?? 0).toBeCloseTo(-sin, TRANSFORM_TOLERANCE);
    expect(d ?? 0).toBeCloseTo(cos, TRANSFORM_TOLERANCE);
  });

  /**
   * @description Axis-aligned text either omits the transform or
   * emits the identity matrix `[1, 0, 0, 1, tx, ty]` — both leave
   * the text unrotated when re-read.
   */
  it('axis-aligned text exports without a rotated text-transform', () => {
    const doc = makeDocument({ elements: [makeRotatedTextElement(0)] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    const transform = psd.children?.[0]?.text?.transform;

    if (transform === undefined) {
      // Identity-by-omission is acceptable.
      return;
    }

    const [a, b, c, d] = transform;

    expect(a ?? 0).toBeCloseTo(1, TRANSFORM_TOLERANCE);
    expect(b ?? 0).toBeCloseTo(0, TRANSFORM_TOLERANCE);
    expect(c ?? 0).toBeCloseTo(0, TRANSFORM_TOLERANCE);
    expect(d ?? 0).toBeCloseTo(1, TRANSFORM_TOLERANCE);
  });

  /**
   * @description The importer decomposes a non-identity
   * `text.transform` back into `BroadsetElement.rotation` so a
   * round-trip survives within ~1°.
   */
  it('round-trips text rotation through export → import', () => {
    const doc = makeDocument({ elements: [makeRotatedTextElement(TEXT_ROTATION_DEG)] });
    const bytes = exportPsdBytes(doc);
    const reImported = importPsd(bytes);
    const importedText = reImported.elements.find((el) => el.type === 'text');

    expect(importedText).toBeDefined();
    expect(importedText?.rotation ?? 0).toBeCloseTo(TEXT_ROTATION_DEG, 0);
    // Angular tolerance — decomposition uses atan2 on a stored 6-tuple
    // so the recovered angle is within the chosen tolerance.
    expect(Math.abs((importedText?.rotation ?? 0) - TEXT_ROTATION_DEG)).toBeLessThanOrEqual(
      ROUND_TRIP_ROTATION_TOLERANCE,
    );
  });

  /**
   * @description The Phase 4.5 close-out: the preflight no longer
   * surfaces a "rotated text" warning because rotation now rides
   * through ag-psd's text engine natively.
   */
  it('preflight no longer warns about rotated text', async () => {
    const doc = makeDocument({ elements: [makeRotatedTextElement(TEXT_ROTATION_DEG)] });
    const result = await exportPsdBytesAsyncWithPreflight(doc);

    const hasTextRotationWarning = result.warnings.some((w) =>
      /rotated text|text rotation/i.test(w),
    );

    expect(hasTextRotationWarning).toBe(false);
  });
});
