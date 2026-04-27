import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as fontkit from 'fontkit';
import { describe, expect, it } from 'vitest';

import { subsetFont } from './subset';

/**
 * Phase 4 `_shared/fonts/subset.ts` — `subsetFont` produces the
 * byte-minimal subset SVG `@font-face` embedding, PDF font subsetting,
 * and PPTX font embedding all call at export time. The happy-path
 * tests drive a committed codicon fixture (Microsoft VS Code, MIT)
 * per the `__fixtures__/MANIFEST.md` convention so the code path is
 * exercised end-to-end without network access.
 *
 * Error-path tests guarantee safe degradation (null) for
 * malformed / absent input per IO-D-18 — importers and preflight
 * invoke the wrapper on untrusted byte blobs and must never crash.
 */

const testFileDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(testFileDir, '__fixtures__', 'codicon.ttf');
const codiconBytes = new Uint8Array(readFileSync(fixturePath));

describe('subsetFont error paths', () => {
  /**
   * @description Absent input returns `null` so callers can invoke
   * unconditionally on an optional font buffer without pre-checks.
   */
  it('returns null for undefined bytes', () => {
    expect(subsetFont(undefined, [0x41])).toBeNull();
  });

  /**
   * @description Empty bytes return `null` rather than letting
   * fontkit throw on zero-length buffers.
   */
  it('returns null for empty bytes', () => {
    expect(subsetFont(new Uint8Array(0), [0x41])).toBeNull();
  });

  /**
   * @description Arbitrary non-font bytes return `null`; exporters
   * can pipe the subset call straight into a byte stream without a
   * try / catch guard.
   */
  it('returns null for invalid (non-font) bytes', () => {
    const garbage = new Uint8Array(1024);

    for (let i = 0; i < garbage.length; i++) garbage[i] = i % 256;

    expect(subsetFont(garbage, [0x41])).toBeNull();
  });

  /**
   * @description An empty codepoint set is meaningless — there is
   * nothing to render, so there is no subset to emit. Callers should
   * skip the embed entirely; returning `null` signals that cleanly.
   */
  it('returns null when no codepoints are requested', () => {
    expect(subsetFont(codiconBytes, [])).toBeNull();
  });
});

describe('subsetFont happy path', () => {
  /**
   * @description A real TTF subset round-trips cleanly: the output is
   * a non-empty byte buffer smaller than the input (subset, not
   * identity re-encode). Codicon is mostly ligatured glyph data, so
   * subsetting to a single codepoint shrinks it substantially.
   */
  it('subsets a real font and shrinks it', () => {
    // Codicon's private-use range starts at U+EA60. Pick a codepoint
    // the font actually covers so fontkit has a glyph to include.
    const codepoints = [0xea60];
    const subset = subsetFont(codiconBytes, codepoints);

    expect(subset).not.toBeNull();

    if (subset === null) return;

    expect(subset.byteLength).toBeGreaterThan(0);
    expect(subset.byteLength).toBeLessThan(codiconBytes.byteLength);
  });

  /**
   * @description Unknown codepoints (not present in the font) are
   * silently skipped rather than failing the whole subset — exporters
   * call this with any character ever typed into a text element, not
   * just the ones the font supports.
   */
  it('skips codepoints not present in the font', () => {
    const codepoints = [0xea60, 0xffffe /* unassigned */];
    const subset = subsetFont(codiconBytes, codepoints);

    expect(subset).not.toBeNull();
    expect((subset?.byteLength ?? 0) > 0).toBe(true);
  });

  /**
   * @description The returned bytes are a valid OpenType / TrueType
   * file — the first four bytes are one of the accepted TTF / OTF
   * signatures. PDF / SVG / PPTX embedders pass the subset straight
   * through to their respective format writers, so signature
   * correctness matters.
   */
  it('produces bytes with a valid TTF/OTF signature', () => {
    const subset = subsetFont(codiconBytes, [0xea60]);

    expect(subset).not.toBeNull();

    if (subset === null) return;

    // TTF: 0x00 0x01 0x00 0x00 (version 1.0)
    // TrueType ('true'): 0x74 0x72 0x75 0x65
    // OpenType CFF ('OTTO'): 0x4F 0x54 0x54 0x4F
    const signature = Array.from(subset.slice(0, 4));
    const acceptedSignatures: readonly (readonly number[])[] = [
      [0x00, 0x01, 0x00, 0x00],
      [0x74, 0x72, 0x75, 0x65],
      [0x4f, 0x54, 0x54, 0x4f],
    ];

    const matches = acceptedSignatures.some((accepted) =>
      accepted.every((byte, idx) => byte === signature[idx]),
    );

    expect(matches).toBe(true);
  });
});

