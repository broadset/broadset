import type { projectFormatV1 } from '@broadset/model';

import type { ScheduledSequenceActionV1 } from './state-evaluator';

export interface ActiveSequenceV1 {
  readonly sequence: projectFormatV1.Sequence;
  readonly tick: number;
  readonly canonicalOrder: number;
}

interface MutableControl {
  active: boolean;
  originTick: number;
  offsetTick: number;
  stoppedAtTick: number;
}

export function deriveActiveSequencesV1(options: {
  readonly sequences: readonly projectFormatV1.Sequence[];
  readonly pageSequenceId?: projectFormatV1.Id | undefined;
  readonly actions: readonly ScheduledSequenceActionV1[];
  readonly tick: number;
}): readonly ActiveSequenceV1[] {
  const controls = new Map<projectFormatV1.Id, MutableControl>();

  if (options.pageSequenceId !== undefined) controls.set(options.pageSequenceId, { active: true, originTick: 0, offsetTick: 0, stoppedAtTick: 0 });

  const actions = options.actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.startTick <= options.tick)
    .sort((left, right) => left.action.startTick - right.action.startTick || left.index - right.index);

  for (const { action: scheduled } of actions) {
    const action = scheduled.action;

    if (action.kind === 'send-event') continue;

    const control = controls.get(action.sequenceId) ?? { active: false, originTick: scheduled.startTick, offsetTick: 0, stoppedAtTick: 0 };

    if (action.kind === 'play-sequence') {
      if (action.behavior === 'restart') {
        control.offsetTick = 0;
        control.originTick = scheduled.startTick;
        control.active = true;
      } else if (!control.active) {
        control.offsetTick += Math.max(0, control.stoppedAtTick - control.originTick);
        control.originTick = scheduled.startTick;
        control.active = true;
      }
    } else if (action.kind === 'stop-sequence') {
      if (control.active) control.stoppedAtTick = scheduled.startTick;
      control.active = false;
    } else {
      control.offsetTick = action.tick;
      control.originTick = scheduled.startTick;
    }

    controls.set(action.sequenceId, control);
  }

  return options.sequences.flatMap((sequence, canonicalOrder) => {
    const control = controls.get(sequence.id);

    return control?.active === true
      ? [{ sequence, tick: control.offsetTick + Math.max(0, options.tick - control.originTick), canonicalOrder }]
      : [];
  });
}
