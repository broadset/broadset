/**
 * P7.3 — SVG export beyond prior art.
 *
 * Covers the four Phase 7.3 deliverables:
 *
 * 1. `data-bs-*` tagging on every rendered element (+ namespaced
 *    `broadset:content-hash` for identity recovery after external
 *    tools strip `data-bs-*`).
 * 2. Document-level `<metadata>` RDF packet under the shared
 *    Broadset XMP namespace URI (IO-D-08), carrying document id,
 *    canvas unit + dpi, and per-element fingerprints.
 * 3. Conic gradient fallback: visual layer emits a many-stop linear
 *    approximation; metadata carries the true conic spec so re-import
 *    recovers the original gradient type.
 * 4. OKLCH / display-p3 colour preservation: visual layer emits a
 *    gamut-mapped sRGB fallback; `BroadsetColor.originalColor` rides
 *    in the metadata packet so re-import restores the source spec.
 *
 * These tests gate the promotion of SVG export from "parity" to
 * "beyond prior art" — regression in any of them is a spec-level
 * failure, not a style nit.
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

import { exportSvgString } from './index';
import { SVG_BROADSET_NAMESPACE } from './types';

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
  };
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-beyond',
    name: 'Beyond Parity Test',
    documentMode: 'screen' as const,
    canvas: makeCanvas(),
    elements: [],
    animations: [],
    pages: [],
    dataSchema: { fields: [] },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  1. `data-bs-*` tagging                                            */
/* ------------------------------------------------------------------ */

describe('P7.3 — data-bs-* tagging on every rendered element', () => {
  /**
   * @description Every rendered element MUST carry `data-bs-id` and
   * `data-bs-kind` attributes. These are SVG 2 / HTML5 global
   * attributes and survive Illustrator / Inkscape / Figma / Sketch /
   * Affinity save-roundtrips unless the user aggressively flattens.
   */
  it('emits data-bs-id and data-bs-kind on every rendered element', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'rect-1', type: 'rectangle' }),
        makeElement({ id: 'ellipse-1', type: 'ellipse' }),
        makeElement({ id: 'text-1', type: 'text', content: 'hi' }),
        makeElement({ id: 'path-1', type: 'path', content: 'M0,0 L10,10' }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('data-bs-id="rect-1"');
    expect(svg).toContain('data-bs-kind="rectangle"');
    expect(svg).toContain('data-bs-id="ellipse-1"');
    expect(svg).toContain('data-bs-kind="ellipse"');
    expect(svg).toContain('data-bs-id="text-1"');
    expect(svg).toContain('data-bs-kind="text"');
    expect(svg).toContain('data-bs-id="path-1"');
    expect(svg).toContain('data-bs-kind="path"');
  });

  /**
   * @description Groups also carry `data-bs-id` and `data-bs-kind`
   * with `kind=group`. The exporter MUST NOT emit `data-bs-kind` on
   * the root `<svg>` element (only on rendered children).
   */
  it('emits data-bs-* on group elements', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'grp-1', type: 'group' }),
        makeElement({ id: 'child-1', type: 'rectangle', parentId: 'grp-1' }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('data-bs-id="grp-1"');
    expect(svg).toContain('data-bs-kind="group"');
    // Root <svg> does not carry element-kind tagging.
    expect(svg).not.toMatch(/<svg[^>]*data-bs-kind/);
  });

  /**
   * @description `dataField`, `visibleWhen`, `repeater` from the
   * model MUST emit as `data-bs-data-field`, `data-bs-visible-when`,
   * `data-bs-repeater` respectively. These drive the fast-path
   * importer's data-binding recovery.
   */
  it('emits data-binding markers when set', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'bound-1',
          type: 'text',
          content: 'bound',
          dataField: { fieldName: 'headline', overflow: 'clip' },
          visibleWhen: 'hasHeadline',
          repeater: { dataArrayField: 'cards', direction: 'horizontal', gap: 0 },
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('data-bs-data-field="headline"');
    expect(svg).toContain('data-bs-visible-when="hasHeadline"');
    expect(svg).toContain('data-bs-repeater="cards"');
  });

  /**
   * @description QRCode, image, and svg-type opaque payload
   * elements all carry `data-bs-*` tagging too. The tagging path
   * MUST cover every one of Broadset's 11 element kinds.
   */
  it('emits data-bs-* on qrcode, image, and svg-type elements', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'qr-1', type: 'qrcode', content: 'https://example.com' }),
        makeElement({ id: 'img-1', type: 'image', content: 'data:image/png;base64,AAAA' }),
        makeElement({
          id: 'svg-1',
          type: 'svg',
          content: '<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>',
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('data-bs-id="qr-1"');
    expect(svg).toContain('data-bs-kind="qrcode"');
    expect(svg).toContain('data-bs-id="img-1"');
    expect(svg).toContain('data-bs-kind="image"');
    expect(svg).toContain('data-bs-id="svg-1"');
    expect(svg).toContain('data-bs-kind="svg"');
  });

  /**
   * @description Every rendered element MUST carry a
   * `broadset:content-hash` attribute for identity recovery after
   * external tools strip `data-bs-*`. The value is a 16-char
   * lowercase hex xxhash64 produced by `_shared/fingerprint`.
   */
  it('emits broadset:content-hash on every rendered element', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'hash-1', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc);

    // broadset:content-hash (namespaced attribute) with a 16-char
    // lowercase hex value.
    expect(svg).toMatch(/broadset:content-hash="[0-9a-f]{16}"/);
  });
});

