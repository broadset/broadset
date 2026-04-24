import { describe, expect, it } from 'vitest';

import { OOXML_CONTENT_TYPES, OOXML_NAMESPACES, OOXML_PREFIXES, OOXML_REL_TYPES } from './namespaces';

/**
 * @description OOXML namespace URIs must match the canonical ECMA-376
 * strings exactly. PowerPoint / Keynote / LibreOffice match by URI, so a
 * single typo anywhere in this table breaks every slide we emit.
 */
describe('OOXML_NAMESPACES', () => {
  it('declares the five namespaces a PPTX importer / exporter must know', () => {
    expect(OOXML_NAMESPACES.drawingml).toBe('http://schemas.openxmlformats.org/drawingml/2006/main');
    expect(OOXML_NAMESPACES.presentationml).toBe('http://schemas.openxmlformats.org/presentationml/2006/main');
    expect(OOXML_NAMESPACES.relationships).toBe(
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    );
    expect(OOXML_NAMESPACES.contentTypes).toBe('http://schemas.openxmlformats.org/package/2006/content-types');
    expect(OOXML_NAMESPACES.packageRelationships).toBe(
      'http://schemas.openxmlformats.org/package/2006/relationships',
    );
  });
});

/** @description Canonical prefix-to-URI map used on export. */
describe('OOXML_PREFIXES', () => {
  it('maps prefixes to the same URIs listed in OOXML_NAMESPACES', () => {
    expect(OOXML_PREFIXES.a).toBe(OOXML_NAMESPACES.drawingml);
    expect(OOXML_PREFIXES.p).toBe(OOXML_NAMESPACES.presentationml);
    expect(OOXML_PREFIXES.r).toBe(OOXML_NAMESPACES.relationships);
  });
});

/**
 * @description Relationship type URIs identify what an `_rels` entry
 * points at. Importers dispatch on these URIs; typos silently route to
 * the wrong handler.
 */
describe('OOXML_REL_TYPES', () => {
  it('covers every PPTX relationship type the exporter emits', () => {
    expect(OOXML_REL_TYPES.slide).toMatch(/relationships\/slide$/);
    expect(OOXML_REL_TYPES.slideMaster).toMatch(/relationships\/slideMaster$/);
    expect(OOXML_REL_TYPES.slideLayout).toMatch(/relationships\/slideLayout$/);
    expect(OOXML_REL_TYPES.theme).toMatch(/relationships\/theme$/);
    expect(OOXML_REL_TYPES.image).toMatch(/relationships\/image$/);
    expect(OOXML_REL_TYPES.customXml).toMatch(/relationships\/customXml$/);
  });
});

/**
 * @description Content-types strings drive `[Content_Types].xml`.
 * PowerPoint rejects a package with an unknown or misspelled content
 * type, so these values are load-bearing for "opens cleanly in
 * PowerPoint".
 */
describe('OOXML_CONTENT_TYPES', () => {
  it('declares the content-type strings for slide / master / layout / theme / rels', () => {
    expect(OOXML_CONTENT_TYPES.presentation).toContain('presentationml.presentation');
    expect(OOXML_CONTENT_TYPES.slide).toContain('presentationml.slide+xml');
    expect(OOXML_CONTENT_TYPES.slideMaster).toContain('slideMaster+xml');
    expect(OOXML_CONTENT_TYPES.slideLayout).toContain('slideLayout+xml');
    expect(OOXML_CONTENT_TYPES.theme).toContain('theme+xml');
    expect(OOXML_CONTENT_TYPES.rels).toContain('package.relationships+xml');
  });
});
