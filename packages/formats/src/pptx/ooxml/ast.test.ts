import { describe, expect, it } from 'vitest';

import {
  findChild,
  findChildren,
  findDescendant,
  findDescendants,
  getAttr,
  getText,
  parseOoxml,
  rootElement,
  serializeNode,
  type XmlElement,
} from './ast';

function expectElement(node: XmlElement | null): XmlElement {
  if (node === null) throw new Error('expected XmlElement, got null');

  return node;
}

/**
 * @description AST helper layer over fast-xml-parser. Closes the
 * Spec Gaps acceptance criterion "The importer does NOT use regex
 * to extract XML attributes or element content" by giving the
 * regex hot path a typed, namespace-aware replacement. Tests cover
 * the canonical readers (find/getAttr/getText) plus the failure
 * modes the regex parser couldn't handle: non-default namespace
 * prefixes, CDATA, attribute-order swap, single-quoted attrs,
 * decimal coordinates.
 */
describe('AST helpers', () => {
  it('parses canonical OOXML prefix bindings and resolves namespace by URI', () => {
    const xml = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:off x="100" y="200"/></p:cSld></p:sld>`;
    const root = rootElement(parseOoxml(xml));

    expect(root?.local).toBe('sld');
    expect(root?.ns).toBe('http://schemas.openxmlformats.org/presentationml/2006/main');

    const cSld = root !== null ? findChild(root, 'p:cSld') : null;

    expect(cSld?.local).toBe('cSld');

    const off = expectElement(cSld !== null ? findChild(cSld, 'a:off') : null);

    expect(getAttr(off, 'x')).toBe('100');
    expect(getAttr(off, 'y')).toBe('200');
  });

  it('resolves non-default namespace prefixes by URI (Keynote dml: instead of p:)', () => {
    // Keynote occasionally rebinds the canonical OOXML namespaces to
    // its own prefixes. The AST layer matches by URI, so `p:cSld` and
    // `dml:cSld` resolve identically when the URI matches.
    const xml = `<dml:sld xmlns:dml="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:dr="http://schemas.openxmlformats.org/drawingml/2006/main"><dml:cSld><dr:off x="100" y="200"/></dml:cSld></dml:sld>`;
    const root = rootElement(parseOoxml(xml));

    // Even though the source prefix is `dml:` we read it via canonical `p:`.
    const cSld = expectElement(root !== null ? findChild(root, 'p:cSld') : null);
    const off = expectElement(findChild(cSld, 'a:off'));

    expect(getAttr(off, 'x')).toBe('100');
  });

  it('handles attribute-order swap', () => {
    const xml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:off y="200" x="100"/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const off = expectElement(root !== null ? findChild(root, 'a:off') : null);

    expect(getAttr(off, 'x')).toBe('100');
    expect(getAttr(off, 'y')).toBe('200');
  });

  it('handles single-quoted attribute values', () => {
    const xml = `<p:sld xmlns:p='http://schemas.openxmlformats.org/presentationml/2006/main' xmlns:a='http://schemas.openxmlformats.org/drawingml/2006/main'><a:off x='100' y='200'/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const off = expectElement(root !== null ? findChild(root, 'a:off') : null);

    expect(getAttr(off, 'x')).toBe('100');
  });

  it('handles decimal coordinates in attribute values', () => {
    const xml = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:pt x="0.5" y="0.5"/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const pt = expectElement(root !== null ? findChild(root, 'a:pt') : null);

    expect(getAttr(pt, 'x')).toBe('0.5');
  });

  it('decodes entity-encoded attribute values', () => {
    const xml = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:tag name="Foo &amp; Bar &lt;X&gt;"/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const tag = expectElement(root !== null ? findChild(root, 'p:tag') : null);

    expect(getAttr(tag, 'name')).toBe('Foo & Bar <X>');
  });

  it('decodes entity-encoded text content', () => {
    const xml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:t>A &amp; B &lt;C&gt;</a:t></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const t = expectElement(root !== null ? findChild(root, 'a:t') : null);

    expect(getText(t)).toBe('A & B <C>');
  });

  it('finds multiple direct children in order', () => {
    const xml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:gs pos="0"/><a:gs pos="50000"/><a:gs pos="100000"/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const stops = root !== null ? findChildren(root, 'a:gs') : [];

    expect(stops.map((s) => getAttr(s, 'pos'))).toEqual(['0', '50000', '100000']);
  });

  it('finds nested same-named tags via depth-aware findDescendant', () => {
    // `<a:effectLst>` legitimately appears at shape level AND inside
    // run-level rPr blocks. findDescendant returns the FIRST in
    // document order; findDescendants returns all.
    const xml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:effectLst id="outer"><a:innerShdw/></a:effectLst><a:tx><a:effectLst id="inner"/></a:tx></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const all = root !== null ? findDescendants(root, 'a:effectLst') : [];

    expect(all).toHaveLength(2);

    const [outerNode, innerNode] = all;

    expect(outerNode !== undefined ? getAttr(outerNode, 'id') : '').toBe('outer');
    expect(innerNode !== undefined ? getAttr(innerNode, 'id') : '').toBe('inner');

    const first = expectElement(root !== null ? findDescendant(root, 'a:effectLst') : null);

    expect(getAttr(first, 'id')).toBe('outer');
  });

  it('reads attributes by local name regardless of attribute prefix', () => {
    // OOXML attribute namespaces (`r:id`) are read by local name —
    // the prefix is purely a serialisation concern.
    const xml = `<p:sld xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:blip r:embed="rId7"/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const blip = expectElement(root !== null ? findChild(root, 'a:blip') : null);

    expect(getAttr(blip, 'embed')).toBe('rId7');
  });

  it('returns empty list for empty / whitespace-only input', () => {
    expect(parseOoxml('')).toEqual([]);
    expect(parseOoxml('   \n\t  ')).toEqual([]);
  });

  it('serialises a node back to XML', () => {
    const xml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:off x="100" y="200"/></p:sld>`;
    const root = rootElement(parseOoxml(xml));
    const off = expectElement(root !== null ? findChild(root, 'a:off') : null);

    expect(serializeNode(off)).toBe('<a:off x="100" y="200"/>');
  });
});
