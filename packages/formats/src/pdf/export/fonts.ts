import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import fontkit from '@pdf-lib/fontkit';
import { type PDFDocument, type PDFFont, StandardFonts } from 'pdf-lib';

import { safeFetchBytes } from '../../_shared/network/safe-fetch';
import { normalizeFontFamily, resolveGoogleFontUrl } from '../fonts';
import { decompressWoff2Bytes } from './woff2-decompress';

/**
 * Hosts allowed for the Google Fonts embed path. Tightens the export
 * boundary so a hostile project file with a `fontFamily` shaped to
 * coerce an arbitrary URL cannot land remote bytes from outside the
 * Google Fonts CDN. The CSS endpoint and the static-assets CDN are
 * intentionally separate: a CSS response cannot pivot font-byte
 * downloads back through the CSS host.
 */
const GOOGLE_FONTS_CSS_ALLOWED_HOSTS = new Set(['fonts.googleapis.com']);
const GOOGLE_FONTS_ASSET_ALLOWED_HOSTS = new Set(['fonts.gstatic.com']);

/**
 * Cap on font CSS / binary fetches. CSS is a few KB; the largest
 * statically-served Google Fonts WOFF2 binaries are well under 1 MB.
 * 5 MiB leaves comfortable headroom while bounding the buffer.
 */
const DEFAULT_FONT_FETCH_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_FONT_FETCH_TIMEOUT_MS = 10_000;

/** Weight threshold above which a font is considered bold. */
const BOLD_WEIGHT_THRESHOLD = 700;

/** Map of normalized family name → pdf-lib Standard14 font name. */
const STANDARD_FONT_MAP: ReadonlyMap<string, StandardFonts> = new Map([
  ['helvetica', StandardFonts.Helvetica],
  ['arial', StandardFonts.Helvetica],
  ['timesroman', StandardFonts.TimesRoman],
  ['times', StandardFonts.TimesRoman],
  ['times new roman', StandardFonts.TimesRoman],
  ['courier', StandardFonts.Courier],
  ['courier new', StandardFonts.Courier],
]);

const STANDARD_BOLD_MAP: ReadonlyMap<StandardFonts, StandardFonts> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  [StandardFonts.Courier, StandardFonts.CourierBold],
]);

const STANDARD_ITALIC_MAP: ReadonlyMap<StandardFonts, StandardFonts> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaOblique],
  [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic],
  [StandardFonts.Courier, StandardFonts.CourierOblique],
]);

const STANDARD_BOLD_ITALIC_MAP: ReadonlyMap<StandardFonts, StandardFonts> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaBoldOblique],
  [StandardFonts.TimesRoman, StandardFonts.TimesRomanBoldItalic],
  [StandardFonts.Courier, StandardFonts.CourierBoldOblique],
]);

/**
 * Identifies a font face uniquely by family + weight bucket + italic
 * flag. The export pipeline embeds one PDFFont per identity so bold /
 * italic / bold-italic combinations of a family resolve to the
 * matching standard-font variant.
 */
interface FontIdentity {
  readonly familyKey: string;
  readonly isBold: boolean;
  readonly isItalic: boolean;
}

/**
 * Map key for storing a `PDFFont` per `FontIdentity`.
 */
function identityKey(id: FontIdentity): string {
  return `${id.familyKey}|${id.isBold ? 'b' : 'r'}|${id.isItalic ? 'i' : 'u'}`;
}

/**
 * Compute the font identity of an element's text style. Bold / italic
 * thresholds match the prior `@libpdf/core` selection rules so the
 * pdf-lib swap stayed behaviour-preserving.
 */
export function elementFontIdentity(el: BroadsetElement): FontIdentity {
  const family = el.style.fontFamily ?? '';
  const weight = el.style.fontWeight;
  const style = el.style.fontStyle;

  return {
    familyKey: normalizeFontFamily(family),
    isBold: weight !== undefined && weight >= BOLD_WEIGHT_THRESHOLD,
    isItalic: style === 'italic' || style === 'oblique',
  };
}

/**
 * Pick the bold / italic / bold-italic variant of a Standard 14 font.
 */
function selectStandardFontVariant(base: StandardFonts, isBold: boolean, isItalic: boolean): StandardFonts {
  if (isBold && isItalic) {
    return STANDARD_BOLD_ITALIC_MAP.get(base) ?? base;
  }

  if (isBold) {
    return STANDARD_BOLD_MAP.get(base) ?? base;
  }

  if (isItalic) {
    return STANDARD_ITALIC_MAP.get(base) ?? base;
  }

  return base;
}

