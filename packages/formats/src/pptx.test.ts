import type { AnimationRegistryEntry, BroadsetDocument, BroadsetElement, PageElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';
import PizZip from 'pizzip';

import { exportPptx, importPptx } from './pptx';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** @description Converts a BroadsetElement to a PageElement for document assembly. */
function toPageElement(el: BroadsetElement): PageElement {
  return {
    id: el.id,
    type: el.type,
    position: el.position,
    width: el.width,
    height: el.height,
    rotation: el.rotation,
    content: el.content,
    parentId: el.parentId,
    groupId: el.groupId,
    screen: el.screen as unknown as Record<string, unknown>,
    style: el.style as unknown as Record<string, unknown>,
  };
}

/** @description Creates a minimal valid BroadsetDocument for testing. */
function makeDoc(
  elements: readonly BroadsetElement[],
  animationRegistry: readonly AnimationRegistryEntry[] = [],
): BroadsetDocument {
  return {
    id: 'doc-1',
    documentMode: 'print',
    canvas: { width: 210, height: 118, padding: [0, 0, 0, 0] },
    pages: [{ id: 'page-1', elements: elements.map(toPageElement) }],
    animationRegistry,
  };
}

/**
 * @description Reads XML content from a ZipObject, handling both string
 * and binary representations consistently.
 */
function zipEntryText(zip: PizZip, path: string): string {
  const entry = zip.file(path);

  if (!entry) {
    throw new Error(`Missing zip entry: ${path}`);
  }

  return entry.asText();
}

// ===========================================================================
// PPTX Export — SVG Picture Fallback
// ===========================================================================

describe('PPTX Export — SVG Picture Fallback', () => {
  /**
   * @description A rectangle with a gradient background is a "styled"
   * rectangle that cannot be represented as a native PPTX shape. The
   * exporter MUST use SVG picture media as a fallback with the correct
   * content type registered in [Content_Types].xml.
   */
  it('uses SVG media for rectangle with gradient background', async () => {
    const el = createDefaultElement('rectangle', {
      id: 'rect-gradient',
      width: 100,
      height: 60,
      position: { x: 10, y: 20 },
    });
    const styledEl: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundGradient: 'linear-gradient(90deg, red, blue)' },
    };
    const doc = makeDoc([styledEl]);
    const blob = await exportPptx(doc);

    expect(blob).toBeInstanceOf(Uint8Array);

    const zip = new PizZip(blob);

    // Content types must register SVG extension
    const contentTypes = zipEntryText(zip, '[Content_Types].xml');

    expect(contentTypes).toContain('svg');

    // Slide XML must reference picture media
    const slide = zipEntryText(zip, 'ppt/slides/slide1.xml');

    expect(slide).toContain('pic:pic');
  });

  /**
   * @description A simple rectangle with only a solid background MUST
   * be exported as a native PPTX shape (sp:sp), not as SVG picture
   * fallback. This ensures maximum compatibility with PowerPoint.
   */
  it('uses native shape for rectangle with only solid background', async () => {
    const el = createDefaultElement('rectangle', {
      id: 'rect-simple',
      width: 100,
      height: 60,
      position: { x: 10, y: 20 },
    });
    const styledEl: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundColor: '#ff0000' },
    };
    const doc = makeDoc([styledEl]);
    const blob = await exportPptx(doc);

    const zip = new PizZip(blob);
    const slide = zipEntryText(zip, 'ppt/slides/slide1.xml');

    // Must contain native shape
    expect(slide).toContain('p:sp');

    // Should NOT contain picture fallback for this element
    // (Unless there are other elements needing it)
    expect(slide).not.toContain('pic:pic');
  });

  /**
   * @description Non-uniform corner radii (per-corner values) cannot be
   * represented as a native PPTX shape, so the exporter MUST fall back
   * to SVG picture media.
   */
  it('uses SVG fallback for rectangle with non-uniform border radii', async () => {
    const el = createDefaultElement('rectangle', {
      id: 'rect-radii',
      width: 80,
      height: 40,
    });
    const styledEl: BroadsetElement = {
      ...el,
      style: { ...el.style, borderRadius: [10, 20, 30, 40] as [number, number, number, number] },
    };
    const doc = makeDoc([styledEl]);
    const blob = await exportPptx(doc);

    const zip = new PizZip(blob);
    const slide = zipEntryText(zip, 'ppt/slides/slide1.xml');

    expect(slide).toContain('pic:pic');
  });
});

