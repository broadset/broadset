import { encodeText, writeOoxmlPackage } from '../ooxml/zip';

/**
 * External-tool PPTX fixtures.
 *
 * Each factory produces a synthetic `.pptx` byte stream whose content
 * models the characteristic quirks of a real-world authoring tool. These
 * fixtures feed the importer test suite so we can assert coverage
 * against arbitrary third-party content without shipping real `.pptx`
 * golden files (which typically carry licensed fonts and corporate
 * templates that can't live in the repo).
 *
 * Fixture traits per tool:
 * - **PowerPoint Windows/Mac/365** — canonical ECMA-376: rich
 *   placeholder inheritance, multi-level master + layout, named
 *   shapes, extLst preserved across save.
 * - **Keynote** — strips unknown extLst entries on save, uses
 *   `<a:custGeom>` for shapes PowerPoint treats as presets, embeds
 *   Quartz PDFs as picture blips.
 * - **Google Slides** — minimal master / layout, may strip customXml
 *   parts entirely, flat slide trees.
 * - **LibreOffice Impress** — rewrites shape names to generic
 *   `Rectangle N`, different theme slot ordering, verbose font
 *   declarations.
 * - **Canva** — tends to flatten to pictures, embeds base64 images
 *   heavily, thin / absent master.
 */

const MINIMAL_ROOT_RELS = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>';

const DEFAULT_SLIDE_SIZE = 'cx="9144000" cy="6858000"';

function basePresentation(slideCount: number): string {
  const ids = Array.from({ length: slideCount }, (_, i) =>
    `<p:sldId id="${String(256 + i)}" r:id="rId${String(2 + i)}"/>`,
  ).join('');

  return `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${ids}</p:sldIdLst><p:sldSz ${DEFAULT_SLIDE_SIZE} type="custom"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function baseSlideRels(): string {
  return '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>';
}

function presentationRels(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, i) =>
    `<Relationship Id="rId${String(2 + i)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${String(i + 1)}.xml"/>`,
  ).join('');

  return `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides}</Relationships>`;
}

/**
 * PowerPoint Windows / Mac / 365 — canonical OOXML with a title and
 * body placeholder, rectangle, ellipse, and a grouped subtree. Tests
 * that placeholder inheritance works and groups are preserved.
 */
export function powerpointFixture(): Uint8Array {
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6858000" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>Quarterly results</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Rectangle 2"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="2286000"/><a:ext cx="3600000" cy="1800000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Ellipse 3"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="4800000" y="2286000"/><a:ext cx="1800000" cy="1800000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const layoutXml = `<?xml version="1.0"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="title"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title" idx="0"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="4000"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sldLayout>`;
  const masterRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(baseSlideRels())],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
      ['ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(masterRels)],
      ['ppt/slideLayouts/slideLayout1.xml', encodeText(layoutXml)],
    ]),
  );
}

/**
 * Keynote export — custom geometry on a shape PowerPoint would mark
 * as a preset, no extLst, minimal placeholder metadata.
 */
export function keynoteFixture(): Uint8Array {
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="3600000" cy="1800000"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="100000" b="100000"/><a:pathLst><a:path w="100000" h="100000"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="100000" y="0"/></a:lnTo><a:lnTo><a:pt x="100000" y="100000"/></a:lnTo><a:lnTo><a:pt x="0" y="100000"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom><a:solidFill><a:srgbClr val="00C49F"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(baseSlideRels())],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
    ]),
  );
}

/**
 * Google Slides export — flat, minimal master, shape names like
 * "Shape" or empty, no extLst. Tests the "no preserved metadata" path.
 */
export function googleSlidesFixture(): Uint8Array {
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name=""/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FF5722"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name=""/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="3000000" y="500000"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(baseSlideRels())],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
    ]),
  );
}

/**
 * LibreOffice Impress export — verbose layout with multiple slides,
 * rewrites shape names to generic `Rectangle N` / `Oval N`.
 */
