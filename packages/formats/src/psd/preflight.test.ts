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
   * @description Rotated non-image elements (text, shape) export at
   * axis-aligned bounds — preflight names the count.
   */
  it('warns when shapes or text are rotated', () => {
    const el = makeElement('rectangle', { id: 'r1', rotation: 45 });
    const doc = makeDocument({ elements: [el] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('rotat'))).toBe(true);
  });

  /**
   * @description Rotated images compose via placedLayer.transform —
   * no warning needed.
   */
  it('does not warn when only images are rotated', () => {
    const el = makeElement('image', { id: 'i1', rotation: 90, content: 'data:image/png;base64,xx' });
    const doc = makeDocument({ elements: [el] });
    const warnings = collectPreflightWarnings(doc);

    expect(warnings.some((w) => w.toLowerCase().includes('rotat'))).toBe(false);
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
   * preflight + any fetch failures.
   */
  it('returns bytes alongside the static preflight warnings', async () => {
    const el = makeElement('rectangle', { id: 'r1', rotation: 30 });
    const doc = makeDocument({ elements: [el] });
    const result = await exportPsdBytesAsyncWithPreflight(doc, () => Promise.resolve(new Response(null, { status: 500 })));

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
    const result = await exportPsdBytesAsyncWithPreflight(doc, () => Promise.resolve(new Response(null, { status: 404 })));

    expect(result.warnings.some((w) => w.includes('failed to fetch'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('BrokenImage'))).toBe(true);
  });
});
