import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';

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

  return warnings;
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
 * Rotation composes natively into image (`placedLayer`) transforms,
 * and into the vector-mask AABB for native shape and path layers.
 * Text rotation is the remaining gap: ag-psd's text engine doesn't
 * round-trip an arbitrary transform, so rotated text exports at its
 * axis-aligned bounds and reads back as un-rotated.
 */
function collectRotationWarnings(doc: BroadsetDocument): readonly string[] {
  const rotated = doc.elements.filter((el) => el.rotation !== 0 && el.type === 'text');

  if (rotated.length === 0) return [];

  return [
    `PSD preflight: ${String(rotated.length)} rotated text element(s) will export at axis-aligned bounds. Image and shape rotation compose natively; text rotation through ag-psd's text engine lands in a follow-up.`,
  ];
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
  const psd = (el.extensions as { readonly psd?: { readonly dirty?: unknown; readonly unmappedEffects?: unknown } } | undefined)?.psd;

  if (psd === undefined) return false;

  if (psd.unmappedEffects === undefined) return false;

  return psd.dirty === true;
}
