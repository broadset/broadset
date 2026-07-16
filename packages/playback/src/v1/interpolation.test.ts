import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as projectFormatV1Runtime } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { interpolateTrackSegmentV1 } from './interpolation';

type Interpolation = projectFormatV1.Interpolation;
type TypedValue = projectFormatV1.TypedValue;
type ValueType = projectFormatV1.ValueType;

function colorChannels(space: projectFormatV1.ColorSpace, value: number): readonly number[] {
  if (space === 'cmyk') return [value, value, value, value];
  if (space === 'gray') return [value];

  return [value, value, value];
}

function interpolate(options: {
  readonly valueType: ValueType;
  readonly from: TypedValue;
  readonly to: TypedValue;
  readonly interpolation: Interpolation;
  readonly progress?: number | undefined;
}) {
  return interpolateTrackSegmentV1({ ...options, progress: options.progress ?? 0.5 });
}

describe('interpolateTrackSegmentV1 dispatch', () => {
  const from = { type: 'number', value: 0 } as const;
  const to = { type: 'number', value: 100 } as const;

  it('preserves endpoint identity and implements exact hold/step semantics', () => {
    expect(interpolate({ valueType: 'number', from, to, interpolation: { kind: 'hold' } })).toMatchObject({ value: { value: from } });
    expect(interpolate({ valueType: 'number', from, to, interpolation: { kind: 'step', position: 'start' }, progress: 0 })).toMatchObject({ value: { value: to } });
    expect(interpolate({ valueType: 'number', from, to, interpolation: { kind: 'step', position: 'end' }, progress: 0.999 })).toMatchObject({ value: { value: from } });
    expect(interpolate({ valueType: 'number', from, to, interpolation: { kind: 'step', position: 'end' }, progress: 1 })).toMatchObject({ value: { value: to } });
  });

  it('supports cubic and spring easing with exact spring endpoints', () => {
    expect(interpolate({ valueType: 'number', from, to, interpolation: { kind: 'cubic-bezier', controlPoints: [0.25, 0.1, 0.25, 1] } })).toMatchObject({ status: 'resolved' });

    const spring = { kind: 'spring', mass: 1, stiffness: 100, damping: 3, initialVelocity: 0, settleThreshold: 0.001 } as const;

    expect(interpolate({ valueType: 'number', from, to, interpolation: spring, progress: 0 })).toMatchObject({ value: { value: from } });
    expect(interpolate({ valueType: 'number', from, to, interpolation: spring, progress: 1 })).toMatchObject({ value: { value: to } });
    expect(interpolate({ valueType: 'number', from, to, interpolation: spring, progress: 0.05 })).toMatchObject({ value: { value: { type: 'number' } } });

    const overshoot = interpolate({ valueType: 'number', from, to, interpolation: spring, progress: 0.05 });

    expect(overshoot.status === 'resolved' && overshoot.value.value.type === 'number' ? overshoot.value.value.value : 0).toBeGreaterThan(100);
  });

  it.each([
    ['integer', { type: 'integer', value: 0 }, { type: 'integer', value: 5 }, { type: 'integer', value: 3 }],
    ['number', from, to, { type: 'number', value: 50 }],
    ['length', { type: 'length', value: 2 }, { type: 'length', value: 6 }, { type: 'length', value: 4 }],
    ['angle', { type: 'angle', value: 0 }, { type: 'angle', value: 2 }, { type: 'angle', value: 1 }],
    ['point2d', { type: 'point2d', value: [0, 10] }, { type: 'point2d', value: [10, 30] }, { type: 'point2d', value: [5, 20] }],
    ['point3d', { type: 'point3d', value: [0, 10, 20] }, { type: 'point3d', value: [10, 30, 40] }, { type: 'point3d', value: [5, 20, 30] }],
  ] as const)('linearly interpolates %s values', (valueType, start, end, expected) => {
    expect(interpolate({ valueType, from: start, to: end, interpolation: { kind: 'cubic-bezier', controlPoints: [0, 0, 1, 1] } })).toMatchObject({ value: { value: expected } });
  });

  it('returns typed diagnostics for mismatched values and invalid progress', () => {
    expect(interpolate({ valueType: 'number', from, to: { type: 'string', value: 'no' }, interpolation: { kind: 'hold' } })).toMatchObject({ status: 'invalid' });
    expect(interpolate({ valueType: 'number', from, to, interpolation: { kind: 'hold' }, progress: Number.NaN })).toMatchObject({ status: 'invalid' });
  });
});

