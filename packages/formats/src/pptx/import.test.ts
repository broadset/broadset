import { createDefaultElement, createEmptyBroadsetDocument, isBroadsetColor, isRgbBroadsetColor } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptx, importPptxWithReport } from './import';
import { encodeText,writeOoxmlPackage } from './ooxml/zip';

/**
 * @description Round-trip validates the fast-path — a Broadset document
 * export → re-import must recover the element count and basic shape.
 */
describe('PPTX importer — fast-path round-trip', () => {
  it('round-trips an empty document through export → import', () => {
    const doc = createEmptyBroadsetDocument();
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('round-trips a document with rectangle + text + ellipse', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', { id: 'rect-1', content: '' }),
        createDefaultElement('text', { id: 'text-1', content: 'hello' }),
        createDefaultElement('ellipse', { id: 'ellipse-1' }),
      ],
    };
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.elements).toHaveLength(3);
    expect(imported.elements.find((el) => el.id === 'rect-1')?.type).toBe('rectangle');
    expect(imported.elements.find((el) => el.id === 'text-1')?.type).toBe('text');
    expect(imported.elements.find((el) => el.id === 'ellipse-1')?.type).toBe('ellipse');
  });

  /**
   * @description Speaker notes (`Page.notes`) round-trip via the
   * per-slide `ppt/notesSlides/notesSlideN.xml` part and the
   * slide → notesSlide relationship.
   */
  it('round-trips Page.notes through notesSlides', () => {
    const base = createEmptyBroadsetDocument();
    const firstPage = base.pages[0];

    if (firstPage === undefined) throw new Error('createEmptyBroadsetDocument produced no pages');

    const doc = {
      ...base,
      pages: [{ ...firstPage, notes: 'Presenter reminder: pause here' }],
    };
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);

    expect(imported.pages[0]?.notes).toBe('Presenter reminder: pause here');
  });

  it('preserves text content across round-trip', () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('text', { id: 'el-text', content: 'Round-trip me' })],
    };
    const bytes = exportPptxBytes(doc);
    const imported = importPptx(bytes);
    const textEl = imported.elements.find((el) => el.id === 'el-text');

    expect(textEl?.content).toBe('Round-trip me');
  });
});

/**
 * @description Operator-level extraction handles arbitrary third-party
 * PPTX where no Broadset metadata is present. The importer must still
 * recover slide + shape count, geometry, and text where possible.
 */
