import type { projectFormatV1 } from '@broadset/model';

/**
 * Build a separate canonical exit sequence: fresh stable IDs, ticks mirrored within the explicit
 * durationTicks, and each segment's interpolation carried with its value pair. Markers, cues,
 * child clips, and looping are intentionally not part of the reversed-exit contract.
 */
export function reverseSequenceV1(options: {
  readonly sequence: projectFormatV1.Sequence;
  readonly name: string;
  readonly createId: () => projectFormatV1.Id;
}): projectFormatV1.Sequence {
  const duration = options.sequence.durationTicks;

  return {
    id: options.createId(),
    name: options.name,
    durationTicks: duration,
    loop: { kind: 'none' },
    tracks: options.sequence.tracks.map((track): projectFormatV1.Track => {
      const reversedOrder = [...track.keyframes].reverse();
      const count = reversedOrder.length;
      const keyframes = reversedOrder.map((keyframe, index): projectFormatV1.Keyframe => {
        // Segment between reversed[index] and reversed[index+1] spans the same value pair as the
        // original segment between original indices (count-2-index, count-1-index).
        const segmentSource = index < count - 1 ? track.keyframes[count - 2 - index] : undefined;
        const base = { id: options.createId(), tick: duration - keyframe.tick, value: keyframe.value };

        return segmentSource?.interpolation === undefined ? base : { ...base, interpolation: segmentSource.interpolation };
      });

      return { id: options.createId(), name: track.name, target: track.target, valueType: track.valueType, keyframes };
    }),
    markers: [],
    cues: [],
    childClips: [],
  };
}
