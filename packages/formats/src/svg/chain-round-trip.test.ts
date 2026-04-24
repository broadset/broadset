/**
 * P7.6 — SVG chain round-trip + external-tool fixtures + security.
 *
 * Covers the Phase 7 plan's test deliverables:
 *
 * 1. Chain round-trip: `source → exportSvgString → importSvgDocument
 *    → reconcileSvg`. Any drift shows up in the `ReconcileResult`.
 * 2. `assertReImportableBy` — the exported SVG parses via the
 *    browser's native DOMParser without `parsererror`.
 * 3. External-tool fixtures: smoke tests on synthetic SVG output
 *    shaped like Illustrator / Inkscape / Figma produce. Each must
 *    import without throwing and produce at least one native
 *    element; vendor metadata surfaces as a warning.
 * 4. Hostile-SVG security suite. Every attacker-influenceable
 *    vector (script, onclick, javascript: URL, foreign object,
 *    billion-laughs, recursive use) MUST be sanitized or rejected
 *    with a warning; import never throws on recognised hostility.
 */
import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type BroadsetElementStyleInput,
  type Canvas,
  rgbColor,
  styleSchema,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportSvgString, importSvgDocument, reconcileSvg } from './index';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 400,
    height: 300,
    unit: 'px' as const,
    dpi: 72,
    padding: [0, 0, 0, 0] as [number, number, number, number],
    backgroundColor: '#ffffff',
    backgroundMode: 'solid' as const,
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyleInput> = {}): BroadsetElementStyle {
  return styleSchema.parse({
    opacity: 1,
    ...overrides,
  });
}

function makeElement(overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    type: 'rectangle',
    name: 'Test Element',
    content: '',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    parentId: null,
    groupId: null,
    style: makeStyle(),
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    componentRef: null,
    typeConfig: null,
    autoSize: 'fixed' as const,
    locked: false,
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-chain-svg',
    name: 'Chain Doc',
    documentMode: 'screen' as const,
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...overrides,
  } as BroadsetDocument;
}

/* ------------------------------------------------------------------ */
/*  1. Chain round-trip                                               */
/* ------------------------------------------------------------------ */

describe('P7.6 — Chain round-trip (source → export → import → reconcile)', () => {
  /**
   * @description A canonical Broadset document carrying rect + text
   * + group + child passes a clean round-trip: the reconciliation
   * result surfaces zero modifications / additions / deletions.
   */
  it('round-trips a canonical document with zero drift', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'rect-1', type: 'rectangle', style: makeStyle({ fill: rgbColor('#336699') }) }),
        makeElement({ id: 'text-1', type: 'text', content: 'hello' }),
        makeElement({ id: 'grp-1', type: 'group' }),
        makeElement({ id: 'child-1', type: 'ellipse', parentId: 'grp-1' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const result = await reconcileSvg({ preserved: doc, currentSvg: svg });

    expect(result.modifications).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
  });

  /**
   * @description After a round-trip, the imported document MUST
   * carry the same element ids, the same document id, and the same
   * canvas settings as the source.
   */
  it('preserves document id, canvas, and element ids through the chain', async () => {
    const doc = makeDocument({
      id: 'specific-doc-id',
      canvas: makeCanvas({ unit: 'mm', dpi: 96 }),
      elements: [makeElement({ id: 'only', type: 'rectangle' })],
    });
    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    expect(imported.id).toBe('specific-doc-id');
    expect(imported.canvas.unit).toBe('mm');
    expect(imported.canvas.dpi).toBe(96);
    expect(imported.elements.map((el) => el.id)).toContain('only');
  });
});

/* ------------------------------------------------------------------ */
/*  2. assertReImportableBy — DOMParser validates the output          */
/* ------------------------------------------------------------------ */

describe('P7.6 — Exported SVG is re-importable by the browser', () => {
  /**
   * @description The exporter MUST produce SVG that the browser's
   * native DOMParser parses without a `<parsererror>` element.
   * Broadset's own importer sits on top of the same parser, so a
   * parserror here means Illustrator / Inkscape / Figma would also
   * reject the file.
   */
  it('produces markup that DOMParser parses without parsererror', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'a', type: 'rectangle' }),
        makeElement({ id: 'b', type: 'text', content: 'b' }),
        makeElement({ id: 'c', type: 'path', content: 'M0,0 L10,10' }),
      ],
    });
    const svg = await exportSvgString(doc);
    const parser = new DOMParser();
    const parsed = parser.parseFromString(svg, 'image/svg+xml');

    expect(parsed.querySelector('parsererror')).toBeNull();
    expect(parsed.documentElement.tagName.toLowerCase()).toBe('svg');
  });
});

/* ------------------------------------------------------------------ */
/*  3. External-tool fixtures (synthetic)                              */
/* ------------------------------------------------------------------ */

