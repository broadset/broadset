import { clampUnitInterval, interpolateNumber } from './number';

const HEX_COLOR_RE = /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i;

interface ParsedHexColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly alpha: number;
  readonly hadExplicitAlpha: boolean;
}

interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export function isHexColor(value: string): boolean {
  return HEX_COLOR_RE.test(value);
}

function parseHexColor(value: string): ParsedHexColor | null {
  if (!isHexColor(value)) {
    return null;
  }

  const normalized = value.slice(1);

  if (normalized.length === 3 || normalized.length === 4) {
    const [red = '0', green = '0', blue = '0', alpha = 'f'] = normalized.split('');

    return {
      red: Number.parseInt(`${red}${red}`, 16),
      green: Number.parseInt(`${green}${green}`, 16),
      blue: Number.parseInt(`${blue}${blue}`, 16),
      alpha: Number.parseInt(`${alpha}${alpha}`, 16),
      hadExplicitAlpha: normalized.length === 4,
    };
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const alpha = normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) : 255;

  return {
    red,
    green,
    blue,
    alpha,
    hadExplicitAlpha: normalized.length === 8,
  };
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;

  if (normalized <= 0.04045) {
    return normalized / 12.92;
  }

  return ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb(channel: number): number {
  const clamped = Math.max(0, Math.min(1, channel));

  if (clamped <= 0.0031308) {
    return clamped * 12.92;
  }

  return 1.055 * clamped ** (1 / 2.4) - 0.055;
}

function rgbToOklab(red: number, green: number, blue: number): OklabColor {
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToRgb(color: OklabColor): { readonly red: number; readonly green: number; readonly blue: number } {
  const lRoot = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b;
  const mRoot = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b;
  const sRoot = color.l - 0.0894841775 * color.a - 1.291485548 * color.b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;

  return {
    red: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    green: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    blue: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function toHexChannel(value: number): string {
  const rounded = Math.round(Math.max(0, Math.min(255, value)));

  return rounded.toString(16).padStart(2, '0');
}

export function interpolateHexColor(from: string, to: string, progress: number): string {
  const fromColor = parseHexColor(from);
  const toColor = parseHexColor(to);

  if (fromColor === null || toColor === null) {
    return from;
  }

  if (from.toLowerCase() === to.toLowerCase()) {
    return `#${toHexChannel(fromColor.red)}${toHexChannel(fromColor.green)}${toHexChannel(fromColor.blue)}${
      fromColor.hadExplicitAlpha ? toHexChannel(fromColor.alpha) : ''
    }`;
  }

  const easedProgress = clampUnitInterval(progress);
  const fromLab = rgbToOklab(
    srgbChannelToLinear(fromColor.red),
    srgbChannelToLinear(fromColor.green),
    srgbChannelToLinear(fromColor.blue),
  );
  const toLab = rgbToOklab(
    srgbChannelToLinear(toColor.red),
    srgbChannelToLinear(toColor.green),
    srgbChannelToLinear(toColor.blue),
  );
  const interpolatedLab: OklabColor = {
    l: interpolateNumber(fromLab.l, toLab.l, easedProgress),
    a: interpolateNumber(fromLab.a, toLab.a, easedProgress),
    b: interpolateNumber(fromLab.b, toLab.b, easedProgress),
  };
  const interpolatedRgb = oklabToRgb(interpolatedLab);
  const red = linearChannelToSrgb(interpolatedRgb.red) * 255;
  const green = linearChannelToSrgb(interpolatedRgb.green) * 255;
  const blue = linearChannelToSrgb(interpolatedRgb.blue) * 255;
  const alpha = interpolateNumber(fromColor.alpha, toColor.alpha, easedProgress);
  const includeAlpha = fromColor.hadExplicitAlpha || toColor.hadExplicitAlpha || Math.round(alpha) < 255;

  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}${includeAlpha ? toHexChannel(alpha) : ''}`;
}