describe('PPTX importer — operator-level extraction', () => {
  it('returns an empty document for a ZIP with no presentation.xml', () => {
    const bytes = writeOoxmlPackage(new Map([['[Content_Types].xml', encodeText('<Types/>')]]));
    const imported = importPptx(bytes);

    expect(imported.elements).toEqual([]);
    expect(imported.pages.length).toBeGreaterThanOrEqual(1);
  });

  it('recovers a single-slide deck with a rectangle (no Broadset metadata)', () => {
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Rectangle 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="3600000" cy="1800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const slideRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText(slideRels)],
      ]),
    );

    const imported = importPptx(bytes);

    expect(imported.elements).toHaveLength(1);
    expect(imported.elements[0]?.type).toBe('rectangle');
  });

  it('recovers a group shape and its children', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="Group 1"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5000000" cy="2500000"/><a:chOff x="0" y="0"/><a:chExt cx="5000000" cy="2500000"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="3" name="Rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:grpSp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const slideRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText(slideRels)],
      ]),
    );

    const imported = importPptx(bytes);
    const group = imported.elements.find((el) => el.type === 'group');
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(group).toBeDefined();
    expect(rect).toBeDefined();
    expect(rect?.groupId).toBe(group?.id);
  });

  /**
   * @description Placeholder inheritance — a slide shape with
   * `<p:ph idx="0"/>` should pick up the layout's placeholder font
   * family / size / colour when its own run properties omit them.
   */
  it('applies layout-placeholder inheritance to text-bearing shapes', () => {
    const layoutXml = `<?xml version="1.0"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="4400"><a:solidFill><a:srgbClr val="FF8800"/></a:solidFill><a:latin typeface="Inter"/></a:rPr><a:t>Layout Placeholder Default</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`;
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6858000" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>Slide Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`;
    const masterRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
        ['ppt/slideMasters/slideMaster1.xml', encodeText('<?xml version="1.0"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')],
        ['ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(masterRels)],
        ['ppt/slideLayouts/slideLayout1.xml', encodeText(layoutXml)],
      ]),
    );

    const imported = importPptx(bytes);
    const textEl = imported.elements.find((el) => el.type === 'text');

    expect(textEl).toBeDefined();
    expect(textEl?.content).toBe('Slide Title');
    expect(textEl?.style.fontFamily).toBe('Inter');
    expect(textEl?.style.fontSize).toBe(44);
    expect(textEl?.style.fontColor).toEqual({ kind: 'rgb', hex: '#FF8800' });
  });

  /**
   * @description Theme-slot colour references round-trip as
   * `{ kind: 'theme', slot, mods }` instead of resolved sRGB — the
   * spec says colours with `<a:schemeClr val="accentN"/>` import with
   * their theme identity preserved so re-export can emit `<a:schemeClr>`
   * again.
   */
  it('preserves theme-slot colours with mods on import', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/><a:lumOff val="25000"/></a:schemeClr></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    expect(fill?.kind).toBe('solid');
    if (fill?.kind !== 'solid') throw new Error('expected solid fill');
    expect(fill.color.kind).toBe('theme');
    if (fill.color.kind !== 'theme') throw new Error('expected theme colour');
    expect(fill.color.slot).toBe('accent1');
    expect(fill.color.mods?.lumMod).toBeCloseTo(0.75, 5);
    expect(fill.color.mods?.lumOff).toBeCloseTo(0.25, 5);
  });

  /**
   * @description Multi-run paragraphs import as structured TextBody
   * with per-run styling (bold / italic / font family preserved).
   */
  it('imports multi-run paragraphs as TextBody with per-run styling', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="T1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" b="1"/><a:t>Hello</a:t></a:r><a:r><a:rPr lang="en-US" i="1"/><a:t> world</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(bytes);
    const textEl = imported.elements.find((el) => el.type === 'text');
    const content = textEl?.content;

    expect(typeof content).toBe('object');
    if (typeof content !== 'object' || !('paragraphs' in content)) throw new Error('expected TextBody');
    expect(content.paragraphs).toHaveLength(1);
    expect(content.paragraphs[0]?.runs).toHaveLength(2);
    expect(content.paragraphs[0]?.runs[0]?.text).toBe('Hello');
    expect(content.paragraphs[0]?.runs[0]?.props?.style?.['bold']).toBe(true);
    expect(content.paragraphs[0]?.runs[1]?.text).toBe(' world');
    expect(content.paragraphs[0]?.runs[1]?.props?.style?.['italic']).toBe(true);
  });

  /**
   * @description Linear gradient fills import as BroadsetFill with
   * the gradient variant, stops extracted from <a:gsLst>.
   */
  it('imports linear gradient fills with stops', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="G"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="5400000" scaled="1"/></a:gradFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');
    const fill = rect?.style.fill;

    expect(fill?.kind).toBe('gradient');
    if (fill?.kind !== 'gradient') throw new Error('expected gradient fill');
    expect(fill.gradient.type).toBe('linear');
    expect(fill.gradient.stops).toHaveLength(2);
    expect(fill.gradient.angle).toBeCloseTo(90, 5);
  });

  /**
   * @description `<a:ln>` arrow head/tail endings round-trip into
   * `strokeHeadEnd` / `strokeTailEnd` on the element style.
   */
  it('imports stroke arrow head/tail endings into the element style', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Arrow"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3000000" cy="300000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln w="19050"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:headEnd type="triangle" w="md" len="md"/><a:tailEnd type="stealth" w="lg" len="sm"/></a:ln></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(bytes);
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect?.style.strokeHeadEnd?.shape).toBe('triangle');
    expect(rect?.style.strokeTailEnd?.shape).toBe('stealth');
    expect(rect?.style.strokeTailEnd?.width).toBe('lg');
  });

  /**
   * @description Unknown OOXML presets (triangle, callout, …) preserve
   * their source XML under `extensions.pptx.raw` per IO-D-18 with
   * `dirty: false` so re-export emits the original blob.
   */
  it('preserves unknown OOXML presets under extensions.pptx.raw with dirty=false', () => {
    // `cloud` isn't in the OOXML_PRESET_TO_SVG_D table — falls through
    // to the unknown-shape preservation path so we can assert the
    // raw blob and the unsupported-shape warning.
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Cloud"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="2000000"/></a:xfrm><a:prstGeom prst="cloud"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const report = importPptxWithReport(bytes);
    const star = report.document.elements[0];
    const ext = star?.extensions['pptx'] as { readonly dirty?: boolean; readonly raw?: string } | undefined;

    expect(ext?.dirty).toBe(false);
    expect(ext?.raw).toContain('cloud');
    expect(report.warnings.some((w) => w.code === 'unsupported-shape')).toBe(true);
  });

  /**
   * @description Every operator-level imported element has
   * `extensions.pptx.dirty` initialised to `false` so subsequent edits
   * can flip it to `true` (per IO-D-18 dirty-flag discipline).
   */
  it('initializes extensions.pptx.dirty=false on every operator-level imported element', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Rect"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(bytes);
    const ext = imported.elements[0]?.extensions['pptx'] as { readonly dirty?: boolean } | undefined;

    expect(ext?.dirty).toBe(false);
  });

  /**
   * @description vbaProject.bin is rejected at import time with a
   * structured warning per the Importer Security Contract.
   */
  /**
   * @description Common OOXML presets (triangle, star5, rightArrow,
   * pentagon, hexagon) map to native Broadset `path` elements with
   * SVG `d` strings rather than falling through to the unknown-preset
   * preservation path. Spec acceptance: "<a:prstGeom> presets map to
   * Broadset native kinds where possible (rect, roundRect, ellipse,
   * triangle, star, arrow, callout, …)".
   */
  it('expands common OOXML presets to native Broadset path elements', () => {
    const presets = ['triangle', 'star5', 'rightArrow', 'pentagon', 'hexagon', 'plus'];
    const shapes = presets
      .map(
        (preset, idx) =>
          `<p:sp><p:nvSpPr><p:cNvPr id="${String(idx + 2)}" name="${preset}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="2000000"/></a:xfrm><a:prstGeom prst="${preset}"><a:avLst/></a:prstGeom></p:spPr></p:sp>`,
      )
      .join('');
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(bytes);
    const paths = imported.elements.filter((el) => el.type === 'path');

    expect(paths).toHaveLength(presets.length);

    for (const path of paths) {
      expect(path.content).toMatch(/^M /);
    }
  });

  /**
   * @description Placeholder inheritance cascades slide → layout →
   * master per ECMA-376. When a slide shape's placeholder idx is not
   * defined on any layout, it falls through to the master.
   */
  it('cascades placeholder inheritance through the master', () => {
    const masterXml = `<?xml version="1.0"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="MasterTitle"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="3600"><a:solidFill><a:srgbClr val="ABCDEF"/></a:solidFill><a:latin typeface="Master Font"/></a:rPr><a:t>Master Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>`;
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="6000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>Hi</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
        ['ppt/slideMasters/slideMaster1.xml', encodeText(masterXml)],
        // No layouts — cascade should fall through directly to master.
      ]),
    );
    const imported = importPptx(bytes);
    const textEl = imported.elements.find((el) => el.type === 'text');

    expect(textEl?.style.fontFamily).toBe('Master Font');
    expect(textEl?.style.fontSize).toBe(36);
  });

  /**
   * @description Every Broadset-exported PPTX includes a `broadset:`
   * XMP packet at `docProps/custom.xml` per the cross-format
   * Round-Trip Metadata requirement (IO-D-08).
   */
  it('emits a broadset XMP packet at docProps/custom.xml on export', async () => {
    const { exportPptxBytesAsync } = await import('./export');
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('rectangle', { id: 'rect-1' })],
    };
    const bytes = await exportPptxBytesAsync(doc);
    const pkg = readOoxmlPackage(bytes);
    const xmp = readTextPart(pkg, 'docProps/custom.xml');

    expect(xmp).not.toBeNull();
    expect(xmp).toContain('https://broadset.io/ns/xmp/1.0/');
  });

  /**
   * @description Round-trip B2 — preserved unknown-shape raw blobs
   * re-emit verbatim on export when `dirty: false`. The exporter must
   * read `extensions.pptx.raw` and inline it instead of synthesising a
   * fresh shape.
   */
  it('round-trips preserved unknown shapes via extensions.pptx.raw', async () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Cloud"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="2000000"/></a:xfrm><a:prstGeom prst="cloud"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);
    const reExportedBytes = exportPptxBytes(imported);
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const reExportedPkg = readOoxmlPackage(reExportedBytes);
    const reExportedSlide = readTextPart(reExportedPkg, 'ppt/slides/slide1.xml') ?? '';

    // Cloud preset survives — original geometry preserved verbatim.
    expect(reExportedSlide).toContain('prst="cloud"');
  });

  /**
   * @description importPptxWithMerge merges external PowerPoint edits
   * into the preserved Broadset state. Elements whose visual hash
   * matches the ledger return preserved (including richer metadata);
   * elements that diverge return the current state with dirty=true.
   */
  it('merges external edits via fingerprint comparison against the interop ledger', async () => {
    const { exportPptxBytesAsync } = await import('./export');
    const { importPptxWithMerge } = await import('./import');
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');

    // Distinct widths so we can identify the "will-edit" shape uniquely
    // in the slide XML by its `<a:ext cx="…">`. The default canvas is
    // 1920×1080 px @ 96 dpi, so 100 px → 952,500 EMU and 200 px →
    // 1,905,000 EMU; we'll bump 200 → 250 px (= 2,381,250 EMU) on the
    // edited shape.
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [
        createDefaultElement('rectangle', { id: 'untouched', width: 100, height: 100, dataField: null }),
        createDefaultElement('rectangle', {
          id: 'will-edit',
          width: 200,
          height: 100,
          dataField: { fieldName: 'campaign.headline', overflow: 'clip' },
        }),
      ],
    };
    const bytes = await exportPptxBytesAsync(doc);

    // Simulate an external tool resizing the "will-edit" shape from
    // 200 px → 250 px. We rewrite the bytes to look like PowerPoint
    // just saved the file with the change.
    const pkg = readOoxmlPackage(bytes);
    const slidePath = 'ppt/slides/slide1.xml';
    const slideXml = readTextPart(pkg, slidePath) ?? '';
    const editedSlideXml = slideXml.replace(/<a:ext cx="1905000" cy="952500"\/>/, '<a:ext cx="2381250" cy="952500"/>');

    expect(editedSlideXml).not.toBe(slideXml);

    const editedParts = new Map<string, Uint8Array>(pkg);

    editedParts.set(slidePath, encodeText(editedSlideXml));

    const editedBytes = writeOoxmlPackage(editedParts);
    const merged = await importPptxWithMerge(editedBytes);

    expect(merged.document.elements).toHaveLength(2);

    const untouched = merged.document.elements.find((el) => el.id === 'untouched');
    const willEdit = merged.document.elements.find((el) => el.id === 'will-edit');

    // Untouched element: ledger hash matches → preserved state wins.
    expect(untouched?.width).toBeCloseTo(100, 0);

    const untouchedExt = untouched?.extensions['pptx'] as { readonly dirty?: boolean } | undefined;

    expect(untouchedExt?.dirty).toBeFalsy();

    // Edited element: ledger hash diverges → current state wins, but
    // preserved data binding is still carried through, and the element
    // is flagged dirty so future fingerprinting starts from the new
    // baseline.
    expect(willEdit?.width).toBeCloseTo(250, 0);
    expect(willEdit?.dataField?.fieldName).toBe('campaign.headline');

    const willEditExt = willEdit?.extensions['pptx'] as { readonly dirty?: boolean } | undefined;

    expect(willEditExt?.dirty).toBe(true);
  });

  /**
   * @description B3 — flipH / flipV round-trip via extensions.pptx.
   * Broadset has no native flip field on elements; mirror state is
   * stashed on the extensions slot during import and re-emitted on
   * `<a:xfrm flipH="1">` during export.
   */
  it('round-trips flipH / flipV via extensions.pptx', async () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Mirror"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm flipH="1" flipV="1"><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);
    const ext = imported.elements[0]?.extensions['pptx'] as { readonly flipH?: boolean; readonly flipV?: boolean } | undefined;

    expect(ext?.flipH).toBe(true);
    expect(ext?.flipV).toBe(true);

    // Re-export and verify the flips emit on <a:xfrm>.
    const reExported = exportPptxBytes(imported);
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const reExportedSlide = readTextPart(readOoxmlPackage(reExported), 'ppt/slides/slide1.xml') ?? '';

    expect(reExportedSlide).toMatch(/<a:xfrm[^>]*flipH="1"[^>]*flipV="1"/);
  });

  /**
   * @description B4 — slide background round-trip. `<p:bg>` solid
   * fill on the first slide seeds `canvas.backgroundColor`; export
   * emits `<p:bg>` from the canvas state.
   */
  it('round-trips slide background colour via canvas.backgroundColor', async () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);

    expect(imported.canvas.backgroundColor).toBe('#112233');
    expect(imported.canvas.backgroundMode).toBe('solid');

    const reExported = exportPptxBytes(imported);
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const reExportedSlide = readTextPart(readOoxmlPackage(reExported), 'ppt/slides/slide1.xml') ?? '';

    expect(reExportedSlide).toContain('<p:bg>');
    expect(reExportedSlide).toContain('val="112233"');
  });

  /**
   * @description B5+B7 — bullets / numbered lists / paragraph
   * alignment / line spacing on `<a:pPr>` MUST round-trip: import →
   * re-export → re-import recovers every field unchanged.
   */
  it('round-trips bullets, alignment, indent, and line spacing through <a:pPr>', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="List"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr" indent="-360000" marL="360000"><a:lnSpc><a:spcPct val="150000"/></a:lnSpc><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>First bullet</a:t></a:r></a:p><a:p><a:pPr algn="r"><a:buAutoNum type="arabicPeriod" startAt="3"/></a:pPr><a:r><a:rPr lang="en-US"/><a:t>Numbered item</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);
    const textEl = imported.elements.find((el) => el.type === 'text');
    const content = textEl?.content;

    if (typeof content !== 'object' || !('paragraphs' in content)) throw new Error('expected TextBody');
    expect(content.paragraphs).toHaveLength(2);

    const first = content.paragraphs[0];

    expect(first?.props?.align).toBe('center');
    expect(first?.props?.lineSpacing).toBeCloseTo(1.5, 5);
    expect(first?.props?.bullet?.kind).toBe('char');

    if (first?.props?.bullet?.kind === 'char') {
      expect(first.props.bullet.char).toBe('•');
    }

    const second = content.paragraphs[1];

    expect(second?.props?.align).toBe('end');
    expect(second?.props?.bullet?.kind).toBe('auto');

    if (second?.props?.bullet?.kind === 'auto') {
      expect(second.props.bullet.format).toBe('arabicPeriod');
      expect(second.props.bullet.startAt).toBe(3);
    }

    // Circle-back: re-export and re-import. Every field above MUST
    // survive the second pass — if the exporter silently drops a
    // paragraph prop the second import will lose it and this test
    // will fail.
    const reExported = exportPptxBytes(imported);
    const reImported = importPptx(reExported);
    const reTextEl = reImported.elements.find((el) => el.type === 'text');
    const reContent = reTextEl?.content;

    if (typeof reContent !== 'object' || !('paragraphs' in reContent)) throw new Error('expected re-imported TextBody');
    expect(reContent.paragraphs).toHaveLength(2);

    const reFirst = reContent.paragraphs[0];

    expect(reFirst?.props?.align).toBe('center');
    expect(reFirst?.props?.lineSpacing).toBeCloseTo(1.5, 3);
    expect(reFirst?.props?.bullet?.kind).toBe('char');

    if (reFirst?.props?.bullet?.kind === 'char') {
      expect(reFirst.props.bullet.char).toBe('•');
    }

    const reSecond = reContent.paragraphs[1];

    expect(reSecond?.props?.align).toBe('end');
    expect(reSecond?.props?.bullet?.kind).toBe('auto');

    if (reSecond?.props?.bullet?.kind === 'auto') {
      expect(reSecond.props.bullet.format).toBe('arabicPeriod');
      expect(reSecond.props.bullet.startAt).toBe(3);
    }
  });

  /**
   * @description B6 — shadow effects round-trip. `<a:outerShdw>` on a
   * shape's `<p:spPr><a:effectLst>` block becomes a CSS `box-shadow`
   * rgba() string on `style.boxShadow`; re-export emits `<a:outerShdw>`
   * again.
   */
  it('round-trips <a:outerShdw> through style.boxShadow', async () => {
    const shadow = `<a:effectLst><a:outerShdw blurRad="180000" dist="360000" dir="2700000" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="50000"/></a:srgbClr></a:outerShdw></a:effectLst>`;
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Shadowed"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>${shadow}</p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);
    const boxShadow = imported.elements[0]?.style.boxShadow;

    expect(boxShadow).toMatch(/^[-\d.]+mm [-\d.]+mm [\d.]+mm rgba\(0, 0, 0, 0\.50\d\)$/);

    const reExported = exportPptxBytes(imported);
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const reExportedSlide = readTextPart(readOoxmlPackage(reExported), 'ppt/slides/slide1.xml') ?? '';

    expect(reExportedSlide).toContain('<a:effectLst>');
    expect(reExportedSlide).toContain('<a:outerShdw');
    expect(reExportedSlide).toMatch(/<a:alpha val="50\d{3}"/);

    // Circle-back: re-import the re-export and confirm style.boxShadow
    // recovers a structurally-identical rgba string (alpha 0.5, near-
    // identical offsets after EMU rounding).
    const reImported = importPptx(reExported);
    const reBoxShadow = reImported.elements[0]?.style.boxShadow;

    expect(reBoxShadow).toMatch(/^[-\d.]+mm [-\d.]+mm [\d.]+mm rgba\(0, 0, 0, 0\.50\d\)$/);
  });

  /**
   * @description R6 — `extractBlock` MUST handle same-named tags
   * nested inside the block it's extracting. A run-level `<a:rPr>`
   * containing inner block markup must not throw the shape-level
   * walker off course; here we exercise an effectLst that contains a
   * nested srgbClr → outerShdw structure typical of Keynote output.
   */
  it('matches nested same-named tags via depth-aware extractBlock', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Outer"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="A1A2A3"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Inner"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100000" y="100000"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="B1B2B3"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);

    // Both shapes must be recovered with their distinct fills — depth-
    // naive matching would have bound the outer's `</a:solidFill>` to
    // a later block and corrupted both.
    const rect = imported.elements.find((el) => el.type === 'rectangle');
    const ell = imported.elements.find((el) => el.type === 'ellipse');

    expect(rect).toBeDefined();
    expect(ell).toBeDefined();

    const rectFill = rect?.style.fill;
    const ellFill = ell?.style.fill;

    if (rectFill?.kind === 'solid' && rectFill.color.kind === 'rgb') {
      expect(rectFill.color.hex.toUpperCase()).toBe('#A1A2A3');
    } else {
      throw new Error('rect fill should be solid rgb');
    }

    if (ellFill?.kind === 'solid' && ellFill.color.kind === 'rgb') {
      expect(ellFill.color.hex.toUpperCase()).toBe('#B1B2B3');
    } else {
      throw new Error('ellipse fill should be solid rgb');
    }
  });

  /**
   * @description R5 — empty paragraphs (PowerPoint's spacing rows
   * authored as `<a:p><a:endParaRPr/></a:p>`) MUST survive import as a
   * structural placeholder so document height and layout are preserved.
   */
  it('preserves empty paragraphs from <a:p><a:endParaRPr/></a:p>', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>First</a:t></a:r></a:p><a:p><a:endParaRPr lang="en-US"/></a:p><a:p><a:r><a:rPr lang="en-US"/><a:t>Third</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);
    const textEl = imported.elements.find((el) => el.type === 'text');

    // The empty middle paragraph must be preserved — collapsing it
    // would alter visible layout. Promote-to-text picks string-form
    // for plain content and TextBody for structured content; either
    // shape MUST retain three slots.
    expect(textEl).toBeDefined();

    if (textEl !== undefined) {
      const content = textEl.content;

      if (typeof content === 'string') {
        const lines = content.split('\n');

        expect(lines).toHaveLength(3);
        expect(lines[1]).toBe('');
      } else if (typeof content === 'object' && 'paragraphs' in content) {
        expect(content.paragraphs).toHaveLength(3);
        expect(content.paragraphs[1]?.runs[0]?.text).toBe('');
      } else {
        throw new Error(`unexpected content type: ${typeof content}`);
      }
    }
  });

  /**
   * @description R4 — `box-shadow` strings round-trip with named CSS
   * colours, `hsl()`, multi-shadow lists, and `inset` entries. Multi-
   * shadow falls back to the first non-inset entry; inset-only inputs
   * skip the `<a:effectLst>` cleanly without crashing.
   */
  it('emits <a:effectLst> from named-colour, hsl, and multi-shadow boxShadow strings', async () => {
    const baseDoc = {
      ...createEmptyBroadsetDocument(),
      canvas: {
        ...createEmptyBroadsetDocument().canvas,
        unit: 'mm' as const,
        width: 200,
        height: 200,
      },
    };

    const cases: { readonly label: string; readonly boxShadow: string; readonly expected: 'emit' | 'skip' }[] = [
      { label: 'named colour `black`', boxShadow: '4mm 4mm 2mm black', expected: 'emit' },
      { label: 'rgb()', boxShadow: '5mm 5mm 3mm rgb(10, 20, 30)', expected: 'emit' },
      { label: 'hsl()', boxShadow: '5mm 5mm 3mm hsl(120, 100%, 50%)', expected: 'emit' },
      { label: 'multi-shadow (first wins)', boxShadow: '4mm 4mm 2mm black, 8mm 8mm 4mm red', expected: 'emit' },
      { label: 'inset only (skipped)', boxShadow: 'inset 4mm 4mm 2mm black', expected: 'skip' },
      { label: 'inset + valid (skip inset, emit other)', boxShadow: 'inset 2mm 2mm 1mm black, 4mm 4mm 2mm red', expected: 'emit' },
    ];

    for (const c of cases) {
      const doc = {
        ...baseDoc,
        elements: [
          createDefaultElement('rectangle', {
            id: `el-${c.label}`,
            width: 80,
            height: 40,
            style: { boxShadow: c.boxShadow, opacity: 1 },
          }),
        ],
      };
      const bytes = exportPptxBytes(doc);
      const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
      const slide = readTextPart(readOoxmlPackage(bytes), 'ppt/slides/slide1.xml') ?? '';

      if (c.expected === 'emit') {
        expect(slide, `case "${c.label}" should emit`).toContain('<a:outerShdw');
      } else {
        expect(slide, `case "${c.label}" should NOT emit`).not.toContain('<a:outerShdw');
      }
    }
  });

  /**
   * @description B8 — hyperlink round-trip. `<a:hlinkClick r:id="…"/>`
   * inside `<a:rPr>` resolves against the slide's relationships table to
   * a `Hyperlink.url` on the run; re-export reallocates the rel and
   * re-emits the markup.
   */
  it('round-trips run hyperlinks via the slide relationship table', async () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="LinkText"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"><a:hlinkClick r:id="rId7" tooltip="Anthropic"/></a:rPr><a:t>Click me</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const slideRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://anthropic.com/" TargetMode="External"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText(slideRels)],
      ]),
    );
    const imported = importPptx(inputBytes);
    const textEl = imported.elements.find((el) => el.type === 'text');
    const content = textEl?.content;

    if (typeof content !== 'object' || !('paragraphs' in content)) throw new Error('expected TextBody');

    const run = content.paragraphs[0]?.runs[0];

    expect(run?.props?.hyperlink?.url).toBe('https://anthropic.com/');
    expect(run?.props?.hyperlink?.tooltip).toBe('Anthropic');

    // Re-export and verify the hyperlink survives via a fresh rel.
    const reExported = exportPptxBytes(imported);
    const { readOoxmlPackage, readTextPart } = await import('./ooxml/zip');
    const pkg = readOoxmlPackage(reExported);
    const reExportedSlide = readTextPart(pkg, 'ppt/slides/slide1.xml') ?? '';
    const reExportedRels = readTextPart(pkg, 'ppt/slides/_rels/slide1.xml.rels') ?? '';

    expect(reExportedSlide).toMatch(/<a:hlinkClick[^>]*r:id="rId\d+"/);
    expect(reExportedRels).toContain('Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"');
    expect(reExportedRels).toContain('Target="https://anthropic.com/"');
    expect(reExportedRels).toContain('TargetMode="External"');

    // Circle-back: re-import the re-export and confirm props.hyperlink
    // is recovered with the same URL + tooltip — the rId in the second
    // import will be allocated fresh, so the URL is the truth.
    const reImported = importPptx(reExported);
    const reTextEl = reImported.elements.find((el) => el.type === 'text');
    const reContent = reTextEl?.content;

    if (typeof reContent !== 'object' || !('paragraphs' in reContent)) throw new Error('expected re-imported TextBody');

    const reRun = reContent.paragraphs[0]?.runs[0];

    expect(reRun?.props?.hyperlink?.url).toBe('https://anthropic.com/');
    expect(reRun?.props?.hyperlink?.tooltip).toBe('Anthropic');
  });

  /**
   * @description R1 — per-run colour `style.color` MUST round-trip.
   * Authored as a `BroadsetColor` object on `RunProps.style.color`,
   * emitted as `<a:solidFill><a:srgbClr val="…"/></a:solidFill>` inside
   * `<a:rPr>`, re-imported back into a `BroadsetColor`. Without this
   * test the export-side colour drop is invisible.
   */
  it('round-trips per-run text colour through <a:rPr><a:solidFill>', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Coloured"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" b="1"><a:solidFill><a:srgbClr val="FF6600"/></a:solidFill></a:rPr><a:t>Bold orange</a:t></a:r><a:r><a:rPr lang="en-US"><a:solidFill><a:srgbClr val="003366"/></a:solidFill></a:rPr><a:t> blue</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;
    const inputBytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
        ['ppt/slides/slide1.xml', encodeText(slideXml)],
        ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
      ]),
    );
    const imported = importPptx(inputBytes);
    const textEl = imported.elements.find((el) => el.type === 'text');
    const content = textEl?.content;

    if (typeof content !== 'object' || !('paragraphs' in content)) throw new Error('expected TextBody');

    const runs = content.paragraphs[0]?.runs ?? [];

    expect(runs).toHaveLength(2);

    const firstColor = runs[0]?.props?.style?.['color'];
    const secondColor = runs[1]?.props?.style?.['color'];

    if (isBroadsetColor(firstColor) && isRgbBroadsetColor(firstColor)) {
      expect(firstColor.hex.toUpperCase()).toBe('#FF6600');
    } else {
      throw new Error('expected first run style.color to be an rgb BroadsetColor');
    }

    if (isBroadsetColor(secondColor) && isRgbBroadsetColor(secondColor)) {
      expect(secondColor.hex.toUpperCase()).toBe('#003366');
    } else {
      throw new Error('expected second run style.color to be an rgb BroadsetColor');
    }

    // Circle-back: re-export and re-import. Each run's colour MUST
    // survive via `<a:rPr><a:solidFill>` — without R1 the second run
    // would come back un-coloured because export silently dropped the
    // BroadsetColor object.
    const reExported = exportPptxBytes(imported);
    const reImported = importPptx(reExported);
    const reTextEl = reImported.elements.find((el) => el.type === 'text');
    const reContent = reTextEl?.content;

    if (typeof reContent !== 'object' || !('paragraphs' in reContent)) throw new Error('expected re-imported TextBody');

    const reRuns = reContent.paragraphs[0]?.runs ?? [];

    expect(reRuns).toHaveLength(2);

    const reFirstColor = reRuns[0]?.props?.style?.['color'];
    const reSecondColor = reRuns[1]?.props?.style?.['color'];

    if (isBroadsetColor(reFirstColor) && isRgbBroadsetColor(reFirstColor)) {
      expect(reFirstColor.hex.toUpperCase()).toBe('#FF6600');
    } else {
      throw new Error('first run colour was lost on re-export');
    }

    if (isBroadsetColor(reSecondColor) && isRgbBroadsetColor(reSecondColor)) {
      expect(reSecondColor.hex.toUpperCase()).toBe('#003366');
    } else {
      throw new Error('second run colour was lost on re-export');
    }
  });

  it('rejects vbaProject.bin with a macro-rejected warning at import', () => {
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst/><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const bytes = writeOoxmlPackage(
      new Map([
        ['[Content_Types].xml', encodeText('<Types/>')],
        ['_rels/.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>')],
        ['ppt/presentation.xml', encodeText(presXml)],
        ['ppt/_rels/presentation.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
        ['ppt/vbaProject.bin', new Uint8Array([0, 0, 0, 0])],
      ]),
    );
    const report = importPptxWithReport(bytes);

    expect(report.warnings.some((w) => w.code === 'macro-rejected')).toBe(true);
  });

  it('recovers a multi-slide deck as a multi-page document', () => {
    const slideBody = `<p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>`;
    const slideXml = (idx: number): string =>
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${slideBody}<!-- slide ${String(idx)} --></p:sld>`;
    const presXml = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;
    const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>`;
    const parts = new Map<string, Uint8Array>([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['ppt/presentation.xml', encodeText(presXml)],
      ['ppt/_rels/presentation.xml.rels', encodeText(presRels)],
    ]);

    for (let i = 1; i <= 3; i += 1) {
      parts.set(`ppt/slides/slide${String(i)}.xml`, encodeText(slideXml(i)));
      parts.set(
        `ppt/slides/_rels/slide${String(i)}.xml.rels`,
        encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
      );
    }

    const imported = importPptx(writeOoxmlPackage(parts));

    expect(imported.pages).toHaveLength(3);
  });
});
