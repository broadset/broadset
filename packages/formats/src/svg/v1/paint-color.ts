import { colorToCss, parseColor, type projectFormatV1 } from '@broadset/model';

import { parseCssColor } from '../../pdf/color';

export function mapCssColorV1(color: string): projectFormatV1.ColorValue {
  let normalized = color;

  try {
    normalized = colorToCss(parseColor(color));
  } catch {
    normalized = '#00000000';
  }

  const parsed = parseCssColor(normalized) ?? { r: 0, g: 0, b: 0, a: 0 };

  return { kind: 'color', space: 'srgb', channels: [parsed.r, parsed.g, parsed.b], alpha: parsed.a };
}
