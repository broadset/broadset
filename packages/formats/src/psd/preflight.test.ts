import { describe, expect, it } from 'vitest';

import { exportPsdBytesAsyncWithPreflight } from './export';
import { collectPreflightWarnings } from './preflight';
import { makeDocument, makeElement } from './test-helpers';

/**
 * PSD preflight surfaces the static-document concerns the spec calls
 * out: animations dropped, rotated non-image elements, colour-mode
 * downgrades, URL images, stale unmapped-effects.
 */

describe('collectPreflightWarnings', () => {
  /**
   * @description An empty document with no animations / rotations /
   * URL assets emits no warnings.
   */
  it('returns no warnings for a clean document', () => {
    const doc = makeDocument({ elements: [] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings).toEqual([]);
  });

  /**
   * @description Animations are silently flattened to the IN state per
   * IO-D-16; preflight surfaces that fact so users aren't surprised.
   */
  it('warns when the document carries animations', () => {
    const el = makeElement('rectangle', { id: 'r1' });
    const doc = makeDocument({
      elements: [el],
      animations: [
        {
          elementId: 'r1',
          config: {
            timelines: [],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('animat'))).toBe(true);
  });

  /**
   * @description Phase 4.5 closed the rotated-text gap: rotation now
   * rides through ag-psd's text-transform field, so preflight no
   * longer surfaces a warning for rotated text.
   */
  it('does not warn when text is rotated (Phase 4.5 closure)', () => {
    const el = makeElement('text', { id: 't1', rotation: 45, content: 'Hello' });
    const doc = makeDocument({ elements: [el] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => /rotated text|text rotation/i.test(w))).toBe(false);
  });

  /**
   * @description Rotated images and shapes compose natively (via
   * placedLayer.transform for images, via the vector-mask rotation
   * pass for shapes); rotated text now composes through ag-psd's
   * text-transform field. None of them surface a rotation warning.
   */
  it('does not warn when only images or shapes are rotated', () => {
    const image = makeElement('image', { id: 'i1', rotation: 90, content: 'data:image/png;base64,xx' });
    const rect = makeElement('rectangle', { id: 'r1', rotation: 30 });
    const doc = makeDocument({ elements: [image, rect] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('rotat'))).toBe(false);
  });

  /**
   * @description RTL text (Hebrew / Arabic) triggers a Unicode-
   * fidelity warning so users know rendering depends on Photoshop's
   * UAX #9 implementation rather than byte-level bidi reordering.
   */
  it('warns when the document contains RTL text', () => {
    const el = makeElement('text', { id: 't1', content: 'مرحبا' });
    const doc = makeDocument({ elements: [el] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('right-to-left'))).toBe(true);
  });

  /**
   * @description CJK text triggers a separate UAX #14 line-break
   * warning so users know Photoshop's text engine handles wrapping.
   */
  it('warns when the document contains CJK text', () => {
    const el = makeElement('text', { id: 't1', content: '你好世界' });
    const doc = makeDocument({ elements: [el] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('cjk'))).toBe(true);
  });

  /**
   * @description URL-bearing images need either prefetch or async
   * fetch — preflight warns so callers know to choose the right path.
   */
  it('warns when the document references remote URL images', () => {
    const el = makeElement('image', { id: 'i1', content: 'https://example.com/x.png' });
    const doc = makeDocument({ elements: [el] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('url'))).toBe(true);
  });
});

describe('exportPsdBytesAsyncWithPreflight', () => {
  /**
   * @description Always returns bytes — preflight never blocks the
   * export per IO-D-14 — and the warning list mirrors the static
   * preflight + any fetch failures. Uses an animated element to
   * trigger a static warning since Phase 4.5 closed the rotated-text
   * gap.
   */
  it('returns bytes alongside the static preflight warnings', async () => {
    const el = makeElement('rectangle', { id: 'r1' });
    const doc = makeDocument({
      elements: [el],
      animations: [
        {
          elementId: 'r1',
          config: {
            timelines: [],
            stateTimelineBindings: [],
            modifierTimelineBindings: [],
            textAnimator: null,
          },
        },
      ],
    });
    const result = await exportPsdBytesAsyncWithPreflight(doc, {
      fetch: () => Promise.resolve(new Response(null, { status: 500 })),
    });

    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  /**
   * @description When the URL fetch fails, the warning list contains
   * a per-URL fetch-failure entry on top of the static warnings.
   */
  it('appends fetch-failure warnings when the supplied fetch returns 404', async () => {
    const el = makeElement('image', { id: 'i1', content: 'https://example.test/missing.png', name: 'BrokenImage' });
    const doc = makeDocument({ elements: [el] });
    const result = await exportPsdBytesAsyncWithPreflight(doc, {
      fetch: () => Promise.resolve(new Response(null, { status: 404 })),
    });

    expect(result.warnings.some((w) => w.includes('failed to fetch'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('BrokenImage'))).toBe(true);
  });
});
