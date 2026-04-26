import { describe, expect, it } from 'vitest';

import { importPptx } from '../import';
import {
  canvaFixture,
  googleSlidesFixture,
  keynoteFixture,
  libreofficeFixture,
  powerpointFixture,
} from './external-tools';

/**
 * @description External-tool fixture suite. Synthesized `.pptx` files
 * that represent each tool's characteristic output quirks feed the
 * importer to prove arbitrary third-party handling. Real `.pptx`
 * golden files from PowerPoint / Keynote / Google Slides / LibreOffice
 * / Canva typically require corporate licenses and fonts the repo
 * cannot ship — the synthesized fixtures exercise the same code paths
 * without that baggage.
 */
describe('external-tool fixtures', () => {
  /**
   * @description Title placeholder defined on layout — verifies that
   * font-family / size / colour cascade from layout `<a:rPr>` onto the
   * slide-level title even though the slide's own `<a:rPr>` is empty.
   * Also confirms the rectangle's hex fill survives.
   */
  it('imports the PowerPoint canonical fixture with placeholder inheritance', () => {
    const doc = importPptx(powerpointFixture());

    const title = doc.elements.find((el) => el.type === 'text');
    const rect = doc.elements.find((el) => el.type === 'rectangle');
    const ellipse = doc.elements.find((el) => el.type === 'ellipse');

    expect(title?.content).toBe('Quarterly results');
    expect(title?.style.fontFamily).toBe('Calibri');
    expect(title?.style.fontSize).toBe(40);

    const rectFill = rect?.style.fill;

    if (rectFill?.kind === 'solid' && rectFill.color.kind === 'rgb') {
      expect(rectFill.color.hex.toUpperCase()).toBe('#4472C4');
    } else {
      throw new Error('expected solid rgb fill on rectangle');
    }

    expect(ellipse).toBeDefined();
  });

  /**
   * @description Keynote characteristically renders shapes that
   * PowerPoint encodes as presets (e.g. rectangle) using `<a:custGeom>`
   * instead. The importer MUST recover them as native `path` elements
   * with a real SVG `d` (M…Z), not just "starts with M".
   */
  it('imports the Keynote fixture (custGeom shape with no extLst)', () => {
    const doc = importPptx(keynoteFixture());

    const path = doc.elements.find((el) => el.type === 'path');
    const d = typeof path?.content === 'string' ? path.content : '';

    expect(d).toMatch(/^M/);
    expect(d).toContain('L');
    expect(d.toUpperCase()).toContain('Z');

    const fill = path?.style.fill;

    if (fill?.kind === 'solid' && fill.color.kind === 'rgb') {
      expect(fill.color.hex.toUpperCase()).toBe('#00C49F');
    } else {
      throw new Error('expected solid rgb fill on Keynote path');
    }
  });

  /**
   * @description Google Slides emits empty `name=""` on every shape.
   * The importer MUST NOT confuse that for an existing BSET tag and
   * MUST still recover both shapes with their fills intact.
   */
  it('imports the Google Slides fixture (minimal master, no names)', () => {
    const doc = importPptx(googleSlidesFixture());

    const rect = doc.elements.find((el) => el.type === 'rectangle');
    const ellipse = doc.elements.find((el) => el.type === 'ellipse');

    // Google Slides empty `name=""` means our BSET decoder rejects the
    // tag → element id falls back to the synthesized counter and name
    // is empty rather than carrying a stale BSET prefix.
    expect(rect?.name).toBe('');
    expect(ellipse?.name).toBe('');

    const rectFill = rect?.style.fill;

    if (rectFill?.kind === 'solid' && rectFill.color.kind === 'rgb') {
      expect(rectFill.color.hex.toUpperCase()).toBe('#FF5722');
    } else {
      throw new Error('expected solid rgb fill on Google Slides rectangle');
    }
  });

  /**
   * @description LibreOffice rewrites shape names to generic `Rectangle
   * N` per slide. The importer MUST land 3 pages, each with its
   * matching rectangle and the per-slide fill colour distinct.
   */
  it('imports the LibreOffice Impress fixture (3 slides, 3 rectangles)', () => {
    const doc = importPptx(libreofficeFixture());

    expect(doc.pages).toHaveLength(3);

    const rectangles = doc.elements.filter((el) => el.type === 'rectangle');

    expect(rectangles).toHaveLength(3);

    const fills = rectangles
      .map((r) => r.style.fill)
      .map((f) => (f.kind === 'solid' && f.color.kind === 'rgb' ? f.color.hex.toUpperCase() : null));

    expect(fills).toEqual(['#FF0000', '#00FF00', '#0000FF']);
  });

  /**
   * @description Canva flattens authored shapes to a picture. The
   * importer MUST resolve the `<a:blipFill>` r:embed to an inline
   * data: URI (no external fetch), preserve the EMU dimensions as
   * canvas-unit width/height, and detect the PNG mime correctly.
   */
  it('imports the Canva fixture (picture with embedded PNG)', () => {
    const doc = importPptx(canvaFixture());
    const image = doc.elements.find((el) => el.type === 'image');
    const content = image?.content;

    expect(typeof content).toBe('string');

    if (typeof content === 'string') {
      expect(content.startsWith('data:image/png;base64,')).toBe(true);

      // Decode the base64 portion to confirm we have a real PNG header
      // (89 50 4E 47) — the importer must round-trip the bytes
      // unchanged, not transcode.
      const base64 = content.slice('data:image/png;base64,'.length);
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

      expect(bytes[0]).toBe(0x89);
      expect(bytes[1]).toBe(0x50);
      expect(bytes[2]).toBe(0x4e);
      expect(bytes[3]).toBe(0x47);
    }

    // 3,000,000 EMU = 83.33 mm; 1,500,000 EMU = 41.67 mm. Operator-
    // level resolves to mm (no preserved canvas in the package).
    expect(image?.width).toBeCloseTo(83.33, 1);
    expect(image?.height).toBeCloseTo(41.67, 1);
  });
});
