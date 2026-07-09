import { rgbColor } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPdfBytes } from './index';
import { makeCanvas, makeDocument, makeElement, makeStyle } from './test-helpers';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function bytesToString(bytes: Uint8Array): string {
  // Using latin1 so arbitrary binary bytes map 1:1 to code points — sufficient
  // for ASCII-substring checks (BDC / EMC tags, /BSET name, /Metadata key,
  // broadset: namespace URI). PDF's cross-reference / stream bodies include
  // binary noise that `latin1` preserves but `utf-8` would corrupt.
  return new TextDecoder('latin1').decode(bytes);
}

/* ------------------------------------------------------------------ */
/*  P6.3 — Marked-content /BSET tagging                                */
/* ------------------------------------------------------------------ */

describe('P6.3 Marked-content /BSET tagging', () => {
  /**
   * @description Every painted Broadset element MUST register a property
   * dict under the page's `/Resources /Properties` dictionary carrying the
   * element's stable id and type so round-trip import can recover the
   * mapping from PDF operators back to Broadset elements. See
   * `project/spec/formats/pdf.md` → "Marked-Content Element Tags".
   *
   * The BDC / EMC operators that reference this dict by name live in the
   * compressed page content stream — verified at the operator level via
   * the `pushOperators` spy in `export-parity.test.ts`.
   */
  it('registers a /BS_ property dict per element in the page /Resources /Properties', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rect-element-001',
          position: { x: 10, y: 10 },
          width: 50,
          height: 50,
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#ff0000') } }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    // The registered property dict name encodes the element id.
    expect(content).toContain('/BS_rect-element-001');
    // The property dict carries the element id as a PDF string literal.
    expect(content).toContain('(rect-element-001)');
  });

  /**
   * @description The property dict's `/Kind` entry must match the Broadset
   * element type (Text, Rectangle, Ellipse, …) so the importer can dispatch
   * construction on the correct element kind.
   */
  it('records the element type as /Kind in the marked-content property dict', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('text', {
          id: 'text-element-001',
          content: 'Hello',
          style: makeStyle({ fontSize: 12 }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('/Kind');
    expect(content).toContain('/Text');
  });

  /**
   * @description The property dict must carry the `extensions.pdf.dirty`
   * flag so untouched re-imports preserve the dirty:false status the
   * reconciliation pipeline relies on.
   */
  it('records the dirty flag as /Dirty in the marked-content property dict', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rect-dirty',
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#00ff00') } }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('/Dirty');
    // PDF boolean literal for the default `false` dirty flag.
    expect(content).toMatch(/\/Dirty\s+(?:false|true)\b/);
  });
});

/* ------------------------------------------------------------------ */
/*  P6.3 — XMP metadata                                                */
/* ------------------------------------------------------------------ */

describe('P6.3 XMP metadata', () => {
  /**
   * @description A Broadset-exported PDF MUST carry a `broadset:` XMP packet
   * attached to the document catalog's `/Metadata` entry. The namespace URI
   * is the shared IO-D-08 namespace so every format (PDF, PSD, PPTX, SVG)
   * emits the same footprint.
   */
  it('attaches a broadset: XMP packet to the document catalog /Metadata', async () => {
    const doc = makeDocument({
      id: 'doc-pdf-xmp',
      elements: [
        makeElement('rectangle', {
          id: 'rect-for-xmp',
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#0000ff') } }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('/Metadata');
    expect(content).toContain('broadset.io/ns/xmp');
    // Document id round-trips through the XMP packet.
    expect(content).toContain('doc-pdf-xmp');
  });

  /**
   * @description The XMP packet MUST list every Broadset element id so the
   * importer can diff against the current operator stream for reconciliation
   * (content-hash fallback requires the id-list to be present).
   */
  it('includes every element id in the XMP packet', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'element-xmp-a',
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#aaaaaa') } }),
        }),
        makeElement('rectangle', {
          id: 'element-xmp-b',
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#bbbbbb') } }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('element-xmp-a');
    expect(content).toContain('element-xmp-b');
  });
});

/* ------------------------------------------------------------------ */
/*  P6.3 — Page boxes                                                  */
/* ------------------------------------------------------------------ */

describe('P6.3 Page boxes', () => {
  /**
   * @description Canvas `bleed` (when declared) MUST grow the `MediaBox` so
   * content drawn into the bleed area is retained; `TrimBox` stays at the
   * canvas dimensions excluding bleed. This is the standards-only path the
   * PDF spec mandates for bleed / trim / safe-area round-trip.
   */
  it('emits a MediaBox larger than TrimBox when canvas.bleed is set', async () => {
    const canvas = makeCanvas({ width: 210, height: 118, unit: 'mm', bleed: [3, 3, 3, 3] });
    const doc = makeDocument({ canvas });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('/MediaBox');
    expect(content).toContain('/TrimBox');
  });

  /**
   * @description When `canvas.safeArea` is declared, the exporter emits a
   * `/ArtBox` equal to the trim minus the safe-area margin so downstream
   * tools (InDesign / Illustrator) can align to the safe zone.
   */
  it('emits an ArtBox when canvas.safeArea is declared', async () => {
    const canvas = makeCanvas({ width: 210, height: 118, unit: 'mm', safeArea: [6, 6, 6, 6] });
    const doc = makeDocument({ canvas });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('/ArtBox');
  });
});

/* ------------------------------------------------------------------ */
/*  P6.3 — Optional Content Groups (OCGs)                              */
/* ------------------------------------------------------------------ */

describe('P6.3 Optional Content Groups', () => {
  /**
   * @description Every Broadset page MUST emit as one PDF Optional Content
   * Group registered in the document catalog's `/OCProperties` dictionary
   * so PDF readers expose per-page visibility controls.
   */
  it('registers an OCG entry in /OCProperties', async () => {
    const doc = makeDocument({
      pages: [
        {
          id: 'page-1',
          name: 'Main Page',
          elements: [],
          locale: null,
          extensions: {},
        },
      ],
      elements: [
        makeElement('rectangle', {
          id: 'rect-ocg',
          style: makeStyle({ fill: { kind: 'solid', color: rgbColor('#123456') } }),
        }),
      ],
    });

    const bytes = await exportPdfBytes(doc);
    const content = bytesToString(bytes);

    expect(content).toContain('/OCProperties');
    expect(content).toContain('/OCG');
    expect(content).toContain('Main Page');
  });
});
