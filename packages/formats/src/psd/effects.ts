import type { RgbaColor } from './color-utils';
import { parseHexColor } from './color-utils';

interface ParsedShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: RgbaColor;
}

interface ParsedGlow {
  readonly blur: number;
  readonly color: RgbaColor;
}

export function parseBoxShadow(shadow: string): ParsedShadow | undefined {
  const rgbaMatch = shadow.match(
    /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );

  if (rgbaMatch) {
    return {
      offsetX: parseFloat(rgbaMatch[1] ?? '0'),
      offsetY: parseFloat(rgbaMatch[2] ?? '0'),
      blur: parseFloat(rgbaMatch[3] ?? '0'),
      spread: parseFloat(rgbaMatch[4] ?? '0'),
      color: {
        r: parseInt(rgbaMatch[5] ?? '0', 10),
        g: parseInt(rgbaMatch[6] ?? '0', 10),
        b: parseInt(rgbaMatch[7] ?? '0', 10),
        a: parseFloat(rgbaMatch[8] ?? '1'),
      },
    };
  }

  const hexMatch = shadow.match(
    /(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?\s+(#[\da-fA-F]{3,8})/,
  );

  if (hexMatch) {
    const color = parseHexColor(hexMatch[5] ?? '#000000');

    return {
      offsetX: parseFloat(hexMatch[1] ?? '0'),
      offsetY: parseFloat(hexMatch[2] ?? '0'),
      blur: parseFloat(hexMatch[3] ?? '0'),
      spread: parseFloat(hexMatch[4] ?? '0'),
      color: color ?? { r: 0, g: 0, b: 0, a: 1 },
    };
  }

  return undefined;
}

export function parseFilterGlow(filter: string): ParsedGlow | undefined {
  const match = filter.match(
    /drop-shadow\(\s*0\s+0\s+(\d+(?:\.\d+)?)px\s+rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)\s*\)/,
  );

  if (!match) {
    return undefined;
  }

  return {
    blur: parseFloat(match[1] ?? '0'),
    color: {
      r: parseInt(match[2] ?? '0', 10),
      g: parseInt(match[3] ?? '0', 10),
      b: parseInt(match[4] ?? '0', 10),
      a: parseFloat(match[5] ?? '1'),
    },
  };
}
