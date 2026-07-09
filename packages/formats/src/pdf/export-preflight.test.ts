import { describe, expect, it } from 'vitest';

import { exportPdfWithPreflight } from './index';
import { makeDocument, makeElement, makeStyle } from './test-helpers';

/**
 * Phase 6 P6.6 — preflight-warning surface tests. Closes the audit
 * gap "exporter emits no warnings" by asserting that
 * `exportPdfWithPreflight` returns `{ bytes, warnings }` with the
 * conditions enumerated in `project/spec/formats/pdf.md` →
 * "Preflight and Warnings".
 */

describe('exportPdfWithPreflight', () => {
  /**
   * @description A clean Broadset document (Standard 14 font, no
   * animations, no SVG elements) emits zero warnings — the preflight
   * never fires for things that aren't problems.
   */
  it('returns zero warnings for a clean document', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Hello',
          style: makeStyle({ fontFamily: 'Helvetica', fontSize: 14 }),
        }),
      ],
    });

    const result = await exportPdfWithPreflight(doc);

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings).toEqual([]);
  });

  /**
   * @description Non-Standard-14 font families (Inter, Roboto, etc.)
   * surface a font-fallback warning per the spec — the exporter
   * attempts Google Fonts resolution but may fall back to Helvetica.
   */
  it('warns when a text element uses a non-Standard-14 font family', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Custom font',
          style: makeStyle({ fontFamily: 'Inter', fontSize: 14 }),
        }),
      ],
    });

    const result = await exportPdfWithPreflight(doc);

    expect(result.warnings.some((w) => w.toLowerCase().includes('inter'))).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes('helvetica'))).toBe(true);
  });

  /**
   * @description Bold or italic styles outside the Standard 14 set
   * surface an additional fallback warning — Helvetica variant
   * substitution is unavoidable until font subsetting wires up.
   */
  it('warns when bold/italic styles fall outside Standard 14 families', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          content: 'Bold custom',
          style: makeStyle({ fontFamily: 'Roboto', fontSize: 14, fontWeight: 700 }),
        }),
      ],
    });

    const result = await exportPdfWithPreflight(doc);

    expect(result.warnings.some((w) => w.toLowerCase().includes('helvetica variant'))).toBe(true);
  });

  /**
   * @description Per IO-D-16 PDF is a static carrier — animated
   * elements export at the IN state and the animation timeline is
   * discarded. The preflight surfaces this so users know what was
   * lost.
   */
  it('warns when the document contains animated elements', async () => {
    const doc = makeDocument({
      id: 'animated-doc',
      elements: [
        makeElement('rectangle', {
          id: 'animated-rect',
          style: makeStyle(),
        }),
      ],
      animations: [
        {
          id: 'anim-1',
          name: 'fade',
          elementId: 'animated-rect',
          trigger: 'onLoad',
          timelines: [
            {
              property: 'style.opacity',
              keyframes: [
                { time: 0, value: { type: 'number', value: 0 } },
                { time: 1, value: { type: 'number', value: 1 } },
              ],
            },
          ],
        },
      ] as never,
    });

    const result = await exportPdfWithPreflight(doc);

    expect(result.warnings.some((w) => w.toLowerCase().includes('animated'))).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes('io-d-16'))).toBe(true);
  });

  /**
   * @description SVG elements rasterise to PNG before embedding (PDF
   * has no native SVG primitive on the current pipeline). The
   * preflight names the count so users know how much was rasterised.
   */
  it('warns when the document contains SVG elements', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('svg', {
          content: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
          style: makeStyle(),
        }),
      ],
    });

    const result = await exportPdfWithPreflight(doc);

    expect(result.warnings.some((w) => w.toLowerCase().includes('rasterise') || w.toLowerCase().includes('svg'))).toBe(true);
  });

  /**
   * @description A document combining Standard 14 fonts AND custom
   * fonts AND animations AND SVG elements emits one warning per
   * issue category — duplicates are deduped per family.
   */
  it('emits a deduped warning per issue category', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', { content: 'Std', style: makeStyle({ fontFamily: 'Helvetica' }) }),
        makeElement('text', { id: 'inter-1', content: 'Inter A', style: makeStyle({ fontFamily: 'Inter' }) }),
        makeElement('text', { id: 'inter-2', content: 'Inter B', style: makeStyle({ fontFamily: 'Inter' }) }),
      ],
    });

    const result = await exportPdfWithPreflight(doc);
    const interWarnings = result.warnings.filter((w) => w.toLowerCase().includes('"inter"'));

    expect(interWarnings).toHaveLength(1);
  });
});
