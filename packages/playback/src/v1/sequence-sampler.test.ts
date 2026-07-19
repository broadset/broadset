import type { projectFormatV1 as ProjectFormatV1 } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { sampleSequenceV1 as sampleSequenceResultV1 } from './sequence-sampler';

type Interpolation = ProjectFormatV1.Interpolation;
type LoopDefinition = ProjectFormatV1.LoopDefinition;
type Track = ProjectFormatV1.Track;
type TypedValue = ProjectFormatV1.TypedValue;
type ValueType = ProjectFormatV1.ValueType;

function sampleSequenceV1(sequence: ProjectFormatV1.Sequence, tick: number) {
  const result = sampleSequenceResultV1({ sequence, transportTick: tick, sequences: new Map([[sequence.id, sequence]]) });

  if (result.status === 'invalid' || result.value.kind === 'time-out-of-range') return [];

  return result.value.values.map(({ target, valueType, value }) => ({ target, valueType, value }));
}

const START_TICK = 10;
const END_TICK = 30;
const MIDPOINT_TICK = 20;
const DURATION_TICKS = 40;
const GAP_TICKS = 10;
const FIRST_ITERATION_OFFSET = DURATION_TICKS + GAP_TICKS;

function createId(value: string): ProjectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

const TARGET: ProjectFormatV1.PropertyTarget = {
  entity: {
    projectId: createId('project'),
    documentId: createId('document'),
    entityKind: 'element',
    entityId: createId('element'),
  },
  pointer: '/style/opacity',
};

function createTrack(options: {
  readonly keyframes: readonly ProjectFormatV1.Keyframe[];
  readonly valueType: ValueType;
  readonly id?: string | undefined;
}): Track {
  const id = options.id ?? 'track';

  return {
    id: createId(id),
    name: id,
    target: TARGET,
    valueType: options.valueType,
    keyframes: options.keyframes,
  };
}

function createKeyframe(options: {
  readonly id: string;
  readonly tick: number;
  readonly value: TypedValue;
  readonly interpolation?: Interpolation | undefined;
}): ProjectFormatV1.Keyframe {
  return {
    id: createId(options.id),
    tick: options.tick,
    value: options.value,
    ...(options.interpolation === undefined ? {} : { interpolation: options.interpolation }),
  };
}

function createSequence(options: {
  readonly tracks: readonly Track[];
  readonly loop?: LoopDefinition | undefined;
  readonly durationTicks?: number | undefined;
}): ProjectFormatV1.Sequence {
  return {
    id: createId('sequence'),
    name: 'Sequence',
    durationTicks: options.durationTicks ?? DURATION_TICKS,
    loop: options.loop ?? { kind: 'none' },
    tracks: options.tracks,
    markers: [],
    cues: [],
    childClips: [],
  };
}

function sampleValue(options: {
  readonly valueType: ValueType;
  readonly from: TypedValue;
  readonly to: TypedValue;
  readonly tick?: number | undefined;
  readonly interpolation?: Interpolation | undefined;
}): TypedValue | undefined {
  const track = createTrack({
    valueType: options.valueType,
    keyframes: [
      createKeyframe({ id: 'from', tick: START_TICK, value: options.from, interpolation: options.interpolation }),
      createKeyframe({ id: 'to', tick: END_TICK, value: options.to }),
    ],
  });

  return sampleSequenceV1(createSequence({ tracks: [track] }), options.tick ?? MIDPOINT_TICK)[0]?.value;
}

