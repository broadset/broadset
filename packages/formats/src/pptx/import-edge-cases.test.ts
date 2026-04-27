import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importPptx } from './import';
import { encodeText, writeOoxmlPackage } from './ooxml/zip';

/**
 * Number of `it.skip` probes in this file — this is the AST-rebuild
 * acceptance gate's measurable target. Each entry pins a known
 * limitation of the regex parser. Adding a new skip MUST also bump
 * this count so the regression gate below catches it; flipping a
 * skip to a passing test means the AST rebuild closed that gap.
 */
const EXPECTED_SKIPPED_PROBES = 5;

/**
 * @description Edge-case probe for the regex-based importer. The spec
 * gap section explicitly calls out "non-default namespace prefixes,
 * CDATA sections, and entity-encoded attribute values can mis-parse"
 * as a known risk. This suite exercises each so that:
 *
 * 1. We know exactly which edge cases work today.
 * 2. We catch regressions if the regex evolves.
 * 3. The AST-rebuild follow-up has a measurable target — every test
 *    here MUST keep passing once the parser is rebuilt on
 *    fast-xml-parser.
 *
 * Tests that pass today cover what the regex genuinely handles.
 * Tests marked `it.skip` document known limitations honestly so the
 * spec gap stays accurate.
 */

const PRES_XML = `<?xml version="1.0"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;

const PRES_RELS = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;

function buildPackage(slideXml: string): Uint8Array {
  return writeOoxmlPackage(
    new Map([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['ppt/presentation.xml', encodeText(PRES_XML)],
      ['ppt/_rels/presentation.xml.rels', encodeText(PRES_RELS)],
      ['ppt/slides/slide1.xml', encodeText(slideXml)],
      ['ppt/slides/_rels/slide1.xml.rels', encodeText('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')],
    ]),
  );
}

describe('PPTX importer — edge-case probes (regex parser limitations)', () => {
  /**
   * @description Entity-encoded attribute values in shape names
   * (`name="A&amp;B"`) MUST decode to the original text. Failure
   * means downstream BSET tag detection or display names mis-render
   * apostrophes / ampersands.
   */
  it('decodes entity-encoded attribute values in shape names', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Foo &amp; Bar"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    // The display name should NOT contain a literal `&amp;` — it must
    // decode back to `&`.
    expect(rect?.name).toContain('&');
    expect(rect?.name).not.toContain('amp;');
  });

  /**
   * @description Entity-encoded text content (`<a:t>A &amp; B</a:t>`)
   * MUST decode to plain text — already exercised by the existing
   * decodeXmlEntities helper.
   */
  it('decodes entity-encoded text content', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t>A &amp; B &lt;C&gt;</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const text = imported.elements.find((el) => el.type === 'text');
    const content = typeof text?.content === 'string' ? text.content : '';

    expect(content).toContain('A & B <C>');
    expect(content).not.toContain('&amp;');
    expect(content).not.toContain('&lt;');
  });

  /**
   * @description Whitespace variations between attributes (multiple
   * spaces, tabs, line breaks) MUST NOT throw the parser off — XML
   * whitespace inside element tags is non-significant.
   */
  it('tolerates whitespace variations inside open tags', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr  id="2"   name="Whitespaced"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off    x="0"    y="0"/><a:ext\tcx="1000000"\tcy="500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
    // Width 1,000,000 EMU = 27.78mm; tolerate any extraction that finds
    // the `<a:ext>` despite the whitespace variations.
    expect(rect?.width).toBeGreaterThan(0);
  });

  /**
   * @description Self-closing variant of an attribute-rich tag (with
   * preceding whitespace before the `/>`) MUST still resolve.
   */
  it('handles self-closing tags with trailing whitespace', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="SelfClose" /><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0" /><a:ext cx="1000000" cy="500000" /></a:xfrm><a:prstGeom prst="rect" ><a:avLst /></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
  });

  /**
   * @description Known limitation: non-default namespace prefixes
   * (e.g. `<dml:sp>` instead of `<p:sp>`) MUST still parse — the
   * regex parser binds to the canonical prefixes and fails today.
   * This test is `skipped` so the suite stays green; flipping it on
   * is the AST-rebuild acceptance gate.
   */
  it.skip('handles non-default namespace prefixes (dml:sp instead of p:sp)', () => {
    const slideXml = `<?xml version="1.0"?><dml:sld xmlns:dml="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:dr="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:rl="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dml:cSld><dml:spTree><dml:nvGrpSpPr><dml:cNvPr id="1" name=""/><dml:cNvGrpSpPr/><dml:nvPr/></dml:nvGrpSpPr><dml:grpSpPr/><dml:sp><dml:nvSpPr><dml:cNvPr id="2" name="Renamed"/><dml:cNvSpPr/><dml:nvPr/></dml:nvSpPr><dml:spPr><dr:xfrm><dr:off x="0" y="0"/><dr:ext cx="1000000" cy="500000"/></dr:xfrm><dr:prstGeom prst="rect"><dr:avLst/></dr:prstGeom></dml:spPr></dml:sp></dml:spTree></dml:cSld></dml:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
  });

  /**
   * @description Known limitation: CDATA sections inside text content
   * (`<a:t><![CDATA[A & B]]></a:t>`) are not unwrapped today. PowerPoint
   * never emits CDATA but some non-Office tools do. Skipped for now;
   * tracked under the AST-rebuild gate.
   */
  it.skip('decodes CDATA-wrapped text content', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Cdata"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US"/><a:t><![CDATA[A & B]]></a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const text = imported.elements.find((el) => el.type === 'text');

    expect(typeof text?.content === 'string' ? text.content : '').toContain('A & B');
  });

  /**
   * @description Known limitation: attribute-order swap on `<a:off>`
   * (`y="…" x="…"` instead of `x="…" y="…"`). The regex `<a:off\s+x="
   * (-?\d+)"\s+y="(-?\d+)"\s*\/>` requires the canonical order. ECMA-376
   * doesn't pin attribute order — XML allows any. This test pins the
   * limitation as `it.skip` so the AST rebuild has a measurable gate.
   */
  it.skip('handles attribute-order swap on <a:off> (y before x)', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="OffSwapped"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off y="500000" x="100000"/><a:ext cy="500000" cx="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    // x and y are mm-converted from EMU; non-zero confirms extraction
    // honoured the reordered attributes.
    expect(rect?.position.x).toBeGreaterThan(0);
    expect(rect?.position.y).toBeGreaterThan(0);
    expect(rect?.width).toBeGreaterThan(0);
    expect(rect?.height).toBeGreaterThan(0);
  });

  /**
   * @description Known limitation: single-quoted attribute values
   * (`name='Foo'`). XML allows either delimiter; the regex assumes
   * double quotes throughout. Pinned as `it.skip` for the AST gate.
   */
  it.skip(`handles single-quoted attribute values`, () => {
    const slideXml = `<?xml version='1.0'?><p:sld xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main' xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships' xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main'><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id='1' name=''/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id='2' name='SingleQuoted'/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x='0' y='0'/><a:ext cx='1000000' cy='500000'/></a:xfrm><a:prstGeom prst='rect'><a:avLst/></a:prstGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
  });

  /**
   * @description Known limitation: decimal-precision coordinates
   * (`<a:pt x="0.5" y="0.5"/>` inside `<a:custGeom><a:pathLst>`).
   * ECMA-376 §20.1.9.16 allows fixed-point decimal `pt` values in
   * custom geometry — `(-?\d+)` rejects the decimal. Pinned for the
   * AST gate.
   */
  it.skip('handles decimal coordinates in <a:custGeom><a:pt>', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="DecimalPath"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm><a:custGeom><a:pathLst><a:path w="100000" h="50000"><a:moveTo><a:pt x="0.5" y="0.5"/></a:moveTo><a:lnTo><a:pt x="99999.5" y="49999.5"/></a:lnTo><a:close/></a:path></a:pathLst></a:custGeom></p:spPr></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const path = imported.elements.find((el) => el.type === 'path');

    expect(path?.content).toMatch(/^M/);
  });

  /**
   * @description XML comments inside the slide tree (`<!-- … -->`)
   * MUST NOT confuse the walker. PowerPoint sometimes emits comments
   * for human readability; the importer should ignore them silently.
   */
  it('ignores XML comments inside the slide tree', () => {
    const slideXml = `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><!-- before shape --><p:sp><p:nvSpPr><p:cNvPr id="2" name="WithComments"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1000000" cy="500000"/></a:xfrm><!-- in spPr --><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp><!-- after shape --></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    const imported = importPptx(buildPackage(slideXml));
    const rect = imported.elements.find((el) => el.type === 'rectangle');

    expect(rect).toBeDefined();
  });

  /**
   * @description Skip-count regression gate. Adding a new `it.skip`
   * here without bumping `EXPECTED_SKIPPED_PROBES` fails this test —
   * which is the point. Skipped probes are the spec gap's measurable
   * AST-rebuild acceptance criteria; silently growing the list would
   * dilute the gate.
   */
  it('matches the documented skipped-probe count exactly', () => {
    // vitest runs from the package root (packages/formats) — read the
    // probe file via that anchor since ESM `import.meta.url` is not a
    // file: URL in the bundled environment.
    const source = readFileSync(resolve(process.cwd(), 'src/pptx/import-edge-cases.test.ts'), 'utf8');
    const skipMatches = source.match(/\bit\.skip\(/g) ?? [];

    expect(skipMatches.length).toBe(EXPECTED_SKIPPED_PROBES);
  });
});