/**
 * Outcome of a single font-resolution attempt. The font itself is the
 * embedded `PDFFont`; `failure` carries a human-readable explanation
 * when the attempt did NOT yield the requested face and we fell back
 * to a Standard 14 variant. Per IO-D-18 ("no silent drops") the
 * exporter MUST surface the failure as a preflight warning.
 */
interface ResolvedFontIdentity {
  readonly font: PDFFont;
  readonly failure?: string;
}

/**
 * Optional per-call resolver settings. `subsetFonts: false` opts back
 * into pdf-lib's full-font embed (used by archival workflows where the
 * original face must round-trip byte-for-byte). `subsetFonts: true`
 * (the default) routes through pdf-lib's fontkit-backed subsetter.
 */
interface ResolveIdentityOptions {
  readonly subsetFonts?: boolean | undefined;
  readonly fontFetchTimeoutMs?: number | undefined;
  readonly fontMaxBytes?: number | undefined;
  readonly fontBytes?: Uint8Array | undefined;
}

/**
 * Embed a single `PDFFont` for a (family, isBold, isItalic) identity.
 * Tries Standard 14 lookup first; falls back to the Google Fonts CSS
 * resolution path when the family name is not a Standard 14; final
 * fallback is the matching Helvetica variant.
 *
 * Returns `failure` populated when the requested family was a real
 * custom face that we could NOT embed (Google Fonts unreachable,
 * fontkit rejected the format, etc.). Standard 14 hits leave
 * `failure` undefined.
 *
 * Custom fonts route through pdf-lib's `CustomFontSubsetEmbedder` (the
 * default `{ subset: true }` path) which uses the registered
 * `@pdf-lib/fontkit` adapter to emit a glyph-only subset plus the
 * `/ToUnicode` CMap so the text remains copy-pastable. Pass
 * `options.subsetFonts: false` to opt back into pdf-lib's
 * `CustomFontEmbedder` for an archival full-face embed.
 */
export async function resolveIdentity(
  family: string,
  isBold: boolean,
  isItalic: boolean,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch | undefined,
  options: ResolveIdentityOptions = {},
): Promise<ResolvedFontIdentity> {
  const normalized = normalizeFontFamily(family);
  const standard = STANDARD_FONT_MAP.get(normalized);

  if (options.fontBytes !== undefined) {
    const maxBytes = positiveIntegerOrDefault(options.fontMaxBytes, DEFAULT_FONT_FETCH_MAX_BYTES);

    if (options.fontBytes.byteLength > maxBytes) {
      return {
        font: await pdf.embedFont(selectStandardFontVariant(StandardFonts.Helvetica, isBold, isItalic)),
        failure: `PDF preflight: font "${family}" exceeds configured cap (${String(maxBytes)}); falling back to Helvetica.`,
      };
    }

    try {
      return { font: await embedFontBytes(pdf, options.fontBytes, options) };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'fontkit rejected the supplied bytes';

      return {
        font: await pdf.embedFont(selectStandardFontVariant(StandardFonts.Helvetica, isBold, isItalic)),
        failure: `PDF preflight: font "${family}" failed to embed (${reason}); falling back to Helvetica.`,
      };
    }
  }

  if (standard !== undefined) {
    return { font: await pdf.embedFont(selectStandardFontVariant(standard, isBold, isItalic)) };
  }

  if (fetchFn && family.trim().length > 0) {
    const result = await tryEmbedGoogleFont(family, pdf, fetchFn, options);

    if (result.font !== null) {
      return { font: result.font };
    }

    const fallback = await pdf.embedFont(selectStandardFontVariant(StandardFonts.Helvetica, isBold, isItalic));

    return { font: fallback, failure: result.failure ?? defaultFontFailure(family) };
  }

  return { font: await pdf.embedFont(selectStandardFontVariant(StandardFonts.Helvetica, isBold, isItalic)) };
}

function defaultFontFailure(family: string): string {
  return `PDF preflight: font "${family}" could not be embedded; falling back to Helvetica.`;
}

/**
 * Register the `@pdf-lib/fontkit` adapter on the document so any
 * subsequent `pdf.embedFont(bytes, { subset: true })` call subsets the
 * font to the glyphs actually referenced in the document. Idempotent —
 * registering twice is a no-op for pdf-lib.
 *
 * Call this once at the start of every export pass; the cost is a
 * single object allocation when no custom fonts are embedded.
 */
export function registerFontkit(pdf: PDFDocument): void {
  pdf.registerFontkit(fontkit);
}

/**
 * Aggregate result of `resolveFonts`. Carries the identity-keyed
 * `PDFFont` map plus the list of human-readable failure messages that
 * the export pipeline must surface as preflight warnings (per IO-D-18).
 */
interface ResolvedFontMap {
  readonly fontMap: ReadonlyMap<string, PDFFont>;
  readonly failures: readonly string[];
}

