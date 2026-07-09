import { describe, expect, it } from 'vitest';

import { sampleMotionPath } from './motion-path';

describe('sampleMotionPath', () => {
  it('returns origin and zero angle for an empty path', () => {
    expect(sampleMotionPath('', 0.5)).toEqual({ x: 0, y: 0, angleDegrees: 0 });
  });

  it('samples a straight diagonal line at midpoint with 45-degree tangent', () => {
    const { x, y, angleDegrees } = sampleMotionPath('M 0 0 L 100 100', 0.5);

    expect(x).toBeCloseTo(50, 4);
    expect(y).toBeCloseTo(50, 4);
    expect(angleDegrees).toBeCloseTo(45, 4);
  });

  it('clamps progress to [0, 1]', () => {
    const below = sampleMotionPath('M 0 0 L 100 0', -1);
    const above = sampleMotionPath('M 0 0 L 100 0', 2);

    expect(below.x).toBeCloseTo(0, 4);
    expect(above.x).toBeCloseTo(100, 4);
  });

  it('samples elliptic arc (A) commands, which the previous hand-rolled sampler skipped', () => {
    const { x, y } = sampleMotionPath('M 0 50 A 50 50 0 0 1 100 50', 0.5);

    expect(x).toBeCloseTo(50, 1);
    expect(y).toBeCloseTo(0, 1);
  });
});
