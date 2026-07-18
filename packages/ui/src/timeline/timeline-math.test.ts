import { describe, expect, it } from 'vitest';

import {
  clampRailRatio,
  fanOffsets,
  formatTickSeconds,
  railRatioFromTick,
  resolveSnapIntervalTicks,
  rulerLabelTicks,
  snapTick,
  tickFromRailRatio,
} from './timeline-math';

describe('timeline math', () => {
  it('maps pointer ratio to exact integer ticks and back', () => {
    expect(tickFromRailRatio(0.5, 1000)).toBe(500);
    expect(tickFromRailRatio(-0.2, 1000)).toBe(0);
    expect(tickFromRailRatio(1.7, 1000)).toBe(1000);
    expect(tickFromRailRatio(0.3333, 3)).toBe(1);
    expect(railRatioFromTick(500, 1000)).toBe(0.5);
    expect(railRatioFromTick(5, 0)).toBe(0);
    expect(clampRailRatio(Number.NaN)).toBe(0);
  });

  it('converts a millisecond snap preference to a positive integer tick interval', () => {
    expect(resolveSnapIntervalTicks(100, 1000)).toBe(100);
    expect(resolveSnapIntervalTicks(100, 30)).toBe(3);
    expect(resolveSnapIntervalTicks(100, 1)).toBe(1); // never 0
  });

  it('snaps ticks to the interval and clamps into the sequence range', () => {
    expect(snapTick(149, 100, 1000)).toBe(100);
    expect(snapTick(151, 100, 1000)).toBe(200);
    expect(snapTick(999, 100, 950)).toBe(950);
    expect(snapTick(-40, 100, 1000)).toBe(0);
  });

  it('formats seconds labels with one decimal', () => {
    expect(formatTickSeconds(500, 1000)).toBe('0.5s');
    expect(formatTickSeconds(45, 30)).toBe('1.5s');
    expect(formatTickSeconds(0, 1000)).toBe('0.0s');
  });

  it('emits bounded, whole-step ruler labels including 0 and the end', () => {
    const labels = rulerLabelTicks(3000, 1000);

    expect(labels[0]).toBe(0);
    expect(labels[labels.length - 1]).toBe(3000);
    expect(labels.length).toBeLessThanOrEqual(13);
    expect(labels.every((tick) => Number.isSafeInteger(tick))).toBe(true);

    const long = rulerLabelTicks(600_000, 1000); // 10 minutes must not emit 600 labels

    expect(long.length).toBeLessThanOrEqual(13);
  });

  it('fans same-tick markers horizontally and leaves distinct ticks at zero offset', () => {
    const offsets = fanOffsets(
      [
        { id: 'a', tick: 100 },
        { id: 'b', tick: 100 },
        { id: 'c', tick: 100 },
        { id: 'd', tick: 200 },
      ],
      8,
    );

    expect(offsets.get('a')).toBe(0);
    expect(offsets.get('b')).toBe(8);
    expect(offsets.get('c')).toBe(16);
    expect(offsets.get('d')).toBe(0);
  });
});

describe('degenerate ticksPerSecond', () => {
  it('formats a safe zero-duration label instead of Infinity/NaN when ticksPerSecond <= 0', () => {
    expect(formatTickSeconds(500, 0)).toBe('0.0s');
    expect(formatTickSeconds(500, -10)).toBe('0.0s');
  });

  it('emits only the start and end ticks instead of an infinite loop when ticksPerSecond <= 0', () => {
    expect(rulerLabelTicks(3000, 0)).toEqual([0, 3000]);
    expect(rulerLabelTicks(3000, -10)).toEqual([0, 3000]);
    expect(rulerLabelTicks(0, 0)).toEqual([0]);
  });

  it('floors the snap interval to 1 for non-positive ticksPerSecond', () => {
    expect(resolveSnapIntervalTicks(100, 0)).toBe(1);
    expect(resolveSnapIntervalTicks(100, -10)).toBe(1);
  });
});
