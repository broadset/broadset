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

/**
 * Normalizes supported CSS color inputs to canonical `#RRGGBB` or `#RRGGBBAA`
 * hex strings at the model boundary.
 */
export function normalizeColor(input: string): string {
  const trimmed = input.trim().toLowerCase();

  const namedColor = CSS_NAMED_COLORS[trimmed];

  if (namedColor !== undefined) {
    return namedColor;
  }

  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);

    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex
        .split('')
        .map((character) => `${character}${character}`)
        .join('');

      return `#${expanded}`;
    }

    if (hex.length === 6 || hex.length === 8) {
      return trimmed;
    }
  }

  const rgbMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);

  if (rgbMatch !== null) {
    const red = Number(rgbMatch[1]);
    const green = Number(rgbMatch[2]);
    const blue = Number(rgbMatch[3]);
    const alpha = rgbMatch[4] === undefined ? undefined : Number(rgbMatch[4]);
    const hex = `#${byteToHex(red)}${byteToHex(green)}${byteToHex(blue)}`;

    return alpha === undefined ? hex : `${hex}${byteToHex(alpha * 255)}`;
  }

  const hslMatch = /^hsla?\(\s*(\d+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(trimmed);

  if (hslMatch !== null) {
    const hue = Number(hslMatch[1]);
    const saturation = Number(hslMatch[2]);
    const lightness = Number(hslMatch[3]);
    const alpha = hslMatch[4] === undefined ? undefined : Number(hslMatch[4]);
    const [red, green, blue] = hslToRgb(hue, saturation, lightness);
    const hex = `#${byteToHex(red)}${byteToHex(green)}${byteToHex(blue)}`;

    return alpha === undefined ? hex : `${hex}${byteToHex(alpha * 255)}`;
  }

  throw new Error(`Unable to normalize color: "${input}"`);
}
