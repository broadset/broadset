import type { EasingMode, KeyframeValue } from '@broadset/model';

import { applyEasing, interpolateKeyframeProperties, interpolatePath, interpolateValue } from './interpolation';

function createNumberValue(value: number, easing: EasingMode = 'linear'): KeyframeValue {
  return { type: 'number', value, easing };
}

function createStringValue(
  value: string,
  easing: EasingMode | 'counting' = 'linear',
  countingFormat?: {
    readonly decimalPlaces?: number | undefined;
    readonly thousandsSeparator?: string | undefined;
    readonly prefix?: string | undefined;
    readonly suffix?: string | undefined;
  },
): KeyframeValue {
  return {
    type: 'string',
    value,
    easing,
    ...(countingFormat === undefined ? {} : { countingFormat }),
  };
}

function createTupleValue(value: readonly number[], easing: EasingMode = 'linear'): KeyframeValue {
  return { type: 'tuple', value, easing };
}

describe('applyEasing', () => {
  it('supports presets, cubic-bezier parsing, fallback, and input clamping', () => {
    expect(applyEasing('linear', 0.5)).toBeCloseTo(0.5, 6);
    expect(applyEasing('step', 0.99)).toBe(0);
    expect(applyEasing('step', 1)).toBe(1);
    expect(applyEasing('cubic-bezier(0.42,0,1,1)', 0.5)).toBeLessThan(0.5);
    expect(applyEasing('not-a-curve', 0.5)).toBeCloseTo(0.5, 6);
    expect(applyEasing('ease', -0.5)).toBe(0);
    expect(applyEasing('ease', 1.5)).toBe(1);
  });

  it('supports named and custom spring easing modes', () => {
    expect(applyEasing('spring-bouncy', 0.3)).toBeGreaterThan(1);
    expect(applyEasing('spring-stiff', 0.8)).toBeCloseTo(1, 2);

    const gentle = applyEasing('spring-gentle', 0.5);

    expect(gentle).toBeGreaterThan(0);
    expect(gentle).toBeLessThanOrEqual(1);
    expect(applyEasing('spring(300, 15, 1)', 1)).toBeCloseTo(1, 3);
  });
});

describe('interpolateValue', () => {
  it('interpolates numbers, booleans, numeric strings, and arrays', () => {
    expect(interpolateValue({ from: 0, to: 100, progress: 0.5, easing: 'linear' })).toBe(50);
    expect(interpolateValue({ from: true, to: false, progress: 0.5, easing: 'linear' })).toBe(true);
    expect(interpolateValue({ from: true, to: false, progress: 1, easing: 'linear' })).toBe(false);
    expect(interpolateValue({ from: '1', to: '0', progress: 0.5, easing: 'linear' })).toBe('0.5');
    expect(interpolateValue({ from: [0, 10], to: [10, 30], progress: 0.5, easing: 'linear' })).toEqual([5, 20]);
  });

  it('interpolates hex colors in OKLab and leaves non-hex inputs untouched', () => {
    expect(interpolateValue({ from: '#ff0000', to: '#ff0000', progress: 0.37, easing: 'linear' })).toBe('#ff0000');

    const alphaMidpoint = String(
      interpolateValue({ from: '#ff000000', to: '#ff0000ff', progress: 0.5, easing: 'linear' }),
    );

    expect(alphaMidpoint).toMatch(/^#[0-9a-f]{8}$/);
    expect(alphaMidpoint.endsWith('80')).toBe(true);

    const saturatedMidpoint = String(
      interpolateValue({ from: '#ff0000', to: '#0000ff', progress: 0.5, easing: 'linear' }),
    );

    expect(saturatedMidpoint).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    expect(saturatedMidpoint.includes('NaN')).toBe(false);
    expect(interpolateValue({ from: 'rgb(255,0,0)', to: '#0000ff', progress: 0.5, easing: 'linear' })).toBe(
      'rgb(255,0,0)',
    );
  });

  it('supports counting text formatting and discrete fallback for non-numeric strings', () => {
    expect(
      interpolateValue({
        from: '0',
        to: '100',
        progress: 0.5,
        easing: 'counting',
      }),
    ).toBe('50');

    expect(
      interpolateValue({
        from: '0',
        to: '99.9',
        progress: 0.5,
        easing: 'counting',
        countingFormat: { decimalPlaces: 1 },
      }),
    ).toBe('50.0');

    expect(
      interpolateValue({
        from: '0',
        to: '1000',
        progress: 0.5,
        easing: 'counting',
        countingFormat: { prefix: '$', suffix: 'k', thousandsSeparator: ',' },
      }),
    ).toBe('$500k');

    expect(
      interpolateValue({
        from: 'Hello',
        to: 'World',
        progress: 0.5,
        easing: 'counting',
      }),
    ).toBe('Hello');
  });
});

describe('interpolatePath', () => {
  it('morphs path coordinates and rejects mismatched tuples', () => {
    expect(
      interpolatePath({
        commands: ['M', 'L', 'Z'],
        from: [0, 0, 20, 20],
        to: [10, 10, 30, 30],
        progress: 0.5,
      }),
    ).toBe('M 5 5 L 25 25 Z');

    expect(() =>
      interpolatePath({
        commands: ['M', 'L', 'Z'],
        from: [0, 0, 20, 20],
        to: [10, 10],
        progress: 0.5,
      }),
    ).toThrow(/same length/i);
  });
});

describe('interpolateKeyframeProperties', () => {
  it('mixes easing per property and uses pathCommands for tuple morphing', () => {
    const midpoint = interpolateKeyframeProperties({
      fromProperties: {
        opacity: createNumberValue(0, 'linear'),
        translateX: createNumberValue(0, 'ease-in'),
      },
      toProperties: {
        opacity: createNumberValue(1, 'linear'),
        translateX: createNumberValue(100, 'ease-in'),
      },
      progress: 0.5,
    });

    expect(midpoint['opacity']).toBeCloseTo(0.5, 6);
    expect(Number(midpoint['translateX'])).toBeLessThan(50);

    const pathMidpoint = interpolateKeyframeProperties({
      fromProperties: {
        pathCommands: createStringValue('M L Z'),
        d: createTupleValue([0, 0, 20, 20], 'linear'),
      },
      toProperties: {
        pathCommands: createStringValue('M L Z'),
        d: createTupleValue([10, 10, 30, 30], 'linear'),
      },
      progress: 0.5,
    });

    expect(pathMidpoint['d']).toBe('M 5 5 L 25 25 Z');
  });
});
