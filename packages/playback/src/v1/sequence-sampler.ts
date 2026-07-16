import type { projectFormatV1 } from '@broadset/model';

import { cubicBezierEase } from './cubic-bezier';

type Sequence = projectFormatV1.Sequence;
type Track = projectFormatV1.Track;
type Keyframe = projectFormatV1.Keyframe;
type Interpolation = projectFormatV1.Interpolation;
type TypedValue = projectFormatV1.TypedValue;
type PropertyTarget = projectFormatV1.PropertyTarget;
type ValueType = projectFormatV1.ValueType;
type ConcreteColorValue = projectFormatV1.ConcreteColorValue;

export interface SampledTrackValue {
  readonly target: PropertyTarget;
  readonly valueType: ValueType;
  readonly value: TypedValue;
}

function clampTick(tick: number, durationTicks: number): number {
  if (Number.isNaN(tick) || tick <= 0) return 0;
  if (tick >= durationTicks) return durationTicks;

  return tick;
}

function mapLoopTick(sequence: Sequence, tick: number): number {
  const nonNegativeTick = Math.max(0, tick);

  if (sequence.loop.kind !== 'repeat') return clampTick(tick, sequence.durationTicks);
  if (!Number.isFinite(nonNegativeTick)) return sequence.durationTicks;

  const period = sequence.durationTicks + sequence.loop.gapTicks;

  if (period <= 0) return sequence.durationTicks;

  const iteration = Math.floor(nonNegativeTick / period);

  if (sequence.loop.count !== undefined && iteration >= sequence.loop.count) return sequence.durationTicks;

  const phase = nonNegativeTick % period;

  return phase > sequence.durationTicks ? sequence.durationTicks : phase;
}

function sortKeyframes(keyframes: readonly Keyframe[]): readonly Keyframe[] {
  return Array.from(keyframes).sort((first, second) => first.tick - second.tick);
}

function findSegment(
  keyframes: readonly Keyframe[],
  localTick: number,
): { readonly from: Keyframe; readonly to?: Keyframe | undefined } | undefined {
  const first = keyframes[0];

  if (first === undefined) return undefined;
  if (localTick < first.tick) return { from: first };

  let from = first;

  for (const keyframe of keyframes) {
    if (keyframe.tick > localTick) return { from, to: keyframe };
    from = keyframe;
  }

  return { from };
}

function calculateSegmentProgress(from: Keyframe, to: Keyframe, localTick: number): number {
  const duration = to.tick - from.tick;

  if (duration === 0) return 0;

  return (localTick - from.tick) / duration;
}

function easeSegment(interpolation: Interpolation | undefined, progress: number): number {
  if (interpolation === undefined) return progress;

  if (interpolation.kind === 'hold') return 0;
  if (interpolation.kind === 'step') return interpolation.position === 'start' ? 0 : 1;
  if (interpolation.kind === 'cubic-bezier') return cubicBezierEase(interpolation.controlPoints, progress);

  return progress;
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function interpolateNumber(from: number, to: number, progress: number): number {
  const finiteFrom = finiteNumber(from);
  const finiteTo = finiteNumber(to);
  const result = finiteFrom + (finiteTo - finiteFrom) * finiteNumber(progress);

  if (Number.isFinite(result)) return result;

  return progress >= 1 ? finiteTo : finiteFrom;
}

function interpolateChannels(
  from: readonly number[],
  to: readonly number[],
  progress: number,
): readonly number[] {
  return from.map((channel, index) => interpolateNumber(channel, to[index] ?? channel, progress));
}

function interpolateConcreteColor(
  from: ConcreteColorValue,
  to: ConcreteColorValue,
  progress: number,
): ConcreteColorValue {
  return {
    kind: 'color',
    space: from.space,
    channels: interpolateChannels(from.channels, to.channels, progress),
    alpha: interpolateNumber(from.alpha, to.alpha, progress),
  };
}

/**
 * Returns the first value until progress reaches the segment end.
 * Discrete values and incompatible typed values intentionally use this fallback.
 */
function interpolateDiscrete(from: TypedValue, to: TypedValue, progress: number): TypedValue {
  return progress >= 1 ? to : from;
}

function interpolateColorValue(
  from: Extract<TypedValue, { readonly type: 'color' }>,
  to: TypedValue,
  progress: number,
): TypedValue {
  if (to.type !== 'color') return interpolateDiscrete(from, to, progress);

  if (from.value.kind !== 'color' || to.value.kind !== 'color' || from.value.space !== to.value.space) {
    return interpolateDiscrete(from, to, progress);
  }

  return { type: 'color', value: interpolateConcreteColor(from.value, to.value, progress) };
}

function interpolateTypedValue(from: TypedValue, to: TypedValue, progress: number): TypedValue {
  if (progress <= 0) return from;
  if (progress >= 1) return to;
  if (from.type !== to.type) return interpolateDiscrete(from, to, progress);

  switch (from.type) {
    case 'number':
    case 'length':
    case 'angle':
      if (to.type !== from.type) return interpolateDiscrete(from, to, progress);

      return { type: from.type, value: interpolateNumber(from.value, to.value, progress) };
    case 'integer':
      if (to.type !== 'integer') return interpolateDiscrete(from, to, progress);

      return { type: 'integer', value: Math.round(interpolateNumber(from.value, to.value, progress)) };
    case 'point2d':
      if (to.type !== 'point2d') return interpolateDiscrete(from, to, progress);

      return {
        type: 'point2d',
        value: [
          interpolateNumber(from.value[0], to.value[0], progress),
          interpolateNumber(from.value[1], to.value[1], progress),
        ],
      };
    case 'point3d':
      if (to.type !== 'point3d') return interpolateDiscrete(from, to, progress);

      return {
        type: 'point3d',
        value: [
          interpolateNumber(from.value[0], to.value[0], progress),
          interpolateNumber(from.value[1], to.value[1], progress),
          interpolateNumber(from.value[2], to.value[2], progress),
        ],
      };
    case 'color':
      return interpolateColorValue(from, to, progress);
    default:
      return interpolateDiscrete(from, to, progress);
  }
}

function sampleTrack(track: Track, localTick: number): SampledTrackValue | undefined {
  const segment = findSegment(sortKeyframes(track.keyframes), localTick);

  if (segment === undefined) return undefined;

  const value =
    segment.to === undefined
      ? segment.from.value
      : interpolateTypedValue(
          segment.from.value,
          segment.to.value,
          easeSegment(
            segment.from.interpolation,
            calculateSegmentProgress(segment.from, segment.to, localTick),
          ),
        );

  return { target: track.target, valueType: track.valueType, value };
}

export function sampleSequenceV1(sequence: Sequence, tick: number): readonly SampledTrackValue[] {
  const localTick = mapLoopTick(sequence, tick);
  const sampledValues: SampledTrackValue[] = [];

  for (const track of sequence.tracks) {
    const sampledValue = sampleTrack(track, localTick);

    if (sampledValue !== undefined) sampledValues.push(sampledValue);
  }

  return sampledValues;
}
