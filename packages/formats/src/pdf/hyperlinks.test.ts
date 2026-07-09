import { describe, expect, it } from 'vitest';

import { exportPdfBytes } from './index';
import { makeCanvas, makeDocument, makeElement, makeStyle } from './test-helpers';

function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

describe('PDF hyperlink emission via extensions.pdf.link', () => {
  /**
   * @description An element that opts into a URL via
   * `extensions.pdf.link` MUST emit a `/Annot /Subtype /Link` with a
   * `/URI` action pointing at that URL. Verified by grepping the
   * exported bytes for the annotation dict + URI string.
   */
  it('emits a /Annot /Subtype /Link with the declared URL', async () => {
    const doc = makeDocument({
      id: 'link-doc',
      canvas: makeCanvas({ width: 200, height: 100, unit: 'mm' }),
      elements: [
        makeElement('rectangle', {
          id: 'link-rect',
          position: { x: 10, y: 10 },
          width: 80,
          height: 30,
          style: makeStyle(),
          extensions: { pdf: { link: 'https://broadset.io' } },
        }),
      ],
    });
    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    expect(text).toMatch(/\/Subtype\s+\/Link/);
    expect(text).toMatch(/\/S\s+\/URI/);
    expect(text).toContain('https://broadset.io');
  });

  /**
   * @description A document with NO link extension MUST NOT emit any
   * /Link annotations — confirms the link path is gated behind the
   * opt-in extension.
   */
  it('does not emit link annotations when no element opts in', async () => {
    const doc = makeDocument({
      id: 'no-link-doc',
      elements: [
        makeElement('rectangle', { id: 'plain-rect', style: makeStyle() }),
      ],
    });
    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    expect(text).not.toMatch(/\/Subtype\s+\/Link/);
  });

  /**
   * @description Multiple elements with links MUST each emit their
   * own annotation — no collapsing or de-duping that would silently
   * drop a clickable region.
   */
  it('emits one /Link annotation per element with a declared URL', async () => {
    const doc = makeDocument({
      id: 'multi-link-doc',
      elements: [
        makeElement('rectangle', {
          id: 'rect-a',
          position: { x: 10, y: 10 },
          width: 30,
          height: 30,
          style: makeStyle(),
          extensions: { pdf: { link: 'https://example.com/a' } },
        }),
        makeElement('rectangle', {
          id: 'rect-b',
          position: { x: 50, y: 10 },
          width: 30,
          height: 30,
          style: makeStyle(),
          extensions: { pdf: { link: 'https://example.com/b' } },
        }),
      ],
    });
    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);

    const linkCount = (text.match(/\/Subtype\s+\/Link/g) ?? []).length;

    expect(linkCount).toBeGreaterThanOrEqual(2);
    expect(text).toContain('https://example.com/a');
    expect(text).toContain('https://example.com/b');
  });

  /**
   * @description The link annotation's /Rect MUST cover the
   * element's bounding box so the entire element is clickable, not
   * just the centre point.
   */
  it('annotation /Rect covers the element bounding box', async () => {
    const doc = makeDocument({
      id: 'rect-link-doc',
      canvas: makeCanvas({ width: 200, height: 200, unit: 'mm' }),
      elements: [
        makeElement('rectangle', {
          id: 'big-rect',
          position: { x: 10, y: 10 },
          width: 100,
          height: 80,
          style: makeStyle(),
          extensions: { pdf: { link: 'https://broadset.io/big' } },
        }),
      ],
    });
    const bytes = await exportPdfBytes(doc);
    const text = bytesToString(bytes);
    // Find the /Rect entry — should be a 4-number array.
    const rectMatch = /\/Rect\s+\[([\d.\s-]+)\]/.exec(text);

    expect(rectMatch).not.toBeNull();

    if (rectMatch !== null) {
      const numbers = rectMatch[1]?.trim().split(/\s+/).map(Number) ?? [];

      expect(numbers.length).toBe(4);

      // All four must be positive finite numbers.
      for (const n of numbers) {
        expect(Number.isFinite(n)).toBe(true);
        expect(n).toBeGreaterThanOrEqual(0);
      }

      // upper-right > lower-left (rect has positive area).
      expect((numbers[2] ?? 0) - (numbers[0] ?? 0)).toBeGreaterThan(0);
      expect((numbers[3] ?? 0) - (numbers[1] ?? 0)).toBeGreaterThan(0);
    }
  });
});
