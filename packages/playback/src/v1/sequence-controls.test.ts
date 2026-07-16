import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as model } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { deriveActiveSequencesV1 } from './sequence-controls';
import type { ScheduledSequenceActionV1 } from './state-evaluator';

const id = (value: string): projectFormatV1.Id => model.idSchema.parse(value);
const SEQUENCE_ID = id('sequence');
const sequence: projectFormatV1.Sequence = { id: SEQUENCE_ID, name: 'Sequence', durationTicks: 100, loop: { kind: 'none' }, tracks: [], markers: [], cues: [], childClips: [] };

function scheduled(startTick: number, action: projectFormatV1.SequenceAction): ScheduledSequenceActionV1 {
  return { stateMachineId: id('machine'), startTick, actionIndex: 0, action };
}

describe('deriveActiveSequencesV1', () => {
  it('folds restart, seek, stop, and later restart without mutation', () => {
    const actions = [
      scheduled(2, { kind: 'play-sequence', sequenceId: SEQUENCE_ID, behavior: 'restart' }),
      scheduled(5, { kind: 'seek-sequence', sequenceId: SEQUENCE_ID, tick: 20 }),
      scheduled(8, { kind: 'stop-sequence', sequenceId: SEQUENCE_ID }),
      scheduled(10, { kind: 'play-sequence', sequenceId: SEQUENCE_ID, behavior: 'restart' }),
    ] as const;
    const before = structuredClone(actions);

    expect(deriveActiveSequencesV1({ sequences: [sequence], actions, tick: 7 })).toMatchObject([{ tick: 22 }]);
    expect(deriveActiveSequencesV1({ sequences: [sequence], actions, tick: 9 })).toEqual([]);
    expect(deriveActiveSequencesV1({ sequences: [sequence], actions, tick: 12 })).toMatchObject([{ tick: 2 }]);
    expect(actions).toEqual(before);
  });

  it('starts the page sequence at tick zero', () => {
    expect(deriveActiveSequencesV1({ sequences: [sequence], pageSequenceId: SEQUENCE_ID, actions: [], tick: 7 })).toMatchObject([{ tick: 7, canonicalOrder: 0 }]);
  });

  it('does not restart an already-active sequence when resume is requested', () => {
    const actions = [scheduled(5, { kind: 'play-sequence', sequenceId: SEQUENCE_ID, behavior: 'resume' })];

    expect(deriveActiveSequencesV1({ sequences: [sequence], pageSequenceId: SEQUENCE_ID, actions, tick: 7 })).toMatchObject([{ tick: 7 }]);
  });
});
