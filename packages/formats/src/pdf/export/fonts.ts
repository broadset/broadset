import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import fontkit from '@pdf-lib/fontkit';
import { type PDFDocument, type PDFFont, StandardFonts } from 'pdf-lib';

import { normalizeFontFamily, resolveGoogleFontUrl } from '../fonts';

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
export interface FontIdentity {
  readonly familyKey: string;
  readonly isBold: boolean;
  readonly isItalic: boolean;
}

/**
 * Map key for storing a `PDFFont` per `FontIdentity`.
 */
export function identityKey(id: FontIdentity): string {
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
export function selectStandardFontVariant(base: StandardFonts, isBold: boolean, isItalic: boolean): StandardFonts {
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
export interface ResolvedFontIdentity {
  readonly font: PDFFont;
  readonly failure?: string;
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
 */
export async function resolveIdentity(
  family: string,
  isBold: boolean,
  isItalic: boolean,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch | undefined,
): Promise<ResolvedFontIdentity> {
  const normalized = normalizeFontFamily(family);
  const standard = STANDARD_FONT_MAP.get(normalized);

  if (standard !== undefined) {
    return { font: await pdf.embedFont(selectStandardFontVariant(standard, isBold, isItalic)) };
  }

  if (fetchFn && family.trim().length > 0) {
    const result = await tryEmbedGoogleFont(family, pdf, fetchFn);

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
export interface ResolvedFontMap {
  readonly fontMap: ReadonlyMap<string, PDFFont>;
  readonly failures: readonly string[];
}

/**
 * Walk every text element in `doc`, dedupe identities, and embed one
 * PDFFont per identity. Identity-keyed map so `lookupFont` resolves
 * O(1) at draw time. Returns the failure list alongside so callers
 * can surface "font X could not be embedded" warnings to the user.
 */
export async function resolveFonts(
  doc: BroadsetDocument,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch | undefined,
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
    const resolved = await resolveIdentity(family, id.isBold, id.isItalic, pdf, fetchFn);

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
export function lookupFont(
  el: BroadsetElement,
  fontMap: ReadonlyMap<string, PDFFont>,
  fallback: PDFFont,
): PDFFont {
  const key = identityKey(elementFontIdentity(el));

  return fontMap.get(key) ?? fallback;
}

interface GoogleFontEmbedAttempt {
  readonly font: PDFFont | null;
  readonly failure?: string;
}

async function tryEmbedGoogleFont(
  family: string,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch,
): Promise<GoogleFontEmbedAttempt> {
  try {
    const cssUrl = resolveGoogleFontUrl(family);
    const cssResponse = await fetchFn(cssUrl);
    const cssText = await cssResponse.text();
    const urlMatch = /url\(([^)]+\.(?:ttf|woff2?))\)/.exec(cssText);
    const fontUrl = urlMatch?.[1];

    if (fontUrl === undefined) {
      return {
        font: null,
        failure: `PDF preflight: font "${family}" — Google Fonts CSS yielded no embeddable font URL (.ttf / .woff / .woff2). Falling back to Helvetica.`,
      };
    }

    if (fontUrl.endsWith('.woff2')) {
      // pdf-lib's fontkit cannot decompress WOFF2; trying to embed
      // the bytes throws. Surface this as a preflight warning rather
      // than silently degrading to Helvetica.
      return {
        font: null,
        failure: `PDF preflight: font "${family}" is only available in WOFF2 format from Google Fonts; pdf-lib's fontkit cannot decompress WOFF2. Falling back to Helvetica.`,
      };
    }

    const fontResponse = await fetchFn(fontUrl);
    const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());

    // `subset: true` tells pdf-lib (via the registered `@pdf-lib/fontkit`
    // adapter) to embed only the glyphs the document actually references.
    // Cuts every Google-Font-backed embed from ~200 KB → ~10 KB on
    // typical content.
    return { font: await pdf.embedFont(fontBytes, { subset: true }) };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';

    return {
      font: null,
      failure: `PDF preflight: font "${family}" failed to embed (${reason}). Falling back to Helvetica.`,
    };
  }
}