export function libreofficeFixture(): Uint8Array {
  const makeSlide = (index: number, color: string): string =>
    `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Slide ${String(index)}"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Rectangle ${String(index)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="3000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const parts = new Map<string, Uint8Array>([
    ['[Content_Types].xml', encodeText('<Types/>')],
    ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
    ['ppt/presentation.xml', encodeText(basePresentation(3))],
    ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(3))],
    ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
  ]);
  const colors = ['FF0000', '00FF00', '0000FF'];

  for (let i = 1; i <= 3; i += 1) {
    parts.set(`ppt/slides/slide${String(i)}.xml`, encodeText(makeSlide(i, colors[i - 1] ?? '000000')));
    parts.set(`ppt/slides/_rels/slide${String(i)}.xml.rels`, encodeText(baseSlideRels()));
  }

  return writeOoxmlPackage(parts);
}

/**
 * Canva export — shape flattened to a picture (a 1×1 PNG), minimal
 * master, no layouts.
 */
export function canvaFixture(): Uint8Array {
  const onePxPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="Canva Image"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="3000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slideRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(slideRels)],
      ['ppt/media/image1.png', onePxPng],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
    ]),
  );
}

/**
 * PowerPoint complex-text fixture — rich runs (bold/italic/colour),
 * paragraph alignment, bullets, and a hyperlink. Exercises the full
 * text-body round-trip end-to-end.
 */
export function powerpointComplexTextFixture(): Uint8Array {
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="RichText"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="6000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"><a:lnSpc><a:spcPct val="120000"/></a:lnSpc></a:pPr><a:r><a:rPr lang="en-US" b="1" sz="3200"><a:solidFill><a:srgbClr val="C00000"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>Bold red</a:t></a:r><a:r><a:rPr lang="en-US" sz="2400"><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:rPr><a:t> and </a:t></a:r><a:r><a:rPr lang="en-US" i="1" sz="2400"><a:solidFill><a:srgbClr val="0000C0"/></a:solidFill></a:rPr><a:t>italic blue</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="en-US" sz="2000" u="sng"><a:solidFill><a:srgbClr val="2F6F2F"/></a:solidFill><a:hlinkClick r:id="rId7"/></a:rPr><a:t>Linked underlined item</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slideRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://broadset.dev/" TargetMode="External"/></Relationships>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(slideRels)],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
    ]),
  );
}

/**
 * Keynote fixture with non-sRGB colour primitives — `<a:scrgbClr>`,
 * `<a:hslClr>`, and `<a:prstClr>`. Verifies the importer round-trips
 * Keynote-style colour authoring without silent translation.
 */
export function keynoteNonSrgbColoursFixture(): Uint8Array {
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="ScRgb"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1500000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:scrgbClr r="100000" g="0" b="0"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Hsl"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="2000000" y="0"/><a:ext cx="1500000" cy="1500000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:hslClr hue="14400000" sat="80000" lum="40000"/></a:solidFill></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Prst"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="4000000" y="0"/><a:ext cx="1500000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:prstClr val="cornflowerBlue"/></a:solidFill></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(baseSlideRels())],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
    ]),
  );
}

/**
 * Canva fixture with `<a:srcRect>` crop — a 10×20%/30×40% crop on a
 * 1×1 PNG. Verifies the importer preserves the crop on
 * `extensions.pptx.srcRect` for round-trip.
 */
export function canvaCroppedFixture(): Uint8Array {
  const onePxPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);
  const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:pic><p:nvPicPr><p:cNvPr id="2" name="Cropped"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId1"/><a:srcRect l="10000" t="20000" r="30000" b="40000"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="500000" y="500000"/><a:ext cx="3000000" cy="1500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const slideRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`;

  return writeOoxmlPackage(
    new Map<string, Uint8Array>([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['_rels/.rels', encodeText(MINIMAL_ROOT_RELS)],
      ['ppt/presentation.xml', encodeText(basePresentation(1))],
      ['ppt/_rels/presentation.xml.rels', encodeText(presentationRels(1))],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText(slideRels)],
      ['ppt/media/image1.png', onePxPng],
      ['ppt/slideMasters/slideMaster1.xml', encodeText(minimalMaster())],
    ]),
  );
}

function minimalMaster(): string {
  return `<?xml version="1.0"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>`;
}
