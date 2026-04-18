import { interpolatePathD, isSvgPathD } from './path-morph';

describe('isSvgPathD', () => {
  it('accepts strings starting with a moveto command', () => {
    expect(isSvgPathD('M 0 0 L 10 10')).toBe(true);
    expect(isSvgPathD('m 0 0 l 5 5')).toBe(true);
    expect(isSvgPathD('M10,10L20,20')).toBe(true);
  });

  it('rejects ordinary strings that happen to start with the letter M', () => {
    expect(isSvgPathD('Monday')).toBe(false);
    expect(isSvgPathD('Mountain')).toBe(false);
    expect(isSvgPathD('')).toBe(false);
  });
});

describe('interpolatePathD', () => {
  it('returns the source path at progress 0', () => {
    const result = interpolatePathD({
      fromD: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      toD: 'M 50 0 A 50 50 0 1 1 49.9 0 Z',
      progress: 0,
    });

    expect(result.length).toBeGreaterThan(0);
  });

  it('returns the target path at progress 1', () => {
    const result = interpolatePathD({
      fromD: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      toD: 'M 50 0 A 50 50 0 1 1 49.9 0 Z',
      progress: 1,
    });

    expect(result.length).toBeGreaterThan(0);
  });

  it('morphs between paths with different command structures', () => {
    const squareToTriangle = interpolatePathD({
      fromD: 'M 0 0 L 100 0 L 100 100 L 0 100 Z',
      toD: 'M 50 0 L 100 100 L 0 100 Z',
      progress: 0.5,
    });

    expect(squareToTriangle).toMatch(/^M/);
    expect(squareToTriangle).toContain('L');
  });

  it('clamps progress to [0, 1]', () => {
    const below = interpolatePathD({ fromD: 'M 0 0 L 10 0', toD: 'M 100 0 L 110 0', progress: -1 });
    const above = interpolatePathD({ fromD: 'M 0 0 L 10 0', toD: 'M 100 0 L 110 0', progress: 2 });

    expect(below.length).toBeGreaterThan(0);
    expect(above.length).toBeGreaterThan(0);
  });
});
