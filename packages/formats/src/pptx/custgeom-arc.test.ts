import { describe, expect, it } from 'vitest';

import { importPptx } from './import';
import { writeOoxmlPackage } from './ooxml/zip';

/**
 * @description `<a:arcTo>` + `<a:close/>` round-trip from OOXML
 * `<a:custGeom>` to a Broadset path's SVG `d` attribute. Closes the
 * spec gap "OOXML arcTo with `wR/hR/stAng/swAng` parameterisation"
 * called out in the plan risk register — Keynote-origin custom
 * shapes use this path.
 */

const TEXT = new TextEncoder();

function buildSlideXmlWithArc(): string {
  // Quarter-circle arc of an ellipse 100×60 starting at (0,0) and
  // sweeping 90° counter-clockwise. Closing the path yields a fan.
  // OOXML's stAng / swAng are in 60000ths of a degree.
  return [
    '<?xml version="1.0"?>',
    '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    '<p:cSld><p:spTree>',
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>',
    '<p:sp>',
    '<p:nvSpPr><p:cNvPr id="2" name="Arc"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>',
    '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>',
    '<a:custGeom><a:pathLst><a:path w="100" h="60">',
    '<a:moveTo><a:pt x="0" y="0"/></a:moveTo>',
    '<a:arcTo wR="100" hR="60" stAng="0" swAng="5400000"/>',
    '<a:close/>',
    '</a:path></a:pathLst></a:custGeom>',
    '</p:spPr></p:sp>',
    '</p:spTree></p:cSld>',
    '</p:sld>',
  ].join('');
}

function buildPackageWithSlide(slideXml: string): Uint8Array {
  return writeOoxmlPackage(
    new Map<string, Uint8Array>([
      [
        '[Content_Types].xml',
        TEXT.encode(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>',
        ),
      ],
      [
        '_rels/.rels',
        TEXT.encode(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>',
        ),
      ],
      [
        'ppt/presentation.xml',
        TEXT.encode(
          '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="9144000" cy="6858000"/></p:presentation>',
        ),
      ],
      [
        'ppt/_rels/presentation.xml.rels',
        TEXT.encode(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>',
        ),
      ],
      ['ppt/slides/slide1.xml', TEXT.encode(slideXml)],
    ]),
  );
}

describe('OOXML <a:arcTo> + <a:close/> import', () => {
  it('emits an SVG arc command and closes the path', () => {
    const bytes = buildPackageWithSlide(buildSlideXmlWithArc());
    const doc = importPptx(bytes);

    expect(doc.elements).toHaveLength(1);

    const element = doc.elements[0];

    expect(element?.type).toBe('path');

    const d = element?.content;

    expect(typeof d).toBe('string');

    if (typeof d !== 'string') return;

    // svgpath compacts whitespace; assert the operators rather than
    // their spacing.
    expect(d).toMatch(/^M[\d\s\-.]/);
    expect(d).toMatch(/A[\d\s\-.]/);
    expect(d).toMatch(/Z\s*$/);
  });

  it('drops a degenerate arc (zero radius) to a line rather than dropping the operator', () => {
    const slideXml = buildSlideXmlWithArc().replace('wR="100" hR="60"', 'wR="0" hR="0"');
    const bytes = buildPackageWithSlide(slideXml);
    const doc = importPptx(bytes);

    expect(doc.elements).toHaveLength(1);

    const content = doc.elements[0]?.content;

    expect(typeof content).toBe('string');

    if (typeof content !== 'string') return;

    expect(content.length).toBeGreaterThan(0);
    // Path remains valid SVG; the degenerate arc shouldn't blow up
    // svgpath's downstream normalisation.
    expect(content).toMatch(/Z\s*$/);
  });
});
