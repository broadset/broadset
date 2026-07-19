import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { sampleSequenceV1 } from './sequence-sampler';

type Id = projectFormatV1.Id;

const id = (value: string): Id => model.idSchema.parse(value);
const TARGET: projectFormatV1.PropertyTarget = {
  entity: { projectId: id('project'), documentId: id('document'), entityKind: 'element', entityId: id('element') },
  pointer: '/style/opacity',
};

function sequence(options: {
  readonly id?: Id | undefined;
  readonly keyframes?: readonly projectFormatV1.Keyframe[] | undefined;
  readonly childClips?: readonly projectFormatV1.SequenceClip[] | undefined;
} = {}): projectFormatV1.Sequence {
  const sequenceId = options.id ?? id('sequence');

  return {
    id: sequenceId, name: String(sequenceId), durationTicks: 10, loop: { kind: 'none' },
    tracks: options.keyframes === undefined ? [] : [{ id: id(`track-${String(sequenceId)}`), name: 'Track', target: TARGET, valueType: 'number', keyframes: options.keyframes }],
    markers: [], cues: [], childClips: options.childClips ?? [],
  };
}

function sample(root: projectFormatV1.Sequence, tick: number, others: readonly projectFormatV1.Sequence[] = []) {
  return sampleSequenceV1({ sequence: root, transportTick: tick, sequences: new Map([[root.id, root], ...others.map((item) => [item.id, item] as const)]) });
}

