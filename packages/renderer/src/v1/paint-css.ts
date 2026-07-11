import type { projectFormatV1 } from '@broadset/model';

// v1 model types are reached through the `projectFormatV1` namespace: several color names (`Swatch`,
// `ColorSpace`) collide with legacy exports at the `@broadset/model` barrel root and would otherwise
// resolve to the legacy symbol during the migration coexistence window.
type ColorValue = projectFormatV1.ColorValue;
type ConcreteColorValue = projectFormatV1.ConcreteColorValue;
type ColorAdjustment = projectFormatV1.ColorAdjustment;
type ColorSpace = projectFormatV1.ColorSpace;
type Swatch = projectFormatV1.Swatch;
type Id = projectFormatV1.Id;

const CSS_NUMBER_PRECISION = 5;
const OPAQUE_ALPHA = 1;

/** Render a number for CSS: fixed precision with trailing zeros stripped, never `NaN`/`Infinity`. */
function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';

  return Number(value.toFixed(CSS_NUMBER_PRECISION)).toString();
}

function alphaSuffix(alpha: number): string {
  return alpha < OPAQUE_ALPHA ? ` / ${formatNumber(alpha)}` : '';
}

/** Emit a `color(<space> r g b[ / a])` string, defaulting missing channels so a wrong-length input never
 * yields invalid CSS. */
function colorFunction(space: 'srgb' | 'display-p3' | 'rec2020', channels: readonly number[], alpha: number): string {
  const [red = 0, green = 0, blue = 0] = channels;

  return `color(${space} ${formatNumber(red)} ${formatNumber(green)} ${formatNumber(blue)}${alphaSuffix(alpha)})`;
}

/** Naive CMYK → sRGB used for browser rendering; `device-cmyk()` is not broadly supported. */
function cmykToSrgbChannels(cyan: number, magenta: number, yellow: number, key: number): readonly [number, number, number] {
  const inverseKey = 1 - key;

  return [(1 - cyan) * inverseKey, (1 - magenta) * inverseKey, (1 - yellow) * inverseKey];
}

/** Map a concrete v1 color to a modern CSS color string, keeping wide-gamut spaces in their own space. */
function concreteToCss(color: ConcreteColorValue): string {
  const { channels, alpha } = color;

  switch (color.space) {
    case 'srgb':
    case 'display-p3':
    case 'rec2020':
      return colorFunction(color.space, channels, alpha);

    case 'gray': {
      const [gray = 0] = channels;

      return colorFunction('srgb', [gray, gray, gray], alpha);
    }

    case 'cmyk': {
      const [cyan = 0, magenta = 0, yellow = 0, key = 0] = channels;

      return colorFunction('srgb', cmykToSrgbChannels(cyan, magenta, yellow, key), alpha);
    }

    case 'lab': {
      const [lightness = 0, a = 0, b = 0] = channels;

      return `lab(${formatNumber(lightness)} ${formatNumber(a)} ${formatNumber(b)}${alphaSuffix(alpha)})`;
    }

    case 'oklab': {
      const [lightness = 0, a = 0, b = 0] = channels;

      return `oklab(${formatNumber(lightness)} ${formatNumber(a)} ${formatNumber(b)}${alphaSuffix(alpha)})`;
    }

    case 'oklch': {
      const [lightness = 0, chroma = 0, hue = 0] = channels;

      return `oklch(${formatNumber(lightness)} ${formatNumber(chroma)} ${formatNumber(hue)}${alphaSuffix(alpha)})`;
    }
  }
}

/**
 * The color-space's white, used as the tint mix target. Wide-gamut/lightness spaces mix in their own
 * space (no cross-space conversion); oklch preserves hue, cmyk mixes toward zero ink.
 */
function spaceWhite(space: ColorSpace, channels: readonly number[]): readonly number[] {
  switch (space) {
    case 'srgb':
    case 'display-p3':
    case 'rec2020':
      return [1, 1, 1];
    case 'gray':
      return [1];
    case 'lab':
      return [100, 0, 0];
    case 'oklab':
      return [1, 0, 0];
    case 'oklch':
      return [1, 0, channels[2] ?? 0];
    case 'cmyk':
      return [0, 0, 0, 0];
  }
}

/**
 * Mix each channel toward the space's white by `amount` (a convex combination, so results stay in range
 * and alpha is unchanged). The mix runs in the color's own encoded channels — matching the repository's
 * established tint convention (blend toward white in the working space) rather than linear light.
 */
function applyTint(color: ConcreteColorValue, amount: number): ConcreteColorValue {
  const white = spaceWhite(color.space, color.channels);
  const channels = color.channels.map((channel, index) => {
    const target = white[index] ?? channel;

    return channel + (target - channel) * amount;
  });

  return { ...color, channels };
}

function applyAdjustments(color: ConcreteColorValue, adjustments: readonly ColorAdjustment[]): ConcreteColorValue {
  // ColorAdjustment currently has a single `tint` variant; this must gain a discriminant switch when
  // the union grows so a new adjustment is not silently treated as a tint.
  return adjustments.reduce((current, adjustment) => applyTint(current, adjustment.amount), color);
}

function swatchConcreteColor(swatch: Swatch): ConcreteColorValue {
  return swatch.kind === 'process' ? swatch.color : swatch.alternateColor;
}

/**
 * Convert a v1 `ColorValue` to a CSS color string. Swatch references resolve against `swatches` and
 * apply their tint adjustments; an unresolved swatch fails closed to `'transparent'`.
 */
export function colorValueToCss(color: ColorValue, swatches: ReadonlyMap<Id, Swatch>): string {
  if (color.kind === 'color') return concreteToCss(color);

  const swatch = swatches.get(color.swatchId);

  if (swatch === undefined) return 'transparent';

  return concreteToCss(applyAdjustments(swatchConcreteColor(swatch), color.adjustments ?? []));
}
