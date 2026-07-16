import type { projectFormatV1 } from '@broadset/model';

import { invalidEvaluationV1, type PlaybackEvaluationResultV1, resolvedEvaluationV1 } from './evaluation-result';

export type SequenceTickMappingV1 =
  | {
      readonly kind: 'mapped';
      readonly sequenceTick: number;
      readonly iteration: number;
      readonly direction: 'forward' | 'reverse';
      readonly inGap: boolean;
    }
  | {
      readonly kind: 'time-out-of-range';
      readonly requestedTick: number;
      readonly minimumTick: 0;
      readonly maximumTick: number;
    };

function mapped(options: {
  readonly sequenceTick: number;
  readonly iteration: number;
  readonly direction: 'forward' | 'reverse';
  readonly inGap: boolean;
}): PlaybackEvaluationResultV1<SequenceTickMappingV1> {
  return resolvedEvaluationV1({ kind: 'mapped', ...options });
}

function outOfRange(requestedTick: number, maximumTick: number): PlaybackEvaluationResultV1<SequenceTickMappingV1> {
  return resolvedEvaluationV1({ kind: 'time-out-of-range', requestedTick, minimumTick: 0, maximumTick });
}

function finiteMaximum(options: {
  readonly duration: number;
  readonly gap: number;
  readonly count: number;
  readonly duplicate: boolean;
}): number {
  const stride = options.duration + options.gap + (options.duplicate ? 1 : 0);

  return (options.count - 1) * stride + options.duration;
}

function mapRepeat(options: {
  readonly duration: number;
  readonly gap: number;
  readonly count?: number | undefined;
  readonly tick: number;
}): PlaybackEvaluationResultV1<SequenceTickMappingV1> {
  if (options.duration === 0) {
    if (options.count !== undefined && options.tick > finiteMaximum({ duration: 0, gap: options.gap, count: options.count, duplicate: false })) {
      return outOfRange(options.tick, finiteMaximum({ duration: 0, gap: options.gap, count: options.count, duplicate: false }));
    }

    if (options.gap === 0) return mapped({ sequenceTick: 0, iteration: options.tick, direction: 'forward', inGap: false });

    const iteration = Math.floor(options.tick / options.gap);

    return mapped({ sequenceTick: 0, iteration, direction: 'forward', inGap: options.tick - iteration * options.gap !== 0 });
  }

  const maximum = options.count === undefined
    ? Number.MAX_SAFE_INTEGER
    : finiteMaximum({ duration: options.duration, gap: options.gap, count: options.count, duplicate: false });

  if (options.tick > maximum) return outOfRange(options.tick, maximum);

  const stride = options.duration + options.gap;
  let iteration = Math.floor(options.tick / stride);
  let local = options.tick - iteration * stride;

  if (options.gap === 0 && options.tick > 0 && local === 0) {
    iteration -= 1;
    local = options.duration;
  }

  if (local > options.duration) {
    return mapped({ sequenceTick: options.duration, iteration, direction: 'forward', inGap: true });
  }

  return mapped({ sequenceTick: local, iteration, direction: 'forward', inGap: false });
}

function mapPingPong(options: {
  readonly duration: number;
  readonly gap: number;
  readonly count?: number | undefined;
  readonly endpoint: 'once' | 'duplicate';
  readonly tick: number;
}): PlaybackEvaluationResultV1<SequenceTickMappingV1> {
  if (options.duration === 0) return mapRepeat(options);

  const duplicate = options.endpoint === 'duplicate';
  const maximum = options.count === undefined
    ? Number.MAX_SAFE_INTEGER
    : finiteMaximum({ duration: options.duration, gap: options.gap, count: options.count, duplicate });

  if (options.tick > maximum) return outOfRange(options.tick, maximum);

  const stride = options.duration + options.gap + (duplicate ? 1 : 0);
  let iteration = Math.floor(options.tick / stride);
  let local = options.tick - iteration * stride;

  if (!duplicate && options.tick > 0 && local === 0) {
    iteration -= 1;
    local = options.duration + options.gap;
  }

  const reverse = iteration % 2 === 1;

  if (local > options.duration) {
    const endpointTick = reverse ? 0 : options.duration;

    return mapped({ sequenceTick: endpointTick, iteration, direction: reverse ? 'reverse' : 'forward', inGap: true });
  }

  const adjustedLocal = !duplicate && iteration > 0 && local === 0 ? 1 : local;

  return mapped({
    sequenceTick: reverse ? options.duration - adjustedLocal : adjustedLocal,
    iteration,
    direction: reverse ? 'reverse' : 'forward',
    inGap: false,
  });
}

export function mapSequenceTickV1(options: {
  readonly sequence: projectFormatV1.Sequence;
  readonly transportTick: number;
}): PlaybackEvaluationResultV1<SequenceTickMappingV1> {
  if (!Number.isSafeInteger(options.transportTick) || options.transportTick < 0) {
    return invalidEvaluationV1({ code: 'playback.invalid-tick', message: 'Transport tick must be a non-negative safe integer.' });
  }

  const { durationTicks: duration, loop } = options.sequence;

  if (loop.kind === 'none') {
    return options.transportTick <= duration
      ? mapped({ sequenceTick: options.transportTick, iteration: 0, direction: 'forward', inGap: false })
      : outOfRange(options.transportTick, duration);
  }

  if (loop.kind === 'repeat') {
    return mapRepeat({ duration, gap: loop.gapTicks, count: loop.count, tick: options.transportTick });
  }

  return mapPingPong({
    duration,
    gap: loop.gapTicks,
    count: loop.count,
    endpoint: loop.endpoint,
    tick: options.transportTick,
  });
}