describe('sampleSequenceV1 keyframe lookup', () => {
  it('returns a single keyframe only once its tick is reached', () => {
    const value = { type: 'number', value: 7 } as const;
    const track = createTrack({
      valueType: 'number',
      keyframes: [createKeyframe({ id: 'only', tick: MIDPOINT_TICK, value })],
    });
    const sequence = createSequence({ tracks: [track] });

    expect(sampleSequenceV1(sequence, 0)).toEqual([]);
    expect(sampleSequenceV1(sequence, MIDPOINT_TICK)[0]?.value).toEqual(value);
  });

  it('contributes nothing before the first value, preserves the last value, and sorts defensively', () => {
    const first = { type: 'number', value: 10 } as const;
    const last = { type: 'number', value: 30 } as const;
    const track = createTrack({
      valueType: 'number',
      keyframes: [
        createKeyframe({ id: 'last', tick: END_TICK, value: last }),
        createKeyframe({ id: 'first', tick: START_TICK, value: first }),
      ],
    });
    const sequence = createSequence({ tracks: [track] });

    expect(sampleSequenceV1(sequence, 0)).toEqual([]);
    expect(sampleSequenceV1(sequence, DURATION_TICKS)[0]?.value).toEqual(last);
  });

  it('skips empty tracks and samples multiple tracks independently', () => {
    const emptyTrack = createTrack({ id: 'empty', valueType: 'number', keyframes: [] });
    const numberTrack = createTrack({
      id: 'number',
      valueType: 'number',
      keyframes: [createKeyframe({ id: 'number-value', tick: 0, value: { type: 'number', value: 3 } })],
    });
    const textTrack = createTrack({
      id: 'text',
      valueType: 'string',
      keyframes: [createKeyframe({ id: 'text-value', tick: 0, value: { type: 'string', value: 'hello' } })],
    });

    expect(sampleSequenceV1(createSequence({ tracks: [emptyTrack, numberTrack, textTrack] }), 0)).toEqual([
      { target: TARGET, valueType: 'number', value: { type: 'number', value: 3 } },
      { target: TARGET, valueType: 'string', value: { type: 'string', value: 'hello' } },
    ]);
  });
});

describe('sampleSequenceV1 typed values', () => {
  it('linearly interpolates numeric values and rounds integers', () => {
    expect(sampleValue({ valueType: 'number', from: { type: 'number', value: 10 }, to: { type: 'number', value: 30 } })).toEqual({
      type: 'number',
      value: 20,
    });
    expect(sampleValue({ valueType: 'integer', from: { type: 'integer', value: 2 }, to: { type: 'integer', value: 5 } })).toEqual({
      type: 'integer',
      value: 4,
    });
  });

  it('interpolates point values componentwise', () => {
    expect(sampleValue({
      valueType: 'point2d',
      from: { type: 'point2d', value: [0, 10] },
      to: { type: 'point2d', value: [10, 30] },
    })).toEqual({ type: 'point2d', value: [5, 20] });
    expect(sampleValue({
      valueType: 'point3d',
      from: { type: 'point3d', value: [0, 10, 20] },
      to: { type: 'point3d', value: [10, 30, 40] },
    })).toEqual({ type: 'point3d', value: [5, 20, 30] });
  });

  it('interpolates concrete same-space colors including alpha', () => {
    const sampled = sampleValue({
      valueType: 'color',
      from: { type: 'color', value: { kind: 'color', space: 'srgb', channels: [0, 0.2, 0.4], alpha: 0.5 } },
      to: { type: 'color', value: { kind: 'color', space: 'srgb', channels: [1, 0.6, 0.8], alpha: 1 } },
      interpolation: { kind: 'color', space: 'srgb' },
    });

    expect(sampled?.type).toBe('color');
    if (sampled?.type !== 'color' || sampled.value.kind !== 'color') return;

    expect(sampled.value.space).toBe('srgb');
    expect(sampled.value.channels[0]).toBeCloseTo(0.5);
    expect(sampled.value.channels[1]).toBeCloseTo(0.4);
    expect(sampled.value.channels[2]).toBeCloseTo(0.6);
    expect(sampled.value.alpha).toBeCloseTo(0.75);
  });

  it('rejects concrete cross-space colors and swatch colors', () => {
    const srgb = { type: 'color', value: { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } } as const;
    const p3 = { type: 'color', value: { kind: 'color', space: 'display-p3', channels: [1, 1, 1], alpha: 1 } } as const;
    const swatch = { type: 'color', value: { kind: 'swatch', swatchId: createId('swatch') } } as const;

    expect(sampleValue({ valueType: 'color', from: srgb, to: p3, interpolation: { kind: 'color', space: 'srgb' } })).toBeUndefined();
    expect(sampleValue({ valueType: 'color', from: swatch, to: p3, interpolation: { kind: 'color', space: 'srgb' } })).toBeUndefined();
  });

  it('steps discrete and mismatched values only at the segment end', () => {
    const fromBoolean = { type: 'boolean', value: false } as const;
    const toBoolean = { type: 'boolean', value: true } as const;
    const fromString = { type: 'string', value: 'before' } as const;
    const toString = { type: 'string', value: 'after' } as const;

    expect(sampleValue({ valueType: 'boolean', from: fromBoolean, to: toBoolean })).toBe(fromBoolean);
    expect(sampleValue({ valueType: 'boolean', from: fromBoolean, to: toBoolean, tick: END_TICK })).toBe(toBoolean);
    expect(sampleValue({ valueType: 'string', from: fromString, to: toString })).toBe(fromString);
    expect(sampleValue({ valueType: 'string', from: fromString, to: toString, tick: END_TICK })).toBe(toString);
    expect(sampleValue({ valueType: 'number', from: { type: 'number', value: 1 }, to: toString })).toBeUndefined();
  });
});