// ===========================================================================
// PPTX Export — Text, Image, and Group
// ===========================================================================

describe('PPTX Export — Text, Image, and Group', () => {
  /**
   * @description A document with text, image, and grouped elements MUST
   * be exported with text content, image relationships, and group
   * hierarchy present in the slide XML.
   */
  it('exports text content, image relationships, and group hierarchy', async () => {
    const group = createDefaultElement('group', { id: 'group-1', width: 200, height: 200 });
    const child = createDefaultElement('rectangle', {
      id: 'child-1',
      width: 50,
      height: 50,
      parentId: 'group-1',
      groupId: 'group-1',
    });
    const textEl = createDefaultElement('text', { id: 'txt-1', content: 'Hello PPTX' });
    const imgEl = createDefaultElement('image', {
      id: 'img-1',
      content:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });

    const doc = makeDoc([group, child, textEl, imgEl]);
    const blob = await exportPptx(doc);
    const zip = new PizZip(blob);
    const slide = zipEntryText(zip, 'ppt/slides/slide1.xml');

    // Text content present
    expect(slide).toContain('Hello PPTX');

    // Image relationship present (rId reference in slide)
    expect(slide).toContain('r:embed');

    // Group hierarchy present
    expect(slide).toContain('p:grpSp');
  });

  /**
   * @description An SVG element with foreignObject content MUST have the
   * SVG media contain the foreignObject fragment, so that complex HTML
   * content embedded in SVG is preserved.
   */
  it('preserves SVG with foreignObject in exported media', async () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<foreignObject width="100" height="100"><div>HTML content</div></foreignObject>' +
      '</svg>';
    const svgEl = createDefaultElement('svg', {
      id: 'svg-fo',
      content: svgContent,
      width: 100,
      height: 100,
    });
    const doc = makeDoc([svgEl]);
    const blob = await exportPptx(doc);
    const zip = new PizZip(blob);

    // Find the SVG media file in the zip
    const svgFiles = zip.file(/\.svg$/);

    expect(svgFiles.length).toBeGreaterThan(0);

    const firstSvg = svgFiles[0];

    expect(firstSvg).toBeDefined();

    const svgMediaContent = firstSvg?.asText() ?? '';

    expect(svgMediaContent).toContain('foreignObject');
  });
});

// ===========================================================================
// PPTX Import — Path Recovery
// ===========================================================================

describe('PPTX Import — Path Recovery', () => {
  /**
   * @description Given an exported PPTX with rectangle, text, and image,
   * importing it MUST recover all three element types.
   */
  it('recovers rectangle, text, and image element types', async () => {
    const rectEl = createDefaultElement('rectangle', { id: 'rect-1', width: 100, height: 60 });
    const styledRect: BroadsetElement = {
      ...rectEl,
      style: { ...rectEl.style, backgroundColor: '#00ff00' },
    };
    const textEl = createDefaultElement('text', { id: 'txt-1', content: 'Import test' });
    const imgEl = createDefaultElement('image', {
      id: 'img-1',
      content:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });

    const exported = await exportPptx(makeDoc([styledRect, textEl, imgEl]));
    const imported = importPptx(exported);

    const types = imported.map((el) => el.type);

    expect(types).toContain('rectangle');
    expect(types).toContain('text');
    expect(types).toContain('image');
  });

  /**
   * @description SVG fallback media containing a single simple path element
   * MUST be recovered as a native path-type element with the extracted d
   * attribute and computed bounds.
   */
  it('recovers single-path SVG as native path element', async () => {
    const pathContent = 'M10,10 L90,10 L90,90 L10,90 Z';
    const pathEl = createDefaultElement('path', { id: 'path-1', content: pathContent });
    const doc = makeDoc([pathEl]);
    const exported = await exportPptx(doc);
    const imported = importPptx(exported);

    const recoveredPath = imported.find((el) => el.type === 'path');

    expect(recoveredPath).toBeDefined();

    if (!recoveredPath) throw new Error('path not found');

    expect(recoveredPath.content).toContain('M');
    expect(recoveredPath.content).toContain('L');
  });

  /**
   * @description SVG fallback with complex/ambiguous structure (multiple
   * shapes, foreign objects) MUST be preserved as an SVG payload type
   * rather than attempting path recovery.
   */
  it('preserves complex SVG as svg payload type', async () => {
    const svgContent =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
      '<rect x="0" y="0" width="50" height="50" fill="red"/>' +
      '<circle cx="75" cy="75" r="25" fill="blue"/>' +
      '</svg>';
    const svgEl = createDefaultElement('svg', {
      id: 'svg-complex',
      content: svgContent,
      width: 100,
      height: 100,
    });
    const doc = makeDoc([svgEl]);
    const exported = await exportPptx(doc);
    const imported = importPptx(exported);

    const recoveredSvg = imported.find((el) => el.type === 'svg');

    expect(recoveredSvg).toBeDefined();

    if (!recoveredSvg) throw new Error('svg not found');

    expect(recoveredSvg.content).toContain('<rect');
    expect(recoveredSvg.content).toContain('<circle');
  });
});

