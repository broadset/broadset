import { MAX_CHANNEL } from './constants';

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function isRgbaColor(value: unknown): value is RgbaColor {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value;
}

export function parseHexColor(hex: string): RgbaColor | undefined {
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

export function rgbaToHex(r: number, g: number, b: number, a: number = 1): string {
  const hex = [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');

  if (a < 1) {
    return `#${hex}${Math.round(a * MAX_CHANNEL)
      .toString(16)
      .padStart(2, '0')}`;
  }

  return `#${hex}`;
}
