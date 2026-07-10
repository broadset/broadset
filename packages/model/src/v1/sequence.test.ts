import { describe, expect, it } from 'vitest';

import {
  interpolationSchema,
  lifecycleDefinitionSchema,
  loopDefinitionSchema,
  sequenceSchema,
  stateMachineSchema,
  transitionTriggerSchema,
} from './sequence';

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
});

describe('lifecycle and state machines', () => {
  it('parses every typed transition trigger', () => {
    const triggers = [
      { kind: 'event', eventId: 'show' },
      { kind: 'lifecycle', phase: 'update' },
      { kind: 'after', ticks: 1 },
    ] as const;

    expect(triggers.map((trigger) => transitionTriggerSchema.parse(trigger))).toEqual(triggers);
    expect(transitionTriggerSchema.safeParse({ kind: 'after', ticks: 0 }).success).toBe(false);
  });

  it('parses document lifecycle with every stable action discriminant', () => {
    const lifecycle = {
      id: 'lifecycle',
      in: [{ kind: 'play-sequence', sequenceId: 'in', behavior: 'restart' }],
      hold: [{ kind: 'seek-sequence', sequenceId: 'hold', tick: 0 }],
      update: [{ kind: 'send-event', stateMachineId: 'visibility', eventId: 'refresh' }],
      out: [{ kind: 'stop-sequence', sequenceId: 'in' }],
    } as const;

    expect(lifecycleDefinitionSchema.parse(lifecycle)).toEqual(lifecycle);
    expect(
      lifecycleDefinitionSchema.safeParse({ ...lifecycle, out: [{ kind: 'unknown', sequenceId: 'in' }] }).success,
    ).toBe(false);
  });

  it('validates state references, local ids, priorities, and boolean literal guards', () => {
    const machine = {
      id: 'visibility',
      name: 'Visibility',
      initialStateId: 'hidden',
      states: [
        { id: 'hidden', name: 'Hidden', values: [], entryActions: [], exitActions: [] },
        {
          id: 'visible',
          name: 'Visible',
          values: [{ id: 'opacity', target, value: { type: 'number', value: 1 } }],
          entryActions: [],
          exitActions: [],
        },
      ],
      transitions: [
        {
          id: 'show',
          sourceStateId: 'hidden',
          targetStateId: 'visible',
          trigger: { kind: 'event', eventId: 'show' },
          guard: { kind: 'literal', value: { type: 'boolean', value: true } },
          priority: 0,
          actions: [{ kind: 'play-sequence', sequenceId: 'fade', behavior: 'restart' }],
        },
      ],
    } as const;

    expect(stateMachineSchema.parse(machine)).toEqual(machine);
    expect(stateMachineSchema.safeParse({ ...machine, initialStateId: 'missing' }).success).toBe(false);
    expect(stateMachineSchema.safeParse({ ...machine, states: [machine.states[0], machine.states[0]] }).success).toBe(
      false,
    );
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        states: [
          machine.states[0],
          { ...machine.states[1], values: [machine.states[1].values[0], machine.states[1].values[0]] },
        ],
      }).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [{ ...machine.transitions[0], targetStateId: 'missing' }],
      }).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [
          { ...machine.transitions[0], guard: { kind: 'literal', value: { type: 'string', value: 'yes' } } },
        ],
      }).success,
    ).toBe(false);
    expect(
      stateMachineSchema.safeParse({
        ...machine,
        transitions: [
          {
            ...machine.transitions[0],
            guard: {
              kind: 'unary',
              operator: 'negate',
              operand: { kind: 'literal', value: { type: 'number', value: 1 } },
            },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate source-trigger-priority combinations', () => {
    const transition = {
      id: 'first',
      sourceStateId: 'idle',
      targetStateId: 'active',
      trigger: { kind: 'lifecycle', phase: 'in' },
      priority: 1,
      actions: [],
    } as const;
    const machine = {
      id: 'machine',
      name: 'Machine',
      initialStateId: 'idle',
      states: [
        { id: 'idle', name: 'Idle', values: [], entryActions: [], exitActions: [] },
        { id: 'active', name: 'Active', values: [], entryActions: [], exitActions: [] },
      ],
      transitions: [transition, { ...transition, id: 'second' }],
    } as const;

    expect(stateMachineSchema.safeParse(machine).success).toBe(false);
  });
});