describe('sampleSequenceV1 contract', () => {
  const first = { id: id('first'), tick: 3, value: { type: 'number', value: 3 } } as const;
  const last = { id: id('last'), tick: 10, value: { type: 'number', value: 10 } } as const;

  it('contributes nothing before the first keyframe and preserves exact-keyframe identity/provenance', () => {
    const root = sequence({ keyframes: [first, last] });

    expect(sample(root, 2)).toEqual({ status: 'resolved', value: { kind: 'sample', sequenceTick: 2, values: [] } });
    expect(sample(root, 3)).toMatchObject({
      status: 'resolved',
      value: { values: [{ value: first.value, provenance: { sequenceId: root.id, fromKeyframeId: first.id, childClipPath: [] } }] },
    });
  });

  it('propagates transport time-out rather than clamping', () => {
    expect(sample(sequence({ keyframes: [first, last] }), 11)).toEqual({
      status: 'resolved', value: { kind: 'time-out-of-range', requestedTick: 11, maximumTick: 10 },
    });
  });

  it('uses half-open child bounds and retains nested clip provenance', () => {
    const child = sequence({ id: id('child'), keyframes: [{ id: id('child-keyframe'), tick: 0, value: { type: 'number', value: 7 } }] });
    const root = sequence({ childClips: [{ id: id('clip'), sequenceId: child.id, outputRange: [2, 5], remap: { kind: 'freeze', sourceTick: 0 } }] });

    expect(sample(root, 2, [child])).toMatchObject({ value: { values: [{ value: { value: 7 }, provenance: { childClipPath: [id('clip')] } }] } });
    expect(sample(root, 5, [child])).toMatchObject({ value: { values: [] } });
  });

  it('starts a reverse child remap at the last included source tick', () => {
    const child = sequence({
      id: id('reverse-child'),
      keyframes: [
        { id: id('reverse-start'), tick: 0, value: { type: 'number', value: 0 } },
        { id: id('reverse-end'), tick: 10, value: { type: 'number', value: 10 } },
      ],
    });
    const root = sequence({
      childClips: [{ id: id('reverse-clip'), sequenceId: child.id, outputRange: [0, 5], remap: { kind: 'linear', sourceRange: [0, 10], direction: 'reverse' } }],
    });

    expect(sample(root, 0, [child])).toMatchObject({ value: { values: [{ value: { type: 'number', value: 9 } }] } });
  });

  it('maps forward child clips from the included source start', () => {
    const child = sequence({
      id: id('forward-child'),
      keyframes: [
        { id: id('forward-start'), tick: 0, value: { type: 'number', value: 0 } },
        { id: id('forward-end'), tick: 10, value: { type: 'number', value: 10 } },
      ],
    });
    const root = sequence({
      childClips: [{ id: id('forward-clip'), sequenceId: child.id, outputRange: [0, 5], remap: { kind: 'linear', sourceRange: [2, 7], direction: 'forward' } }],
    });

    expect(sample(root, 0, [child])).toMatchObject({ value: { values: [{ value: { type: 'number', value: 2 } }] } });
    expect(sample(root, 4, [child])).toMatchObject({ value: { values: [{ value: { type: 'number', value: 6 } }] } });
  });

  it('applies deterministic stagger offsets before half-open clip sampling', () => {
    const child = sequence({ id: id('stagger-child'), keyframes: [{ id: id('stagger-value'), tick: 0, value: { type: 'number', value: 4 } }] });
    const root = sequence({
      childClips: [{
        id: id('stagger-clip'),
        sequenceId: child.id,
        outputRange: [0, 3],
        remap: { kind: 'freeze', sourceTick: 0 },
        stagger: { index: 2, intervalTicks: 2, jitterTicks: 0, seed: 7 },
      }],
    });

    expect(sample(root, 3, [child])).toMatchObject({ value: { values: [] } });
    expect(sample(root, 4, [child])).toMatchObject({ value: { values: [{ value: { type: 'number', value: 4 } }] } });
    expect(sample(root, 7, [child])).toMatchObject({ value: { values: [] } });
    expect(sample(root, 4, [child])).toEqual(sample(root, 4, [child]));
  });

  it('returns diagnostics for missing and cyclic child references', () => {
    const missing = sequence({ childClips: [{ id: id('missing-clip'), sequenceId: id('missing'), outputRange: [0, 5], remap: { kind: 'freeze', sourceTick: 0 } }] });

    expect(sample(missing, 0)).toMatchObject({ status: 'invalid' });

    const cyclic = sequence({ id: id('cyclic'), childClips: [{ id: id('cycle'), sequenceId: id('cyclic'), outputRange: [0, 5], remap: { kind: 'freeze', sourceTick: 0 } }] });

    expect(sample(cyclic, 0)).toMatchObject({ status: 'invalid' });
  });

  it('samples a deeply nested valid child graph without using the JavaScript call stack', () => {
    const depth = 6_000;
    const leaf = sequence({ id: id(`deep-${String(depth)}`), keyframes: [{ id: id('deep-value'), tick: 0, value: { type: 'number', value: 11 } }] });
    const sequences: projectFormatV1.Sequence[] = [leaf];

    for (let index = depth - 1; index >= 0; index -= 1) {
      const child = sequences.at(-1);

      if (child === undefined) break;
      sequences.push(sequence({
        id: id(`deep-${String(index)}`),
        childClips: [{ id: id(`deep-clip-${String(index)}`), sequenceId: child.id, outputRange: [0, 1], remap: { kind: 'freeze', sourceTick: 0 } }],
      }));
    }

    const root = sequences.at(-1);

    expect(root).toBeDefined();
    if (root === undefined) return;

    expect(sample(root, 0, sequences)).toMatchObject({
      status: 'resolved',
      value: { values: [{ value: { type: 'number', value: 11 } }] },
    });
  });

  it('returns a sample for many contributing tracks without a variadic append overflow', () => {
    const trackCount = 130_000;
    const tracks: projectFormatV1.Track[] = Array.from({ length: trackCount }, (_, index) => ({
      id: id(`wide-track-${String(index)}`),
      name: `Track ${String(index)}`,
      target: TARGET,
      valueType: 'number',
      keyframes: [{ id: id(`wide-value-${String(index)}`), tick: 0, value: { type: 'number', value: index } }],
    }));
    const root: projectFormatV1.Sequence = {
      id: id('wide-sequence'),
      name: 'Wide',
      durationTicks: 0,
      loop: { kind: 'none' },
      tracks,
      markers: [],
      cues: [],
      childClips: [],
    };
    const result = sample(root, 0);

    expect(result.status).toBe('resolved');
    expect(result.status === 'resolved' && result.value.kind === 'sample' ? result.value.values.length : 0).toBe(trackCount);
  });
});
