import type { projectFormatV1 } from '@broadset/model';

import { invalidEvaluationV1, type PlaybackEvaluationResultV1, resolvedEvaluationV1 } from './evaluation-result';
import { interpolateTrackSegmentV1 } from './interpolation';
import { mapSequenceTickV1 } from './transport-mapping';

export interface TrackSegmentProvenanceV1 {
  readonly sequenceId: projectFormatV1.Id;
  readonly trackId: projectFormatV1.Id;
  readonly fromKeyframeId: projectFormatV1.Id;
  readonly toKeyframeId?: projectFormatV1.Id | undefined;
  readonly childClipPath: readonly projectFormatV1.Id[];
  readonly orientationRadians?: number | undefined;
}

export interface SampledTrackValueV1 {
  readonly target: projectFormatV1.PropertyTarget;
  readonly valueType: projectFormatV1.ValueType;
  readonly value: projectFormatV1.TypedValue;
  readonly provenance: TrackSegmentProvenanceV1;
}

export type SequenceSampleV1 =
  | { readonly kind: 'sample'; readonly sequenceTick: number; readonly values: readonly SampledTrackValueV1[] }
  | { readonly kind: 'time-out-of-range'; readonly requestedTick: number; readonly maximumTick: number };

interface VisitSequenceWork {
  readonly kind: 'sequence';
  readonly sequence: projectFormatV1.Sequence;
  readonly transportTick: number;
  readonly childClipPath: readonly projectFormatV1.Id[];
  readonly root: boolean;
}

interface VisitClipWork {
  readonly kind: 'clip';
  readonly clip: projectFormatV1.SequenceClip;
  readonly parentTick: number;
  readonly childClipPath: readonly projectFormatV1.Id[];
}

interface ExitSequenceWork {
  readonly kind: 'exit';
  readonly sequenceId: projectFormatV1.Id;
}

type SamplingWork = VisitSequenceWork | VisitClipWork | ExitSequenceWork;

function defaultInterpolation(valueType: projectFormatV1.ValueType): projectFormatV1.Interpolation {
  return ['integer', 'number', 'length', 'angle', 'point2d', 'point3d'].includes(valueType)
    ? { kind: 'cubic-bezier', controlPoints: [0, 0, 1, 1] }
    : { kind: 'hold' };
}

function sortedKeyframes(track: projectFormatV1.Track): readonly projectFormatV1.Keyframe[] {
  return track.keyframes
    .map((keyframe, index) => ({ keyframe, index }))
    .sort((left, right) => left.keyframe.tick - right.keyframe.tick || left.index - right.index)
    .map(({ keyframe }) => keyframe);
}

function sampleTrack(options: {
  readonly sequence: projectFormatV1.Sequence;
  readonly track: projectFormatV1.Track;
  readonly tick: number;
  readonly childClipPath: readonly projectFormatV1.Id[];
}): PlaybackEvaluationResultV1<SampledTrackValueV1 | undefined> {
  const keyframes = sortedKeyframes(options.track);
  const first = keyframes[0];

  if (first === undefined || options.tick < first.tick) return resolvedEvaluationV1(undefined);

  let from = first;
  let to: projectFormatV1.Keyframe | undefined;

  for (const keyframe of keyframes.slice(1)) {
    if (keyframe.tick > options.tick) {
      to = keyframe;
      break;
    }

    from = keyframe;
  }

  if (to === undefined || options.tick === from.tick) {
    return resolvedEvaluationV1({
      target: options.track.target,
      valueType: options.track.valueType,
      value: from.value,
      provenance: {
        sequenceId: options.sequence.id,
        trackId: options.track.id,
        fromKeyframeId: from.id,
        ...(to === undefined ? {} : { toKeyframeId: to.id }),
        childClipPath: options.childClipPath,
      },
    });
  }

  const progress = (options.tick - from.tick) / (to.tick - from.tick);
  const interpolated = interpolateTrackSegmentV1({
    valueType: options.track.valueType,
    from: from.value,
    to: to.value,
    interpolation: from.interpolation ?? defaultInterpolation(options.track.valueType),
    progress,
  });

  if (interpolated.status === 'invalid') return interpolated;

  return resolvedEvaluationV1({
    target: options.track.target,
    valueType: options.track.valueType,
    value: interpolated.value.value,
    provenance: {
      sequenceId: options.sequence.id,
      trackId: options.track.id,
      fromKeyframeId: from.id,
      toKeyframeId: to.id,
      childClipPath: options.childClipPath,
      ...(interpolated.value.orientationRadians === undefined ? {} : { orientationRadians: interpolated.value.orientationRadians }),
    },
  });
}

function deterministicJitter(stagger: NonNullable<projectFormatV1.SequenceClip['stagger']>): number {
  if (stagger.jitterTicks === 0) return 0;

  let value = (stagger.seed ^ Math.imul(stagger.index + 1, 0x9e3779b1)) >>> 0;

  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;

  return (value >>> 0) % (stagger.jitterTicks * 2 + 1) - stagger.jitterTicks;
}

function clipStart(clip: projectFormatV1.SequenceClip): number {
  const stagger = clip.stagger;

  return clip.outputRange[0] + (stagger === undefined ? 0 : stagger.index * stagger.intervalTicks + deterministicJitter(stagger));
}

