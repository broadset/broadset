import { describe, expect, it } from 'vitest';

import type { ElementMetaExtension } from '../types';
import { buildElementExt, parseElementExt } from './element-ext';

/**
 * @description `<a:ext>` entries carry every per-element Broadset
 * semantic that doesn't fit in the shape name. PowerPoint and Keynote
 * MUST preserve unknown `<a:ext>` elements verbatim on save, so the
 * build → parse round-trip is the spec's durability test.
 */
describe('buildElementExt / parseElementExt', () => {
  it('round-trips the minimal required fields (id + kind + dirty)', () => {
    const meta: ElementMetaExtension = { id: 'el-1', kind: 'rectangle', dirty: false };
    const xml = buildElementExt(meta);

    expect(xml).toContain('<a:ext uri="{broadset-element-ext}"');
    expect(xml).toContain('id="el-1"');
    expect(xml).toContain('kind="rectangle"');
    expect(xml).toContain('dirty="0"');
    expect(parseElementExt(xml)).toEqual(meta);
  });

  it('round-trips dataField / visibleWhen / repeater', () => {
    const meta: ElementMetaExtension = {
      id: 'el-2',
      kind: 'text',
      dirty: true,
      dataField: 'user.firstName',
      visibleWhen: 'user.active === true',
      repeater: 'items',
    };
    const xml = buildElementExt(meta);

    expect(parseElementExt(xml)).toEqual(meta);
  });

  it('round-trips originalKind when it differs from kind', () => {
    const meta: ElementMetaExtension = {
      id: 'el-3',
      kind: 'rectangle',
      dirty: false,
      originalKind: 'qrcode',
    };
    const xml = buildElementExt(meta);

    expect(parseElementExt(xml)).toEqual(meta);
  });

  it('round-trips the animations array', () => {
    const meta: ElementMetaExtension = {
      id: 'el-4',
      kind: 'ellipse',
      dirty: true,
      animations: ['anim-1', 'anim-2'],
    };
    const xml = buildElementExt(meta);
    const parsed = parseElementExt(xml);

    expect(parsed?.animations).toEqual(['anim-1', 'anim-2']);
  });

  it('round-trips a preservedBlob with XML-special characters escaped', () => {
    const meta: ElementMetaExtension = {
      id: 'el-5',
      kind: 'group',
      dirty: false,
      preservedBlob: '<a:tbl><!-- hi "&" world --></a:tbl>',
    };
    const xml = buildElementExt(meta);
    const parsed = parseElementExt(xml);

    expect(parsed?.preservedBlob).toBe(meta.preservedBlob);
  });

  it('returns null for XML without the broadset-element-ext URI', () => {
    expect(parseElementExt('<a:ext uri="{some-other-ext}" />')).toBeNull();
    expect(parseElementExt('<p:cNvPr/>')).toBeNull();
    expect(parseElementExt('')).toBeNull();
  });

  it('parses dirty="1" as true and dirty="0" as false (also accepts legacy "true"/"false")', () => {
    const ns = ' xmlns:bset="https://broadset.io/ns/pptx/1.0/"';
    const xmlDirty = `<a:ext uri="{broadset-element-ext}"><bset:elementMeta${ns} id="x" kind="y" dirty="1"/></a:ext>`;
    const xmlClean = `<a:ext uri="{broadset-element-ext}"><bset:elementMeta${ns} id="x" kind="y" dirty="0"/></a:ext>`;
    const xmlLegacy = `<a:ext uri="{broadset-element-ext}"><bset:elementMeta${ns} id="x" kind="y" dirty="true"/></a:ext>`;

    expect(parseElementExt(xmlDirty)?.dirty).toBe(true);
    expect(parseElementExt(xmlClean)?.dirty).toBe(false);
    expect(parseElementExt(xmlLegacy)?.dirty).toBe(true);
  });

  it('omits optional fields from the XML when they are absent', () => {
    const meta: ElementMetaExtension = { id: 'el-1', kind: 'rectangle', dirty: false };
    const xml = buildElementExt(meta);

    expect(xml).not.toContain('dataField');
    expect(xml).not.toContain('visibleWhen');
    expect(xml).not.toContain('repeater');
    expect(xml).not.toContain('originalKind');
    expect(xml).not.toContain('animations');
    expect(xml).not.toContain('preservedBlob');
  });
});
