const CSS_NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  blue: '#0000ff',
  brown: '#a52a2a',
  cyan: '#00ffff',
  fuchsia: '#ff00ff',
  gold: '#ffd700',
  gray: '#808080',
  green: '#008000',
  grey: '#808080',
  lime: '#00ff00',
  magenta: '#ff00ff',
  navy: '#000080',
  orange: '#ffa500',
  pink: '#ffc0cb',
  purple: '#800080',
  red: '#ff0000',
  silver: '#c0c0c0',
  teal: '#008080',
  transparent: '#00000000',
  white: '#ffffff',
  yellow: '#ffff00',
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function isFiniteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function byteToHex(value: number): string {
  return clampByte(value).toString(16).padStart(2, '0');
}

function hslToRgb(hue: number, saturation: number, lightness: number): readonly [number, number, number] {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const huePrime = (((hue % 360) + 360) % 360) / 60;
  const secondary = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const match = normalizedLightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (huePrime < 1) {
    red = chroma;
    green = secondary;
  } else if (huePrime < 2) {
    red = secondary;
    green = chroma;
  } else if (huePrime < 3) {
    green = chroma;
    blue = secondary;
  } else if (huePrime < 4) {
    green = secondary;
    blue = chroma;
  } else if (huePrime < 5) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  return [clampByte((red + match) * 255), clampByte((green + match) * 255), clampByte((blue + match) * 255)];
}

function rgbToHex(red: number, green: number, blue: number, alpha: number | undefined): string {
  const hex = `#${byteToHex(red)}${byteToHex(green)}${byteToHex(blue)}`;

  return alpha === undefined ? hex : `${hex}${byteToHex(alpha * 255)}`;
}

function parseHex(trimmed: string): string | null {
  if (!trimmed.startsWith('#')) return null;

  const hex = trimmed.slice(1);

  if (!/^[0-9a-f]+$/i.test(hex)) return null;

  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`;
  }

  return hex.length === 6 || hex.length === 8 ? trimmed : null;
}

function parseRgb(trimmed: string): string | null {
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);

  if (match === null) return null;

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);
  const alpha = match[4] === undefined ? undefined : Number(match[4]);

  if (
    !isFiniteInRange(red, 0, 255) ||
    !isFiniteInRange(green, 0, 255) ||
    !isFiniteInRange(blue, 0, 255) ||
    (alpha !== undefined && !isFiniteInRange(alpha, 0, 1))
  ) {
    return null;
  }

  return rgbToHex(red, green, blue, alpha);
}

function parseHsl(trimmed: string): string | null {
  const match = /^hsla?\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);

  if (match === null) return null;

  const hue = Number(match[1]);
  const saturation = Number(match[2]);
  const lightness = Number(match[3]);
  const alpha = match[4] === undefined ? undefined : Number(match[4]);

  if (
    !isFiniteInRange(saturation, 0, 100) ||
    !isFiniteInRange(lightness, 0, 100) ||
    (alpha !== undefined && !isFiniteInRange(alpha, 0, 1))
  ) {
    return null;
  }

  const [red, green, blue] = hslToRgb(hue, saturation, lightness);

  return rgbToHex(red, green, blue, alpha);
}

export function normalizeCssColor(input: string): string | null {
  const trimmed = input.trim().toLowerCase();

  return CSS_NAMED_COLORS[trimmed] ?? parseHex(trimmed) ?? parseRgb(trimmed) ?? parseHsl(trimmed);
}
