import { describe, expect, it } from 'vitest';

import { interpolationSchema, loopDefinitionSchema, sequenceSchema } from './sequence';

const target = {
  entity: { projectId: 'project-1', documentId: 'document-1', entityKind: 'element', entityId: 'headline' },
  pointer: '/appearance/opacity',
} as const;

function createOpacitySequenceFixture() {
  return {
    id: 'fade',
    name: 'Fade',
    durationTicks: 1_000,
    workArea: [100, 900],
    loop: { kind: 'repeat', count: 2, gapTicks: 10 },
    tracks: [
      {
        id: 'opacity',
        name: 'Opacity',
        target,
        valueType: 'number',
        keyframes: [
          {
            id: 'opacity-start',
            tick: 0,
            value: { type: 'number', value: 0 },
            interpolation: { kind: 'cubic-bezier', controlPoints: [0.42, 0, 0.58, 1] },
          },
          { id: 'opacity-end', tick: 1_000, value: { type: 'number', value: 1 } },
        ],
      },
    ],
    markers: [
      {
        id: 'middle',
        tick: 500,
        label: 'Middle',
        color: { kind: 'color', space: 'srgb', channels: [1, 1, 1], alpha: 1 },
      },
    ],
    cues: [
      {
        id: 'sound',
        kind: 'audio',
        tick: 500,
        assetId: 'sound-asset',
        gain: 1,
        firing: 'forward-and-explicit',
      },
    ],
    childClips: [
      {
        id: 'child-clip',
        sequenceId: 'child',
        outputRange: [100, 900],
        remap: { kind: 'linear', sourceRange: [0, 800], direction: 'forward' },
        stagger: { index: 0, intervalTicks: 20, jitterTicks: 5, seed: 42 },
      },
    ],
  } as const;
}

