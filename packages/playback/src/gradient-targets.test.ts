import { type BroadsetGradient, rgbColor } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  applyGradientPropertyUpdates,
  type GradientPropertyUpdate,
  isGradientAnimationTarget,
  type ParsedGradientTarget,
  parseGradientTarget,
} from './gradient-targets';

const TWO_STOP_GRADIENT: BroadsetGradient = {
  type: 'linear',
  stops: [
    { color: rgbColor('#ff0000'), position: 0 },
    { color: rgbColor('#0000ff'), position: 100 },
  ],
  angle: 180,
};

const RADIAL_GRADIENT: BroadsetGradient = {
  type: 'radial',
  stops: [
    { color: rgbColor('#ffffff'), position: 0 },
    { color: rgbColor('#000000'), position: 100 },
  ],
  center: [50, 50],
};

/** @description Gradient dot-path property names must be recognized by the parser. */
describe('isGradientAnimationTarget', () => {
  /** @description Stop color targets follow the pattern backgroundGradient.stops[N].color. */
  it('recognizes stop color targets', () => {
    expect(isGradientAnimationTarget('backgroundGradient.stops[0].color')).toBe(true);
    expect(isGradientAnimationTarget('backgroundGradient.stops[99].color')).toBe(true);
  });

  /** @description Stop position targets follow the pattern backgroundGradient.stops[N].position. */
  it('recognizes stop position targets', () => {
    expect(isGradientAnimationTarget('backgroundGradient.stops[0].position')).toBe(true);
    expect(isGradientAnimationTarget('backgroundGradient.stops[1].position')).toBe(true);
  });

  /** @description The angle property targets the gradient rotation angle. */
  it('recognizes angle target', () => {
    expect(isGradientAnimationTarget('backgroundGradient.angle')).toBe(true);
  });

  /** @description The center property targets the radial/conic gradient center point. */
  it('recognizes center target', () => {
    expect(isGradientAnimationTarget('backgroundGradient.center')).toBe(true);
  });

  /** @description Regular CSS property names must not be mistaken for gradient targets. */
  it('rejects non-gradient properties', () => {
    expect(isGradientAnimationTarget('opacity')).toBe(false);
    expect(isGradientAnimationTarget('backgroundColor')).toBe(false);
    expect(isGradientAnimationTarget('backgroundGradient')).toBe(false);
    expect(isGradientAnimationTarget('backgroundGradient.stops')).toBe(false);
    expect(isGradientAnimationTarget('backgroundGradient.stops[0]')).toBe(false);
    expect(isGradientAnimationTarget('backgroundGradient.stops[-1].color')).toBe(false);
  });
});

/** @description The parser extracts the target kind, stop index, and sub-property from dot-path strings. */
describe('parseGradientTarget', () => {
  /** @description Stop targets parse into kind 'stop' with the correct index and field. */
  it('parses stop color target', () => {
    const result = parseGradientTarget('backgroundGradient.stops[0].color');

    expect(result).toEqual<ParsedGradientTarget>({ kind: 'stop', index: 0, field: 'color' });
  });

  /** @description Stop position targets parse correctly with arbitrary indices. */
  it('parses stop position target', () => {
    const result = parseGradientTarget('backgroundGradient.stops[3].position');

    expect(result).toEqual<ParsedGradientTarget>({ kind: 'stop', index: 3, field: 'position' });
  });

  /** @description Angle targets parse into kind 'angle'. */
  it('parses angle target', () => {
    const result = parseGradientTarget('backgroundGradient.angle');

    expect(result).toEqual<ParsedGradientTarget>({ kind: 'angle' });
  });

  /** @description Center targets parse into kind 'center'. */
  it('parses center target', () => {
    const result = parseGradientTarget('backgroundGradient.center');

    expect(result).toEqual<ParsedGradientTarget>({ kind: 'center' });
  });

  /** @description Invalid gradient targets return null. */
  it('returns null for non-gradient targets', () => {
    expect(parseGradientTarget('opacity')).toBeNull();
    expect(parseGradientTarget('backgroundGradient.foo')).toBeNull();
  });
});

/** @description Gradient property updates modify individual gradient properties and reconstruct the full object. */
describe('applyGradientPropertyUpdates', () => {
  /** @description Stop color updates replace the color of the addressed stop. */
  it('updates stop color', () => {
    const updates: readonly GradientPropertyUpdate[] = [
      { target: { kind: 'stop', index: 0, field: 'color' }, value: '#00ff00' },
    ];
    const result = applyGradientPropertyUpdates(TWO_STOP_GRADIENT, updates);

    expect(result.stops[0]?.color).toEqual(rgbColor('#00ff00'));
    expect(result.stops[1]?.color).toEqual(rgbColor('#0000ff'));
  });

  /** @description Stop position updates replace the position of the addressed stop. */
  it('updates stop position', () => {
    const updates: readonly GradientPropertyUpdate[] = [
      { target: { kind: 'stop', index: 1, field: 'position' }, value: 75 },
    ];
    const result = applyGradientPropertyUpdates(TWO_STOP_GRADIENT, updates);

    expect(result.stops[1]?.position).toBe(75);
    expect(result.stops[0]?.position).toBe(0);
  });

  /** @description Angle updates replace the gradient angle. */
  it('updates gradient angle', () => {
    const updates: readonly GradientPropertyUpdate[] = [{ target: { kind: 'angle' }, value: 90 }];
    const result = applyGradientPropertyUpdates(TWO_STOP_GRADIENT, updates);

    expect(result.angle).toBe(90);
  });

  /** @description Center updates replace the gradient center point. */
  it('updates gradient center', () => {
    const updates: readonly GradientPropertyUpdate[] = [{ target: { kind: 'center' }, value: [25, 75] }];
    const result = applyGradientPropertyUpdates(RADIAL_GRADIENT, updates);

    expect(result.center).toEqual([25, 75]);
  });

  /** @description Multiple updates can be applied simultaneously in one call. */
  it('applies multiple updates at once', () => {
    const updates: readonly GradientPropertyUpdate[] = [
      { target: { kind: 'stop', index: 0, field: 'color' }, value: '#00ff00' },
      { target: { kind: 'angle' }, value: 45 },
    ];
    const result = applyGradientPropertyUpdates(TWO_STOP_GRADIENT, updates);

    expect(result.stops[0]?.color).toEqual(rgbColor('#00ff00'));
    expect(result.angle).toBe(45);
  });

  /** @description Stop index exceeding the stops array length must be silently ignored per spec. */
  it('silently ignores out-of-bounds stop index', () => {
    const updates: readonly GradientPropertyUpdate[] = [
      { target: { kind: 'stop', index: 99, field: 'color' }, value: '#00ff00' },
    ];
    const result = applyGradientPropertyUpdates(TWO_STOP_GRADIENT, updates);

    expect(result).toEqual(TWO_STOP_GRADIENT);
  });

  /** @description The original gradient object must not be mutated. */
  it('does not mutate the original gradient', () => {
    const updates: readonly GradientPropertyUpdate[] = [
      { target: { kind: 'stop', index: 0, field: 'color' }, value: '#00ff00' },
    ];

    applyGradientPropertyUpdates(TWO_STOP_GRADIENT, updates);

    expect(TWO_STOP_GRADIENT.stops[0]?.color).toEqual(rgbColor('#ff0000'));
  });
});
