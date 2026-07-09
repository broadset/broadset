import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';

import { analyseTextUnicodeProfile, type TextUnicodeProfile } from '../_shared/text-layout';
import { isTextBody } from './export/text';
import type { PsdExportOptions } from './types';

/**
 * PSD preflight warning collector — mirrors `pdf/export/preflight.ts`.
 * Centralises the warning messages the PSD export pipeline raises so
 * the demo's preflight panel (and any future programmatic caller) can
 * surface them with a single contract.
 *
 * Per IO-D-14 the preflight ALWAYS proceeds — warnings never block the
 * export. The collector returns a frozen list; callers concatenate the
 * messages onto the export result.
 */

function isUrl(content: string): boolean {
  return content.startsWith('http://') || content.startsWith('https://');
}

/**
 * Walk the document and emit preflight warnings for the conditions
 * the PSD spec calls out. Pure / synchronous: doesn't fetch image
 * bytes, doesn't render anything. The async exporter upgrades the
 * warning set with fetch-failure detail.
 */
export function collectPreflightWarnings(doc: BroadsetDocument): readonly string[] {
  const warnings: string[] = [];

  warnings.push(...collectAnimationWarnings(doc));
  warnings.push(...collectRotationWarnings(doc));
  warnings.push(...collectColorModeWarnings(doc));
  warnings.push(...collectUrlImageWarnings(doc));
  warnings.push(...collectUnmappedEffectWarnings(doc));
  warnings.push(...collectTextUnicodeWarnings(doc));

  return warnings;
}

/**
 * Photoshop's text engine handles UAX #9 (bidi) and UAX #14 (line-
 * break / CJK wrapping) at render time. Broadset writes text in
 * logical order; we surface a warning so users with RTL or CJK
 * content know that visual rendering depends on the receiving
 * application's Unicode implementation, not on byte fidelity.
 */
function collectTextUnicodeWarnings(doc: BroadsetDocument): readonly string[] {
  const warnings: string[] = [];
  const profile = aggregateTextProfile(doc);

  if (profile.hasRtl) {
    warnings.push(
      'PSD preflight: document contains right-to-left text (Hebrew / Arabic / Syriac / NKo / etc.). The bytes are written in logical order; visual reordering relies on Photoshop’s UAX #9 implementation at render time.',
    );
  }

  if (profile.hasCjk) {
    warnings.push(
      'PSD preflight: document contains CJK ideographs or Japanese / Korean syllables. Line wrapping and inter-glyph spacing rely on Photoshop’s UAX #14 line-break / ICU rules; round-trip wrap points are best-effort.',
    );
  }

  return warnings;
}

function aggregateTextProfile(doc: BroadsetDocument): TextUnicodeProfile {
  let hasRtl = false;
  let hasCjk = false;

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const text = extractElementText(el);
    const profile = analyseTextUnicodeProfile(text);

    if (profile.hasRtl) hasRtl = true;
    if (profile.hasCjk) hasCjk = true;
    if (hasRtl && hasCjk) break;
  }

  return { hasRtl, hasCjk };
}

function extractElementText(el: BroadsetElement): string {
  if (isTextBody(el.content)) {
    return el.content.paragraphs.flatMap((para) => para.runs.map((run) => run.text)).join('');
  }

  return resolveContentAsPlainString(el.content);
}

function collectAnimationWarnings(doc: BroadsetDocument): readonly string[] {
  if (doc.animations.length === 0) {
    return [];
  }

  const animatedElementIds = new Set(doc.animations.map((anim) => anim.elementId));

  if (animatedElementIds.size === 0) return [];

  return [
    `PSD preflight: ${String(animatedElementIds.size)} animated element(s) will export at the IN state per IO-D-16 — PSD is a static carrier and animation timelines are discarded.`,
  ];
}

/**
 * Rotation now composes natively across all element types:
 *   - images: `placedLayer.transform` 4-corner quad,
 *   - shapes / paths: vector-mask AABB + rotated knots,
 *   - text: ag-psd's `text.transform` 6-element affine matrix.
 *
 * The collector is retained as a hook for any future format
 * limitations that might re-introduce a rotation gap. It is empty
 * today.
 */
function collectRotationWarnings(_doc: BroadsetDocument): readonly string[] {
  return [];
}

