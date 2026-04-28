import type { ParsedRgbaColor } from './types';

const MAX_CHANNEL = 255;

/**
 * Parse a CSS hex colour (`#rgb`, `#rrggbb`, `#rrggbbaa`) into a
 * normalised RGBA descriptor. Returns `undefined` for malformed
 * input. Pure: no exceptions, no side effects — every shadow / glow
 * parser in `_shared/effects` calls this for the colour leg.
 */
export function parseHexColor(hex: string): ParsedRgbaColor | undefined {
  const cleaned = hex.replace(/^#/, '');

  if (cleaned.length === 3) {
    const r = parseInt(`${cleaned[0] ?? '0'}${cleaned[0] ?? '0'}`, 16);
    const g = parseInt(`${cleaned[1] ?? '0'}${cleaned[1] ?? '0'}`, 16);
    const b = parseInt(`${cleaned[2] ?? '0'}${cleaned[2] ?? '0'}`, 16);

    return { r, g, b, a: 1 };
  }

  if (cleaned.length === 6) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
      a: 1,
    };
  }

  if (cleaned.length === 8) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16),
      g: parseInt(cleaned.slice(2, 4), 16),
      b: parseInt(cleaned.slice(4, 6), 16),
      a: parseInt(cleaned.slice(6, 8), 16) / MAX_CHANNEL,
    };
  }

  return undefined;
}
