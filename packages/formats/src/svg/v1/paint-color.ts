import type { projectFormatV1 } from '@broadset/model';
import { converter, parse } from 'culori';

const toRgb = converter('rgb');

function channel(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 0 : Math.min(1, Math.max(0, value));
}

export function mapCssColorV1(color: string): projectFormatV1.ColorValue {
  const parsed = parse(color);
  const rgb = parsed === undefined ? undefined : toRgb(parsed);

  return {
    kind: 'color',
    space: 'srgb',
    channels: [channel(rgb?.r), channel(rgb?.g), channel(rgb?.b)],
    alpha: rgb === undefined ? 0 : channel(rgb.alpha ?? 1),
  };
}
