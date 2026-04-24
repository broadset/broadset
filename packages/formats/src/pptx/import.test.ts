import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { importPptx } from './import';
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