/**
 * The current ag-psd writer always emits 8-bit RGB. CMYK / Lab /
 * grayscale outputs and 16-bit channels are tracked as Spec Gaps.
 * Warn if the document declares an output intent that doesn't match.
 */
function collectColorModeWarnings(doc: BroadsetDocument): readonly string[] {
  const intent = doc.outputIntent;

  if (intent === undefined) return [];

  const colorSpace = intent.colorSpace;

  if (colorSpace === 'rgb') return [];

  return [
    `PSD preflight: output intent declares ${colorSpace} but the PSD writer emits 8-bit RGB only. The exported file will be RGB; the colour-mode intent is preserved in XMP for re-import.`,
  ];
}

/**
 * URL-bearing image elements need either a prefetch map (sync export)
 * or the async exporter (which fetches via the supplied fetch fn).
 * Sync export throws if any URL is unresolved; async export degrades
 * gracefully but loses the asset — warn either way.
 */
function collectUrlImageWarnings(doc: BroadsetDocument): readonly string[] {
  const urlImages = doc.elements.filter(isUrlImage);

  if (urlImages.length === 0) return [];

  return [
    `PSD preflight: ${String(urlImages.length)} image element(s) reference remote URLs. Sync export requires prefetched image bytes; async export fetches them via the supplied fetch function — failures degrade to placeholder pixels.`,
  ];
}

function isUrlImage(el: BroadsetElement): boolean {
  if (el.type !== 'image') return false;

  const text = resolveContentAsPlainString(el.content);

  return text !== '' && isUrl(text);
}

/**
 * PSD layer effects that lack a CSS equivalent (bevel, satin, pattern
 * overlay, gradient overlay, colour overlay, inner glow, inner shadow
 * only when the source is a CSS filter) ride in
 * `extensions.psd.unmappedEffects`. The exporter writes the bytes
 * back verbatim when `extensions.psd.dirty === false`; otherwise the
 * untouched preservation blob is the source of truth.
 *
 * Surface a warning when an element carries an unmapped-effects blob
 * whose dirty flag is true — that means the element was edited and
 * the preservation bytes are stale.
 */
function collectUnmappedEffectWarnings(doc: BroadsetDocument): readonly string[] {
  const stale = doc.elements.filter(hasStaleUnmappedEffects);

  if (stale.length === 0) return [];

  return [
    `PSD preflight: ${String(stale.length)} element(s) carry preserved bevel/satin/overlay effects that were marked dirty after editing. The original effect bytes will be re-emitted, but their parameters may no longer match the current Broadset state.`,
  ];
}

function hasStaleUnmappedEffects(el: BroadsetElement): boolean {
  const psd = (
    el.extensions as { readonly psd?: { readonly dirty?: unknown; readonly unmappedEffects?: unknown } } | undefined
  )?.psd;

  if (psd === undefined) return false;

  if (psd.unmappedEffects === undefined) return false;

  return psd.dirty === true;
}

/**
 * Surface warnings for `PsdExportOptions` fields the current writer
 * cannot honour. `colorSpace` (non-RGB) and `bitDepth: 16` require the
 * lcms-wasm pipeline tracked under cross-format-io-improvement-plan.md
 * Phase 4.1 / Phase 4.6. Image smart objects are already embedded as
 * PSD `liFD` linked-file-data records when bytes are available, so
 * `linkSmartObjects: false` is not a warning condition for Broadset-
 * authored data URI / prefetched URL images. `embedIccProfile: false`
 * is the current default behaviour (no profile is embedded regardless),
 * so it is a silent no-op rather than a warning.
 */
export function collectExportOptionsWarnings(options: PsdExportOptions | undefined): readonly string[] {
  if (options === undefined) return [];

  const warnings: string[] = [];

  if (options.colorSpace !== undefined && options.colorSpace !== 'rgb') {
    warnings.push(
      `PSD export does not yet honor non-RGB color space (requested: ${options.colorSpace}); output is RGB. Tracked in cross-format-io-improvement-plan.md Phase 4.1.`,
    );
  }

  if (options.bitDepth !== undefined && options.bitDepth !== 8) {
    warnings.push(
      `PSD export does not yet honor 16-bit bit depth; output is 8-bit. Tracked in cross-format-io-improvement-plan.md Phase 4.1.`,
    );
  }

  return warnings;
}