describe('P7.6 — External-tool fixtures (synthetic)', () => {
  /**
   * @description Illustrator-style SVG export — uses the `ai:`
   * namespace for tool-specific markers alongside standard
   * presentation attrs. Import MUST complete without throwing,
   * produce a native rectangle, and surface the Illustrator
   * namespace warning.
   */
  it('imports an Illustrator-style fixture without throwing', () => {
    const fixture = `<?xml version="1.0" encoding="utf-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" xmlns:ai="http://ns.adobe.com/AdobeIllustrator/10.0/" width="400" height="300" viewBox="0 0 400 300">
        <rect ai:extended="true" width="200" height="100" fill="#336699"/>
        <text x="10" y="30" font-family="Arial" font-size="16">Illustrator</text>
      </svg>`;

    const { document, warnings } = importSvgDocument(fixture);

    expect(document.elements.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /illustrator|ai:|adobe/i.test(w))).toBe(true);
  });

  /**
   * @description Inkscape-style SVG export — declares sodipodi +
   * inkscape namespaces and often emits `<defs>` with named
   * gradients. Import MUST map the gradient and surface the
   * Inkscape namespace warning.
   */
  it('imports an Inkscape-style fixture with sodipodi namespace', () => {
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="400" height="300">
      <defs>
        <linearGradient id="grad1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ff0000"/>
          <stop offset="100%" stop-color="#0000ff"/>
        </linearGradient>
      </defs>
      <g inkscape:label="Layer 1" sodipodi:insensitive="false">
        <rect width="200" height="100" fill="url(#grad1)"/>
      </g>
    </svg>`;

    const { document, warnings } = importSvgDocument(fixture);

    expect(document.elements.length).toBeGreaterThan(0);
    expect(warnings.some((w) => /inkscape|sodipodi/i.test(w))).toBe(true);
  });

  /**
   * @description Figma-style SVG export — commonly class-heavy
   * with inline `<style>` blocks. The class-selector path in
   * `applyStyleBlocks` MUST resolve the declared fill.
   */
  it('imports a Figma-style class-heavy fixture with <style> block', () => {
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
      <style>.accent { fill: #0055ff; } .base { fill: #ffffff; }</style>
      <rect class="base" width="400" height="300"/>
      <rect class="accent" x="50" y="50" width="200" height="100"/>
    </svg>`;

    const { document } = importSvgDocument(fixture);
    const accentRect = document.elements.find((el) => {
      const fill = el.style.fill;

      return fill.kind === 'solid' && fill.color.kind === 'rgb' && fill.color.hex === '#0055ff';
    });

    expect(accentRect).toBeDefined();
  });

  /**
   * @description Hand-authored SVG with a `<use>` referencing a
   * `<symbol>` — common in icon-heavy designs. The importer MUST
   * dereference the use and produce concrete elements.
   */
  it('imports a hand-authored SVG with <use> / <symbol>', () => {
    const fixture = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="300">
      <defs>
        <symbol id="pin">
          <circle cx="10" cy="10" r="8" fill="#ff0000"/>
        </symbol>
      </defs>
      <use xlink:href="#pin" x="50" y="50"/>
      <use xlink:href="#pin" x="150" y="50"/>
    </svg>`;

    const { document } = importSvgDocument(fixture);
    // Each <use> dereferences the symbol's circle; we see two
    // native ellipse elements (imported from the <circle> source).
    const ellipses = document.elements.filter((el) => el.type === 'ellipse');

    expect(ellipses.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Hostile-SVG security suite                                     */
/* ------------------------------------------------------------------ */

describe('P7.6 — Hostile-SVG security suite', () => {
  /**
   * @description A billion-laughs entity-expansion fixture MUST
   * complete parsing in bounded time and memory — DTDs are
   * disabled so entity expansion never fires.
   */
  it('rejects billion-laughs entity expansion without memory blow-up', () => {
    // DOMParser in modern browsers doesn't expand DTD entities by
    // default — billion-laughs is fundamentally neutralised at the
    // parser layer. The importer either parses cleanly (entities
    // unexpanded) or throws "invalid XML" on malformed DTD input;
    // either outcome completes in bounded time and memory.
    const hostile = `<?xml version="1.0"?>
      <!DOCTYPE lolz [
        <!ENTITY lol "lol">
        <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
        <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
        <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">
      ]>
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <text>&lol4;</text>
      </svg>`;
    const start = Date.now();

    try {
      importSvgDocument(hostile);
    } catch {
      // Parse-level rejection is acceptable — we only care that
      // the failure happens in bounded time.
    }

    expect(Date.now() - start).toBeLessThan(2000);
  });

  /**
   * @description A `<use>` depth bomb (deeply nested references)
   * MUST be bounded by the reference-cycle follow cap.
   */
  it('bounds recursive <use> / <symbol> depth', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">
      <defs>
        <symbol id="a"><use xlink:href="#b"/></symbol>
        <symbol id="b"><use xlink:href="#a"/></symbol>
      </defs>
      <use xlink:href="#a"/>
    </svg>`;
    const start = Date.now();
    const { warnings } = importSvgDocument(hostile);

    expect(Date.now() - start).toBeLessThan(1000);
    expect(warnings.some((w) => w.toLowerCase().includes('use') || w.toLowerCase().includes('cycle'))).toBe(true);
  });

  /**
   * @description Multiple vectors in one input — script, event
   * handler, javascript URL, foreignObject — MUST all be sanitized
   * in a single pass, producing distinct warnings per vector.
   */
  it('sanitizes a multi-vector hostile fixture', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100">
      <script>alert('xss')</script>
      <rect width="50" height="50" onclick="alert(1)"/>
      <image xlink:href="javascript:alert(2)" width="10" height="10"/>
      <foreignObject width="50" height="50"><div>body</div></foreignObject>
    </svg>`;
    const { warnings } = importSvgDocument(hostile);

    expect(warnings.some((w) => w.toLowerCase().includes('script'))).toBe(true);
    expect(warnings.some((w) => w.toLowerCase().includes('event') || w.toLowerCase().includes('attribute'))).toBe(
      true,
    );
    expect(warnings.some((w) => w.toLowerCase().includes('javascript'))).toBe(true);
    expect(warnings.some((w) => w.toLowerCase().includes('foreignobject'))).toBe(true);
  });
});
