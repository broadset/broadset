// ---------------------------------------------------------------------------
// Color Parsing — shared by PDF and potentially other format exporters
// ---------------------------------------------------------------------------

/** Normalized RGBA color with channels clamped to [0, 1]. */
export interface ParsedColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * Parses hex (3, 4, 6, 8 digit) and rgb()/rgba() color strings into
 * normalized RGBA. Returns undefined for unsupported formats.
 */
export function parseColor(color: string): ParsedColor | undefined {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color);

  if (hex !== null) {
    const h = hex[1] ?? '';

    if (h.length === 3) {
      const c0 = h.charAt(0);
      const c1 = h.charAt(1);
      const c2 = h.charAt(2);

      return {
        r: parseInt(c0 + c0, 16) / 255,
        g: parseInt(c1 + c1, 16) / 255,
        b: parseInt(c2 + c2, 16) / 255,
        a: 1,
      };
    }

    if (h.length === 4) {
      const c0 = h.charAt(0);
      const c1 = h.charAt(1);
      const c2 = h.charAt(2);
      const c3 = h.charAt(3);

      return {
        r: parseInt(c0 + c0, 16) / 255,
        g: parseInt(c1 + c1, 16) / 255,
        b: parseInt(c2 + c2, 16) / 255,
        a: parseInt(c3 + c3, 16) / 255,
      };
    }

    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
        a: 1,
      };
    }

    if (h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
        a: parseInt(h.slice(6, 8), 16) / 255,
      };
    }
  }

  const rgbaMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/.exec(color);

  if (rgbaMatch !== null) {
    return {
      r: clamp01(parseFloat(rgbaMatch[1] ?? '0') / 255),
      g: clamp01(parseFloat(rgbaMatch[2] ?? '0') / 255),
      b: clamp01(parseFloat(rgbaMatch[3] ?? '0') / 255),
      a: clamp01(rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1),
    };
  }

  return undefined;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