/**
 * Per-call options for `resolveFonts`. `subsetFonts` defaults to true
 * per `PdfExportOptions.subsetFonts` (IO-D-09); pass `false` to embed
 * the full SFNT for every fetched custom font. `subsetFonts: false` is
 * intended for archival workflows where the original face must be
 * present byte-for-byte; the default path reduces a typical Inter
 * embed from ~200 KB → ~10 KB by routing through pdf-lib's
 * `CustomFontSubsetEmbedder`.
 */
interface ResolveFontsOptions {
  readonly subsetFonts?: boolean | undefined;
  readonly fontFetchTimeoutMs?: number | undefined;
  readonly fontMaxBytes?: number | undefined;
  readonly fontBytesByFamily?: ReadonlyMap<string, Uint8Array> | undefined;
}

/**
 * Walk every text element in `doc`, dedupe identities, and embed one
 * PDFFont per identity. Identity-keyed map so `lookupFont` resolves
 * O(1) at draw time. Returns the failure list alongside so callers
 * can surface "font X could not be embedded" warnings to the user.
 *
 * Subsetting is on by default (per IO-D-09 / `PdfExportOptions.subsetFonts`).
 * The fontkit-driven subsetter walks the document's referenced glyphs
 * via pdf-lib's `CustomFontSubsetEmbedder` and emits a glyph-only
 * embed plus a `/ToUnicode` CMap. Pass `options.subsetFonts: false`
 * to embed the full SFNT for archival workflows.
 */
export async function resolveFonts(
  doc: BroadsetDocument,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch | undefined,
  options: ResolveFontsOptions = {},
): Promise<ResolvedFontMap> {
  registerFontkit(pdf);

  const fontMap = new Map<string, PDFFont>();
  const seen = new Set<string>();
  const failures: string[] = [];

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const id = elementFontIdentity(el);
    const key = identityKey(id);

    if (seen.has(key)) continue;
    seen.add(key);

    // Empty family falls through `resolveIdentity` to the Helvetica
    // variant fallback, matching the prior `@libpdf/core` behaviour
    // where bold / italic text without a declared family still rendered
    // in the matching Helvetica variant.
    const family = el.style.fontFamily ?? '';
    const resolved = await resolveIdentity(family, id.isBold, id.isItalic, pdf, fetchFn, {
      subsetFonts: options.subsetFonts,
      fontFetchTimeoutMs: options.fontFetchTimeoutMs,
      fontMaxBytes: options.fontMaxBytes,
      fontBytes: options.fontBytesByFamily?.get(normalizeFontFamily(family)),
    });

    fontMap.set(key, resolved.font);

    if (resolved.failure !== undefined) failures.push(resolved.failure);
  }

  return { fontMap, failures };
}

/**
 * Resolve an element's font from the embedded font map. Returns the
 * caller's `fallback` (typically a pre-embedded Helvetica) when the
 * map has no entry for the element's identity.
 */
export function lookupFont(el: BroadsetElement, fontMap: ReadonlyMap<string, PDFFont>, fallback: PDFFont): PDFFont {
  const key = identityKey(elementFontIdentity(el));

  return fontMap.get(key) ?? fallback;
}

interface GoogleFontEmbedAttempt {
  readonly font: PDFFont | null;
  readonly failure?: string;
}

/**
 * Cache of resolved SFNT bytes keyed by Google Fonts family name.
 * The fetch + WOFF2 decompression is the expensive part of the Google
 * Fonts pipeline — once we've resolved a family, reuse the bytes
 * across every subsequent export pass instead of re-fetching and
 * re-decompressing. The actual `pdf.embedFont(..., { subset: true })`
 * call still happens per-document because pdf-lib's
 * `CustomFontSubsetEmbedder` binds to a specific `PDFContext`.
 */
const fontBytesCache = new Map<string, Uint8Array>();

/**
 * Reset the cache. Test-only — production paths benefit from
 * cross-export reuse, but tests that exercise WOFF2 decompression
 * need a deterministic cache state.
 */
export function clearFontBytesCache(): void {
  fontBytesCache.clear();
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return fallback;

  return Math.floor(value);
}

