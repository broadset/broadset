import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';
import PizZip from 'pizzip';

import { exportPptxBytes, importPptx } from './pptx';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCanvas(overrides: Partial<Canvas> = {}): Canvas {
  return {
    width: 210,
    height: 118,
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    ...overrides,
  };
}

function makeStyle(overrides: Partial<BroadsetElementStyle> = {}): Partial<BroadsetElementStyle> {
  return { opacity: 1, ...overrides };
}

function makeElement(type: BroadsetElement['type'], overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    type,
    name: type,
    locked: false,
    visible: true,
    position: { x: 10, y: 10 },
    width: 100,
    height: 50,
    rotation: 0,
    style: makeStyle() as BroadsetElementStyle,
    content: '',
    ...overrides,
  } as BroadsetElement;
}

function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return {
    id: 'doc-1',
    name: 'Test Doc',
    canvas: makeCanvas(),
    elements: [],
    pages: [{ id: 'page-1', name: 'Page 1', overrides: [] }],
    animations: [],
    ...overrides,
  } as BroadsetDocument;
}

function getZipEntry(zip: PizZip, path: string): string {
  const file = zip.file(path);

  if (!file) {
    throw new Error(`Missing ZIP entry: ${path}`);
  }

  return file.asText();
}

/* ------------------------------------------------------------------ */
/*  Export Tests                                                       */
/* ------------------------------------------------------------------ */

describe('PPTX Export with SVG Picture Fallback', () => {
  /**
   * @description A rectangle with gradient background requires SVG picture fallback
   * because native PPTX shapes do not support CSS gradients. The exported slide
   * must contain SVG media with the correct content type registered.
   */
  it('exports styled rectangle with gradient as SVG picture fallback', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            backgroundGradient: {
              type: 'linear',
              angle: 90,
              stops: [
                { color: '#ff0000', position: 0 },
                { color: '#0000ff', position: 1 },
              ],
            },
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPptxBytes(doc);
    const zip = new PizZip(bytes);

    // Content_Types must register SVG media type
    const contentTypes = getZipEntry(zip, '[Content_Types].xml');

    expect(contentTypes).toContain('image/svg+xml');

    // At least one SVG media file should exist with gradient definition
    const svgFiles = zip.file(/\.svg$/);

    expect(svgFiles.length).toBeGreaterThan(0);

    const svgContent = svgFiles[0]?.asText() ?? '';

    expect(svgContent).toContain('linearGradient');
    expect(svgContent).toContain('#ff0000');
    expect(svgContent).toContain('#0000ff');
  });

  /**
   * @description A simple rectangle with only solid background MUST be exported
   * as a native PPTX shape without picture fallback for better PowerPoint compatibility.
   */
  it('exports simple rectangle as native PPTX shape', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({ backgroundColor: '#ff0000' }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPptxBytes(doc);
    const zip = new PizZip(bytes);

    // Slide should contain a native shape (sp element with solidFill)
    const slide = getZipEntry(zip, 'ppt/slides/slide1.xml');

    expect(slide).toContain('<a:solidFill');

    // No SVG fallback files for simple rectangles
    const svgFiles = zip.file(/ppt\/media\/.*\.svg$/);

    expect(svgFiles).toHaveLength(0);
  });

  /**
   * @description A rectangle with non-uniform corner radii cannot be represented
   * as a single native PPTX shape, so it MUST use SVG picture fallback.
   */
  it('exports non-uniform corner radii via SVG fallback', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#00ff00',
            borderRadius: [10, 0, 10, 0],
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPptxBytes(doc);
    const zip = new PizZip(bytes);

    const svgFiles = zip.file(/\.svg$/);

    expect(svgFiles.length).toBeGreaterThan(0);
  });
});

