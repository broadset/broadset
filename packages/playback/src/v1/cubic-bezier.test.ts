import { describe, expect, it } from 'vitest';

import { cubicBezierEase } from './cubic-bezier';

const LINEAR_CONTROL_POINTS = [0, 0, 1, 1] as const;
const EASE_CONTROL_POINTS = [0.25, 0.1, 0.25, 1] as const;
const MIDPOINT = 0.5;
const SAMPLE_INCREMENT = 0.05;
const DECIMAL_PRECISION = 7;

describe('cubicBezierEase', () => {
  it('maps clamped endpoints to zero and one', () => {
    expect(cubicBezierEase(EASE_CONTROL_POINTS, -1)).toBe(0);
    expect(cubicBezierEase(EASE_CONTROL_POINTS, 0)).toBe(0);
    expect(cubicBezierEase(EASE_CONTROL_POINTS, 1)).toBe(1);
    expect(cubicBezierEase(EASE_CONTROL_POINTS, 2)).toBe(1);
  });

  it('evaluates a linear curve as linear progress', () => {
    for (let progress = 0; progress <= 1; progress += SAMPLE_INCREMENT) {
      expect(cubicBezierEase(LINEAR_CONTROL_POINTS, progress)).toBeCloseTo(progress, DECIMAL_PRECISION);
    }
  });

  it('accelerates past the midpoint for the CSS ease curve', () => {
    expect(cubicBezierEase(EASE_CONTROL_POINTS, MIDPOINT)).toBeGreaterThan(MIDPOINT);
  });

  it('produces monotonic output for a monotonic timing curve', () => {
    let previous = cubicBezierEase(EASE_CONTROL_POINTS, 0);

    for (let progress = SAMPLE_INCREMENT; progress <= 1; progress += SAMPLE_INCREMENT) {
      const current = cubicBezierEase(EASE_CONTROL_POINTS, progress);

      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});
