import type { projectFormatV1 } from '@broadset/model';

import { interpolateColorV1 } from './color-interpolation';
import { interpolateCountingV1 } from './counting-interpolation';
import { cubicBezierEase } from './cubic-bezier';
import { invalidEvaluationV1, type PlaybackEvaluationResultV1, resolvedEvaluationV1 } from './evaluation-result';
import { sampleSpatialPathV1 } from './spatial-path-sampling';
import { springProgressV1 } from './spring-easing';

export interface InterpolatedTrackValueV1 {
  readonly value: projectFormatV1.TypedValue;
  readonly orientationRadians?: number | undefined;
}

function invalidInterpolation(message: string): PlaybackEvaluationResultV1<InterpolatedTrackValueV1> {
  return invalidEvaluationV1({ code: 'playback.invalid-interpolation', message });
}

function interpolateLinearValue(options: {
  readonly valueType: projectFormatV1.ValueType;
  readonly from: projectFormatV1.TypedValue;
  readonly to: projectFormatV1.TypedValue;
  readonly progress: number;
}): projectFormatV1.TypedValue | undefined {
  const { from, to, progress } = options;

  if (from.type !== options.valueType || to.type !== options.valueType) return undefined;

  switch (options.valueType) {
    case 'integer':
      if (from.type !== 'integer' || to.type !== 'integer') return undefined;

      return { type: 'integer', value: Math.round(from.value + (to.value - from.value) * progress) };
    case 'number':
      if (from.type !== 'number' || to.type !== 'number') return undefined;

      return { type: 'number', value: from.value + (to.value - from.value) * progress };
    case 'length':
      if (from.type !== 'length' || to.type !== 'length') return undefined;

      return { type: 'length', value: from.value + (to.value - from.value) * progress };
    case 'angle':
      if (from.type !== 'angle' || to.type !== 'angle') return undefined;

      return { type: 'angle', value: from.value + (to.value - from.value) * progress };
    case 'point2d':
      if (from.type !== 'point2d' || to.type !== 'point2d') return undefined;

      return { type: 'point2d', value: [from.value[0] + (to.value[0] - from.value[0]) * progress, from.value[1] + (to.value[1] - from.value[1]) * progress] };
    case 'point3d':
      if (from.type !== 'point3d' || to.type !== 'point3d') return undefined;

      return { type: 'point3d', value: [
        from.value[0] + (to.value[0] - from.value[0]) * progress,
        from.value[1] + (to.value[1] - from.value[1]) * progress,
        from.value[2] + (to.value[2] - from.value[2]) * progress,
      ] };
    default:
      return undefined;
  }
}

function specializedValue(options: {
  readonly valueType: projectFormatV1.ValueType;
  readonly from: projectFormatV1.TypedValue;
  readonly to: projectFormatV1.TypedValue;
  readonly interpolation: projectFormatV1.Interpolation;
  readonly progress: number;
}): InterpolatedTrackValueV1 | undefined {
  if (options.interpolation.kind === 'counting') return countingValue(options);
  if (options.interpolation.kind === 'color') return colorValue(options);
  if (options.interpolation.kind === 'spatial-path') return spatialValue(options);

  return undefined;
}

function countingValue(options: Parameters<typeof specializedValue>[0]): InterpolatedTrackValueV1 | undefined {
  if (options.interpolation.kind !== 'counting' || options.valueType !== 'string' || options.from.type !== 'string' || options.to.type !== 'string') return undefined;

  const value = interpolateCountingV1({ from: options.from.value, to: options.to.value, progress: options.progress, ...options.interpolation });

  return value === undefined ? undefined : { value: { type: 'string', value } };
}

function colorValue(options: Parameters<typeof specializedValue>[0]): InterpolatedTrackValueV1 | undefined {
  if (options.interpolation.kind !== 'color') return undefined;

  const value = interpolateColorV1({ from: options.from, to: options.to, space: options.interpolation.space, progress: options.progress });

  return value === undefined ? undefined : { value };
}

function spatialValue(options: Parameters<typeof specializedValue>[0]): InterpolatedTrackValueV1 | undefined {
  if (options.interpolation.kind !== 'spatial-path' || (options.valueType !== 'point2d' && options.valueType !== 'point3d')) return undefined;

  const sample = sampleSpatialPathV1({ path: options.interpolation.path, progress: options.progress });

  if (sample === undefined) return undefined;

  const orientation = options.interpolation.orientToPath ? { orientationRadians: sample.orientationRadians } : {};

  if (options.valueType === 'point2d') return { value: { type: 'point2d', value: sample.point }, ...orientation };
  if (options.from.type !== 'point3d' || options.to.type !== 'point3d') return undefined;

  return {
    value: { type: 'point3d', value: [sample.point[0], sample.point[1], options.from.value[2] + (options.to.value[2] - options.from.value[2]) * options.progress] },
    ...orientation,
  };
}

export function interpolateTrackSegmentV1(options: {
  readonly valueType: projectFormatV1.ValueType;
  readonly from: projectFormatV1.TypedValue;
  readonly to: projectFormatV1.TypedValue;
  readonly interpolation: projectFormatV1.Interpolation;
  readonly progress: number;
}): PlaybackEvaluationResultV1<InterpolatedTrackValueV1> {
  if (!Number.isFinite(options.progress) || options.progress < 0 || options.progress > 1) return invalidInterpolation('Interpolation progress must be finite and between zero and one.');
  if (options.from.type !== options.valueType || options.to.type !== options.valueType) return invalidInterpolation('Track values must match the declared value type.');

  const { interpolation } = options;

  if (interpolation.kind === 'hold') return resolvedEvaluationV1({ value: options.progress === 1 ? options.to : options.from });

  if (interpolation.kind === 'step') {
    return resolvedEvaluationV1({ value: interpolation.position === 'start' || options.progress === 1 ? options.to : options.from });
  }

  if (options.progress === 0) return resolvedEvaluationV1({ value: options.from });
  if (options.progress === 1) return resolvedEvaluationV1({ value: options.to });

  if (interpolation.kind === 'counting' || interpolation.kind === 'color' || interpolation.kind === 'spatial-path') {
    const specialized = specializedValue(options);

    return specialized === undefined ? invalidInterpolation(`Interpolation ${interpolation.kind} is incompatible with the supplied values.`) : resolvedEvaluationV1(specialized);
  }

  const progress = interpolation.kind === 'cubic-bezier'
    ? cubicBezierEase(interpolation.controlPoints, options.progress)
    : springProgressV1({ progress: options.progress, ...interpolation });
  const value = interpolateLinearValue({ valueType: options.valueType, from: options.from, to: options.to, progress });

  return value === undefined ? invalidInterpolation(`Interpolation ${interpolation.kind} is incompatible with ${options.valueType}.`) : resolvedEvaluationV1({ value });
}
