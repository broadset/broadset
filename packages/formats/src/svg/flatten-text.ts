import * as fontkit from 'fontkit';

/**
 * P7.7i — Shared glyph-flatten utilities for the SVG track.
 *
 * The exporter's `flatten` mode and the importer's bake-on-import
 * path both need to lay out a string into per-glyph SVG path data
 * via fontkit's `font.layout`. This module owns the byte-level
 * layout primitives so both paths share the same geometry math.
 *
 * Returns RAW path-d strings (per glyph or concatenated) — the
 * caller wraps them in `<path d="…"/>` markup or feeds the
 * concatenated `d` through `svgpath().matrix(…)` for cumulative
 * transform baking.
 */

type FontkitCreateInput = Uint8Array | Buffer;
type FontkitFont = ReturnType<typeof fontkit.create>;

const fontkitCreate: (input: FontkitCreateInput) => FontkitFont = fontkit.create as (
  input: FontkitCreateInput,
) => FontkitFont;

/**
 * Open a fontkit `Font` from raw bytes. Returns `null` when bytes
 * are absent / unparseable so callers degrade gracefully (the
 * import-side flatten falls back to the warn + drop-scale path
 * when this returns null).
 */
export function safeOpenFont(bytes: Uint8Array | undefined): FontkitFont | null {
  if (bytes === undefined || bytes.byteLength === 0) return null;

  try {
    return fontkitCreate(bytes);
  } catch {
    return null;
  }
}

interface GlyphLayoutOptions {
  readonly fontSize: number;
  readonly letterSpacing?: number;
  readonly originX?: number;
  readonly originY?: number;
}

/**
 * Lay out `text` through the supplied font and return a single
 * concatenated SVG path-d string positioned at `originX, originY`.
 * The path uses absolute coordinates so callers can pre-multiply
 * the result by an arbitrary affine matrix via `svgpath`.
 *
 * Returns `''` when the font has no `layout` method, the layout
 * call throws, or every glyph in the run is `notdef` (codepoints
 * the font can't render).
 */
export function layoutTextAsPathD(text: string, font: FontkitFont, opts: GlyphLayoutOptions): string {
  if (text === '') return '';
  if (!('layout' in font) || typeof font.layout !== 'function') return '';

  const fontSize = opts.fontSize;
  const upem = font.unitsPerEm;
  const scale = fontSize / upem;
  const letterSpacing = opts.letterSpacing ?? 0;
  const originX = opts.originX ?? 0;
  const originY = opts.originY ?? 0;
  let cursorX = originX;

  let run: fontkit.GlyphRun;

  try {
    run = font.layout(text);
  } catch {
    return '';
  }

  const segments: string[] = [];

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i];
    const position = run.positions[i];

    if (glyph === undefined || position === undefined) continue;

    const advance = position.xAdvance * scale + letterSpacing;

    if (glyph.id !== 0) {
      // Glyph paths use the font's coordinate system (Y-up); SVG
      // is Y-down, so flip via `scale(scale, -scale)` then place
      // at the cursor on the baseline.
      const glyphSvg = glyph.path
        .scale(scale, -scale)
        .translate(cursorX + position.xOffset * scale, originY + position.yOffset * scale)
        .toSVG();

      if (glyphSvg !== '') {
        segments.push(glyphSvg);
      }
    }

    cursorX += advance;
  }

  return segments.join(' ');
}
