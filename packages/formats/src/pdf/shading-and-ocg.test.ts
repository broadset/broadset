import { rgbColor } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPdfBytes } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Phase 9 follow-up — real PDF shading-pattern gradients + per-element
 * OCG /OC membership. Exercise the full pipeline against actual PDF
 * output so the structural surfaces (shading patterns, /OC marked
 * content, /Resources /Pattern, /Resources /Properties) are visible
 * in the byte stream.
 */

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('PDF shading patterns — type 2 (linear) + type 3 (radial)', () => {
  /**
   * @description A linear gradient fill MUST emit a real PDF type-2
   * shading pattern registered in the page's `/Resources /Pattern`
   * dictionary. Confirms the shading-pattern emitter wires through
   * the rectangle render path end-to-end.
   */
  it('emits a /Pattern resource + /ShadingType 2 dict for a linear gradient rectangle', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'linear-grad-rect',
          style: makeStyle({
            fill: {
              kind: 'gradient',
              gradient: {
                type: 'linear',
                angle: 90,
                stops: [
                  { color: rgbColor('#ff0000'), position: 0 },
                  { color: rgbColor('#0000ff'), position: 100 },
                ],
              },
            },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    expect(text).toContain('/Pattern');
    expect(text).toContain('/PatternType 2');
    expect(text).toContain('/ShadingType 2');
    expect(text).toContain('/BSPat_');
    // Two-stop linear gradient produces a single type-2 sub-function
    // (no stitching wrapper required).
    expect(text).toContain('/FunctionType 2');
  });

  /**
   * @description Three-stop linear gradients emit a type-3 stitching
   * function wrapping per-pair type-2 sub-functions.
   */
  it('emits a /FunctionType 3 stitching wrapper for 3+ gradient stops', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'three-stop-grad',
          style: makeStyle({
            fill: {
              kind: 'gradient',
              gradient: {
                type: 'linear',
                angle: 90,
                stops: [
                  { color: rgbColor('#ff0000'), position: 0 },
                  { color: rgbColor('#00ff00'), position: 50 },
                  { color: rgbColor('#0000ff'), position: 100 },
                ],
              },
            },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    expect(text).toContain('/FunctionType 3');
    expect(text).toContain('/Bounds');
    expect(text).toContain('/Encode');
  });

  /**
   * @description Radial gradients emit PDF type-3 (radial) shading
   * patterns with /Coords carrying the inner-circle (point) and
   * outer-circle (disc) coordinates.
   */
  it('emits /ShadingType 3 + 6-element /Coords for a radial gradient ellipse', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('ellipse', {
          id: 'radial-grad-ellipse',
          style: makeStyle({
            fill: {
              kind: 'gradient',
              gradient: {
                type: 'radial',
                stops: [
                  { color: rgbColor('#ffffff'), position: 0 },
                  { color: rgbColor('#000000'), position: 100 },
                ],
              },
            },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    expect(text).toContain('/ShadingType 3');
    expect(text).toContain('/Coords');
  });

  /**
   * @description Conic gradients are NOT natively expressible as PDF
   * shading patterns; the exporter falls through to the first-stop
   * solid fallback rather than emitting a malformed shading pattern.
   * Confirms the conic-rejection branch works.
   */
  it('falls through to solid fallback for conic gradients (no PDF native conic)', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'conic-fallback',
          style: makeStyle({
            fill: {
              kind: 'gradient',
              gradient: {
                type: 'conic',
                startAngle: 0,
                stops: [
                  { color: rgbColor('#ff0000'), position: 0 },
                  { color: rgbColor('#0000ff'), position: 100 },
                ],
              },
            },
          }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    // No shading pattern was registered for the conic gradient.
    expect(text).not.toContain('/PatternType 2');
  });
});

describe('PDF per-element OCG /OC membership', () => {
  /**
   * @description Elements that appear on a Broadset page MUST be
   * wrapped in an `/OC <name> BDC ... EMC` marked-content sequence
   * referencing that page's OCG so PDF readers can toggle per-page
   * visibility from the layers panel. The OCG resource binding is
   * registered in the page's `/Resources /Properties` so the BDC
   * operator resolves to the OCG ref.
   */
  it('registers /BS_OC_ resource bindings in /Resources /Properties when pages contain elements', async () => {
    const doc = makeDocument({
      pages: [
        {
          id: 'page-1',
          name: 'First Page',
          elements: [
            { elementId: 'el-on-page-1', transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }, visible: true },
          ],
          locale: null,
          extensions: {},
        },
      ],
      elements: [
        makeElement('rectangle', { id: 'el-on-page-1', style: makeStyle() }),
        makeElement('rectangle', { id: 'el-not-on-any-page', style: makeStyle() }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    expect(text).toContain('/BS_OC_0');
  });

  /**
   * @description When a Broadset document has zero pages, the
   * exporter does NOT register OCG resource bindings — the
   * /Resources /Properties registry only carries /BSET marked-content
   * tags.
   */
  it('does not register OCG bindings when no pages reference elements', async () => {
    const doc = makeDocument({
      pages: [
        // Empty page — no element references.
        { id: 'page-empty', name: 'Empty Page', elements: [], locale: null, extensions: {} },
      ],
      elements: [makeElement('rectangle', { id: 'orphan', style: makeStyle() })],
    });

    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    // No /BS_OC_ bindings (orphan element has no page reference).
    expect(text).not.toContain('/BS_OC_');
  });
});