describe('sampleSequenceV1 interpolation modes', () => {
  const from = { type: 'number', value: 0 } as const;
  const to = { type: 'number', value: 100 } as const;

  it('holds the first value throughout a hold segment', () => {
    expect(sampleValue({ valueType: 'number', from, to, interpolation: { kind: 'hold' } })).toBe(from);
  });

  it('applies start and end step positions', () => {
    expect(sampleValue({ valueType: 'number', from, to, interpolation: { kind: 'step', position: 'start' } })).toBe(to);
    expect(sampleValue({ valueType: 'number', from, to, interpolation: { kind: 'step', position: 'end' } })).toBe(from);
  });

  it('applies cubic-bezier easing from the first keyframe', () => {
    const sampled = sampleValue({
      valueType: 'number',
      from,
      to,
      interpolation: { kind: 'cubic-bezier', controlPoints: [0.25, 0.1, 0.25, 1] },
    });

    expect(sampled?.type).toBe('number');
    if (sampled?.type === 'number') expect(sampled.value).toBeGreaterThan(50);
  });
});

describe('sampleSequenceV1 loop mapping', () => {
  const track = createTrack({
    valueType: 'number',
    keyframes: [
      createKeyframe({ id: 'start', tick: 0, value: { type: 'number', value: 0 } }),
      createKeyframe({ id: 'end', tick: DURATION_TICKS, value: { type: 'number', value: DURATION_TICKS } }),
    ],
  });

  it('reports non-looping time outside the sequence bounds', () => {
    const sequence = createSequence({ tracks: [track] });

    expect(sampleSequenceV1(sequence, -1)).toEqual([]);
    expect(sampleSequenceV1(sequence, 100)).toEqual([]);
  });

  it('wraps repeat loops within a period and holds during the gap', () => {
    const sequence = createSequence({ tracks: [track], loop: { kind: 'repeat', gapTicks: GAP_TICKS } });

    expect(sampleSequenceV1(sequence, FIRST_ITERATION_OFFSET + MIDPOINT_TICK)[0]?.value).toEqual({
      type: 'number',
      value: MIDPOINT_TICK,
    });
    expect(sampleSequenceV1(sequence, DURATION_TICKS + 1)[0]?.value).toEqual({
      type: 'number',
      value: DURATION_TICKS,
    });
  });

  it('reports time out after the repeat count is exhausted', () => {
    const sequence = createSequence({
      tracks: [track],
      loop: { kind: 'repeat', count: 2, gapTicks: GAP_TICKS },
    });

    expect(sampleSequenceV1(sequence, FIRST_ITERATION_OFFSET * 2)).toEqual([]);
  });
});
