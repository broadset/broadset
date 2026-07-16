import { projectFormatV1 } from '@broadset/model';
import type { Layer } from 'ag-psd';

import { REVERSE_BLEND_MAP } from '../constants';

export function mapPsdAppearanceV1(input: {
  readonly layer: Layer;
  readonly fills?: readonly projectFormatV1.FillLayer[];
  readonly strokes?: readonly projectFormatV1.StrokeLayer[];
}): projectFormatV1.Appearance {
  const candidate = input.layer.blendMode === undefined
    ? 'normal'
    : REVERSE_BLEND_MAP[input.layer.blendMode] ?? input.layer.blendMode;
  const parsedBlendMode = projectFormatV1.blendModeSchema.safeParse(candidate);

  return {
    opacity: input.layer.hidden ? 0 : Math.min(1, Math.max(0, input.layer.opacity ?? 1)),
    blendMode: parsedBlendMode.success ? parsedBlendMode.data : 'normal',
    isolation: false,
    fills: input.fills ?? [],
    strokes: input.strokes ?? [],
    effects: [],
  };
}
