import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { reverseSequenceV1 } from './project-v1-reverse-sequence';
import { createKeyframeV1, createSequenceV1, createTrackV1 } from './project-v1-sequence-mutations';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function idFactory(): () => projectFormatV1.Id {
  let next = 0;

  return () => id(`seq-gen-${String(next++)}`);
}

const OPACITY_TARGET: projectFormatV1.PropertyTarget = {
  entity: { projectId: id('project'), documentId: id('doc-1'), entityKind: 'element', entityId: id('headline') },
  pointer: '/appearance/opacity',
};

describe('reverseSequenceV1', () => {
  it('creates a separate valid sequence with fresh ids and reversed ticks and segments', () => {
    const createId = idFactory();
    const track = createTrackV1({
      id: createId(),
      name: 'Opacity',
      target: OPACITY_TARGET,
      valueType: 'number',
      keyframes: [
        createKeyframeV1({
          id: createId(),
          tick: 0,
          value: { type: 'number', value: 0 },
          interpolation: { kind: 'cubic-bezier', controlPoints: [0.42, 0, 1, 1] },
        }),
        createKeyframeV1({ id: createId(), tick: 40, value: { type: 'number', value: 0.7 }, interpolation: { kind: 'hold' } }),
        createKeyframeV1({ id: createId(), tick: 60, value: { type: 'number', value: 1 } }),
      ],
    });
    const original = createSequenceV1({ id: createId(), name: 'Intro', durationTicks: 60, tracks: [track] });
    const reversed = reverseSequenceV1({ sequence: original, name: 'Intro (exit)', createId });

    expect(reversed.id).not.toBe(original.id);
    expect(reversed.durationTicks).toBe(60);
    expect(reversed.tracks[0]?.id).not.toBe(track.id);

    const keyframes = reversed.tracks[0]?.keyframes ?? [];

    expect(keyframes.map(({ tick }) => tick)).toEqual([0, 20, 60]); // 60-60, 60-40, 60-0
    expect(keyframes.map(({ value }) => (value.type === 'number' ? value.value : null))).toEqual([1, 0.7, 0]);
    // Original segment interpolations were [bezier (0→40), hold (40→60)];
    // reversed segments carry them value-pair-wise: (1→0.7) gets hold, (0.7→0) gets bezier.
    expect(keyframes[0]?.interpolation).toEqual({ kind: 'hold' });
    expect(keyframes[1]?.interpolation).toEqual({ kind: 'cubic-bezier', controlPoints: [0.42, 0, 1, 1] });
    expect(keyframes[2]?.interpolation).toBeUndefined();
    expect(new Set(keyframes.map(({ id: keyframeId }) => keyframeId)).size).toBe(3);
    expect(projectFormatV1.trackSchema.safeParse(reversed.tracks[0]).success).toBe(true);
  });
});