describe('sequenceSchema', () => {
  it('parses every closed loop and interpolation discriminant', () => {
    const path = {
      points: [
        { id: 'start', x: 0, y: 0 },
        { id: 'end', x: 1, y: 1 },
      ],
      segments: [
        { id: 'move', kind: 'move', pointId: 'start' },
        { id: 'line', kind: 'line', pointId: 'end' },
      ],
      closed: false,
    } as const;
    const interpolations = [
      { kind: 'hold' },
      { kind: 'step', position: 'end' },
      { kind: 'cubic-bezier', controlPoints: [0.42, 0, 0.58, 1] },
      { kind: 'spring', mass: 1, stiffness: 100, damping: 10, initialVelocity: 0, settleThreshold: 0.001 },
      { kind: 'spatial-path', path, orientToPath: true },
      { kind: 'counting', rounding: 'round', minimumDigits: 2, grouping: true },
      { kind: 'color', space: 'oklab' },
    ] as const;

    expect(interpolations.map((interpolation) => interpolationSchema.parse(interpolation))).toEqual(interpolations);
    expect(loopDefinitionSchema.parse({ kind: 'none' })).toEqual({ kind: 'none' });
    expect(loopDefinitionSchema.parse({ kind: 'repeat', gapTicks: 0 })).toEqual({ kind: 'repeat', gapTicks: 0 });
    expect(loopDefinitionSchema.parse({ kind: 'ping-pong', count: 2, gapTicks: 5, endpoint: 'once' })).toEqual({
      kind: 'ping-pong',
      count: 2,
      gapTicks: 5,
      endpoint: 'once',
    });
  });

  it('requires stable track and key ids with homogeneous values', () => {
    const sequence = createOpacitySequenceFixture();

    expect(sequenceSchema.parse(sequence)).toEqual(sequence);
    expect(sequenceSchema.safeParse({ ...sequence, tracks: [{ ...sequence.tracks[0], id: '' }] }).success).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [
          {
            ...sequence.tracks[0],
            keyframes: [
              sequence.tracks[0].keyframes[0],
              { ...sequence.tracks[0].keyframes[1], value: { type: 'string', value: '1' } },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires strictly ordered bounded keyframes and explicit outgoing interpolation only', () => {
    const sequence = createOpacitySequenceFixture();
    const track = sequence.tracks[0];

    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [{ ...track, keyframes: [{ ...track.keyframes[0], tick: 1_001 }, track.keyframes[1]] }],
      }).success,
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [{ ...track, keyframes: [track.keyframes[1], track.keyframes[0]] }],
      }).success,
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [{ ...track, keyframes: [{ ...track.keyframes[0], interpolation: undefined }, track.keyframes[1]] }],
      }).success,
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [
          { ...track, keyframes: [track.keyframes[0], { ...track.keyframes[1], interpolation: { kind: 'hold' } }] },
        ],
      }).success,
    ).toBe(false);
  });

  it('validates work areas, child output ranges, source ranges, and freeze ticks', () => {
    const sequence = createOpacitySequenceFixture();

    for (const invalid of [
      { ...sequence, workArea: [500, 500] },
      { ...sequence, workArea: [0, 1_001] },
      { ...sequence, childClips: [{ ...sequence.childClips[0], outputRange: [900, 100] }] },
      { ...sequence, childClips: [{ ...sequence.childClips[0], outputRange: [100, 1_001] }] },
      {
        ...sequence,
        childClips: [
          { ...sequence.childClips[0], remap: { kind: 'linear', sourceRange: [10, 10], direction: 'forward' } },
        ],
      },
      { ...sequence, childClips: [{ ...sequence.childClips[0], remap: { kind: 'freeze', sourceTick: -1 } }] },
    ]) {
      expect(sequenceSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it('rejects duplicate local ids in every sequence collection', () => {
    const sequence = createOpacitySequenceFixture();

    expect(sequenceSchema.safeParse({ ...sequence, tracks: [sequence.tracks[0], sequence.tracks[0]] }).success).toBe(
      false,
    );
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [
          {
            ...sequence.tracks[0],
            keyframes: [sequence.tracks[0].keyframes[0], { ...sequence.tracks[0].keyframes[1], id: 'opacity-start' }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(sequenceSchema.safeParse({ ...sequence, markers: [sequence.markers[0], sequence.markers[0]] }).success).toBe(
      false,
    );
    expect(sequenceSchema.safeParse({ ...sequence, cues: [sequence.cues[0], sequence.cues[0]] }).success).toBe(false);
    expect(
      sequenceSchema.safeParse({ ...sequence, childClips: [sequence.childClips[0], sequence.childClips[0]] }).success,
    ).toBe(false);
  });

  it('requires explicit deterministic stagger values and safe loop fields', () => {
    const sequence = createOpacitySequenceFixture();
    const { seed: _seed, ...unseededStagger } = sequence.childClips[0].stagger;

    expect(
      sequenceSchema.safeParse({ ...sequence, childClips: [{ ...sequence.childClips[0], stagger: unseededStagger }] })
        .success,
    ).toBe(false);
    expect(sequenceSchema.safeParse({ ...sequence, loop: { kind: 'repeat', count: 0, gapTicks: 0 } }).success).toBe(
      false,
    );
    expect(
      sequenceSchema.safeParse({ ...sequence, loop: { kind: 'ping-pong', gapTicks: 0, endpoint: 'duplicate' } })
        .success,
    ).toBe(true);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        childClips: [
          {
            ...sequence.childClips[0],
            outputRange: [100, 900],
            stagger: { index: 10, intervalTicks: 20, jitterTicks: 5, seed: 42 },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        loop: { kind: 'repeat', count: Number.MAX_SAFE_INTEGER, gapTicks: Number.MAX_SAFE_INTEGER },
      }).success,
    ).toBe(false);
  });

  it('enforces interpolation compatibility and closed variant fields', () => {
    const sequence = createOpacitySequenceFixture();
    const track = sequence.tracks[0];

    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [
          {
            ...track,
            keyframes: [
              { ...track.keyframes[0], interpolation: { kind: 'color', space: 'oklab' } },
              track.keyframes[1],
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [
          {
            ...track,
            keyframes: [
              {
                ...track.keyframes[0],
                interpolation: {
                  kind: 'spring',
                  mass: 1,
                  stiffness: 100,
                  damping: -1,
                  initialVelocity: 0,
                  settleThreshold: 0.001,
                },
              },
              track.keyframes[1],
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      sequenceSchema.safeParse({
        ...sequence,
        tracks: [
          {
            ...track,
            keyframes: [
              { ...track.keyframes[0], interpolation: { kind: 'cubic-bezier', controlPoints: [1.1, 0, 1, 1] } },
              track.keyframes[1],
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('covers the complete interpolation and value-type compatibility table', () => {
    const path = {
      points: [
        { id: 'start', x: 0, y: 0 },
        { id: 'end', x: 1, y: 1 },
      ],
      segments: [
        { id: 'move', kind: 'move', pointId: 'start' },
        { id: 'line', kind: 'line', pointId: 'end' },
      ],
      closed: false,
    };
    const cubic = { kind: 'cubic-bezier', controlPoints: [0.42, 0, 0.58, 1] };
    const spring = {
      kind: 'spring',
      mass: 1,
      stiffness: 100,
      damping: 10,
      initialVelocity: 0,
      settleThreshold: 0.001,
    };
    const spatial = { kind: 'spatial-path', path, orientToPath: false };
    const counting = { kind: 'counting', rounding: 'round', minimumDigits: 1, grouping: false };
    const color = { kind: 'color', space: 'oklab' };
    const values = {
      null: [
        { type: 'null', value: null },
        { type: 'null', value: null },
      ],
      boolean: [
        { type: 'boolean', value: false },
        { type: 'boolean', value: true },
      ],
      integer: [
        { type: 'integer', value: 0 },
        { type: 'integer', value: 1 },
      ],
      number: [
        { type: 'number', value: 0 },
        { type: 'number', value: 1 },
      ],
      string: [
        { type: 'string', value: '0' },
        { type: 'string', value: '1' },
      ],
      'date-time': [
        { type: 'date-time', value: '2026-01-01T00:00:00Z' },
        { type: 'date-time', value: '2026-01-02T00:00:00Z' },
      ],
      length: [
        { type: 'length', value: 0 },
        { type: 'length', value: 1 },
      ],
      angle: [
        { type: 'angle', value: 0 },
        { type: 'angle', value: 90 },
      ],
      color: [
        { type: 'color', value: { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } },
        { type: 'color', value: { kind: 'color', space: 'srgb', channels: [1, 1, 1], alpha: 1 } },
      ],
      asset: [
        { type: 'asset', assetId: 'first' },
        { type: 'asset', assetId: 'second' },
      ],
      point2d: [
        { type: 'point2d', value: [0, 0] },
        { type: 'point2d', value: [1, 1] },
      ],
      point3d: [
        { type: 'point3d', value: [0, 0, 0] },
        { type: 'point3d', value: [1, 1, 1] },
      ],
      list: [
        { type: 'list', items: [{ type: 'string', value: 'first' }] },
        { type: 'list', items: [{ type: 'string', value: 'second' }] },
      ],
      object: [
        { type: 'object', fields: { value: { type: 'string', value: 'first' } } },
        { type: 'object', fields: { value: { type: 'string', value: 'second' } } },
      ],
    } as const;
    const createSequence = (valueType: keyof typeof values, interpolation: object) => {
      const sequence = createOpacitySequenceFixture();
      const [startValue, endValue] = values[valueType];

      return {
        ...sequence,
        tracks: [
          {
            ...sequence.tracks[0],
            valueType,
            keyframes: [
              { id: 'start', tick: 0, value: startValue, interpolation },
              { id: 'end', tick: 1_000, value: endValue },
            ],
          },
        ],
      };
    };
    const compatible = [
      ['boolean', { kind: 'hold' }],
      ['asset', { kind: 'step', position: 'end' }],
      ['integer', spring],
      ['number', cubic],
      ['length', cubic],
      ['angle', spring],
      ['point2d', cubic],
      ['point3d', spring],
      ['point2d', spatial],
      ['point3d', spatial],
      ['string', counting],
      ['color', color],
      ['null', { kind: 'hold' }],
      ['null', { kind: 'step', position: 'start' }],
      ['date-time', { kind: 'hold' }],
      ['date-time', { kind: 'step', position: 'end' }],
      ['list', { kind: 'hold' }],
      ['list', { kind: 'step', position: 'start' }],
      ['object', { kind: 'hold' }],
      ['object', { kind: 'step', position: 'end' }],
    ] as const;
    const incompatible = [
      ['boolean', cubic],
      ['string', spring],
      ['asset', cubic],
      ['color', cubic],
      ['number', counting],
      ['string', spatial],
      ['point2d', color],
    ] as const;

    for (const [valueType, interpolation] of compatible) {
      expect(sequenceSchema.safeParse(createSequence(valueType, interpolation)).success).toBe(true);
    }

    for (const [valueType, interpolation] of incompatible) {
      expect(sequenceSchema.safeParse(createSequence(valueType, interpolation)).success).toBe(false);
    }

    const newlyCoveredDiscreteTypes = ['null', 'date-time', 'list', 'object'] as const;
    const incompatibleContinuousFamilies = [cubic, counting, color, spatial] as const;

    for (const valueType of newlyCoveredDiscreteTypes) {
      for (const interpolation of incompatibleContinuousFamilies) {
        expect(sequenceSchema.safeParse(createSequence(valueType, interpolation)).success).toBe(false);
      }
    }
  });
});
