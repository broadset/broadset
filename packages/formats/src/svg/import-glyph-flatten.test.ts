/**
 * P7.7i — Import-side glyph flatten for `<text>` under baking
 * transforms.
 *
 * Per `project/spec/formats/svg.md` →
 * "Full Transform Parsing and Composition on Import" — when a
 * `<text>` element sits under an ancestor whose cumulative
 * transform requires bake (scale / skew / non-decomposable
 * matrix), Broadset has no native element-level text scale
 * (IO-D-02). Earlier loops dropped the scale to translate-only
 * with a warning; this unit closes that gap by glyph-flattening
 * the text on import when the caller supplies font bytes.
 *
 * The flatten produces a single `path` element whose `d` carries
 * the per-glyph outlines pre-multiplied by the cumulative matrix,
 * so the visual result on re-render matches the source SVG. The
 * text content / font-family identity is lost (lossy round-trip
 * by definition — same trade-off the export `flatten` mode makes).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { importSvgDocument } from './index';
import { type SvgFontSource } from './types';

const FIXTURE_PATH = resolve(__dirname, '../_shared/fonts/__fixtures__/codicon.ttf');

function loadCodicon(): Uint8Array {
  return new Uint8Array(readFileSync(FIXTURE_PATH));
}

const CODICON_GLYPH = String.fromCodePoint(0xea60);

describe('P7.7i — Import-side glyph flatten', () => {
  /**
   * @description When `<text>` sits under a `scale()` ancestor and
   * `fontSources` carries bytes for the family, the importer MUST
   * emit a `path` element (glyph outlines baked through the
   * cumulative matrix) instead of a text element with the scale
   * dropped. No warning about scale loss should fire — the bake
   * is the resolution.
   */
  it('flattens text to glyph paths when baking transform + fontSources are present', () => {
    const bytes = loadCodicon();
    const fontSources = new Map<string, SvgFontSource>([['Codicon', { bytes, format: 'ttf' }]]);
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2)">
        <text x="0" y="20" font-family="Codicon" font-size="16">${CODICON_GLYPH}</text>
      </g>
    </svg>`;
    const { document, warnings } = importSvgDocument(input, 'Test', { fontSources });
    const text = document.elements.find((el) => el.type === 'text');
    const path = document.elements.find((el) => el.type === 'path');

    expect(text).toBeUndefined();
    expect(path).toBeDefined();
    expect(typeof path?.content).toBe('string');
    expect(path?.content).toMatch(/M/); // contains a move command
    expect(warnings.some((w) => /scale\/skew on a <text>/i.test(w))).toBe(false);
  });

  /**
   * @description Without `fontSources` the importer can't lay out
   * glyphs, so the existing behaviour (warn + translate-only)
   * MUST still fire. Pinning the fallback so we don't accidentally
   * break it.
   */
  it('falls back to warn-and-drop-scale when fontSources is missing', () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2)">
        <text x="0" y="20" font-family="Codicon" font-size="16">A</text>
      </g>
    </svg>`;
    const { document, warnings } = importSvgDocument(input);
    const text = document.elements.find((el) => el.type === 'text');

    expect(text).toBeDefined();
    expect(warnings.some((w) => /scale\/skew on a <text>/i.test(w))).toBe(true);
  });

  /**
   * @description When fontSources is present BUT doesn't carry
   * the family the `<text>` references, the importer MUST emit
   * a warning naming the missing family and fall back to the
   * translate-only behaviour. Closes the false-positive surface
   * where a caller supplies the wrong font bundle.
   */
  it('warns when fontSources is present but missing the referenced family', () => {
    const bytes = loadCodicon();
    const fontSources = new Map<string, SvgFontSource>([['SomethingElse', { bytes, format: 'ttf' }]]);
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="scale(2)">
        <text x="0" y="20" font-family="Codicon" font-size="16">A</text>
      </g>
    </svg>`;
    const { document, warnings } = importSvgDocument(input, 'Test', { fontSources });
    const text = document.elements.find((el) => el.type === 'text');

    expect(text).toBeDefined();
    expect(warnings.some((w) => /Codicon/i.test(w))).toBe(true);
  });

  /**
   * @description Text under a NON-baking transform (pure
   * translate or rotate) MUST still import as a native text
   * element regardless of `fontSources`. The flatten path is
   * only the resolution for non-decomposable scale / skew.
   */
  it('keeps native <text> when ancestor transform does not require bake', () => {
    const bytes = loadCodicon();
    const fontSources = new Map<string, SvgFontSource>([['Codicon', { bytes, format: 'ttf' }]]);
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
      <g transform="translate(10, 20)">
        <text x="0" y="20" font-family="Codicon" font-size="16">A</text>
      </g>
    </svg>`;
    const { document } = importSvgDocument(input, 'Test', { fontSources });
    const text = document.elements.find((el) => el.type === 'text');
    const path = document.elements.find((el) => el.type === 'path');

    expect(text).toBeDefined();
    expect(path).toBeUndefined();
  });
});
