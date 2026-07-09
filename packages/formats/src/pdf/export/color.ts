import type { BroadsetColor, BroadsetElementStyle, BroadsetGradient } from '@broadset/model';
import { colorToCss, getGradientFillGradient, getSolidFillColor } from '@broadset/model';
import { type CMYK, cmyk, rgb } from 'pdf-lib';

import { parseCssColor } from '../color';

/**
 * Clamp a numeric value into the `[0, 1]` PDF colour-channel range.
 */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Convert any `BroadsetColor` into a pdf-lib `RGB` colour. Returns
 * `undefined` for colours the boundary parser cannot resolve so
 * callers can fall through to the next colour in the resolution chain
 * (border → fill → gradient first stop).
 *
 * Real CMYK / Lab / spot colour emission via the `_shared/color/`
 * gamut-mapping pipeline lands with the colour-space follow-up
 * tracked in `project/spec/formats/pdf.md` §Spec Gaps.
 */
export function colorToPdfRgb(color: BroadsetColor | undefined): ReturnType<typeof rgb> | undefined {
  if (color === undefined) return undefined;

  const parsed = parseCssColor(colorToCss(color));

  if (!parsed) return undefined;

  return rgb(parsed.r, parsed.g, parsed.b);
}

/**
 * Resolve a top-level style colour field (`fontColor`, `borderColor`,
 * `stroke`) into a pdf-lib `RGB` colour. Mirrors `colorToPdfRgb` but
 * pulls the input directly off the style payload so callers don't
 * dance with optional unwrapping.
 */
export function resolveStyleColor(
  style: Partial<BroadsetElementStyle>,
  prop: 'fontColor' | 'borderColor' | 'stroke',
): ReturnType<typeof rgb> | undefined {
  return colorToPdfRgb(style[prop]);
}

/**
 * Approximate a gradient as the first stop colour. Real PDF shading
 * patterns (type 2 linear, type 3 radial) are still Spec-Gapped pending
 * the dedicated shading-pattern emitter — this fallback preserves the
 * pre-pdf-lib behaviour so a gradient never paints as undefined.
 */
export function resolveGradientFallbackColor(
  gradient: string | BroadsetGradient,
): ReturnType<typeof rgb> | undefined {
  if (typeof gradient === 'string') {
    return resolveCssGradientFallback(gradient);
  }

  return resolveStructuredGradientFallback(gradient);
}

function resolveCssGradientFallback(gradient: string): ReturnType<typeof rgb> | undefined {
  const colorMatch = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/.exec(gradient);

  if (colorMatch === null) return undefined;

  const parsed = parseCssColor(colorMatch[0]);

  if (parsed === undefined) return undefined;

  return rgb(parsed.r, parsed.g, parsed.b);
}

function resolveStructuredGradientFallback(gradient: BroadsetGradient): ReturnType<typeof rgb> | undefined {
  const firstStop = gradient.stops[0];

  if (firstStop === undefined) return undefined;

  const parsed = parseCssColor(colorToCss(firstStop.color));

  if (parsed === undefined) return undefined;

  return rgb(parsed.r, parsed.g, parsed.b);
}

/**
 * Resolve the element's `fill` to a pdf-lib RGB colour when the fill
 * is a solid colour. Returns `undefined` for gradient / picture / none
 * fills (callers fall through to the gradient first-stop fallback or
 * skip painting).
 */
export function resolveFillAsPdfRgb(
  style: Partial<BroadsetElementStyle>,
): ReturnType<typeof rgb> | undefined {
  const fill = style.fill;

  if (fill === undefined) return undefined;

  return colorToPdfRgb(getSolidFillColor(fill));
}

/**
 * Returns the gradient when the element's `fill` is a gradient,
 * otherwise `undefined`. Callers chain into
 * `resolveGradientFallbackColor` for the first-stop fallback.
 */
export function resolveFillGradient(style: Partial<BroadsetElementStyle>): BroadsetGradient | undefined {
  const fill = style.fill;

  if (fill === undefined) return undefined;

  return getGradientFillGradient(fill);
}

/**
 * Resolve `style.opacity` into a clamped `[0, 1]` value, defaulting
 * to fully-opaque (`1`) when the style omits it.
 */
export function resolveOpacity(style: Partial<BroadsetElementStyle>): number {
  return typeof style.opacity === 'number' ? clamp01(style.opacity) : 1;
}

/**
 * Convert an sRGB triple to CMYK using the canonical "subtractive
 * inverse" mapping (`C = 1 - R`, `M = 1 - G`, `Y = 1 - B`, `K = min`)
 * with black removal. This is the no-ICC fallback used when the
 * document's `outputIntent.colorSpace === 'cmyk'` but no real ICC
 * conversion path is wired (Spec Gap pending `_shared/color/lcms-wasm`).
 *
 * The result is a pdf-lib `CMYK` colour suitable for `drawRectangle({
 * color })`. PDF emitters route `CMYK` colours through the `k` / `K`
 * graphics-state operators rather than `rg` / `RG`, so the page's
 * device-CMYK colour space is preserved end-to-end.
 */
export function srgbToDeviceCmyk(rgbColor: ReturnType<typeof rgb>): CMYK {
  const r = clamp01(rgbColor.red);
  const g = clamp01(rgbColor.green);
  const b = clamp01(rgbColor.blue);

  const k = 1 - Math.max(r, g, b);

  if (k >= 1) {
    return cmyk(0, 0, 0, 1);
  }

  const cyan = (1 - r - k) / (1 - k);
  const magenta = (1 - g - k) / (1 - k);
  const yellow = (1 - b - k) / (1 - k);

  return cmyk(clamp01(cyan), clamp01(magenta), clamp01(yellow), clamp01(k));
}