describe('PPTX Text, Image, and Group Export', () => {
  /**
   * @description The exporter must handle text content, image relationships,
   * and grouped children correctly in the PPTX OOXML structure.
   */
  it('exports text content, image relationships, and group hierarchy', () => {
    const groupEl = makeElement('group', { id: 'grp-1' });
    const childRect = makeElement('rectangle', {
      groupId: 'grp-1',
      style: makeStyle({ backgroundColor: '#0000ff' }) as BroadsetElementStyle,
    });

    const doc = makeDocument({
      elements: [
        makeElement('text', { content: 'Hello PPTX' }),
        makeElement('image', { content: 'data:image/png;base64,iVBORw0KGgo=' }),
        groupEl,
        childRect,
      ],
    });

    const bytes = exportPptxBytes(doc);
    const zip = new PizZip(bytes);
    const slide = getZipEntry(zip, 'ppt/slides/slide1.xml');

    // Text content
    expect(slide).toContain('Hello PPTX');

    // Image — should have a picture element with blip relationship
    expect(slide).toContain('<p:pic>');

    // Group — should have grpSp element
    expect(slide).toContain('grpSp');
  });

  /**
   * @description SVG elements with foreignObject content must preserve the
   * foreignObject fragment inside the exported SVG media.
   */
  it('preserves inline SVG with foreignObject in exported media', () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="50"><div>text</div></foreignObject></svg>';
    const doc = makeDocument({
      elements: [makeElement('svg', { content: svgContent })],
    });

    const bytes = exportPptxBytes(doc);
    const zip = new PizZip(bytes);

    // Find SVG media files and check for foreignObject
    const svgFiles = zip.file(/ppt\/media\/.*\.svg$/);

    expect(svgFiles.length).toBeGreaterThan(0);

    const svgText = svgFiles[0]?.asText() ?? '';

    expect(svgText).toContain('foreignObject');
  });
});

/* ------------------------------------------------------------------ */
/*  Import Tests                                                       */
/* ------------------------------------------------------------------ */

describe('PPTX Import with Path Recovery', () => {
  /**
   * @description Basic shapes (rectangle, text, image) exported to PPTX must be
   * recoverable on import, producing the correct element types.
   */
  it('recovers rectangle, text, and image from exported PPTX', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({ backgroundColor: '#ff0000' }) as BroadsetElementStyle,
        }),
        makeElement('text', { content: 'Test text' }),
        makeElement('image', { content: 'data:image/png;base64,iVBORw0KGgo=' }),
      ],
    });

    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.elements.length).toBeGreaterThanOrEqual(3);

    const types = imported.elements.map((el) => el.type);

    expect(types).toContain('rectangle');
    expect(types).toContain('text');
    expect(types).toContain('image');
  });

  /**
   * @description When SVG fallback media contains a single <path> element with
   * a 'd' attribute, the importer must recover it as a native path-type element
   * with the extracted d attribute and computed bounds.
   */
  it('recovers single-path SVG fallback as native path element', () => {
    // Create a document with a styled rectangle that will use SVG fallback
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            backgroundGradient: 'linear-gradient(90deg, #ff0000, #0000ff)',
          }) as BroadsetElementStyle,
          width: 100,
          height: 50,
        }),
      ],
    });

    // Export — styled rect uses SVG fallback
    const bytes = exportPptxBytes(doc);

    // Now manually create a PPTX with a simple single-path SVG for path recovery
    const zip = new PizZip(bytes);

    // Replace the SVG media with a simple single-path SVG
    const svgFiles = zip.file(/ppt\/media\/.*\.svg$/);

    if (svgFiles.length > 0 && svgFiles[0]) {
      const svgPath = svgFiles[0].name;

      zip.file(
        svgPath,
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path d="M0 0 L100 0 L100 50 L0 50 Z"/></svg>',
      );
    }

    const modifiedBytes = zip.generate({ type: 'uint8array' });
    const imported = importPptx(modifiedBytes);

    // Should have at least one path element recovered from the SVG fallback
    const pathElements = imported.elements.filter((el) => el.type === 'path');

    expect(pathElements.length).toBeGreaterThanOrEqual(1);

    if (pathElements[0]) {
      expect(pathElements[0].content).toContain('M');
    }
  });

  /**
   * @description When SVG fallback media contains multiple shapes or complex
   * content, the importer must preserve it as an SVG payload element rather
   * than attempting path recovery.
   */
  it('preserves complex SVG fallback as SVG payload element', () => {
    // Create a PPTX with complex SVG
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({
            backgroundColor: '#ff0000',
            backgroundGradient: 'linear-gradient(90deg, #ff0000, #0000ff)',
          }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPptxBytes(doc);
    const zip = new PizZip(bytes);

    // Replace SVG with complex multi-shape content
    const svgFiles = zip.file(/ppt\/media\/.*\.svg$/);

    if (svgFiles.length > 0 && svgFiles[0]) {
      const svgPath = svgFiles[0].name;

      zip.file(
        svgPath,
        '<svg xmlns="http://www.w3.org/2000/svg"><rect width="50" height="50"/><circle cx="75" cy="25" r="25"/></svg>',
      );
    }

    const modifiedBytes = zip.generate({ type: 'uint8array' });
    const imported = importPptx(modifiedBytes);

    // Complex SVG should be preserved as svg element type
    const svgElements = imported.elements.filter((el) => el.type === 'svg');

    expect(svgElements.length).toBeGreaterThanOrEqual(1);
  });
});

