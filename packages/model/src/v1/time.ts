import { z } from 'zod';

import { greatestCommonDivisor, positiveSafeIntegerSchema } from './schema-helpers';

export interface Rational {
  readonly numerator: number;
  readonly denominator: number;
}

export interface Timebase {
  readonly frameRate: Rational;
  readonly ticksPerSecond: number;
  readonly timecode: {
    readonly nominalFramesPerSecond: number;
    readonly dropFrame: boolean;
  };
}

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

export const rationalSchema: z.ZodType<Rational> = z.strictObject({
  numerator: positiveSafeIntegerSchema,
  denominator: positiveSafeIntegerSchema,
});

function isIntegralSafeFrameDuration(frameRate: Rational, ticksPerSecond: number): boolean {
  const dividend = BigInt(ticksPerSecond) * BigInt(frameRate.denominator);
  const divisor = BigInt(frameRate.numerator);

  return dividend % divisor === 0n && dividend / divisor > 0n && dividend / divisor <= MAX_SAFE_BIGINT;
}

function nearestIntegerRate({ numerator, denominator }: Rational): bigint {
  return (2n * BigInt(numerator) + BigInt(denominator)) / (2n * BigInt(denominator));
}

function hasSupportedTimecode(timebase: Timebase): boolean {
  const { frameRate, timecode } = timebase;
  const nominal = BigInt(timecode.nominalFramesPerSecond);

  if (!timecode.dropFrame) {
    return nominal === nearestIntegerRate(frameRate);
  }

  return (
    (frameRate.numerator === 30_000 && frameRate.denominator === 1_001 && nominal === 30n) ||
    (frameRate.numerator === 60_000 && frameRate.denominator === 1_001 && nominal === 60n)
  );
}

export const timebaseSchema: z.ZodType<Timebase> = z.strictObject({
  frameRate: rationalSchema,
  ticksPerSecond: positiveSafeIntegerSchema,
  timecode: z.strictObject({ nominalFramesPerSecond: positiveSafeIntegerSchema, dropFrame: z.boolean() }),
});

export function validateTimebaseSemantics(timebase: Timebase): readonly string[] {
  const issues: string[] = [];

  if (!isIntegralSafeFrameDuration(timebase.frameRate, timebase.ticksPerSecond)) {
    issues.push('Frame duration must be a positive safe integer tick count');
  }

  if (!hasSupportedTimecode(timebase)) issues.push('Unsupported SMPTE timecode annotation');

  return issues;
}

function assertNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function toSafeNumber(value: bigint, name: string): number {
  if (value < 0n || value > MAX_SAFE_BIGINT) {
    throw new RangeError(`${name} exceeds the safe integer range`);
  }

  return Number(value);
}

function frameTickDivisor(timebase: Timebase): bigint {
  const parsed = timebaseSchema.parse(timebase);
  const semanticIssues = [...validateTimebaseSemantics(parsed)];

  if (greatestCommonDivisor(parsed.frameRate.numerator, parsed.frameRate.denominator) !== 1) {
    semanticIssues.push('Frame-rate rational must be reduced');
  }

  if (semanticIssues.length > 0) throw new RangeError(semanticIssues.join('; '));

  return BigInt(parsed.ticksPerSecond) * BigInt(parsed.frameRate.denominator);
}

export function reduceRational(numerator: number, denominator: number): Rational {
  if (!Number.isSafeInteger(numerator) || numerator <= 0 || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError('Rational terms must be positive safe integers');
  }

  const divisor = greatestCommonDivisor(numerator, denominator);

  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

/** Computes an exact frame start without accumulating a fractional frame duration. */
export function frameStartTicks(frame: number, timebase: Timebase): number {
  assertNonNegativeSafeInteger(frame, 'frame');

  const dividend = BigInt(frame) * frameTickDivisor(timebase);
  const divisor = BigInt(timebase.frameRate.numerator);

  if (dividend % divisor !== 0n) {
    throw new RangeError('Frame start is not an integer tick');
  }

  return toSafeNumber(dividend / divisor, 'frame start');
}

/** Counts frame starts in the half-open media interval `[0, durationTicks)`. */
export function frameCountForDuration(durationTicks: number, timebase: Timebase): number {
  assertNonNegativeSafeInteger(durationTicks, 'durationTicks');

  if (durationTicks === 0) {
    return 0;
  }

  const numerator = BigInt(durationTicks) * BigInt(timebaseSchema.parse(timebase).frameRate.numerator);
  const denominator = frameTickDivisor(timebase);

  return toSafeNumber((numerator + denominator - 1n) / denominator, 'frame count');
}

/** Returns the greatest frame whose exact start does not exceed the supplied tick. */
export function ticksToFrame(tick: number, timebase: Timebase): number {
  assertNonNegativeSafeInteger(tick, 'tick');

  const numerator = BigInt(tick) * BigInt(timebaseSchema.parse(timebase).frameRate.numerator);

  return toSafeNumber(numerator / frameTickDivisor(timebase), 'frame index');
}
