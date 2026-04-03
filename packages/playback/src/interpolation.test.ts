import { describe, expect, it } from '@jest/globals';

import {
  applyEasing,
  interpolateColor,
  interpolateKeyframeProperties,
  interpolatePath,
  interpolateValue,
} from './interpolation';

// ---------------------------------------------------------------------------
// Easing presets
// ---------------------------------------------------------------------------

describe('applyEasing', () => {
  describe('linear', () => {
    /**
     * @description Verifies the linear preset returns t unchanged —
     * the simplest easing that guarantees identity mapping.
     */
    it('returns 0.5 at t=0.5', () => {
      expect(applyEasing('linear', 0.5)).toBe(0.5);
    });

    /**
     * @description Boundary check: all presets must return 0 at t=0.
     */
    it('returns 0 at t=0', () => {
      expect(applyEasing('linear', 0)).toBe(0);
    });

    /**
     * @description Boundary check: all presets must return 1 at t=1.
     */
    it('returns 1 at t=1', () => {
      expect(applyEasing('linear', 1)).toBe(1);
    });
  });

  describe('step', () => {
    /**
     * @description Step easing holds at 0 for all t < 1, then snaps to 1.
     * This ensures the step function never partially interpolates.
     */
    it('returns 0 at t=0.99', () => {
      expect(applyEasing('step', 0.99)).toBe(0);
    });

    /**
     * @description At exactly t=1, step must snap to 1.
     */
    it('returns 1 at t=1', () => {
      expect(applyEasing('step', 1)).toBe(1);
    });

    /**
     * @description Step must return 0 at t=0.
     */
    it('returns 0 at t=0', () => {
      expect(applyEasing('step', 0)).toBe(0);
    });
  });

  describe('ease-in', () => {
    /**
     * @description Ease-in starts slow; value at midpoint must be < 0.5.
     */
    it('returns less than 0.5 at t=0.5', () => {
      expect(applyEasing('ease-in', 0.5)).toBeLessThan(0.5);
    });

    /** @description Boundary: ease-in must return 0 at t=0 */
    it('returns 0 at t=0', () => {
      expect(applyEasing('ease-in', 0)).toBe(0);
    });

    /** @description Boundary: ease-in must return 1 at t=1 */
    it('returns 1 at t=1', () => {
      expect(applyEasing('ease-in', 1)).toBe(1);
    });
  });

  describe('ease-out', () => {
    /**
     * @description Ease-out starts fast; value at midpoint must be > 0.5.
     */
    it('returns greater than 0.5 at t=0.5', () => {
      expect(applyEasing('ease-out', 0.5)).toBeGreaterThan(0.5);
    });

    /** @description Boundary: ease-out must return 0 at t=0 */
    it('returns 0 at t=0', () => {
      expect(applyEasing('ease-out', 0)).toBe(0);
    });

    /** @description Boundary: ease-out must return 1 at t=1 */
    it('returns 1 at t=1', () => {
      expect(applyEasing('ease-out', 1)).toBe(1);
    });
  });

  describe('ease-in-out', () => {
    /**
     * @description Ease-in-out is symmetric; at t=0.5 the output should be
     * approximately 0.5 (may not be exact due to cubic curves).
     */
    it('returns approximately 0.5 at t=0.5', () => {
      const result = applyEasing('ease-in-out', 0.5);

      expect(result).toBeGreaterThan(0.3);
      expect(result).toBeLessThan(0.7);
    });

    /** @description Boundary: ease-in-out must return 0 at t=0 */
    it('returns 0 at t=0', () => {
      expect(applyEasing('ease-in-out', 0)).toBe(0);
    });

    /** @description Boundary: ease-in-out must return 1 at t=1 */
    it('returns 1 at t=1', () => {
      expect(applyEasing('ease-in-out', 1)).toBe(1);
    });
  });

  describe('cubic-bezier', () => {
    /**
     * @description cubic-bezier(0.42,0,1,1) is an ease-in-like curve.
     * At t=0.5 the output should be < 0.5 because the curve
     * accelerates toward the end.
     */
    it('cubic-bezier(0.42,0,1,1) returns less than 0.5 at t=0.5', () => {
      const result = applyEasing('cubic-bezier(0.42,0,1,1)', 0.5);

      expect(result).toBeLessThan(0.5);
    });

    /**
     * @description cubic-bezier must return 0 at t=0 and 1 at t=1.
     */
    it('returns 0 at t=0 and 1 at t=1', () => {
      expect(applyEasing('cubic-bezier(0.42,0,1,1)', 0)).toBe(0);
      expect(applyEasing('cubic-bezier(0.42,0,1,1)', 1)).toBe(1);
    });

    /**
     * @description Malformed cubic-bezier strings must fall back to linear.
     */
    it('malformed cubic-bezier falls back to linear', () => {
      expect(applyEasing('cubic-bezier(bad)', 0.5)).toBe(0.5);
    });

    /**
     * @description Unknown easing strings must fall back to linear.
     */
    it('unknown easing string falls back to linear', () => {
      expect(applyEasing('wobble', 0.5)).toBe(0.5);
    });
  });

  describe('input clamping', () => {
    /**
     * @description Negative t values must be clamped to 0 to prevent
     * out-of-range easing results.
     */
    it('clamps negative t to 0', () => {
      expect(applyEasing('linear', -0.5)).toBe(0);
    });

    /**
     * @description t values above 1 must be clamped to 1.
     */
    it('clamps t > 1 to 1', () => {
      expect(applyEasing('linear', 1.5)).toBe(1);
    });

    /**
     * @description Clamping must work with non-linear easing.
     */
    it('clamps negative t with ease-in', () => {
      expect(applyEasing('ease-in', -0.5)).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Value interpolation (type dispatch)
// ---------------------------------------------------------------------------

describe('interpolateValue', () => {
  describe('number lerp', () => {
    /**
     * @description Numbers must be linearly interpolated. This is the
     * fundamental interpolation type used by most properties.
     */
    it('interpolates from 0 to 100 at t=0.5 → 50', () => {
      expect(interpolateValue(0, 100, 0.5)).toBe(50);
    });

    /** @description At t=0 returns the from value */
    it('returns from at t=0', () => {
      expect(interpolateValue(0, 100, 0)).toBe(0);
    });

    /** @description At t=1 returns the to value */
    it('returns to at t=1', () => {
      expect(interpolateValue(0, 100, 1)).toBe(100);
    });
  });

  describe('boolean step', () => {
    /**
     * @description Booleans cannot be interpolated — they step from the
     * from-value to the to-value at t=1.
     */
    it('holds true until t=1', () => {
      expect(interpolateValue(true, false, 0.5)).toBe(true);
    });

    /** @description At exactly t=1, boolean switches to the to-value */
    it('switches to false at t=1', () => {
      expect(interpolateValue(true, false, 1)).toBe(false);
    });
  });

  describe('numeric string lerp', () => {
    /**
     * @description Numeric strings are interpolated as numbers but the
     * result is returned as a string, preserving string type semantics.
     */
    it('interpolates "1" to "0" at t=0.5 → "0.5"', () => {
      expect(interpolateValue('1', '0', 0.5)).toBe('0.5');
    });
  });

  describe('number array element-wise', () => {
    /**
     * @description Number arrays are interpolated element-wise — each
     * element is independently lerped.
     */
    it('interpolates [0, 10] to [100, 20] at t=0.5', () => {
      expect(interpolateValue([0, 10], [100, 20], 0.5)).toEqual([50, 15]);
    });

    /**
     * @description Arrays of different lengths must be rejected.
     */
    it('rejects arrays of different lengths (step fallback)', () => {
      // When arrays have different lengths, fall back to step behavior
      expect(interpolateValue([0], [100, 200], 0.5)).toEqual([0]);
      expect(interpolateValue([0], [100, 200], 1)).toEqual([100, 200]);
    });
  });

  describe('unsupported types (step fallback)', () => {
    /**
     * @description Types that cannot be interpolated (objects, null, etc.)
     * must hold the from-value until t=1, then snap to the to-value.
     */
    it('holds from-value for objects until t=1', () => {
      const from = { a: 1 };
      const to = { a: 2 };

      expect(interpolateValue(from, to, 0.5)).toEqual(from);
      expect(interpolateValue(from, to, 1)).toEqual(to);
    });
  });
});

// ---------------------------------------------------------------------------
// OKLab color interpolation
// ---------------------------------------------------------------------------

describe('interpolateColor', () => {
  /**
   * @description Identical colors must round-trip exactly — no drift
   * introduced by the OKLab conversion pipeline.
   */
  it('identical colors round-trip to the same value', () => {
    expect(interpolateColor('#ff0000', '#ff0000', 0.5)).toBe('#ff0000');
  });

  /**
   * @description Alpha channels must be linearly interpolated. From fully
   * transparent (00) to fully opaque (ff), the midpoint alpha should be
   * approximately 0x80.
   */
  it('interpolates alpha channel linearly', () => {
    const result = interpolateColor('#ff000000', '#ff0000ff', 0.5);

    // Result should be 8-digit hex with partial alpha
    expect(result).toMatch(/^#[0-9a-f]{8}$/);

    // Alpha channel is last two digits; midpoint of 00 and ff ≈ 80
    const alpha = parseInt(result.slice(7, 9), 16);

    expect(alpha).toBeGreaterThan(0x60);
    expect(alpha).toBeLessThan(0xa0);
  });

  /**
   * @description Saturated color interpolation must never produce NaN
   * digits, which would indicate gamut clamping failure.
   */
  it('produces valid hex with no NaN for saturated colors', () => {
    const result = interpolateColor('#ff0000', '#0000ff', 0.5);

    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toContain('NaN');
  });

  /**
   * @description 3-digit shorthand hex must be accepted and expanded.
   */
  it('handles 3-digit hex shorthand', () => {
    const result = interpolateColor('#f00', '#00f', 0.5);

    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  /**
   * @description 4-digit shorthand hex with alpha must be accepted.
   */
  it('handles 4-digit hex shorthand with alpha', () => {
    const result = interpolateColor('#f000', '#f00f', 0.5);

    expect(result).toMatch(/^#[0-9a-f]{8}$/);
  });

  /**
   * @description Non-hex color formats must return the from value unchanged,
   * as per the hex-only input guarantee.
   */
  it('returns from value unchanged for non-hex input', () => {
    expect(interpolateColor('rgb(255,0,0)', '#0000ff', 0.5)).toBe('rgb(255,0,0)');
  });

  /**
   * @description Named colors are not hex and must be rejected.
   */
  it('returns from value unchanged for named colors', () => {
    expect(interpolateColor('red', '#0000ff', 0.5)).toBe('red');
  });

  /**
   * @description Two valid hex colors produce a valid hex result.
   */
  it('produces valid hex for two valid hex inputs', () => {
    const result = interpolateColor('#ff0000', '#0000ff', 0.5);

    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ---------------------------------------------------------------------------
// Path morphing
// ---------------------------------------------------------------------------

describe('interpolatePath', () => {
  /**
   * @description Triangle path morphing at t=0.5 must produce coordinate
   * midpoints and reassemble a valid SVG d attribute string.
   */
  it('interpolates triangle coordinates at midpoint', () => {
    const commands = ['M', 'L', 'L', 'Z'];
    const fromCoords = [0, 0, 100, 0, 50, 100];
    const toCoords = [10, 10, 110, 10, 60, 110];
    const result = interpolatePath(commands, fromCoords, toCoords, 0.5);

    expect(result).toBe('M 5 5 L 105 5 L 55 105 Z');
  });

  /**
   * @description Coordinates must be rounded to 2 decimal places
   * to keep SVG path data clean and prevent floating-point drift.
   */
  it('rounds coordinates to 2 decimal places', () => {
    const commands = ['M', 'L', 'Z'];
    const fromCoords = [0, 0, 100, 0];
    const toCoords = [1, 1, 101, 1];
    const result = interpolatePath(commands, fromCoords, toCoords, 0.333);

    // 0 + (1-0)*0.333 = 0.333 → 0.33
    expect(result).toContain('0.33');
  });

  /**
   * @description Mismatched coordinate array lengths must throw an error
   * because element-wise interpolation is not possible.
   */
  it('throws for mismatched coordinate lengths', () => {
    const commands = ['M', 'L', 'Z'];
    const fromCoords = [0, 0, 100, 0];
    const toCoords = [0, 0];

    expect(() => interpolatePath(commands, fromCoords, toCoords, 0.5)).toThrow();
  });

  /**
   * @description At t=0, coordinates should match the from values.
   */
  it('returns from coords at t=0', () => {
    const commands = ['M', 'L', 'Z'];
    const fromCoords = [10, 20, 30, 40];
    const toCoords = [50, 60, 70, 80];
    const result = interpolatePath(commands, fromCoords, toCoords, 0);

    expect(result).toBe('M 10 20 L 30 40 Z');
  });

  /**
   * @description At t=1, coordinates should match the to values.
   */
  it('returns to coords at t=1', () => {
    const commands = ['M', 'L', 'Z'];
    const fromCoords = [10, 20, 30, 40];
    const toCoords = [50, 60, 70, 80];
    const result = interpolatePath(commands, fromCoords, toCoords, 1);

    expect(result).toBe('M 50 60 L 70 80 Z');
  });
});

// ---------------------------------------------------------------------------
// Property interpolation (multi-property with per-property easing)
// ---------------------------------------------------------------------------

describe('interpolateKeyframeProperties', () => {
  /**
   * @description Multi-property interpolation applies per-property easing.
   * Linear opacity should be exactly 0.5 at t=0.5, while ease-in
   * translateX should be < 0.5 of the range.
   */
  it('applies per-property easing: linear opacity and ease-in translateX', () => {
    const fromProps = {
      opacity: { value: 0, interpolation: 'linear' },
      translateX: { value: 0, interpolation: 'ease-in' },
    };
    const toProps = {
      opacity: { value: 1, interpolation: 'linear' },
      translateX: { value: 100, interpolation: 'linear' },
    };
    const result = interpolateKeyframeProperties(fromProps, toProps, 0.5);

    expect(result['opacity']).toBe(0.5);
    expect(result['translateX'] as number).toBeLessThan(50);
  });

  /**
   * @description Properties only in the from-keyframe must be held at
   * their from-value throughout the interpolation.
   */
  it('holds from-only properties at their from value', () => {
    const fromProps = {
      opacity: { value: 0.8, interpolation: 'linear' },
      extra: { value: 42, interpolation: 'linear' },
    };
    const toProps = {
      opacity: { value: 1, interpolation: 'linear' },
    };
    const result = interpolateKeyframeProperties(fromProps, toProps, 0.5);

    expect(result['extra']).toBe(42);
    expect(result['opacity']).toBe(0.9);
  });

  /**
   * @description When pathCommands are present, path morphing must be used
   * to produce an SVG d string.
   */
  it('uses path morphing when pathCommands are present', () => {
    const fromProps = {
      pathCommands: { value: ['M', 'L', 'Z'], interpolation: 'linear' },
      pathCoordinates: { value: [0, 0, 100, 0], interpolation: 'linear' },
    };
    const toProps = {
      pathCommands: { value: ['M', 'L', 'Z'], interpolation: 'linear' },
      pathCoordinates: { value: [10, 10, 110, 10], interpolation: 'linear' },
    };
    const result = interpolateKeyframeProperties(fromProps, toProps, 0.5);

    expect(typeof result['d']).toBe('string');
    expect(result['d']).toContain('M');
  });
});
