import * as fontkit from 'fontkit';

/**
 * Phase 4 `_shared/fonts/subset.ts` — produces a byte-minimal font
 * subset covering exactly the Unicode codepoints a document actually
 * renders. Consumed by SVG `@font-face` embedding, PDF font
 * subsetting, and PPTX font embedding per the asset-pipeline plan.
 *
 * Inputs are `Uint8Array` bytes plus an iterable of codepoints; the
 * caller resolves `FontAsset.source` to bytes before invoking. This
 * keeps the subsetter pure: no async / network / ZIP access, and
 * safe to invoke from sync export pipelines.
 *
 * Error-path contract: invalid / absent input returns `null` rather
 * than throwing (IO-D-18 no silent drops — but subsetting failure is
 * recoverable; the caller falls back to the full font embed).
 */

// See font-ops.ts for the rationale behind the fontkit typing shim.
type FontkitCreateInput = Uint8Array | Buffer;
type FontkitFont = ReturnType<typeof fontkit.create>;

const fontkitCreate: (input: FontkitCreateInput) => FontkitFont = fontkit.create as (
  input: FontkitCreateInput,
) => FontkitFont;

function safeOpen(bytes: Uint8Array | undefined): FontkitFont | null {
  if (bytes === undefined || bytes.byteLength === 0) return null;

  try {
    return fontkitCreate(bytes);
  } catch {
    return null;
  }
}

/**
 * Subsets the font down to the glyphs required for `codepoints`.
 * Returns the encoded subset bytes, or `null` when the input is
 * malformed, the font does not expose a subsetter, or the codepoint
 * set is empty (nothing to render).
 *
 * Unknown codepoints (not present in the font's character map) are
 * silently skipped — exporters call this with every character ever
 * typed into a text element, not just the ones the font supports.
 */
export function subsetFont(bytes: Uint8Array | undefined, codepoints: Iterable<number>): Uint8Array | null {
  const font = safeOpen(bytes);

  if (font === null) return null;

  const codepointArray = Array.from(codepoints);

  if (codepointArray.length === 0) return null;

  if (!('createSubset' in font) || typeof font.createSubset !== 'function') return null;
  if (!('glyphForCodePoint' in font) || typeof font.glyphForCodePoint !== 'function') return null;

  let subset;

  try {
    subset = font.createSubset();
  } catch {
    return null;
  }

  let includedAny = false;

  for (const codepoint of codepointArray) {
    try {
      const glyph = font.glyphForCodePoint(codepoint);

      if (glyph.id === 0) continue; // notdef — codepoint not in the font

      subset.includeGlyph(glyph);
      includedAny = true;
    } catch {
      // fontkit throws on malformed CMap entries — skip and continue.
    }
  }

  if (!includedAny) return null;

  try {
    const encoded = subset.encode();

    return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  } catch {
    return null;
  }
}
