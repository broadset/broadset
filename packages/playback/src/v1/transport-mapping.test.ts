import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { mapSequenceTickV1 } from './transport-mapping';

type LoopDefinition = projectFormatV1.LoopDefinition;

function sequence(loop: LoopDefinition, durationTicks = 10): projectFormatV1.Sequence {
  return {
    id: model.idSchema.parse('sequence'),
    name: 'Sequence',
    durationTicks,
    loop,
    tracks: [],
    markers: [],
    cues: [],
    childClips: [],
  };
}

function map(loop: LoopDefinition, transportTick: number, durationTicks = 10) {
  return mapSequenceTickV1({ sequence: sequence(loop, durationTicks), transportTick });
}

describe('mapSequenceTickV1 validation and non-looping transport', () => {
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])('returns diagnostics for invalid tick %s', (transportTick) => {
    expect(map({ kind: 'none' }, transportTick)).toMatchObject({ status: 'invalid' });
  });

  it('keeps the terminal tick inspectable and reports later time as out of range', () => {
    expect(map({ kind: 'none' }, 10)).toEqual({
      status: 'resolved',
      value: { kind: 'mapped', sequenceTick: 10, iteration: 0, direction: 'forward', inGap: false },
    });
    expect(map({ kind: 'none' }, 11)).toEqual({
      status: 'resolved',
      value: { kind: 'time-out-of-range', requestedTick: 11, minimumTick: 0, maximumTick: 10 },
    });
  });
});

describe('mapSequenceTickV1 repeat loops', () => {
  it('maps finite repeats, holds their gap, and omits a trailing completion gap', () => {
    const loop = { kind: 'repeat', count: 2, gapTicks: 3 } as const;

    expect(map(loop, 10)).toMatchObject({ value: { sequenceTick: 10, iteration: 0, inGap: false } });
    expect(map(loop, 11)).toMatchObject({ value: { sequenceTick: 10, iteration: 0, inGap: true } });
    expect(map(loop, 13)).toMatchObject({ value: { sequenceTick: 0, iteration: 1, inGap: false } });
    expect(map(loop, 23)).toMatchObject({ value: { sequenceTick: 10, iteration: 1, inGap: false } });
    expect(map(loop, 24)).toMatchObject({ value: { kind: 'time-out-of-range', maximumTick: 23 } });
  });

  it('maps an unbounded repeat without accumulating drift', () => {
    expect(map({ kind: 'repeat', gapTicks: 0 }, 1_000_003)).toEqual({
      status: 'resolved',
      value: { kind: 'mapped', sequenceTick: 3, iteration: 100_000, direction: 'forward', inGap: false },
    });
  });
});

describe('mapSequenceTickV1 ping-pong and zero duration', () => {
  it('alternates direction and distinguishes shared from duplicated boundaries', () => {
    expect(map({ kind: 'ping-pong', gapTicks: 0, endpoint: 'once' }, 11)).toMatchObject({
      value: { sequenceTick: 9, iteration: 1, direction: 'reverse' },
    });
    expect(map({ kind: 'ping-pong', gapTicks: 0, endpoint: 'duplicate' }, 11)).toMatchObject({
      value: { sequenceTick: 10, iteration: 1, direction: 'reverse' },
    });
  });

  it('handles a zero-duration sequence without division by zero', () => {
    expect(map({ kind: 'none' }, 0, 0)).toMatchObject({ value: { kind: 'mapped', sequenceTick: 0 } });
    expect(map({ kind: 'none' }, 1, 0)).toMatchObject({ value: { kind: 'time-out-of-range', maximumTick: 0 } });
    expect(map({ kind: 'repeat', gapTicks: 0 }, 1, 0)).toMatchObject({ value: { kind: 'mapped', sequenceTick: 0 } });
    expect(map({ kind: 'repeat', gapTicks: 3 }, 1, 0)).toMatchObject({ value: { kind: 'mapped', sequenceTick: 0, iteration: 0, inGap: true } });
    expect(map({ kind: 'repeat', gapTicks: 3 }, 3, 0)).toMatchObject({ value: { kind: 'mapped', sequenceTick: 0, iteration: 1, inGap: false } });
  });
});
