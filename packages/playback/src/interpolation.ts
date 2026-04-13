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
import { interpolatePath, type InterpolatePathOptions } from './interpolation/tuple-path';

export type { CountingFormat, InterpolatePathOptions };
export { applyEasing, interpolatePath };

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

export function interpolateValue(options: InterpolateValueOptions): unknown {
  const easedProgress = applyEasing(options.easing, options.progress);

  if (typeof options.from === 'number' && typeof options.to === 'number') {
    return interpolateNumber(options.from, options.to, easedProgress);
  }

  if (typeof options.from === 'boolean' && typeof options.to === 'boolean') {
    return easedProgress >= 1 ? options.to : options.from;
  }

  if (isNumberArray(options.from) && isNumberArray(options.to)) {
    const targetValues = options.to;

    return options.from.map((item, index) => interpolateNumber(item, targetValues[index] ?? item, easedProgress));
  }

  if (typeof options.from === 'string' && typeof options.to === 'string') {
    if (options.easing === 'counting') {
      if (!isNumericString(options.from) || !isNumericString(options.to)) {
        return easedProgress >= 1 ? options.to : options.from;
      }

      const value = interpolateNumber(Number(options.from), Number(options.to), easedProgress);

      return formatCountingNumber(value, options.countingFormat);
    }

    if (isHexColor(options.from) && isHexColor(options.to)) {
      return interpolateHexColor(options.from, options.to, easedProgress);
    }

    if (isNumericString(options.from) && isNumericString(options.to)) {
      const value = interpolateNumber(Number(options.from), Number(options.to), easedProgress);

      return formatSimpleNumber(value);
    }

    return easedProgress >= 1 ? options.to : options.from;
  }

  return easedProgress >= 1 ? options.to : options.from;
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
