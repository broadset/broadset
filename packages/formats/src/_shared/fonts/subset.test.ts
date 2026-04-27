import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

    const matches = acceptedSignatures.some((accepted) => accepted.every((byte, idx) => byte === signature[idx]));

    expect(matches).toBe(true);
  });
});