describe('interpolateTrackSegmentV1 specialized interpolation', () => {
  it.each(['srgb', 'display-p3', 'rec2020', 'lab', 'oklab', 'oklch', 'cmyk', 'gray'] as const)(
    'interpolates concrete %s colors including alpha',
    (space) => {
      const channels = colorChannels(space, 0);
      const endChannels = colorChannels(space, 1);
      const result = interpolate({
        valueType: 'color',
        from: { type: 'color', value: { kind: 'color', space, channels, alpha: 0 } },
        to: { type: 'color', value: { kind: 'color', space, channels: endChannels, alpha: 1 } },
        interpolation: { kind: 'color', space },
      });

      expect(result).toMatchObject({ status: 'resolved', value: { value: { type: 'color', value: { alpha: 0.5 } } } });
    },
  );

  it('rejects cross-space color approximation', () => {
    expect(interpolate({
      valueType: 'color',
      from: { type: 'color', value: { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } },
      to: { type: 'color', value: { kind: 'color', space: 'display-p3', channels: [1, 1, 1], alpha: 1 } },
      interpolation: { kind: 'color', space: 'srgb' },
    })).toMatchObject({ status: 'invalid' });
  });

  it('formats counting interpolation deterministically', () => {
    expect(interpolate({
      valueType: 'string', from: { type: 'string', value: '0' }, to: { type: 'string', value: '2000' },
      interpolation: { kind: 'counting', rounding: 'round', minimumDigits: 5, grouping: true },
    })).toMatchObject({ value: { value: { type: 'string', value: '01,000' } } });
    expect(interpolate({
      valueType: 'string', from: { type: 'string', value: 'zero' }, to: { type: 'string', value: '10' },
      interpolation: { kind: 'counting', rounding: 'round', minimumDigits: 0, grouping: false },
    })).toMatchObject({ status: 'invalid' });
  });

  it('samples a spatial path by arc length and returns tangent orientation', () => {
    const point = (id: string, x: number, y: number) => ({ id: (awaitId(id)), x, y });
    const path: projectFormatV1.StructuredPath = {
      points: [point('p0', 0, 0), point('p1', 10, 10)],
      segments: [
        { id: awaitId('move'), kind: 'move', pointId: awaitId('p0') },
        { id: awaitId('line'), kind: 'line', pointId: awaitId('p1') },
      ],
      closed: false,
    };
    const result = interpolate({
      valueType: 'point2d',
      from: { type: 'point2d', value: [0, 0] },
      to: { type: 'point2d', value: [10, 10] },
      interpolation: { kind: 'spatial-path', path, orientToPath: true },
    });

    expect(result).toMatchObject({ status: 'resolved', value: { value: { type: 'point2d', value: [5, 5] } } });
    expect(result.status === 'resolved' ? result.value.orientationRadians : 0).toBeCloseTo(Math.PI / 4);
  });

  it('samples a curved arc midpoint without connecting move subpaths or dropping close edges', () => {
    const point = (id: string, x: number, y: number) => ({ id: awaitId(id), x, y });
    const curve: projectFormatV1.StructuredPath = {
      points: [point('curve-start', 0, 0), point('curve-end', 10, 10)],
      segments: [
        { id: awaitId('curve-move'), kind: 'move', pointId: awaitId('curve-start') },
        { id: awaitId('curve-segment'), kind: 'quadratic', control: [10, 0], pointId: awaitId('curve-end') },
      ],
      closed: false,
    };
    const curveResult = interpolate({
      valueType: 'point2d',
      from: { type: 'point2d', value: [0, 0] },
      to: { type: 'point2d', value: [10, 10] },
      interpolation: { kind: 'spatial-path', path: curve, orientToPath: false },
    });

    expect(curveResult.status === 'resolved' && curveResult.value.value.type === 'point2d' ? curveResult.value.value.value[0] : 0).toBeCloseTo(7.5, 1);
    expect(curveResult.status === 'resolved' && curveResult.value.value.type === 'point2d' ? curveResult.value.value.value[1] : 0).toBeCloseTo(2.5, 1);

    const disconnected: projectFormatV1.StructuredPath = {
      points: [point('a0', 0, 0), point('a1', 10, 0), point('b0', 100, 0), point('b1', 110, 0)],
      segments: [
        { id: awaitId('move-a'), kind: 'move', pointId: awaitId('a0') },
        { id: awaitId('line-a'), kind: 'line', pointId: awaitId('a1') },
        { id: awaitId('move-b'), kind: 'move', pointId: awaitId('b0') },
        { id: awaitId('line-b'), kind: 'line', pointId: awaitId('b1') },
      ],
      closed: false,
    };
    const disconnectedResult = interpolate({
      valueType: 'point2d',
      from: { type: 'point2d', value: [0, 0] },
      to: { type: 'point2d', value: [110, 0] },
      interpolation: { kind: 'spatial-path', path: disconnected, orientToPath: false },
    });

    expect(disconnectedResult).toMatchObject({ value: { value: { type: 'point2d', value: [10, 0] } } });

    const closed: projectFormatV1.StructuredPath = {
      points: [point('c0', 0, 0), point('c1', 10, 0), point('c2', 10, 10)],
      segments: [
        { id: awaitId('move-c'), kind: 'move', pointId: awaitId('c0') },
        { id: awaitId('line-c1'), kind: 'line', pointId: awaitId('c1') },
        { id: awaitId('line-c2'), kind: 'line', pointId: awaitId('c2') },
        { id: awaitId('close-c'), kind: 'close' },
      ],
      closed: false,
    };
    const closedResult = interpolate({
      valueType: 'point2d',
      from: { type: 'point2d', value: [0, 0] },
      to: { type: 'point2d', value: [10, 10] },
      interpolation: { kind: 'spatial-path', path: closed, orientToPath: false },
      progress: 0.75,
    });

    expect(closedResult.status === 'resolved' && closedResult.value.value.type === 'point2d' ? closedResult.value.value.value[0] : 0).toBeCloseTo(6, 0);
    expect(closedResult.status === 'resolved' && closedResult.value.value.type === 'point2d' ? closedResult.value.value.value[1] : 0).toBeCloseTo(6, 0);
  });
});

function awaitId(value: string): projectFormatV1.Id {
  return projectFormatV1Runtime.idSchema.parse(value);
}
