import type { projectFormatV1 } from '@broadset/model';

export function interpolateColorV1(options: {
  readonly from: projectFormatV1.TypedValue;
  readonly to: projectFormatV1.TypedValue;
  readonly space: projectFormatV1.ColorSpace;
  readonly progress: number;
}): projectFormatV1.TypedValue | undefined {
  if (options.from.type !== 'color' || options.to.type !== 'color') return undefined;
  if (options.from.value.kind !== 'color' || options.to.value.kind !== 'color') return undefined;
  if (options.from.value.space !== options.space || options.to.value.space !== options.space) return undefined;
  if (options.from.value.channels.length !== options.to.value.channels.length) return undefined;

  const from = options.from.value;
  const to = options.to.value;
  const channels = from.channels.map((channel, index) => {
    const end = to.channels[index];

    return end === undefined ? channel : channel + (end - channel) * options.progress;
  });

  return {
    type: 'color',
    value: {
      kind: 'color',
      space: options.space,
      channels,
      alpha: from.alpha + (to.alpha - from.alpha) * options.progress,
    },
  };
}