function extractFontUrlFromGoogleCss(cssText: string): string | null {
  const urlFunctionPattern = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

  for (;;) {
    const match = urlFunctionPattern.exec(cssText);

    if (match === null) return null;

    const candidate = match[2]?.trim();

    if (candidate !== undefined && /\.(?:ttf|woff2?)(?:[?#]|$)/i.test(candidate)) {
      return candidate;
    }
  }
}

function isWoff2Url(url: string): boolean {
  try {
    return new URL(url).pathname.toLowerCase().endsWith('.woff2');
  } catch {
    return url.split(/[?#]/, 1)[0]?.toLowerCase().endsWith('.woff2') ?? false;
  }
}

async function tryEmbedGoogleFont(
  family: string,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch,
  options: ResolveIdentityOptions,
): Promise<GoogleFontEmbedAttempt> {
  try {
    const maxBytes = positiveIntegerOrDefault(options.fontMaxBytes, DEFAULT_FONT_FETCH_MAX_BYTES);
    const timeoutMs = positiveIntegerOrDefault(options.fontFetchTimeoutMs, DEFAULT_FONT_FETCH_TIMEOUT_MS);
    const cached = fontBytesCache.get(family);

    if (cached !== undefined) {
      if (cached.byteLength > maxBytes) {
        return {
          font: null,
          failure: `PDF preflight: font "${family}" — cached font bytes exceed configured cap (${String(maxBytes)}). Falling back to Helvetica.`,
        };
      }

      return { font: await embedFontBytes(pdf, cached, options) };
    }

    const cssUrl = resolveGoogleFontUrl(family);
    const cssResult = await safeFetchBytes(cssUrl, {
      fetchFn,
      allowedHosts: GOOGLE_FONTS_CSS_ALLOWED_HOSTS,
      maxBytes,
      timeoutMs,
    });

    if (!cssResult.ok) {
      return {
        font: null,
        failure: `PDF preflight: font "${family}" — Google Fonts CSS fetch failed (${cssResult.reason}). Falling back to Helvetica.`,
      };
    }

    const cssText = new TextDecoder('utf-8').decode(cssResult.bytes);
    const fontUrl = extractFontUrlFromGoogleCss(cssText);

    if (fontUrl === null) {
      return {
        font: null,
        failure: `PDF preflight: font "${family}" — Google Fonts CSS yielded no embeddable font URL (.ttf / .woff / .woff2). Falling back to Helvetica.`,
      };
    }

    const fontResult = await safeFetchBytes(fontUrl, {
      fetchFn,
      allowedHosts: GOOGLE_FONTS_ASSET_ALLOWED_HOSTS,
      maxBytes,
      timeoutMs,
    });

    if (!fontResult.ok) {
      return {
        font: null,
        failure: `PDF preflight: font "${family}" — font asset fetch failed (${fontResult.reason}). Falling back to Helvetica.`,
      };
    }

    const compressedOrPlain = fontResult.bytes;
    // Google Fonts increasingly only serves WOFF2; decompress to the
    // underlying SFNT (TTF/OTF) bytes via wawoff2 before handing to
    // pdf-lib's fontkit, which only understands uncompressed SFNT.
    const fontBytes = isWoff2Url(fontUrl) ? await decompressWoff2(compressedOrPlain) : compressedOrPlain;

    fontBytesCache.set(family, fontBytes);

    return { font: await embedFontBytes(pdf, fontBytes, options) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';

    return {
      font: null,
      failure: `PDF preflight: font "${family}" failed to embed (${reason}). Falling back to Helvetica.`,
    };
  }
}

/**
 * Embed `fontBytes` into the document. When `options.subsetFonts !== false`
 * (the default per IO-D-09) the bytes are routed through pdf-lib's
 * `CustomFontSubsetEmbedder`, which uses the registered `@pdf-lib/fontkit`
 * adapter to walk the document's referenced glyphs and emit a subset
 * containing only those glyphs plus the `/ToUnicode` CMap that maps
 * each glyph back to its source codepoint(s). The `_shared/fonts/`
 * subsetter ships the same fontkit-based glyph extraction for sibling
 * formats (PPTX `<p:embeddedFont>`, SVG `@font-face`, raw font export);
 * for PDF the subsetting is delegated to pdf-lib because pdf-lib needs
 * the original `Font` object alive for text layout — re-parsing a
 * post-subset SFNT byte stream loses the cmap fontkit needs to call
 * `glyphForCodePoint` at draw time.
 *
 * Typical reduction: ~200 KB → ~10 KB on a Latin-only document.
 *
 * `subsetFonts: false` opts back into pdf-lib's `CustomFontEmbedder`,
 * which embeds the entire SFNT (head, hhea, glyf, loca, cmap, OS/2,
 * name, post — every table in the source font) and attaches the same
 * `/ToUnicode` CMap derived from the font's cmap table. Intended for
 * archival workflows where the original face must be present byte-for-byte.
 */
async function embedFontBytes(
  pdf: PDFDocument,
  fontBytes: Uint8Array,
  options: ResolveIdentityOptions,
): Promise<PDFFont> {
  const shouldSubset = options.subsetFonts !== false;

  return await pdf.embedFont(fontBytes, { subset: shouldSubset });
}

async function decompressWoff2(woff2: Uint8Array): Promise<Uint8Array> {
  return await decompressWoff2Bytes(woff2);
}