function remapClipTick(options: { readonly clip: projectFormatV1.SequenceClip; readonly parentTick: number }): number | undefined {
  const start = clipStart(options.clip);
  const end = start + (options.clip.outputRange[1] - options.clip.outputRange[0]);

  if (options.parentTick < start || options.parentTick >= end) return undefined;
  if (options.clip.remap.kind === 'freeze') return options.clip.remap.sourceTick;

  const local = options.parentTick - start;
  const outputSpan = end - start;
  const [sourceStart, sourceEnd] = options.clip.remap.sourceRange;
  const offset = Math.floor((local * (sourceEnd - sourceStart)) / outputSpan);

  return options.clip.remap.direction === 'forward' ? sourceStart + offset : sourceEnd - 1 - offset;
}

function sampleTracks(options: {
  readonly sequence: projectFormatV1.Sequence;
  readonly sequenceTick: number;
  readonly childClipPath: readonly projectFormatV1.Id[];
}): PlaybackEvaluationResultV1<readonly SampledTrackValueV1[]> {
  const values: SampledTrackValueV1[] = [];

  for (const track of options.sequence.tracks) {
    const sampled = sampleTrack({ sequence: options.sequence, track, tick: options.sequenceTick, childClipPath: options.childClipPath });

    if (sampled.status === 'invalid') return sampled;
    if (sampled.value !== undefined) values.push(sampled.value);
  }

  return resolvedEvaluationV1(values);
}

function pushChildWork(options: {
  readonly stack: SamplingWork[];
  readonly sequence: projectFormatV1.Sequence;
  readonly sequenceTick: number;
  readonly childClipPath: readonly projectFormatV1.Id[];
}): void {
  for (let index = options.sequence.childClips.length - 1; index >= 0; index -= 1) {
    const clip = options.sequence.childClips[index];

    if (clip !== undefined) options.stack.push({ kind: 'clip', clip, parentTick: options.sequenceTick, childClipPath: options.childClipPath });
  }
}

function visitSequence(options: {
  readonly work: VisitSequenceWork;
  readonly stack: SamplingWork[];
  readonly ancestors: Set<projectFormatV1.Id>;
  readonly values: SampledTrackValueV1[];
  readonly rootSequenceTick: { value?: number | undefined };
}): PlaybackEvaluationResultV1<SequenceSampleV1 | undefined> {
  const mapping = mapSequenceTickV1({ sequence: options.work.sequence, transportTick: options.work.transportTick });

  if (mapping.status === 'invalid') return mapping;

  if (mapping.value.kind === 'time-out-of-range') {
    return resolvedEvaluationV1(options.work.root
      ? { kind: 'time-out-of-range', requestedTick: mapping.value.requestedTick, maximumTick: mapping.value.maximumTick }
      : undefined);
  }

  if (options.work.root) options.rootSequenceTick.value = mapping.value.sequenceTick;
  options.ancestors.add(options.work.sequence.id);

  const tracks = sampleTracks({
    sequence: options.work.sequence,
    sequenceTick: mapping.value.sequenceTick,
    childClipPath: options.work.childClipPath,
  });

  if (tracks.status === 'invalid') return tracks;
  for (const value of tracks.value) options.values.push(value);

  options.stack.push({ kind: 'exit', sequenceId: options.work.sequence.id });
  pushChildWork({
    stack: options.stack,
    sequence: options.work.sequence,
    sequenceTick: mapping.value.sequenceTick,
    childClipPath: options.work.childClipPath,
  });

  return resolvedEvaluationV1(undefined);
}

function visitClip(options: {
  readonly work: VisitClipWork;
  readonly stack: SamplingWork[];
  readonly ancestors: ReadonlySet<projectFormatV1.Id>;
  readonly sequences: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Sequence>;
}): PlaybackEvaluationResultV1<undefined> {
  const childTick = remapClipTick({ clip: options.work.clip, parentTick: options.work.parentTick });

  if (childTick === undefined) return resolvedEvaluationV1(undefined);

  const child = options.sequences.get(options.work.clip.sequenceId);

  if (child === undefined) return invalidEvaluationV1({ code: 'playback.missing-child-sequence', message: `Child sequence ${String(options.work.clip.sequenceId)} was not found.` });
  if (options.ancestors.has(child.id)) return invalidEvaluationV1({ code: 'playback.cyclic-child-sequence', message: `Child sequence cycle includes ${String(child.id)}.` });

  options.stack.push({
    kind: 'sequence',
    sequence: child,
    transportTick: childTick,
    childClipPath: [...options.work.childClipPath, options.work.clip.id],
    root: false,
  });

  return resolvedEvaluationV1(undefined);
}

export function sampleSequenceV1(options: {
  readonly sequence: projectFormatV1.Sequence;
  readonly transportTick: number;
  readonly sequences: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Sequence>;
}): PlaybackEvaluationResultV1<SequenceSampleV1> {
  const stack: SamplingWork[] = [{ kind: 'sequence', sequence: options.sequence, transportTick: options.transportTick, childClipPath: [], root: true }];
  const ancestors = new Set<projectFormatV1.Id>();
  const values: SampledTrackValueV1[] = [];
  const rootSequenceTick: { value?: number | undefined } = {};

  while (stack.length > 0) {
    const work = stack.pop();

    if (work === undefined) continue;

    if (work.kind === 'exit') {
      ancestors.delete(work.sequenceId);
      continue;
    }

    const result = work.kind === 'sequence'
      ? visitSequence({ work, stack, ancestors, values, rootSequenceTick })
      : visitClip({ work, stack, ancestors, sequences: options.sequences });

    if (result.status === 'invalid') return result;
    if (result.value !== undefined) return resolvedEvaluationV1(result.value);
  }

  return resolvedEvaluationV1({ kind: 'sample', sequenceTick: rootSequenceTick.value ?? options.transportTick, values });
}
