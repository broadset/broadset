import * as fontkit from 'fontkit';

/**
 * Phase 2 `_shared/fonts/` — thin fontkit wrapper consumed by every
 * format's font-embedding path. The Phase 4 asset pipeline will light
 * up richer capabilities (Google Fonts fetch, system-font matching,
 * subsetting); this module ships the byte-level byte-aware surface
 * available today: metrics, embed-permission inspection, and the
 * glyph → Unicode map every PDF / PDF/A importer needs.
 */

export interface FontMetrics {
  readonly ascender: number;
  readonly descender: number;
  readonly lineGap: number;
  readonly unitsPerEm: number;
  readonly capHeight: number | undefined;
  readonly xHeight: number | undefined;
}

export type EmbedPermission = 'installable' | 'editable' | 'preview-print' | 'restricted';

/**
 * Opens a font from raw bytes using fontkit. Returns `null` when the
 * buffer is absent, empty, or unparseable so callers (importers,
 * preflight warnings) degrade gracefully rather than crashing per
 * IO-D-18.
 */
// The `@types/fontkit` definitions target Node's historical
// `Buffer<ArrayBufferLike>` shape; recent `@types/node` tightened the
// generic so `Buffer.from(Uint8Array)` produces a `Buffer<any>` that
// the type system considers incompatible. `fontkit.create` accepts
// any `Uint8Array`-like buffer at runtime — the shim below declares
// the wider surface explicitly so the call site stays type-safe.
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
 * Returns font metrics (ascender / descender / unitsPerEm and the
 * hinting metrics) so PDF / PPTX exporters can position glyphs
 * without re-parsing the font. Returns `null` for invalid input.
 */
export function getFontMetrics(bytes: Uint8Array | undefined): FontMetrics | null {
  const font = safeOpen(bytes);

  if (font === null || !('ascent' in font)) return null;

  const capHeight = 'capHeight' in font ? (font as { readonly capHeight?: number }).capHeight : undefined;
  const xHeight = 'xHeight' in font ? (font as { readonly xHeight?: number }).xHeight : undefined;

  return {
    ascender: font.ascent,
    descender: font.descent,
    lineGap: font.lineGap,
    unitsPerEm: font.unitsPerEm,
    capHeight,
    xHeight,
  };
}

/**
 * Reads the `OS/2.fsType` bit field and returns the coarsest Broadset
 * permission bucket:
 *
 * - `installable`: unrestricted embedding (fsType bit 0 clear)
 * - `editable`: embedded with edit rights (fsType bit 3 set)
 * - `preview-print`: embedded for preview / print only (bit 2 set)
 * - `restricted`: no embedding allowed (bit 1 set)
 *
 * Returns `null` for invalid input or when the OS/2 table is absent.
 */
export function readEmbedPermission(bytes: Uint8Array | undefined): EmbedPermission | null {
  const font = safeOpen(bytes);

  if (font === null) return null;

  // fontkit surfaces the OS/2 table under `font['OS/2']`. Older / non-
  // TrueType fonts may not have one; degrade to 'installable' per the
  // OpenType spec default.
  const os2 = (font as { readonly 'OS/2'?: { readonly fsType?: number } })['OS/2'];

  if (os2 === undefined || typeof os2.fsType !== 'number') return 'installable';

  const fsType = os2.fsType;

  if ((fsType & 0x0002) !== 0) return 'restricted';
  if ((fsType & 0x0004) !== 0) return 'preview-print';
  if ((fsType & 0x0008) !== 0) return 'editable';

  return 'installable';
}

/**
 * Extracts the glyph ID → codepoints map. PDF ToUnicode CMap
 * generation and PDF/A-2b total-coverage enforcement both need this
 * (ActualText fallback when the same glyph maps to multiple chars,
 * e.g. ligatures).
 *
 * Returns an empty map for invalid input. Values are `readonly
 * number[]` because a single glyph may back multiple codepoints
 * (fi ligature → ['f','i']).
 */
export function getGlyphToUnicodeMap(bytes: Uint8Array | undefined): ReadonlyMap<number, readonly number[]> {
  const font = safeOpen(bytes);

  if (font === null || !('characterSet' in font) || !('glyphForCodePoint' in font)) return new Map();

  const accumulator = new Map<number, number[]>();

  for (const codepoint of font.characterSet) {
    try {
      const glyph = font.glyphForCodePoint(codepoint);
      const existing = accumulator.get(glyph.id);

      if (existing === undefined) {
        accumulator.set(glyph.id, [codepoint]);
      } else {
        existing.push(codepoint);
      }
    } catch {
      // fontkit throws on malformed CMap entries — skip and continue.
    }
  }

  const result = new Map<number, readonly number[]>();

  for (const [glyphId, codepoints] of accumulator) {
    result.set(glyphId, [...codepoints]);
  }

  return result;
}
