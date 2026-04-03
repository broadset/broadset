import type { KeyframeProperty } from '@broadset/model';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COORDINATE_PRECISION = 2;

/**
 * Cubic-bezier control points for the built-in easing presets.
 * source: https://developer.mozilla.org/en-US/docs/Web/CSS/easing-function
 */
const PRESET_CURVES: Readonly<Record<string, readonly [number, number, number, number]>> = {
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const CUBIC_BEZIER_RE = /^cubic-bezier\(\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,]+)\s*,\s*([^\s,)]+)\s*\)$/;

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 0.001;
const SUBDIVISION_PRECISION = 1e-7;
const SUBDIVISION_MAX_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// Cubic-bezier solver (Newton's method with bisection fallback)
// ---------------------------------------------------------------------------

/**
 * Evaluate a 1D cubic bezier at parameter `t` given control points `a` and `b`.
 * The curve goes from 0 at t=0 to 1 at t=1 with control points (a, b).
 */
function cubicBezierCalc(a: number, b: number, t: number): number {
  return ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
}

/** Derivative of the 1D cubic bezier. */
function cubicBezierSlope(a: number, b: number, t: number): number {
  return (3 * (1 - 3 * b + 3 * a) * t + 2 * (3 * b - 6 * a)) * t + 3 * a;
}

/**
 * Given x control points (x1, x2), find the parameter `t` that produces
 * the given `x` value on the bezier curve. Uses Newton's method first,
 * then falls back to binary subdivision if Newton's slope is too flat.
 */
function solveCubicBezierT(x1: number, x2: number, x: number): number {
  let t = x;

  // Newton's method
  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const currentX = cubicBezierCalc(x1, x2, t) - x;

    if (Math.abs(currentX) < SUBDIVISION_PRECISION) {
      return t;
    }

    const slope = cubicBezierSlope(x1, x2, t);

    if (Math.abs(slope) < NEWTON_MIN_SLOPE) {
      break;
    }

    t -= currentX / slope;
  }

  // Binary subdivision fallback when Newton's slope is too flat
  let a = 0;
  let b = 1;

  if (t < 0 || t > 1) {
    t = x;
  }

  for (let i = 0; i < SUBDIVISION_MAX_ITERATIONS; i++) {
    const currentX = cubicBezierCalc(x1, x2, t) - x;

    if (Math.abs(currentX) < SUBDIVISION_PRECISION) {
      return t;
    }

    if (currentX > 0) {
      b = t;
    } else {
      a = t;
    }

    t = (a + b) / 2;
  }

  return t;
}

/**
 * Evaluate a cubic-bezier easing curve at progress `t`.
 * Maps input x to output y via the parametric bezier.
 */
function evaluateCubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;

  // Degenerate: if x control points make it linear-ish
  if (x1 === y1 && x2 === y2) return t;

  const paramT = solveCubicBezierT(x1, x2, t);

  return cubicBezierCalc(y1, y2, paramT);
}

// ---------------------------------------------------------------------------
// Easing — public API
// ---------------------------------------------------------------------------

/**
 * Applies an easing function to a progress value `t`.
 *
 * Supports named presets (linear, ease-in, ease-out, ease-in-out, step)
 * and `cubic-bezier(x1,y1,x2,y2)` strings.
 *
 * Input `t` is clamped to [0, 1]. Malformed or unknown easing modes
 * fall back to linear.
 */
export function applyEasing(mode: string, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));

  if (mode === 'linear') return clamped;

  if (mode === 'step') {
    return clamped < 1 ? 0 : 1;
  }

  const preset = PRESET_CURVES[mode];

  if (preset) {
    return evaluateCubicBezier(preset[0], preset[1], preset[2], preset[3], clamped);
  }

  // Try to parse cubic-bezier(...)
  const match = CUBIC_BEZIER_RE.exec(mode);

  if (match) {
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);

    if (
      Number.isFinite(x1) &&
      Number.isFinite(y1) &&
      Number.isFinite(x2) &&
      Number.isFinite(y2) &&
      x1 >= 0 &&
      x1 <= 1 &&
      x2 >= 0 &&
      x2 <= 1
    ) {
      return evaluateCubicBezier(x1, y1, x2, y2, clamped);
    }
  }

  // Unknown → linear fallback
  return clamped;
}

// ---------------------------------------------------------------------------
// OKLab color space conversions
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

// ---------------------------------------------------------------------------
// Color interpolation — public API
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
// Path morphing — public API
// ---------------------------------------------------------------------------

/**
 * Interpolate SVG path coordinates element-wise and reassemble a d string.
 *
 * @param commands - SVG command letters (e.g. ['M', 'L', 'Z'])
 * @param fromCoords - Source coordinate array
 * @param toCoords - Target coordinate array (must be same length as fromCoords)
 * @param t - Progress in [0, 1]
 * @returns A valid SVG `d` attribute string
 * @throws When fromCoords and toCoords have different lengths
 */
