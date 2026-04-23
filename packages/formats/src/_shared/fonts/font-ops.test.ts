import { describe, expect, it } from 'vitest';

import { getFontMetrics, getGlyphToUnicodeMap, readEmbedPermission } from './font-ops';

/**
 * Phase 2 `_shared/fonts/` — tests pin the error-path behavior of
 * every wrapper function so callers (importers, preflight) can
 * invoke them on untrusted byte blobs without crashing. Byte-level
 * happy-path tests land with the Phase 4 asset pipeline where real
 * font fixtures arrive; until then the wrapper guarantees safe
 * degradation (null / empty results) for malformed input per
 * IO-D-18.
 */

describe('getFontMetrics', () => {
  /**
   * @description Absent input returns `null` so callers can invoke
   * unconditionally on an optional font buffer.
   */
  it('returns null for undefined input', () => {
    expect(getFontMetrics(undefined)).toBeNull();
  });

  /**
   * @description Empty bytes return `null` (there's no font data to
   * parse). Avoids fontkit's internal parser throwing on zero-length
   * buffers.
   */
  it('returns null for empty input', () => {
    expect(getFontMetrics(new Uint8Array(0))).toBeNull();
  });

  /**
   * @description Arbitrary non-font bytes return `null` rather than
   * throwing the fontkit parse error. Importers processing arbitrary
   * uploads rely on this.
   */
  it('returns null for invalid (non-font) bytes', () => {
    const garbage = new Uint8Array(1024);

    for (let i = 0; i < garbage.length; i++) garbage[i] = i % 256;

    expect(getFontMetrics(garbage)).toBeNull();
  });
});

describe('readEmbedPermission', () => {
  /**
   * @description Absent input returns `null` — consumers treat this
   * as "unknown" and surface a preflight warning if the font can't be
   * audited.
   */
  it('returns null for undefined input', () => {
    expect(readEmbedPermission(undefined)).toBeNull();
  });

  /**
   * @description Empty bytes return `null`.
   */
  it('returns null for empty input', () => {
    expect(readEmbedPermission(new Uint8Array(0))).toBeNull();
  });

  /**
   * @description Invalid (non-font) bytes return `null`; no throw.
   */
  it('returns null for invalid bytes', () => {
    const garbage = new Uint8Array(512).fill(0x20);

    expect(readEmbedPermission(garbage)).toBeNull();
  });
});

describe('getGlyphToUnicodeMap', () => {
  /**
   * @description Absent input returns an empty map. Iterating an
   * empty map is a safe no-op for PDF ToUnicode emitters.
   */
  it('returns an empty map for undefined input', () => {
    expect(getGlyphToUnicodeMap(undefined).size).toBe(0);
  });

  /**
   * @description Empty bytes return an empty map.
   */
  it('returns an empty map for empty input', () => {
    expect(getGlyphToUnicodeMap(new Uint8Array(0)).size).toBe(0);
  });

  /**
   * @description Invalid bytes return an empty map.
   */
  it('returns an empty map for invalid bytes', () => {
    expect(getGlyphToUnicodeMap(new Uint8Array(128)).size).toBe(0);
  });
});
