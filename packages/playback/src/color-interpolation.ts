// ---------------------------------------------------------------------------
// OKLab color space interpolation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

// ---------------------------------------------------------------------------
// Internal conversions
// ---------------------------------------------------------------------------

/** Parse a hex color string into [r, g, b, a] with each in [0, 1]. */
function hexToRgba(hex: string): readonly [number, number, number, number] {
  const h = hex.slice(1);
  let r: number, g: number, b: number, a: number;

  if (h.length === 3) {
    r = parseInt(h.charAt(0) + h.charAt(0), 16) / 255;
    g = parseInt(h.charAt(1) + h.charAt(1), 16) / 255;
    b = parseInt(h.charAt(2) + h.charAt(2), 16) / 255;
    a = 1;
  } else if (h.length === 4) {
    r = parseInt(h.charAt(0) + h.charAt(0), 16) / 255;
    g = parseInt(h.charAt(1) + h.charAt(1), 16) / 255;
    b = parseInt(h.charAt(2) + h.charAt(2), 16) / 255;
    a = parseInt(h.charAt(3) + h.charAt(3), 16) / 255;
  } else if (h.length === 6) {
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
    a = 1;
  } else {
    // 8-digit
    r = parseInt(h.slice(0, 2), 16) / 255;
    g = parseInt(h.slice(2, 4), 16) / 255;
    b = parseInt(h.slice(4, 6), 16) / 255;
    a = parseInt(h.slice(6, 8), 16) / 255;
  }

  return [r, g, b, a] as const;
}

/** sRGB to linear RGB (inverse gamma). */
function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Linear RGB to sRGB (gamma). */
function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** Linear RGB [0,1] to OKLab [L, a, b]. */
function linearRgbToOklab(r: number, g: number, b: number): readonly [number, number, number] {
  const l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l = Math.cbrt(l_);
  const m = Math.cbrt(m_);
  const s = Math.cbrt(s_);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ] as const;
}

/** OKLab [L, a, b] to linear RGB [0,1]. */
function oklabToLinearRgb(L: number, a: number, b: number): readonly [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ] as const;
}

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;

  return Math.max(0, Math.min(1, v));
}

/** Convert a [0,1] float to a 2-digit hex string. */
function toHex2(v: number): string {
  const byte = Math.round(clamp01(v) * 255);

  return byte.toString(16).padStart(2, '0');
}

/** Convert RGBA [0,1] back to a hex string. */
function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const rs = toHex2(linearToSrgb(clamp01(r)));
  const gs = toHex2(linearToSrgb(clamp01(g)));
  const bs = toHex2(linearToSrgb(clamp01(b)));

  if (a >= 1) {
    return `#${rs}${gs}${bs}`;
  }

  return `#${rs}${gs}${bs}${toHex2(a)}`;
}

/** Normalize a hex string to 6 or 8 digits (lowercase). */
function normalizeHex(hex: string): string {
  const h = hex.slice(1).toLowerCase();

  if (h.length === 3) {
    return `#${h.charAt(0)}${h.charAt(0)}${h.charAt(1)}${h.charAt(1)}${h.charAt(2)}${h.charAt(2)}`;
  }

  if (h.length === 4) {
    return `#${h.charAt(0)}${h.charAt(0)}${h.charAt(1)}${h.charAt(1)}${h.charAt(2)}${h.charAt(2)}${h.charAt(3)}${h.charAt(3)}`;
  }

  return `#${h}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Interpolate between two hex color strings in OKLab perceptual color space.
 *
 * Accepts 3, 4, 6, and 8-digit hex formats. Alpha is interpolated linearly.
 * Non-hex inputs are returned unchanged (from value).
 * Gamut boundary values are clamped — no NaN in output.
 */
export function interpolateColor(from: string, to: string, t: number): string {
  if (!HEX_COLOR_RE.test(from) || !HEX_COLOR_RE.test(to)) {
    return from;
  }

  if (t <= 0) return normalizeHex(from);
  if (t >= 1) return normalizeHex(to);

  const [r1, g1, b1, a1] = hexToRgba(from);
  const [r2, g2, b2, a2] = hexToRgba(to);

  // Convert to linear RGB, then to OKLab
  const lr1 = srgbToLinear(r1);
  const lg1 = srgbToLinear(g1);
  const lb1 = srgbToLinear(b1);
  const lr2 = srgbToLinear(r2);
  const lg2 = srgbToLinear(g2);
  const lb2 = srgbToLinear(b2);

  const [L1, la1, lb1Ok] = linearRgbToOklab(lr1, lg1, lb1);
  const [L2, la2, lb2Ok] = linearRgbToOklab(lr2, lg2, lb2);

  // Lerp in OKLab
  const L = L1 + (L2 - L1) * t;
  const a = la1 + (la2 - la1) * t;
  const b = lb1Ok + (lb2Ok - lb1Ok) * t;

  // Alpha interpolated linearly
  const alpha = a1 + (a2 - a1) * t;

  // OKLab → linear RGB → sRGB → hex
  const [rOut, gOut, bOut] = oklabToLinearRgb(L, a, b);

  return rgbaToHex(rOut, gOut, bOut, alpha);
}
