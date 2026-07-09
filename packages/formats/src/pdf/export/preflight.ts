import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { normalizeFontFamily } from '../fonts';
import { elementFontIdentity } from './fonts';

/**
 * Phase 6 P6.6 — preflight warning collector. Centralises the warning
 * messages the export pipeline raises so the demo's preflight panel
 * (and any future programmatic caller) can surface them to the user
 * with a single contract.
 *
 * Per IO-D-14 the preflight ALWAYS proceeds — warnings never block
 * the export. The collector mutates the same array passed in so the
 * caller owns the list at the end of the pass.
 */

/**
 * Standard 14 base font families. A declared `style.fontFamily` that
 * normalises into one of these is satisfied by pdf-lib's built-in
 * embedder; anything else needs to round-trip via Google Fonts CSS
 * resolution (or a future custom-font asset path).
 */
const STANDARD_FAMILIES: ReadonlySet<string> = new Set([
  'helvetica',
  'arial',
  'timesroman',
  'times',
  'times new roman',
  'courier',
  'courier new',
]);

/**
 * Walk the document and emit preflight warnings for the conditions
 * the spec calls out. Pure / synchronous: doesn't make any side-
 * effecting fetches itself; the actual font-resolution / image-fetch
 * pipeline upgrades the warnings during render with extra detail.
 */
export function collectPreflightWarnings(doc: BroadsetDocument): readonly string[] {
  const warnings: string[] = [];

  warnings.push(...collectFontWarnings(doc));
  warnings.push(...collectAnimationWarnings(doc));
  warnings.push(...collectRasterFallbackWarnings(doc));

  return warnings;
}

function collectFontWarnings(doc: BroadsetDocument): readonly string[] {
  const warnings: string[] = [];
  const seenFamilies = new Set<string>();

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const family = el.style.fontFamily;

    if (family === undefined || family === '') continue;

    const normalized = normalizeFontFamily(family);

    if (STANDARD_FAMILIES.has(normalized)) continue;

    if (seenFamilies.has(normalized)) continue;

    seenFamilies.add(normalized);
    warnings.push(
      `PDF preflight: font "${family}" is not in pdf-lib's Standard 14 set; the exporter will attempt Google Fonts resolution and fall back to Helvetica if it fails. Real font subsetting via @pdf-lib/fontkit + _shared/fonts/subset lands in a follow-up.`,
    );
  }

  // Variant warnings — bold/italic without a Standard 14 base family will fall back too.
  if (doc.elements.some(usesNonStandardBoldOrItalic)) {
    warnings.push(
      'PDF preflight: text elements with bold or italic styles outside the Standard 14 family set will use the matching Helvetica variant fallback unless the font asset pipeline (Phase 4 P4.5 subsetting) is wired.',
    );
  }

  return warnings;
}

function usesNonStandardBoldOrItalic(el: BroadsetElement): boolean {
  if (el.type !== 'text') return false;

  const id = elementFontIdentity(el);

  if (!id.isBold && !id.isItalic) return false;

  return !STANDARD_FAMILIES.has(id.familyKey);
}

function collectAnimationWarnings(doc: BroadsetDocument): readonly string[] {
  if (doc.animations.length === 0) {
    return [];
  }

  const animatedElementIds = new Set(doc.animations.map((anim) => anim.elementId));

  if (animatedElementIds.size === 0) return [];

  return [
    `PDF preflight: ${String(animatedElementIds.size)} animated element(s) will export at the IN state per IO-D-16 — PDF is a static carrier and animation timelines are discarded.`,
  ];
}

function collectRasterFallbackWarnings(doc: BroadsetDocument): readonly string[] {
  const svgElements = doc.elements.filter((el) => el.type === 'svg');

  if (svgElements.length === 0) return [];

  return [
    `PDF preflight: ${String(svgElements.length)} SVG element(s) will rasterise to PNG before embedding. Native vector path emission via the SVG-to-PDF-operator pipeline is Spec-Gapped.`,
  ];
}
