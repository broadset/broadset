/**
 * P7.4a — SVG import fast path (metadata + `data-bs-*`).
 *
 * When a source SVG carries a Broadset-emitted `<metadata>` RDF
 * packet + `data-bs-*` / `broadset:content-hash` tags on each
 * element, the importer MUST recognise it and hydrate via the fast
 * path: element ids survive, canvas unit/dpi come from metadata,
 * document id survives, `extensions.svg.dirty` initialises to
 * `false` per IO-D-11. Third-party SVGs without the packet fall
 * through to the existing element extractor (P7.4b territory).
 *
 * Covers the round-trip golden test from the plan: export a
 * canonical document, parse the result back via `importSvgDocument`,
 * and confirm Broadset identity survives.
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

import { exportSvgString, importSvgDocument } from './index';

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 800,
    height: 600,
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
    id: 'doc-fast',
    name: 'Fast Path',
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
/*  Fast-path detection                                               */
/* ------------------------------------------------------------------ */

describe('P7.4a — Fast-path detection', () => {
  /**
   * @description A source SVG without a `<metadata>` packet or
   * `data-bs-*` attributes falls through to the third-party
   * importer path (P7.4b). The fast path activates only when the
   * shared Broadset XMP namespace is declared on the root `<svg>`.
   */
  it('ignores SVGs without the broadset namespace declaration', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100">
      <rect width="100" height="50" fill="#00ff00"/>
    </svg>`;

    const { document: imported } = importSvgDocument(input);

    // Third-party fallback path generates element ids of the form
    // `imported-0`, `imported-1`, … (per the existing
    // `import-document.ts` wrapper behaviour). The fast path would
    // preserve source ids verbatim — this assertion pins the
    // discrimination.
    expect(imported.elements[0]?.id).toMatch(/^imported-/);
  });

  /**
   * @description A Broadset-exported SVG (with the shared
   * namespace + `<metadata>` + `data-bs-*`) MUST activate the fast
   * path. The imported document's elements carry their original
   * Broadset ids — not the synthetic `imported-N` ids.
   */
  it('activates the fast path when the broadset namespace is declared', async () => {
    const doc = makeDocument({
      id: 'fast-1',
      elements: [
        makeElement({ id: 'orig-1', type: 'rectangle' }),
        makeElement({ id: 'orig-2', type: 'text', content: 'hi' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    const importedIds = imported.elements.map((el) => el.id);

    expect(importedIds).toContain('orig-1');
    expect(importedIds).toContain('orig-2');
  });
});

/* ------------------------------------------------------------------ */
/*  Document-level metadata hydration                                 */
/* ------------------------------------------------------------------ */

describe('P7.4a — Document-level metadata hydration', () => {
  /**
   * @description The `broadset:documentId` value in the packet MUST
   * survive round-trip; importers use this id to match a re-imported
   * SVG to an existing Broadset document in reconciliation.
   */
  it('preserves documentId across round-trip', async () => {
    const doc = makeDocument({
      id: 'my-doc-id-12345',
      elements: [makeElement({ id: 'el-1', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    expect(imported.id).toBe('my-doc-id-12345');
  });

  /**
   * @description The `broadset:canvasUnit` + `broadset:canvasDpi`
   * attrs in the metadata packet MUST hydrate the imported
   * document's canvas settings. Third-party SVGs default to `px` /
   * 72 dpi; the fast path preserves the original unit system.
   */
  it('preserves canvas unit and dpi across round-trip', async () => {
    const doc = makeDocument({
      canvas: makeCanvas({ unit: 'mm', dpi: 96 }),
      elements: [makeElement({ id: 'el-1', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    expect(imported.canvas.unit).toBe('mm');
    expect(imported.canvas.dpi).toBe(96);
  });
});

/* ------------------------------------------------------------------ */
/*  Per-element identity                                              */
/* ------------------------------------------------------------------ */

describe('P7.4a — Per-element identity', () => {
  /**
   * @description Element ids come from the `data-bs-id` attribute
   * (or the `broadset:elements` RDF Seq when data-bs-* is stripped),
   * not from the synthetic `imported-N` generator the third-party
   * fallback uses.
   */
  it('preserves each element id across round-trip', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'alpha', type: 'rectangle' }),
        makeElement({ id: 'beta', type: 'ellipse' }),
        makeElement({ id: 'gamma', type: 'text', content: 'hello' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    const ids = imported.elements.map((el) => el.id).sort((a, b) => a.localeCompare(b));

    expect(ids).toEqual(['alpha', 'beta', 'gamma']);
  });

  /**
   * @description Nested-group element ids MUST each survive round-
   * trip — every child keeps its OWN `data-bs-id`, not the parent
   * group's. Regression test for the pre-fix bug where the fast
   * path stamped the group id on all descendants.
   */
  it('preserves each nested group child id independently', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'outer', type: 'group' }),
        makeElement({ id: 'inner-rect', type: 'rectangle', parentId: 'outer' }),
        makeElement({ id: 'inner-text', type: 'text', content: 'x', parentId: 'outer' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);
    const ids = imported.elements.map((el) => el.id).sort((a, b) => a.localeCompare(b));

    expect(ids).toEqual(['inner-rect', 'inner-text', 'outer']);

    const byId = new Map(imported.elements.map((el) => [el.id, el]));

    expect(byId.get('outer')?.type).toBe('group');
    expect(byId.get('inner-rect')?.type).toBe('rectangle');
    expect(byId.get('inner-rect')?.parentId).toBe('outer');
    expect(byId.get('inner-text')?.type).toBe('text');
    expect(byId.get('inner-text')?.parentId).toBe('outer');
  });

  /**
   * @description Element kind survives from `data-bs-kind` — the
   * fast path honours this over any heuristic guess based on the
   * SVG tag name.
   */
  it('preserves element type across round-trip', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'rect-1', type: 'rectangle' }),
        makeElement({ id: 'path-1', type: 'path', content: 'M0,0 L10,10' }),
      ],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    const byId = new Map(imported.elements.map((el) => [el.id, el]));

    expect(byId.get('rect-1')?.type).toBe('rectangle');
    expect(byId.get('path-1')?.type).toBe('path');
  });
});

/* ------------------------------------------------------------------ */
/*  Extensions.svg.dirty initialisation                               */
/* ------------------------------------------------------------------ */

describe('P7.4a — Extensions.svg.dirty = false on hydrate (IO-D-11)', () => {
  /**
   * @description Every element imported via the fast path MUST
   * carry `extensions.svg.dirty === false`. The editor's dirty-flag
   * middleware flips it to `true` on first mutation; exporters then
   * re-emit from current state rather than the preserved blob.
   */
  it('initialises extensions.svg.dirty to false on every element', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'el-1', type: 'rectangle' }), makeElement({ id: 'el-2', type: 'ellipse' })],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    for (const el of imported.elements) {
      const ext = el.extensions as { readonly svg?: { readonly dirty?: boolean } };

      expect(ext.svg?.dirty).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  originalColor + conic gradient metadata preservation              */
/* ------------------------------------------------------------------ */

describe('P7.4a — Colour-space & conic-gradient preservation on round-trip', () => {
  /**
   * @description A non-sRGB `BroadsetColor.originalColor` on an
   * element's solid fill MUST survive export + re-import. The value
   * rides in `broadset:originalColor` on the per-element metadata
   * entry and hydrates back onto `style.fill`.
   */
  it('preserves originalColor across round-trip', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'oklch-1',
          type: 'rectangle',
          style: makeStyle({
            fill: rgbColor('#b26633', { space: 'oklch', originalColor: 'oklch(70% 0.25 30)' }),
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);
    const { document: imported } = importSvgDocument(svg);

    const imp = imported.elements.find((el) => el.id === 'oklch-1');
    const fill = imp?.style.fill;

    expect(fill?.kind).toBe('solid');

    if (fill?.kind !== 'solid') {
      throw new Error('Expected solid fill');
    }

    expect(fill.color.kind).toBe('rgb');

    if (fill.color.kind !== 'rgb') {
      throw new Error('Expected rgb color');
    }

    expect(fill.color.originalColor).toBe('oklch(70% 0.25 30)');
  });

  /**
   * @description A conic gradient exports as a linear approximation
   * on the visual layer + the original conic spec in metadata. On
   * round-trip the importer MUST rehydrate the conic gradient from
   * metadata, not the linear approximation.
   */
  it('rehydrates conic gradient from metadata (not the linear fallback)', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'conic-1',
          type: 'rectangle',
          style: makeStyle({
            backgroundGradient: {
              type: 'conic',
              startAngle: 45,
              stops: [
                { color: rgbColor('#ff0000'), position: 0 },
                { color: rgbColor('#0000ff'), position: 100 },
              ],
            },
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    // Diagnostic: confirm the conic spec made it into the metadata packet.
    expect(svg).toContain('broadset:conicGradient');

    const { document: imported } = importSvgDocument(svg);

    // Diagnostic: confirm the element made it through with the expected id.
    expect(imported.elements.map((el) => el.id)).toContain('conic-1');

    const imp = imported.elements.find((el) => el.id === 'conic-1');
    const fill = imp?.style.fill;

    expect(fill?.kind).toBe('gradient');

    if (fill?.kind !== 'gradient') {
      throw new Error('Expected gradient fill');
    }

    expect(fill.gradient.type).toBe('conic');
    expect(fill.gradient.startAngle).toBe(45);
    expect(fill.gradient.stops).toHaveLength(2);
  });
});