/* ------------------------------------------------------------------ */
/*  2. <metadata> RDF packet                                          */
/* ------------------------------------------------------------------ */

describe('P7.3 — Document <metadata> RDF packet', () => {
  /**
   * @description The root `<svg>` MUST declare the shared Broadset
   * XMP namespace URI from IO-D-08 (`https://broadset.io/ns/xmp/1.0/`).
   */
  it('declares the shared broadset: namespace URI on root <svg>', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'el-1', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain(`xmlns:broadset="${SVG_BROADSET_NAMESPACE}"`);
  });

  /**
   * @description A document-level `<metadata>` child of the root
   * `<svg>` MUST be present and carry an `rdf:RDF` root with
   * `broadset:documentId` and `broadset:elements` children.
   */
  it('emits a <metadata> block with the broadset: RDF packet', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({ id: 'el-1', type: 'rectangle' }),
        makeElement({ id: 'el-2', type: 'text', content: 'hello' }),
      ],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<metadata');
    expect(svg).toContain('<rdf:RDF');
    expect(svg).toContain('broadset:documentId');
    expect(svg).toContain('doc-beyond');
    expect(svg).toContain('broadset:elements');
    // rdf:Seq entries carrying every element id.
    expect(svg).toContain('broadset:elementId="el-1"');
    expect(svg).toContain('broadset:elementId="el-2"');
  });

  /**
   * @description The metadata packet MUST carry canvas unit/dpi so
   * re-imported SVGs preserve Broadset's spatial unit system
   * instead of silently defaulting to px.
   */
  it('carries canvas unit and dpi in the metadata packet', async () => {
    const doc = makeDocument({
      canvas: makeCanvas({ unit: 'mm', dpi: 96 }),
      elements: [makeElement({ id: 'el-1', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('broadset:canvasUnit="mm"');
    expect(svg).toContain('broadset:canvasDpi="96"');
  });
});

/* ------------------------------------------------------------------ */
/*  3. Conic gradient fallback + metadata                             */
/* ------------------------------------------------------------------ */

describe('P7.3 — Conic gradient fallback + metadata preservation', () => {
  /**
   * @description SVG 2 has no native conic gradient primitive. The
   * visual layer MUST emit a linear approximation (SVG consumers see
   * a plausible gradient) AND the metadata packet MUST carry the
   * original conic spec so re-import recovers the true type.
   */
  it('emits a visual fallback and carries conic spec in metadata', async () => {
    const doc = makeDocument({
      elements: [
        makeElement({
          id: 'conic-1',
          type: 'rectangle',
          style: makeStyle({
            backgroundGradient: {
              type: 'conic',
              startAngle: 0,
              stops: [
                { color: rgbColor('#ff0000'), position: 0 },
                { color: rgbColor('#00ff00'), position: 50 },
                { color: rgbColor('#0000ff'), position: 100 },
              ],
            },
          }),
        }),
      ],
    });

    const svg = await exportSvgString(doc);

    // Visual layer: a <linearGradient> fallback reference so any
    // SVG renderer draws SOMETHING (not nothing, as before).
    expect(svg).toContain('<linearGradient');
    expect(svg).toContain('fill="url(#');
    // Metadata: original conic spec preserved.
    expect(svg).toContain('broadset:conicGradient');
    expect(svg).toContain('broadset:elementId="conic-1"');
  });
});

/* ------------------------------------------------------------------ */
/*  4. OKLCH / display-p3 colour preservation                         */
/* ------------------------------------------------------------------ */

describe('P7.3 / P7.6 — SvgExportOptions gate metadata + tagging emission', () => {
  /**
   * @description `includeMetadata: false` MUST suppress the
   * `<metadata>` RDF packet AND the `xmlns:rdf` / `xmlns:broadset`
   * namespace declarations on root when the caller also disables
   * tagging. A minimal SVG output is useful for consumers that
   * don't care about round-trip identity (pure visual distribution).
   */
  it('suppresses <metadata> and namespace decl when both options are off', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'no-meta', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc, { includeMetadata: false, includeElementTagging: false });

    expect(svg).not.toContain('<metadata');
    expect(svg).not.toContain('<rdf:RDF');
    expect(svg).not.toContain('data-bs-id');
    expect(svg).not.toContain('broadset:content-hash');
    expect(svg).not.toContain('xmlns:broadset');
    expect(svg).not.toContain('xmlns:rdf');
  });

  /**
   * @description `includeElementTagging: false` with metadata on
   * suppresses per-element `data-bs-*` + `broadset:content-hash`
   * but keeps the `<metadata>` packet so reconciliation still
   * has a document-level hook.
   */
  it('suppresses per-element tagging without dropping the <metadata> packet', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'tag-off', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc, { includeMetadata: true, includeElementTagging: false });

    expect(svg).toContain('<metadata');
    expect(svg).toContain('<rdf:RDF');
    expect(svg).not.toContain('data-bs-id="tag-off"');
    expect(svg).not.toContain('broadset:content-hash');
  });

  /**
   * @description The default call (no options) MUST emit the full
   * metadata + tagging surface — defaults are `true` for both, so
   * every callsite gets round-trip-ready output unless it opts
   * out explicitly.
   */
  it('emits metadata + tagging by default when no options are passed', async () => {
    const doc = makeDocument({
      elements: [makeElement({ id: 'default', type: 'rectangle' })],
    });

    const svg = await exportSvgString(doc);

    expect(svg).toContain('<metadata');
    expect(svg).toContain('data-bs-id="default"');
  });
});

describe('P7.3 — OKLCH / display-p3 colour preservation', () => {
  /**
   * @description Non-sRGB colours from `BroadsetColor.originalColor`
   * MUST be preserved in the metadata packet so re-import restores
   * the source colour spec. The visual-layer `fill=` attribute
   * carries the gamut-mapped sRGB fallback.
   */
  it('preserves originalColor in metadata for non-sRGB fills', async () => {
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

    expect(svg).toContain('broadset:elementId="oklch-1"');
    expect(svg).toContain('broadset:originalColor');
    expect(svg).toContain('oklch(70%');
  });
});
