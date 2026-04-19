import type { KeyframeValue } from '@broadset/model';

import { interpolateHexColor, isHexColor } from './interpolation/color';
import { applyEasing } from './interpolation/easing';
import {
  type CountingFormat,
  formatCountingNumber,
  formatSimpleNumber,
  interpolateNumber,
  isNumericString,
} from './interpolation/number';
import { interpolatePathD, type InterpolatePathDOptions, isSvgPathD } from './interpolation/path-morph';
import { interpolatePath, type InterpolatePathOptions } from './interpolation/tuple-path';

export type { CountingFormat, InterpolatePathDOptions, InterpolatePathOptions };
export { applyEasing, interpolatePath, interpolatePathD };

export interface InterpolateValueOptions {
  readonly from: unknown;
  readonly to: unknown;
  readonly progress: number;
  readonly easing: string;
  readonly countingFormat?: CountingFormat | undefined;
}

export interface InterpolateKeyframePropertiesOptions {
  readonly fromProperties: Readonly<Record<string, KeyframeValue>>;
  readonly toProperties: Readonly<Record<string, KeyframeValue>>;
  readonly progress: number;
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number');
}

function step<T>(from: T, to: T, easedProgress: number): T {
  return easedProgress >= 1 ? to : from;
}

function interpolateNumberArrayPair(
  from: readonly number[],
  to: readonly number[],
  easedProgress: number,
): readonly number[] {
  return from.map((item, index) => interpolateNumber(item, to[index] ?? item, easedProgress));
}

function interpolateStringPair(
  from: string,
  to: string,
  easedProgress: number,
  easing: string,
  countingFormat: CountingFormat | undefined,
): string {
  if (easing === 'counting') {
    if (!isNumericString(from) || !isNumericString(to)) {
      return step(from, to, easedProgress);
    }

    return formatCountingNumber(interpolateNumber(Number(from), Number(to), easedProgress), countingFormat);
  }

  if (isHexColor(from) && isHexColor(to)) {
    return interpolateHexColor(from, to, easedProgress);
  }

  if (isNumericString(from) && isNumericString(to)) {
    return formatSimpleNumber(interpolateNumber(Number(from), Number(to), easedProgress));
  }

  if (isSvgPathD(from) && isSvgPathD(to)) {
    return interpolatePathD({ fromD: from, toD: to, progress: easedProgress });
  }

  return step(from, to, easedProgress);
}

export function interpolateValue(options: InterpolateValueOptions): unknown {
  const easedProgress = applyEasing(options.easing, options.progress);
  const { from, to } = options;

  if (typeof from === 'number' && typeof to === 'number') {
    return interpolateNumber(from, to, easedProgress);
  }

  if (typeof from === 'boolean' && typeof to === 'boolean') {
    return step(from, to, easedProgress);
  }

  if (isNumberArray(from) && isNumberArray(to)) {
    return interpolateNumberArrayPair(from, to, easedProgress);
  }

  if (typeof from === 'string' && typeof to === 'string') {
    return interpolateStringPair(from, to, easedProgress, options.easing, options.countingFormat);
  }

  return step(from, to, easedProgress);
}

function getCountingFormat(value: KeyframeValue): CountingFormat | undefined {
  if (value.type !== 'string') {
    return undefined;
  }

  return 'countingFormat' in value ? value.countingFormat : undefined;
}

function readKeyframeValue(value: KeyframeValue): unknown {
  return value.value;
}

export function interpolateKeyframeProperties(
  options: InterpolateKeyframePropertiesOptions,
): Readonly<Record<string, unknown>> {
  const keys = new Set<string>([...Object.keys(options.fromProperties), ...Object.keys(options.toProperties)]);
  const result: Record<string, unknown> = {};
  const pathCommands = options.fromProperties['pathCommands'] ?? options.toProperties['pathCommands'];

  for (const key of keys) {
    if (key === 'pathCommands') {
      continue;
    }

    const fromValue = options.fromProperties[key];
    const toValue = options.toProperties[key];

    if (fromValue === undefined) {
      if (options.progress >= 1 && toValue !== undefined) {
        result[key] = readKeyframeValue(toValue);
      }

      continue;
    }

    if (toValue === undefined) {
      result[key] = readKeyframeValue(fromValue);
      continue;
    }

    if (pathCommands?.type === 'string' && fromValue.type === 'tuple' && toValue.type === 'tuple') {
      result[key] = interpolatePath({
        commands: pathCommands.value,
        from: fromValue.value,
        to: toValue.value,
        progress: options.progress,
      });
      continue;
    }

    result[key] = interpolateValue({
      from: readKeyframeValue(fromValue),
      to: readKeyframeValue(toValue),
      progress: options.progress,
      easing: fromValue.easing,
      countingFormat: getCountingFormat(fromValue),
    });
  }

  return result;
}
