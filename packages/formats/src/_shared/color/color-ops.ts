import type { BroadsetColor, ColorMods, RgbBroadsetColor } from '@broadset/model';
import { colorToCss } from '@broadset/model';
import { clampRgb, converter, type Hsl, parse, type Rgb } from 'culori';

/**
 * Phase 2 `_shared/color/` — colour-space-aware operations for every
 * format's export / import pipeline. Wraps culori for sRGB / oklch /
 * display-p3 / HSL parsing plus gamut-map + color-mod arithmetic.
 *
 * The lcms-wasm / ICC-profile / CMYK surface is deferred to the Phase
 * 4 asset pipeline (per the io-prereqs plan); this module ships the
 * pure-culori subset every eager consumer needs today. When the
 * first CMYK or ICC-aware caller arrives, the lazy-load seam in
 * `toCmyk` lights up without changing the public API shape.
 */

const toRgbConverter = converter('rgb');
const toHslConverter = converter('hsl');

function componentToHex(value: number): string {
  const clamped = Math.max(0, Math.min(1, value));

  return Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
}

function rgbToHex(rgb: Rgb): `#${string}` {
  const alpha = rgb.alpha;
  const r = componentToHex(rgb.r);
  const g = componentToHex(rgb.g);
  const b = componentToHex(rgb.b);

  if (alpha === undefined || alpha >= 1) {
    return `#${r}${g}${b}`;
  }

  return `#${r}${g}${b}${componentToHex(alpha)}`;
}

/**
 * Rgb-channel projection of a canonical `BroadsetColor`. Values are
 * 0-1 floats including optional alpha; callers that need 0-255 ints
 * multiply at their format boundary. Theme colors MUST be resolved
 * against a palette before calling — pass the resolved `RgbBroadsetColor`
 * via `ColorResolutionContext` (this module only accepts RGB colors to
 * keep the surface narrow).
 */
export interface ResolvedRgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha?: number | undefined;
}

function ensureRgb(color: BroadsetColor): RgbBroadsetColor {
  if (color.kind === 'theme') {
    throw new Error('toRgb requires an RGB BroadsetColor — resolve theme slots via resolveStyleColor / colorToCss first.');
  }

  return color;
}

/**
 * Converts any `RgbBroadsetColor` to a culori-parsed 0-1 RGB triple
 * (plus optional alpha). Honors `space` / `originalColor` preservation
 * so non-sRGB inputs (`oklch`, `display-p3`) round-trip through the
 * correct color space before being projected to sRGB for output.
 */
export function toRgb(color: BroadsetColor): ResolvedRgb {
  const rgbColor = ensureRgb(color);
  const source = rgbColor.originalColor ?? colorToCss(rgbColor);
  const parsed = parse(source);

  if (parsed === undefined) {
    throw new Error(`toRgb: unable to parse color ${JSON.stringify(source)}`);
  }

  const rgb = toRgbConverter(parsed);

  return {
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
    ...(rgb.alpha === undefined ? {} : { alpha: rgb.alpha }),
  };
}

/**
 * Clamps any `BroadsetColor` into the destination gamut (sRGB today;
 * `display-p3` / ICC targets arrive with Phase 4 lcms-wasm support).
 * Non-sRGB colors that fall outside sRGB are gamut-mapped via culori's
 * `clampRgb` (preserves hue, reduces chroma) so the returned color is
 * always sRGB-safe.
 */
export function gamutMap(color: BroadsetColor, _targetSpace: 'srgb' = 'srgb'): BroadsetColor {
  // _targetSpace is reserved for the Phase 4 lcms-wasm expansion; only
  // 'srgb' is implemented today. The literal default narrows to the
  // supported space so callers that need other spaces surface a type
  // error rather than a silent no-op.
  if (color.kind === 'theme') return color;

  const source = color.originalColor ?? color.hex;
  const parsed = parse(source);

  if (parsed === undefined) return color;

  const clamped = clampRgb(parsed);
  const rgbResult = toRgbConverter(clamped);
  const hex = rgbToHex(rgbResult);

  return { kind: 'rgb', hex };
}

/** Clamps a unit-interval modifier value; `undefined` passes through. */
function clampUnitModifier(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return undefined;

  return Math.max(0, Math.min(1, value));
}

function applyToneModification(rgb: Rgb, mods: ColorMods): Rgb {
  const hsl = toHslConverter(rgb);
  const lumMod = clampUnitModifier(mods.lumMod);
  const lumOff = clampUnitModifier(mods.lumOff);
  const tint = clampUnitModifier(mods.tint);
  const shade = clampUnitModifier(mods.shade);

  let lightness = hsl.l;

  if (lumMod !== undefined) lightness *= lumMod;
  if (lumOff !== undefined) lightness = Math.max(0, Math.min(1, lightness + lumOff));
  if (tint !== undefined) lightness = lightness + (1 - lightness) * tint;
  if (shade !== undefined) lightness = lightness * (1 - shade);

  const modifiedHsl: Hsl = { ...hsl, l: Math.max(0, Math.min(1, lightness)) };

  return toRgbConverter(modifiedHsl);
}

/**
 * Applies PowerPoint-style color modifiers to a color. Produces a
 * fresh `RgbBroadsetColor` whose hex is the modified sRGB value and
 * whose `originalColor` is dropped (the modification inherently alters
 * the source string; keeping it would desynchronize the lossless
 * round-trip contract). Theme colors stay unchanged until they're
 * resolved against a palette — theme + mods resolution is the
 * palette-aware `resolveThemeColor` path, not this one.
 *
 * Returns the original color unchanged when every modifier is absent
 * so callers can invoke the function unconditionally.
 */
export function applyMods(color: BroadsetColor, mods: ColorMods | undefined): BroadsetColor {
  if (mods === undefined) return color;

  const hasAnyMod =
    mods.lumMod !== undefined ||
    mods.lumOff !== undefined ||
    mods.tint !== undefined ||
    mods.shade !== undefined ||
    mods.alpha !== undefined;

  if (!hasAnyMod) return color;
  if (color.kind === 'theme') return color;

  const rgb = toRgb(color);
  const rgbInput: Rgb = {
    mode: 'rgb',
    r: rgb.r,
    g: rgb.g,
    b: rgb.b,
    ...(rgb.alpha === undefined ? {} : { alpha: rgb.alpha }),
  };
  const modifiedRgb = applyToneModification(rgbInput, mods);
  const alphaMod = clampUnitModifier(mods.alpha);
  const finalAlpha = alphaMod === undefined ? modifiedRgb.alpha : (modifiedRgb.alpha ?? 1) * alphaMod;

  const rgbWithAlpha: Rgb = {
    mode: 'rgb',
    r: modifiedRgb.r,
    g: modifiedRgb.g,
    b: modifiedRgb.b,
    ...(finalAlpha === undefined ? {} : { alpha: finalAlpha }),
  };

  return { kind: 'rgb', hex: rgbToHex(rgbWithAlpha) };
}