// ===========================================================================
// PPTX Round-Trip Fidelity
// ===========================================================================

describe('PPTX Round-Trip Fidelity', () => {
  /**
   * @description Element count MUST be preserved across export→import.
   * A document with N elements should produce exactly N recovered elements.
   */
  it('preserves element count across round-trip', async () => {
    const elements: BroadsetElement[] = [
      createDefaultElement('rectangle', { id: 'r1', width: 100, height: 60 }),
      createDefaultElement('text', { id: 't1', content: 'abc' }),
      createDefaultElement('image', {
        id: 'i1',
        content:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      }),
    ];
    // Apply solid bg to rectangle so it becomes native shape (recoverable)
    const styledElements = elements.map((el) =>
      el.type === 'rectangle' ? { ...el, style: { ...el.style, backgroundColor: '#cccccc' } } : el,
    );
    const exported = await exportPptx(makeDoc(styledElements));
    const imported = importPptx(exported);

    expect(imported.length).toBe(styledElements.length);
  });

  /**
   * @description Rectangle position and dimensions MUST be within PPTX
   * tolerance after round-trip. PPTX uses EMU (English Metric Units,
   * 914400 EMUs per inch) which introduces rounding. Tolerance ≤ 1mm.
   */
  it('preserves rectangle position within tolerance', async () => {
    const el = createDefaultElement('rectangle', {
      id: 'rect-pos',
      width: 120,
      height: 80,
      position: { x: 25, y: 35 },
    });
    const styledEl: BroadsetElement = {
      ...el,
      style: { ...el.style, backgroundColor: '#aabbcc' },
    };
    const exported = await exportPptx(makeDoc([styledEl]));
    const imported = importPptx(exported);

    const rect = imported.find((e) => e.type === 'rectangle');

    expect(rect).toBeDefined();

    if (!rect) throw new Error('rectangle not found');

    const TOLERANCE_MM = 1;

    expect(Math.abs(rect.position.x - 25)).toBeLessThanOrEqual(TOLERANCE_MM);
    expect(Math.abs(rect.position.y - 35)).toBeLessThanOrEqual(TOLERANCE_MM);
    expect(Math.abs(rect.width - 120)).toBeLessThanOrEqual(TOLERANCE_MM);
    expect(Math.abs(rect.height - 80)).toBeLessThanOrEqual(TOLERANCE_MM);
  });

  /**
   * @description Text content MUST be preserved exactly across round-trip.
   * The text string exported must match the text string recovered on import.
   */
  it('preserves text content across round-trip', async () => {
    const textEl = createDefaultElement('text', {
      id: 'txt-rt',
      content: 'Round-trip text content',
    });
    const exported = await exportPptx(makeDoc([textEl]));
    const imported = importPptx(exported);

    const text = imported.find((e) => e.type === 'text');

    expect(text).toBeDefined();

    if (!text) throw new Error('text not found');

    expect(text.content).toBe('Round-trip text content');
  });
});
