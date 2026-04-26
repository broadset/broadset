import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString, resolveStyleColor } from '@broadset/model';
import * as fontkit from 'fontkit';

import { resolveEmbedDecision } from '../_shared/fonts/embed-policy';
import { type EmbedPermission, readEmbedPermission } from '../_shared/fonts/font-ops';
import { subsetFont } from '../_shared/fonts/subset';
import { escapeXml } from './shared';
import { type FontEmbedChoice, type SvgFontSource } from './types';

/**
 * P7.7d — SVG font embedding pipeline.
 *
 * Owns three previously-deferred behaviours from `svg.md` → "Font
 * Embedding (Embed / Reference / Flatten)":
 *
 * - `'embed'` — subsets the supplied font to the codepoints actually
 *   used in the document, base64-encodes the bytes, and emits a
 *   single `@font-face` rule per family inside `<defs><style>`.
 * - `'reference'` — emits an external `url()` reference for callers
 *   that prefer to host the font alongside the SVG.
 * - `'flatten'` — replaces every `<text>` element with a `<g>` of
 *   `<path>` glyph outlines. The exporter substitutes the rendered
 *   element XML before the main render path runs so no `<text>`
 *   survives.
 *
 * Permission gating per IO-D-14: a restricted-permission font
 * (`OS/2.fsType` bit 1) MUST emit a warning and fall back to
 * `reference` mode for that family — the rendered SVG carries no
 * embedded bytes for that font.
 */

/**
 * Hard cap on font bytes accepted for embed. Prevents a 500 MB font
 * → ~700 MB base64 string memory blow-up. Real-world fonts subset to
 * a typical document fit comfortably under 5 MB; the 50 MB cap
 * accommodates whole-font embeds for non-subsettable formats with
 * generous headroom. Closes the security audit length-bomb finding.
 */
const FONT_EMBED_MAX_BYTES = 50 * 1024 * 1024;

type FontkitCreateInput = Uint8Array | Buffer;
type FontkitFont = ReturnType<typeof fontkit.create>;

const fontkitCreate: (input: FontkitCreateInput) => FontkitFont = fontkit.create as (
  input: FontkitCreateInput,
) => FontkitFont;

interface ResolvedFontEmission {
  readonly fontFaceRule: string | null;
  readonly mode: FontEmbedChoice;
  /** True when the family was processed at all (had bytes or a url). */
  readonly emitted: boolean;
}

export interface FontEmbedPlan {
  /** `<style>` body to inject into `<defs>` (empty string when no families). */
  readonly defsStyleBlock: string;
  /** Pre-rendered `<g>` blocks keyed by element id (flatten mode). */
  readonly flattenedTextElements: ReadonlyMap<string, string>;
  /** Warnings to surface to the caller. */
  readonly warnings: readonly string[];
}

const EMPTY_PLAN: FontEmbedPlan = {
  defsStyleBlock: '',
  flattenedTextElements: new Map(),
  warnings: [],
};

/**
 * Build the font-embedding plan for a document. Called once from
 * `exportSvgString` before the per-element render walk; the returned
 * plan carries the `<style>` body to inject into `<defs>` and a map
 * of pre-flattened text elements that the renderer substitutes for
 * the original `<text>` markup.
 */
export function planFontEmbedding(
  doc: BroadsetDocument,
  mode: FontEmbedChoice,
  fonts: ReadonlyMap<string, SvgFontSource> | undefined,
): FontEmbedPlan {
  const familiesUsed = collectFontFamiliesUsed(doc);

  if (familiesUsed.size === 0) {
    return EMPTY_PLAN;
  }

  const warnings: string[] = [];

  if (mode === 'flatten') {
    return planFlatten(doc, familiesUsed, fonts ?? new Map(), warnings);
  }

  return planEmbedOrReference(mode, familiesUsed, fonts ?? new Map(), warnings);
}

function planEmbedOrReference(
  mode: 'embed' | 'reference',
  familiesUsed: ReadonlyMap<string, ReadonlySet<number>>,
  fonts: ReadonlyMap<string, SvgFontSource>,
  warnings: string[],
): FontEmbedPlan {
  const fontFaceRules: string[] = [];

  for (const [family, codepoints] of familiesUsed) {
    const source = fonts.get(family);

    if (source === undefined) {
      if (mode === 'embed') {
        warnings.push(
          `Font embedding skipped for "${family}": no font bytes supplied. Pass options.fonts with this family or accept consumer-side font resolution.`,
        );
      }

      continue;
    }

    const emission = resolveSingleFamily(family, source, mode, codepoints, warnings);

    if (emission.fontFaceRule !== null) {
      fontFaceRules.push(emission.fontFaceRule);
    }
  }

  if (fontFaceRules.length === 0) {
    return { defsStyleBlock: '', flattenedTextElements: new Map(), warnings };
  }

  const styleBody = fontFaceRules.join('\n');
  const defsStyleBlock = `<style type="text/css">\n${styleBody}\n</style>`;

  return { defsStyleBlock, flattenedTextElements: new Map(), warnings };
}

