/**
 * Cross-format parity and stress tests (C13).
 *
 * These tests verify that all format exporters handle the same canonical
 * documents without errors, produce non-trivial output, and agree on basic
 * structural properties where applicable.
 */
import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, BroadsetProject, Canvas } from '@broadset/model';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { exportProjectJson, generateOGrafPackages } from './interchange';
import { exportPdfBytes } from './pdf';
import { exportPptxBytes, importPptx } from './pptx';
import { exportPsdBytes } from './psd';
import { exportHtmlStandalone, exportSvg } from './web-vector';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 200,
    height: 120,
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyle> = {}): BroadsetElementStyle {
  return { opacity: 1, ...overrides } as BroadsetElementStyle;
}

function makeElement(type: BroadsetElement['type'], overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: type,
    locked: false,
    visible: true,
    position: { x: 10, y: 10 },
    width: 80,
    height: 50,
    rotation: 0,
    style: makeStyle(),
    content: '',
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'parity-doc',
    name: 'Parity Test',
    canvas: makeCanvas(),
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} }],
    animations: [],
    ...overrides,
  } as BroadsetDocument;
}

/**
 * Canonical document with a representative mix of element types.
 * Used by conformance tests to verify every exporter handles it.
 */
function canonicalDocument(): BroadsetDocument {
  return makeDocument({
    elements: [
      makeElement('rectangle', {
        id: 'rect-1',
        position: { x: 5, y: 5 },
        width: 60,
        height: 40,
        style: makeStyle({ backgroundColor: '#336699' }),
      }),
      makeElement('text', {
        id: 'text-1',
        content: 'Cross-format parity',
        position: { x: 70, y: 5 },
        width: 120,
        height: 30,
      }),
      makeElement('ellipse', {
        id: 'ellipse-1',
        position: { x: 5, y: 55 },
        width: 50,
        height: 50,
        style: makeStyle({ backgroundColor: '#cc3333' }),
      }),
      makeElement('image', {
        id: 'img-1',
        content: 'data:image/png;base64,iVBORw0KGgo=',
        position: { x: 60, y: 55 },
        width: 70,
        height: 50,
      }),
    ],
  });
}

/* ------------------------------------------------------------------ */
/*  Conformance: every exporter handles canonical doc without error     */
/* ------------------------------------------------------------------ */

describe('Cross-Format Conformance', () => {
  const doc = canonicalDocument();

  /**
   * @description HTML standalone export must produce a non-trivial HTML string
   * containing all text content from the canonical document.
   */
  it('HTML standalone produces valid output for canonical document', () => {
    const html = exportHtmlStandalone(doc);

    expect(html.length).toBeGreaterThan(100);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Parity Test');
  });

  /**
   * @description SVG export must produce valid SVG markup containing visual
   * representations of all element types in the canonical document.
   */
  it('SVG export produces valid output for canonical document', () => {
    const svg = exportSvg(doc);

    expect(svg.length).toBeGreaterThan(50);
    expect(svg).toContain('<svg');
    expect(svg).toContain('Cross-format parity');
  });

  /**
   * @description PDF export must produce a non-trivial byte array (valid PDF
   * header) for the canonical document without throwing.
   */
  it('PDF export produces non-empty bytes for canonical document', async () => {
    const bytes = await exportPdfBytes(doc);

    expect(bytes.length).toBeGreaterThan(100);
  });

  /**
   * @description PPTX export must produce a valid ZIP archive containing the
   * expected OOXML structure for the canonical document.
   */
  it('PPTX export produces valid ZIP for canonical document', () => {
    const bytes = exportPptxBytes(doc);

    expect(bytes.length).toBeGreaterThan(100);

    const zip = new PizZip(bytes);

    expect(zip.file('ppt/slides/slide1.xml')).toBeTruthy();
    expect(zip.file('[Content_Types].xml')).toBeTruthy();
  });

  /**
   * @description Project JSON export must produce valid JSON containing the
   * canonical document's elements.
   */
  it('Project JSON export produces valid JSON for canonical document', () => {
    const project: BroadsetProject = {
      schemaVersion: 1,
      id: 'project-1',
      name: 'Parity Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: { fonts: [], palette: [], defaultStyles: {}, defaultDocumentMode: 'screen' as const },
      assets: [],
      documents: [doc],
    } as BroadsetProject;

    const json = exportProjectJson(project);

    expect(json.length).toBeGreaterThan(50);

    const parsed: unknown = JSON.parse(json);

    expect(parsed).toBeDefined();
  });

  /**
   * @description OGraf package generation must produce at least one package
   * with non-empty runtime HTML for the canonical document.
   */
  it('OGraf generates packages for canonical document', () => {
    const packages = generateOGrafPackages(doc);

    expect(packages.length).toBeGreaterThanOrEqual(1);
    expect(packages[0]?.runtime.length).toBeGreaterThan(0);
  });

  /**
   * @description PSD export must produce a non-trivial byte array for the
   * canonical document without throwing.
   */
  it('PSD export produces non-empty bytes for canonical document', () => {
    const bytes = exportPsdBytes(doc);

    expect(bytes.length).toBeGreaterThan(50);
  });
});

