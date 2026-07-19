import type { projectFormatV1 } from '@broadset/model';

import type { PdfColorV1 } from './types';

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function mapPdfColorV1(color: PdfColorV1): projectFormatV1.ColorValue {
  let channels: readonly [number, number, number];

  if (color.space === 'gray') {
    const gray = clamp(color.channels[0]);

    channels = [gray, gray, gray];
  } else if (color.space === 'rgb') {
    channels = [clamp(color.channels[0]), clamp(color.channels[1]), clamp(color.channels[2])];
  } else {
    const cyan = clamp(color.channels[0]);
    const magenta = clamp(color.channels[1]);
    const yellow = clamp(color.channels[2]);
    const black = clamp(color.channels[3]);

    channels = [
      1 - Math.min(1, cyan + black),
      1 - Math.min(1, magenta + black),
      1 - Math.min(1, yellow + black),
    ];
  }

  return { kind: 'color', space: 'srgb', channels, alpha: 1 };
}
