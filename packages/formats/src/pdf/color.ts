interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_4 = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Extract a regex match group as a guaranteed string.
 * Only call after a successful match where the group is known to exist.
 */
function group(m: RegExpMatchArray, i: number): string {
  return m[i] ?? '';
}

/**
 * Parse hex (3/4/6/8 digit) and rgb()/rgba() strings into normalized RGBA.
 * Returns undefined for unsupported formats (HSL, named colors, etc.).
 */
export function parseCssColor(color: string): RgbaColor | undefined {
  let m: RegExpMatchArray | null;

  m = color.match(HEX_3);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1) + group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2) + group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3) + group(m, 3), 16) / 255),
      a: 1,
    };
  }

  m = color.match(HEX_4);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1) + group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2) + group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3) + group(m, 3), 16) / 255),
      a: clamp01(parseInt(group(m, 4) + group(m, 4), 16) / 255),
    };
  }

  m = color.match(HEX_6);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3), 16) / 255),
      a: 1,
    };
  }

  m = color.match(HEX_8);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3), 16) / 255),
      a: clamp01(parseInt(group(m, 4), 16) / 255),
    };
  }

  m = color.match(RGB_FN);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1), 10) / 255),
      g: clamp01(parseInt(group(m, 2), 10) / 255),
      b: clamp01(parseInt(group(m, 3), 10) / 255),
      a: m[4] !== undefined ? clamp01(parseFloat(group(m, 4))) : 1,
    };
  }

  return undefined;
}