function resolveSingleFamily(
  family: string,
  source: SvgFontSource,
  mode: 'embed' | 'reference',
  codepoints: ReadonlySet<number>,
  warnings: string[],
): ResolvedFontEmission {
  if (mode === 'reference') {
    return { fontFaceRule: buildReferenceRule(family, source, warnings), mode: 'reference', emitted: source.url !== undefined };
  }

  // mode === 'embed'
  const permission: EmbedPermission | null = source.permissionOverride ?? readEmbedPermission(source.bytes);
  const decision = resolveEmbedDecision(permission);

  if (decision.action === 'refuse') {
    if (decision.reason !== undefined) {
      warnings.push(`Font "${family}": ${decision.reason}`);
    }

    return { fontFaceRule: buildReferenceRule(family, source, warnings), mode: 'reference', emitted: source.url !== undefined };
  }

  if (decision.warning !== undefined) {
    warnings.push(`Font "${family}": ${decision.warning}`);
  }

  if (source.bytes === undefined) {
    warnings.push(
      `Font embedding fell back to reference for "${family}" (no bytes supplied; embed mode requires subsettable font bytes).`,
    );

    return { fontFaceRule: buildReferenceRule(family, source, warnings), mode: 'reference', emitted: source.url !== undefined };
  }

  const subset = subsetFont(source.bytes, codepoints) ?? source.bytes;

  if (subset.byteLength > FONT_EMBED_MAX_BYTES) {
    warnings.push(
      `Font "${family}" exceeds the ${String(FONT_EMBED_MAX_BYTES)}-byte embed cap (${String(subset.byteLength)} bytes after subset); falling back to reference.`,
    );

    return { fontFaceRule: buildReferenceRule(family, source, warnings), mode: 'reference', emitted: source.url !== undefined };
  }

  const base64 = encodeBase64(subset);
  const dataUri = `data:font/${mimeFontFormat(source.format)};base64,${base64}`;
  const rule = `@font-face { font-family: '${escapeCssString(family)}'; src: url('${dataUri}') format('${cssFontFormat(source.format)}'); }`;

  return { fontFaceRule: rule, mode: 'embed', emitted: true };
}

function buildReferenceRule(family: string, source: SvgFontSource, warnings: string[]): string | null {
  if (source.url === undefined) {
    return null;
  }

  if (!isAllowedFontUrlScheme(source.url)) {
    warnings.push(
      `Font "${family}": rejected reference URL with disallowed scheme. Only http(s), data:font/*, and relative URLs are allowed.`,
    );

    return null;
  }

  return `@font-face { font-family: '${escapeCssString(family)}'; src: url('${escapeCssUrl(source.url)}') format('${cssFontFormat(source.format)}'); }`;
}

function mimeFontFormat(format: SvgFontSource['format']): 'woff2' | 'ttf' | 'otf' {
  if (format === 'woff2') return 'woff2';
  if (format === 'otf') return 'otf';

  return 'ttf';
}

function cssFontFormat(format: SvgFontSource['format']): 'woff2' | 'truetype' | 'opentype' {
  if (format === 'woff2') return 'woff2';
  if (format === 'otf') return 'opentype';

  return 'truetype';
}

function planFlatten(
  doc: BroadsetDocument,
  familiesUsed: ReadonlyMap<string, ReadonlySet<number>>,
  fonts: ReadonlyMap<string, SvgFontSource>,
  warnings: string[],
): FontEmbedPlan {
  const flattenedTextElements = new Map<string, string>();
  const fontByFamily = new Map<string, FontkitFont>();

  for (const family of familiesUsed.keys()) {
    const source = fonts.get(family);

    if (source?.bytes === undefined) {
      warnings.push(
        `Font flatten skipped for "${family}": no font bytes supplied. Text elements using this family render with consumer fallback.`,
      );

      continue;
    }

    try {
      fontByFamily.set(family, fontkitCreate(source.bytes));
    } catch {
      warnings.push(`Font flatten failed to parse bytes for "${family}"; text element falls back to consumer rendering.`);
    }
  }

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const family = el.style.fontFamily;

    if (family === undefined) continue;

    const font = fontByFamily.get(family);

    if (font === undefined) continue;

    const flattened = renderTextAsGlyphPaths(el, font);

    if (flattened !== null) {
      flattenedTextElements.set(el.id, flattened);
    }
  }

  return { defsStyleBlock: '', flattenedTextElements, warnings };
}