/**
 * @description Byte-level structural fidelity of the subset output.
 *
 * Closes the spec gap in `project/spec/formats/pptx.md` line 512
 * ("Full font-embedding acceptance tests — byte-level OS/2 /
 * name-table assertions land when a license-clear font fixture is
 * available"). Codicon (MIT) is committed in `__fixtures__/` so
 * these assertions run unconditionally.
 *
 * After subsetting, the OS/2 and name tables MUST survive — PPTX's
 * `<p:embeddedFontLst>` and PDF's `/FontDescriptor` both require
 * embed-permission flags (OS/2 fsType) and the family / style names
 * (name records 1, 2, 6) for the embedded font to be usable in the
 * consuming reader.
 *
 * fontkit's CFF / TTF subsetter strips these tables by default;
 * `subsetFont` runs a post-process that copies OS/2 and name from
 * the source font into the subset's table directory.
 */
describe('subsetFont preserves OS/2 + name tables', () => {
  interface ParsedFont {
    readonly familyName: string | null;
    readonly subfamilyName: string | null;
    readonly postscriptName: string | null;
    readonly 'OS/2'?: {
      readonly fsType?: unknown;
      readonly usWeightClass?: number;
      readonly usWidthClass?: number;
    };
  }

  function parseSubset(codepoints: readonly number[]): ParsedFont {
    const subset = subsetFont(codiconBytes, codepoints);

    expect(subset).not.toBeNull();

    if (subset === null) {
      throw new Error('unreachable: subset is null after expect');
    }

    return fontkit.create(Buffer.from(subset)) as unknown as ParsedFont;
  }

  /**
   * @description The OS/2 table (`fsType` field) controls the
   * downstream embedder's permission to embed the font under
   * `ppt/fonts/` or in PDF `/FontFile2`. A subsetted output that
   * drops OS/2 leaves the embedder with no policy signal.
   */
  it('preserves the OS/2 table with a parseable fsType', () => {
    const font = parseSubset([0xea60]);
    const os2 = font['OS/2'];

    expect(os2, 'subset must include the OS/2 table').toBeDefined();
    expect(os2?.fsType, 'OS/2 fsType field must be parseable').toBeDefined();
  });

  /**
   * @description Codicon is a regular-weight icon font. Subsetting
   * MUST preserve the OS/2 weight + width class so the consuming
   * reader can pair the subset with its sibling weights at compose
   * time (PowerPoint, e.g., uses these to pick a fallback when the
   * exact subset isn't installed).
   */
  it('preserves OS/2 weight and width classes', () => {
    const font = parseSubset([0xea60]);
    const os2 = font['OS/2'];
    const expectedWeightClass = 400; // codicon Regular
    const expectedWidthClassMin = 1; // 1..9 valid range
    const expectedWidthClassMax = 9;

    expect(os2?.usWeightClass).toBe(expectedWeightClass);
    expect(os2?.usWidthClass ?? 0).toBeGreaterThanOrEqual(expectedWidthClassMin);
    expect(os2?.usWidthClass ?? 10).toBeLessThanOrEqual(expectedWidthClassMax);
  });

  /**
   * @description The name table family / subfamily / postscript
   * names are how PowerPoint matches the embedded subset against
   * the `<a:latin typeface="…"/>` reference in slide text. A
   * subsetted output that loses the name records ends up rendering
   * with the consumer's fallback font even though the embed went
   * through.
   */
  it('preserves the name table family, subfamily, and postscript records', () => {
    const font = parseSubset([0xea60]);

    expect(font.familyName).toBe('codicon');
    expect(font.subfamilyName).toBe('Regular');
    expect(font.postscriptName).toBe('codicon');
  });

  /**
   * @description Subsetting on a glyph the font does NOT cover is
   * still expected to produce a valid font (the includeAny guard
   * keeps any-glyph subsets out, but mixed input where SOME glyphs
   * cover should preserve the metadata tables for the rest).
   */
  it('preserves the OS/2 and name tables for mixed-coverage codepoint sets', () => {
    const codepoints = [0xea60, 0xfffd /* unassigned-but-valid */];
    const font = parseSubset(codepoints);
    const os2 = font['OS/2'];

    expect(os2).toBeDefined();
    expect(font.familyName).toBe('codicon');
  });
});
