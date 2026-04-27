import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { registerFontkit } from './export/fonts';

/**
 * Path to the Liberation Sans TTF that ships with `pdfjs-dist` (already
 * a transitive dependency of @broadset/formats). 140 KB of real font
 * data — large enough to demonstrate subsetting savings, small enough
 * to embed in a unit test without slowing the suite. Resolved via
 * Node's module-resolution algorithm so the test works regardless of
 * which cwd vitest is launched from.
 */
const require = createRequire(import.meta.url);
const LIBERATION_SANS_PATH = require.resolve('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf');

async function loadLiberationSansBytes(): Promise<Uint8Array> {
  const data = await readFile(LIBERATION_SANS_PATH);

  return new Uint8Array(data);
}

async function buildPdfWithEmbeddedFont(
  fontBytes: Uint8Array,
  options: { readonly subset: boolean; readonly text: string },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  registerFontkit(pdf);

  const font = await pdf.embedFont(fontBytes, { subset: options.subset });
  const page = pdf.addPage([200, 200]);

  page.drawText(options.text, { x: 10, y: 100, size: 16, font });

  return await pdf.save({ useObjectStreams: false });
}

describe('Real font subsetting effectiveness', () => {
  /**
   * @description The end-to-end font subsetting pipeline (registered
   * fontkit + pdf-lib's `embedFont(bytes, { subset: true })`) MUST
   * produce a PDF significantly smaller than the same export with
   * `subset: false`. This is a real-byte test against a real 140 KB
   * TTF — proves subsetting actually reduces bytes, not just that
   * `{ subset: true }` is passed through.
   */
  it('subsets Liberation Sans down to a fraction of the full font when only "Hi" is rendered', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const fullPdfBytes = await buildPdfWithEmbeddedFont(fontBytes, { subset: false, text: 'Hi' });
    const subsetPdfBytes = await buildPdfWithEmbeddedFont(fontBytes, { subset: true, text: 'Hi' });

    // Subsetting "Hi" should shave off ~95% of the font bytes — even
    // accounting for PDF wrapping overhead, the subset PDF must be
    // less than 25% of the full-embed PDF.
    expect(subsetPdfBytes.length).toBeLessThan(fullPdfBytes.length * 0.25);
  });

  /**
   * @description Subsetting MUST scale to glyph coverage — a longer
   * text run with more unique glyphs needs more bytes than a shorter
   * one. Verifies the subsetter is actually choosing glyphs based on
   * usage rather than pulling a fixed slice.
   */
  it('grows the subset proportionally with glyph diversity', async () => {
    const fontBytes = await loadLiberationSansBytes();
    const tiny = await buildPdfWithEmbeddedFont(fontBytes, { subset: true, text: 'A' });
    const richer = await buildPdfWithEmbeddedFont(fontBytes, {
      subset: true,
      text: 'The quick brown fox jumps over the lazy dog',
    });

    // The richer text uses ~26 unique glyphs vs the tiny text's 1.
    // The richer subset PDF MUST be larger.
    expect(richer.length).toBeGreaterThan(tiny.length);
  });
});
