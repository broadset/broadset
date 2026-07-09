import { describe, expect, it } from 'vitest';

import { decodeShapeName, encodeShapeName, hasBroadsetPrefix } from './shape-name';

/**
 * @description Shape-name tags survive PowerPoint save/load cleanly —
 * the spec's primary element-identity carrier for round-trip. Every
 * Broadset-exported shape MUST have a recoverable `BSET:{id}:{kind}`
 * tag.
 */
describe('encodeShapeName / decodeShapeName', () => {
  it('round-trips a minimal tag (id + kind)', () => {
    const tag = { id: 'el-1', kind: 'rectangle' };
    const encoded = encodeShapeName(tag);

    expect(encoded).toBe('BSET:el-1:rectangle');
    expect(decodeShapeName(encoded)).toEqual(tag);
  });

  it('round-trips a tag with dataField', () => {
    const tag = { id: 'el-2', kind: 'text', dataField: 'user.firstName' };
    const encoded = encodeShapeName(tag);

    expect(encoded).toBe('BSET:el-2:text:user.firstName');
    expect(decodeShapeName(encoded)).toEqual(tag);
  });

  it('escapes colons in dataField so the decoder can still split fields', () => {
    const tag = { id: 'el-3', kind: 'text', dataField: 'ns:Field:nested' };
    const encoded = encodeShapeName(tag);

    expect(decodeShapeName(encoded)).toEqual(tag);
  });

  it('escapes colons in id and kind (defence-in-depth)', () => {
    const tag = { id: 'has:colon', kind: 'rectangle' };
    const encoded = encodeShapeName(tag);

    expect(encoded).toContain('%3A');
    expect(decodeShapeName(encoded)).toEqual(tag);
  });

  it('escapes percent signs to prevent double-unescape corruption', () => {
    const tag = { id: '50%off', kind: 'text' };
    const encoded = encodeShapeName(tag);

    expect(decodeShapeName(encoded)).toEqual(tag);
  });
});

/**
 * @description decodeShapeName returns null for names the user renamed
 * past the `BSET:` prefix; callers must fall back to fingerprint
 * matching in that case.
 */
describe('decodeShapeName — non-Broadset shapes', () => {
  it('returns null for names without the BSET prefix', () => {
    expect(decodeShapeName('Rectangle 4')).toBeNull();
    expect(decodeShapeName('')).toBeNull();
    expect(decodeShapeName('Freeform: Shape 12')).toBeNull();
  });

  it('returns null for truncated BSET tags', () => {
    expect(decodeShapeName('BSET:')).toBeNull();
    expect(decodeShapeName('BSET:el-1')).toBeNull();
  });
});

/**
 * @description hasBroadsetPrefix lets callers distinguish "this was a
 * Broadset shape that got corrupted" from "this was never a Broadset
 * shape".
 */
describe('hasBroadsetPrefix', () => {
  it('returns true for any name starting with BSET:', () => {
    expect(hasBroadsetPrefix('BSET:')).toBe(true);
    expect(hasBroadsetPrefix('BSET:el-1:rectangle')).toBe(true);
  });

  it('returns false for non-Broadset names', () => {
    expect(hasBroadsetPrefix(undefined)).toBe(false);
    expect(hasBroadsetPrefix('')).toBe(false);
    expect(hasBroadsetPrefix('Rectangle 1')).toBe(false);
  });
});