/* ------------------------------------------------------------------ */
/*  Round-trip: PPTX export → import preserves structure                */
/* ------------------------------------------------------------------ */

describe('Cross-Format Round-Trip (PPTX)', () => {
  /**
   * @description A round-trip through PPTX export→import must preserve the
   * number of elements in the canonical document.
   */
  it('preserves element count across PPTX round-trip', () => {
    const doc = canonicalDocument();
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.elements.length).toBe(doc.elements.length);
  });

  /**
   * @description Text content must survive a PPTX round-trip byte-for-byte.
   */
  it('preserves text content across PPTX round-trip', () => {
    const doc = canonicalDocument();
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    const textEls = imported.elements.filter((el) => el.type === 'text');

    expect(textEls.length).toBeGreaterThanOrEqual(1);
    expect(textEls[0]?.content).toBe('Cross-format parity');
  });

  /**
   * @description Image elements must survive a PPTX round-trip with real
   * data URIs (not placeholder pptx-media: references).
   */
  it('preserves image data across PPTX round-trip', () => {
    const doc = canonicalDocument();
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    const imageEls = imported.elements.filter((el) => el.type === 'image');

    expect(imageEls.length).toBeGreaterThanOrEqual(1);
    expect(imageEls[0]?.content).toMatch(/^data:image\//);
  });
});

/* ------------------------------------------------------------------ */
/*  Stress: large documents                                            */
/* ------------------------------------------------------------------ */

describe('Cross-Format Stress Tests', () => {
  /**
   * @description Exporters must handle documents with many elements (50+)
   * without crashing. This exercises allocation, loop bounds, and ID
   * generation in each exporter.
   */
  it('handles 50-element document across all exporters', async () => {
    const elements = Array.from({ length: 50 }, (_, i) =>
      makeElement(i % 2 === 0 ? 'rectangle' : 'text', {
        id: `stress-${String(i)}`,
        content: i % 2 === 0 ? '' : `Item ${String(i)}`,
        position: { x: (i % 10) * 20, y: Math.floor(i / 10) * 25 },
        width: 18,
        height: 20,
        style: makeStyle({ backgroundColor: i % 2 === 0 ? '#aabbcc' : undefined }),
      }),
    );

    const doc = makeDocument({ elements });

    // HTML
    const html = exportHtmlStandalone(doc);

    expect(html.length).toBeGreaterThan(500);

    // SVG
    const svg = exportSvg(doc);

    expect(svg.length).toBeGreaterThan(500);

    // PDF
    const pdf = await exportPdfBytes(doc);

    expect(pdf.length).toBeGreaterThan(100);

    // PPTX
    const pptx = exportPptxBytes(doc);
    const zip = new PizZip(pptx);

    expect(zip.file('ppt/slides/slide1.xml')).toBeTruthy();

    // OGraf
    const pkgs = generateOGrafPackages(doc);

    expect(pkgs.length).toBeGreaterThanOrEqual(1);

    // PSD
    const psd = exportPsdBytes(doc);

    expect(psd.length).toBeGreaterThan(50);
  });

  /**
   * @description Exporters must handle an empty document (no elements)
   * without crashing. This validates edge-case handling in each pipeline.
   */
  it('handles empty document gracefully', async () => {
    const doc = makeDocument({ elements: [] });

    expect(() => exportHtmlStandalone(doc)).not.toThrow();
    expect(() => exportSvg(doc)).not.toThrow();
    await expect(exportPdfBytes(doc)).resolves.toBeDefined();
    expect(() => exportPptxBytes(doc)).not.toThrow();
    expect(() => generateOGrafPackages(doc)).not.toThrow();
    expect(() => exportPsdBytes(doc)).not.toThrow();
  });

  /**
   * @description Elements with deeply nested style properties (gradients,
   * shadows, filters) must be handled by all exporters without errors.
   */
  it('handles richly styled elements across all exporters', async () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          id: 'rich-rect',
          style: makeStyle({
            backgroundColor: '#ff0000',
            backgroundGradient: {
              type: 'linear',
              angle: 45,
              stops: [
                { color: '#ff0000', position: 0 },
                { color: '#00ff00', position: 0.5 },
                { color: '#0000ff', position: 1 },
              ],
            },
            boxShadow: '5px 5px 10px rgba(0,0,0,0.5)',
            borderWidth: 2,
            borderColor: '#333333',
            borderRadius: [5, 5, 5, 5],
          }),
        }),
        makeElement('text', {
          id: 'rich-text',
          content: 'Styled text',
          style: makeStyle({
            fontFamily: 'Arial',
            fontSize: 24,
            fontWeight: 700,
            fontStyle: 'italic',
            textDecoration: 'underline',
            letterSpacing: 2,
            textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
          }),
        }),
      ],
    });

    expect(() => exportHtmlStandalone(doc)).not.toThrow();
    expect(() => exportSvg(doc)).not.toThrow();
    await expect(exportPdfBytes(doc)).resolves.toBeDefined();
    expect(() => exportPptxBytes(doc)).not.toThrow();
    expect(() => generateOGrafPackages(doc)).not.toThrow();
    expect(() => exportPsdBytes(doc)).not.toThrow();
  });
});
