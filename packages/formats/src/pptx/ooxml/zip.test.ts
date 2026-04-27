import { describe, expect, it } from 'vitest';

import { decodeText, encodeText, readOoxmlPackage, readTextPart, writeOoxmlPackage } from './zip';

/**
 * @description An OOXML package is a plain ZIP; write + read must round
 * trip part paths, raw bytes, and UTF-8 text without corruption. The
 * exporter depends on byte-identical round-trip to preserve image
 * bytes (JPEG, PNG) without re-encoding.
 */
describe('OOXML ZIP round-trip', () => {
  it('round-trips text parts through write → read', () => {
    const parts = new Map<string, Uint8Array>([
      ['[Content_Types].xml', encodeText('<Types/>')],
      ['ppt/presentation.xml', encodeText('<p:presentation/>')],
    ]);

    const zipped = writeOoxmlPackage(parts);
    const pkg = readOoxmlPackage(zipped);

    expect(pkg.size).toBe(2);
    expect(readTextPart(pkg, '[Content_Types].xml')).toBe('<Types/>');
    expect(readTextPart(pkg, 'ppt/presentation.xml')).toBe('<p:presentation/>');
  });

  it('preserves binary bytes byte-identical (image preservation)', () => {
    const jpegMagic = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const parts = new Map<string, Uint8Array>([['ppt/media/image1.jpeg', jpegMagic]]);

    const zipped = writeOoxmlPackage(parts);
    const pkg = readOoxmlPackage(zipped);
    const readBack = pkg.get('ppt/media/image1.jpeg');

    expect(readBack).toBeDefined();
    expect(Array.from(readBack ?? [])).toEqual(Array.from(jpegMagic));
  });

  it('returns null for absent text parts so callers can branch without throwing', () => {
    const pkg = readOoxmlPackage(writeOoxmlPackage(new Map()));

    expect(readTextPart(pkg, 'ppt/does-not-exist.xml')).toBeNull();
  });
});

/**
 * @description UTF-8 encode / decode helpers must handle high-surrogate
 * content (emoji, CJK, RTL) without corruption.
 */
describe('UTF-8 encode / decode', () => {
  it('round-trips ASCII', () => {
    expect(decodeText(encodeText('hello'))).toBe('hello');
  });

  it('round-trips high-surrogate text', () => {
    const input = '日本語 العربية 🌈';

    expect(decodeText(encodeText(input))).toBe(input);
  });
});
