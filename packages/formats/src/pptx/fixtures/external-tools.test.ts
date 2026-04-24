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
  it('imports the PowerPoint canonical fixture with placeholder inheritance', () => {
    const doc = importPptx(powerpointFixture());

    const title = doc.elements.find((el) => el.type === 'text');
    const rect = doc.elements.find((el) => el.type === 'rectangle');
    const ellipse = doc.elements.find((el) => el.type === 'ellipse');

    expect(title?.content).toBe('Quarterly results');
    expect(title?.style.fontFamily).toBe('Calibri');
    expect(title?.style.fontSize).toBe(40);
    expect(rect).toBeDefined();
    expect(ellipse).toBeDefined();
  });

  it('imports the Keynote fixture (custGeom shape with no extLst)', () => {
    const doc = importPptx(keynoteFixture());

    const path = doc.elements.find((el) => el.type === 'path');

    expect(path).toBeDefined();
    expect(path?.content).toMatch(/^M/);
  });

  it('imports the Google Slides fixture (minimal master, no names)', () => {
    const doc = importPptx(googleSlidesFixture());

    const rect = doc.elements.find((el) => el.type === 'rectangle');
    const ellipse = doc.elements.find((el) => el.type === 'ellipse');

    expect(rect).toBeDefined();
    expect(ellipse).toBeDefined();
  });

  it('imports the LibreOffice Impress fixture (3 slides, 3 rectangles)', () => {
    const doc = importPptx(libreofficeFixture());

    expect(doc.pages).toHaveLength(3);
    expect(doc.elements.filter((el) => el.type === 'rectangle')).toHaveLength(3);
  });

  it('imports the Canva fixture (picture with embedded PNG)', () => {
    const doc = importPptx(canvaFixture());
    const image = doc.elements.find((el) => el.type === 'image');

    expect(image).toBeDefined();
    expect(image?.content).toMatch(/^data:image\/png;base64,/);
  });
});