export function interpolatePath(
  commands: readonly string[],
  fromCoords: readonly number[],
  toCoords: readonly number[],
  t: number,
): string {
  if (fromCoords.length !== toCoords.length) {
    throw new Error(
      `Path coordinate arrays must have equal length: from=${String(fromCoords.length)}, to=${String(toCoords.length)}`,
    );
  }

  // Interpolate coordinates
  const interpolated = fromCoords.map((from, i) => {
    const to = toCoords[i] ?? 0;
    const value = from + (to - from) * t;

    return Number(value.toFixed(COORDINATE_PRECISION));
  });

  // Reassemble d string: each command consumes 0 or 2 coordinates
  const parts: string[] = [];
  let coordIdx = 0;

  for (const cmd of commands) {
    if (cmd === 'Z' || cmd === 'z') {
      parts.push(cmd);
    } else {
      // Each command takes x,y pair
      const x = interpolated[coordIdx] ?? 0;
      const y = interpolated[coordIdx + 1] ?? 0;

      parts.push(`${cmd} ${String(x)} ${String(y)}`);
      coordIdx += 2;
    }
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Value interpolation — public API
// ---------------------------------------------------------------------------

/**
 * Interpolate between two values based on their type.
 *
 * Type dispatch:
 * - number → linear lerp
 * - hex color string → OKLab perceptual interpolation
 * - numeric string → lerp as number, return as string
 * - number array → element-wise lerp (different lengths → step)
 * - all other types → step (hold from until t=1)
 */
export function interpolateValue(from: unknown, to: unknown, t: number): unknown {
  // Number lerp
  if (typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * t;
  }

  // String handling
  if (typeof from === 'string' && typeof to === 'string') {
    // Hex color
    if (HEX_COLOR_RE.test(from) && HEX_COLOR_RE.test(to)) {
      return interpolateColor(from, to, t);
    }

    // Numeric string
    const fromNum = Number(from);
    const toNum = Number(to);

    if (!Number.isNaN(fromNum) && !Number.isNaN(toNum)) {
      const lerped = fromNum + (toNum - fromNum) * t;

      return String(lerped);
    }

    // Non-numeric string → step
    return t < 1 ? from : to;
  }

  // Array interpolation (element-wise for number arrays)
  if (Array.isArray(from) && Array.isArray(to)) {
    if (from.length !== to.length) {
      // Different lengths → step fallback
      return t < 1 ? from : to;
    }

    // Only lerp if all elements are numbers
    const allNumbers =
      from.every((v): v is number => typeof v === 'number') && to.every((v): v is number => typeof v === 'number');

    if (allNumbers) {
      return from.map((f, i) => f + ((to[i] as number) - f) * t);
    }

    // Mixed types → step
    return t < 1 ? from : to;
  }

  // Fallback: step (boolean, object, null, etc.)
  return t < 1 ? from : to;
}

// ---------------------------------------------------------------------------
// Keyframe property interpolation — public API
// ---------------------------------------------------------------------------

/**
 * Interpolate all properties between two keyframes, applying per-property
 * easing from the from-keyframe's interpolation mode.
 *
 * Properties present only in the from-keyframe are held at their from-value.
 * When `pathCommands` and `pathCoordinates` are both present, path morphing
 * is used and the result is stored under a `d` key.
 *
 * @param fromProps - Properties of the from-keyframe
 * @param toProps - Properties of the to-keyframe
 * @param t - Raw progress in [0, 1] (before per-property easing)
 * @returns Record of interpolated property values
 */
export function interpolateKeyframeProperties(
  fromProps: Readonly<Record<string, KeyframeProperty>>,
  toProps: Readonly<Record<string, KeyframeProperty>>,
  t: number,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Check for path morphing
  const fromCommands = fromProps['pathCommands'];
  const toCommands = toProps['pathCommands'];
  const fromCoords = fromProps['pathCoordinates'];
  const toCoords = toProps['pathCoordinates'];

  if (fromCommands && toCommands && fromCoords && toCoords) {
    const commands = fromCommands.value as readonly string[];
    const from = fromCoords.value as readonly number[];
    const to = toCoords.value as readonly number[];
    const eased = applyEasing(fromCoords.interpolation, t);

    result['d'] = interpolatePath(commands, from, to, eased);
  }

  // Interpolate each property
  for (const key of Object.keys(fromProps)) {
    // Skip path morphing properties — they're handled above
    if (key === 'pathCommands' || key === 'pathCoordinates') continue;

    const fromProp = fromProps[key];
    const toProp = toProps[key];

    if (!fromProp) continue;

    if (!toProp) {
      // Property only in from — hold at from value
      result[key] = fromProp.value;
      continue;
    }

    // Apply per-property easing from the from-keyframe
    const eased = applyEasing(fromProp.interpolation, t);

    result[key] = interpolateValue(fromProp.value, toProp.value, eased);
  }

  return result;
}
