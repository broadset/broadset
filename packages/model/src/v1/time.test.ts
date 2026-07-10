import { describe, expect, it } from 'vitest';

import {
  frameCountForDuration,
  frameStartTicks,
  rationalSchema,
  reduceRational,
  ticksToFrame,
  timebaseSchema,
} from './time';

const createTimebase = (numerator: number, denominator: number, ticksPerSecond = numerator) => ({
  frameRate: { numerator, denominator },
  ticksPerSecond,
  timecode: { nominalFramesPerSecond: Math.round(numerator / denominator), dropFrame: false },
});

describe('exact rational time', () => {
  it('reduces positive safe-integer rational terms', () => {
    expect(reduceRational(60_000, 2_002)).toEqual({ numerator: 30_000, denominator: 1_001 });
    expect(() => reduceRational(0, 1)).toThrow(RangeError);
    expect(() => reduceRational(Number.MAX_SAFE_INTEGER + 1, 1)).toThrow(RangeError);
  });

  it('requires reduced positive safe-integer rationals', () => {
    expect(rationalSchema.parse({ numerator: 30_000, denominator: 1_001 })).toEqual({
      numerator: 30_000,
      denominator: 1_001,
    });

    for (const value of [
      { numerator: 0, denominator: 1 },
      { numerator: 1, denominator: -1 },
      { numerator: 60_000, denominator: 2_002 },
      { numerator: 1.5, denominator: 1 },
      { numerator: Number.MAX_SAFE_INTEGER + 1, denominator: 1 },
    ]) {
      expect(rationalSchema.safeParse(value).success).toBe(false);
    }
  });

  it.each([
    [24_000, 1_001, 1_001_000],
    [30_000, 1_001, 1_001_000],
    [60_000, 1_001, 1_001_000],
  ])('computes exact long-duration frame starts for %i/%i', (numerator, denominator, frame) => {
    expect(frameStartTicks(frame, timebaseSchema.parse(createTimebase(numerator, denominator)))).toBe(
      frame * denominator,
    );
  });

  it('represents 30000/1001 with integer frame ticks', () => {
    const timebase = timebaseSchema.parse({
      frameRate: { numerator: 30_000, denominator: 1_001 },
      ticksPerSecond: 30_000,
      timecode: { nominalFramesPerSecond: 30, dropFrame: true },
    });

    expect(frameStartTicks(17_982, timebase)).toBe(17_999_982);
  });

  it('rejects fractional frame ticks and unsupported SMPTE annotations', () => {
    expect(timebaseSchema.safeParse({ ...createTimebase(24, 1), ticksPerSecond: 1 }).success).toBe(false);
    expect(
      timebaseSchema.safeParse({
        ...createTimebase(24_000, 1_001),
        timecode: { nominalFramesPerSecond: 24, dropFrame: true },
      }).success,
    ).toBe(false);
    expect(
      timebaseSchema.safeParse({
        ...createTimebase(30_000, 1_001),
        timecode: { nominalFramesPerSecond: 29, dropFrame: false },
      }).success,
    ).toBe(false);
    expect(
      timebaseSchema.safeParse({
        ...createTimebase(60_000, 1_001),
        timecode: { nominalFramesPerSecond: 60, dropFrame: true },
      }).success,
    ).toBe(true);
  });

  it('uses half-open duration frame counting and containing-frame lookup', () => {
    const timebase = timebaseSchema.parse(createTimebase(30_000, 1_001));

    expect(frameCountForDuration(0, timebase)).toBe(0);
    expect(frameCountForDuration(1, timebase)).toBe(1);
    expect(frameCountForDuration(1_001, timebase)).toBe(1);
    expect(frameCountForDuration(1_002, timebase)).toBe(2);
    expect(ticksToFrame(0, timebase)).toBe(0);
    expect(ticksToFrame(1_000, timebase)).toBe(0);
    expect(ticksToFrame(1_001, timebase)).toBe(1);
  });

  it('rejects unsafe helper inputs and results instead of losing precision', () => {
    const timebase = timebaseSchema.parse(createTimebase(1, 1));

    expect(() => frameStartTicks(Number.MAX_SAFE_INTEGER, { ...timebase, ticksPerSecond: 2 })).toThrow(RangeError);
    expect(() => frameStartTicks(-1, timebase)).toThrow(RangeError);
    expect(() => frameCountForDuration(-1, timebase)).toThrow(RangeError);
    expect(() => frameCountForDuration(Number.MAX_SAFE_INTEGER + 1, timebase)).toThrow(RangeError);
    expect(() => ticksToFrame(0.5, timebase)).toThrow(RangeError);
    expect(() => ticksToFrame(Number.MAX_SAFE_INTEGER + 1, timebase)).toThrow(RangeError);
  });
});