function renderTextAsGlyphPaths(el: BroadsetElement, font: FontkitFont): string | null {
  const text = resolveContentAsPlainString(el.content);

  if (text === '') return null;

  if (!('layout' in font) || typeof font.layout !== 'function') return null;

  const fontSize = el.style.fontSize ?? 16;
  const upem = font.unitsPerEm;
  const scale = fontSize / upem;
  const ascent = 'ascent' in font ? font.ascent * scale : fontSize * 0.8;
  let cursorX = 0;
  const baselineY = ascent;
  const paths: string[] = [];

  let run;

  try {
    run = font.layout(text);
  } catch {
    return null;
  }

  for (let i = 0; i < run.glyphs.length; i++) {
    const glyph = run.glyphs[i];
    const position = run.positions[i];

    if (glyph === undefined || position === undefined) continue;

    if (glyph.id === 0) {
      cursorX += position.xAdvance * scale;
      continue;
    }

    const glyphSvg = glyph.path
      .scale(scale, -scale)
      .translate(cursorX + position.xOffset * scale, baselineY + position.yOffset * scale)
      .toSVG();

    paths.push(`<path d="${escapeXml(glyphSvg)}"/>`);
    cursorX += position.xAdvance * scale;
  }

  if (paths.length === 0) return null;

  const fontColorCss = resolveStyleColor(el.style.fontColor, { resolveTheme: false });
  const fillCss = fontColorCss !== undefined ? ` fill="${escapeXml(fontColorCss)}"` : '';
  const transform = `translate(${String(el.position.x)}, ${String(el.position.y)})`;

  return `<g id="${escapeXml(el.id)}" transform="${transform}"${fillCss}>${paths.join('')}</g>`;
}

function collectFontFamiliesUsed(doc: BroadsetDocument): Map<string, Set<number>> {
  const familyToCodepoints = new Map<string, Set<number>>();

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const family = el.style.fontFamily;

    if (family === undefined || family === '') continue;

    const codepoints = familyToCodepoints.get(family) ?? new Set<number>();
    const text = resolveContentAsPlainString(el.content);

    for (const ch of text) {
      const cp = ch.codePointAt(0);

      if (cp !== undefined) {
        codepoints.add(cp);
      }
    }

    familyToCodepoints.set(family, codepoints);
  }

  return familyToCodepoints;
}

function encodeBase64(bytes: Uint8Array): string {
  // Use Buffer when available (Node) for performance; fall back to
  // btoa-equivalent on the browser. The exporter currently runs only
  // in Node test/build environments, so Buffer is the fast path.
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

/**
 * Escape a CSS identifier-context string for safe inclusion inside a
 * single-quoted CSS string. Backslashes MUST be escaped first (so the
 * later `'` escape doesn't compose `\\'` → `\'`); control characters
 * (`\n`, `\r`, `\f`) and `<` are escaped via CSS hex-codepoint syntax
 * to prevent breaking out of `<style>` when the SVG is consumed in
 * HTML mode (where `<style>` is parsed as raw text terminated by
 * `</style`). Closes the security audit C1 finding.
 */
function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/[\n\r\f]/g, (ch) => `\\${ch.charCodeAt(0).toString(16)} `)
    .replace(/</g, '\\3c ');
}

function escapeCssUrl(url: string): string {
  return url
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, (ch) => `\\${ch.charCodeAt(0).toString(16)} `)
    .replace(/</g, '\\3c ');
}

/**
 * Reject font reference URLs that aren't http(s), data:font/* or
 * relative paths. Closes the security audit C1 sub-issue: a
 * `javascript:` or `vbscript:` URL in a font reference would not be
 * fetched as a font by browsers, but consumers running CSS-as-HTML
 * pipelines could surface it as an attack vector.
 */
function isAllowedFontUrlScheme(url: string): boolean {
  // Empty / relative path — allowed.
  if (url === '' || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) {
    return true;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);

  if (schemeMatch === null) {
    // No scheme means relative URL — allow.
    return true;
  }

  const scheme = (schemeMatch[1] ?? '').toLowerCase();

  if (scheme === 'http' || scheme === 'https') {
    return true;
  }

  if (scheme === 'data') {
    // Only data:font/* allowed.
    return /^data:font\//i.test(url);
  }

  return false;
}