/* ------------------------------------------------------------------ */
/*  Round-Trip Tests                                                   */
/* ------------------------------------------------------------------ */

describe('PPTX Round-Trip Fidelity', () => {
  /**
   * @description Element count must be preserved across export→import round-trip.
   * The importer must produce the same number of elements as the original document.
   */
  it('preserves element count across round-trip', () => {
    const doc = makeDocument({
      elements: [
        makeElement('rectangle', {
          style: makeStyle({ backgroundColor: '#ff0000' }) as BroadsetElementStyle,
        }),
        makeElement('text', { content: 'Round-trip text' }),
        makeElement('rectangle', {
          style: makeStyle({ backgroundColor: '#00ff00' }) as BroadsetElementStyle,
        }),
      ],
    });

    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.elements.length).toBe(doc.elements.length);
  });

  /**
   * @description Rectangle position and dimensions must be within PPTX tolerance
   * (EMU rounding) across a round-trip. 1 EMU = 1/914400 inch = 1/36000 mm.
   * Tolerance: ±1 mm accounting for EMU quantization.
   */
  it('preserves rectangle position and dimensions within tolerance', () => {
    const rect = makeElement('rectangle', {
      position: { x: 25.4, y: 12.7 },
      width: 76.2,
      height: 50.8,
      style: makeStyle({ backgroundColor: '#ff0000' }) as BroadsetElementStyle,
    });

    const doc = makeDocument({ elements: [rect] });
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.elements.length).toBeGreaterThanOrEqual(1);

    const importedRect = imported.elements[0];

    if (!importedRect) {
      throw new Error('Expected at least one imported element');
    }

    // Tolerance of 1mm for EMU quantization
    expect(importedRect.position.x).toBeCloseTo(25.4, 0);
    expect(importedRect.position.y).toBeCloseTo(12.7, 0);
    expect(importedRect.width).toBeCloseTo(76.2, 0);
    expect(importedRect.height).toBeCloseTo(50.8, 0);
  });

  /**
   * @description Text content must be preserved exactly across a round-trip.
   */
  it('preserves text content across round-trip', () => {
    const doc = makeDocument({
      elements: [makeElement('text', { content: 'Hello World' })],
    });

    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    const textElements = imported.elements.filter((el) => el.type === 'text');

    expect(textElements.length).toBeGreaterThanOrEqual(1);

    if (textElements[0]) {
      expect(textElements[0].content).toBe('Hello World');
    }
  });
});
