import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import { type LifecyclePhase, setLifecyclePhaseActionsInProject } from '../project-v1-lifecycle-mutations';
import { reverseSequenceV1 } from '../project-v1-reverse-sequence';
import { addSequenceInProject } from '../project-v1-sequence-mutations';
import {
  createModifierStateMachine,
  removeStateMachineInProject,
  upsertStateMachineInProject,
} from '../project-v1-state-machine-mutations';
import type { ProjectEditorState } from './project-store';

export interface ProjectEditorAnimationStateActions {
  readonly setLifecyclePhaseActions: (
    phase: LifecyclePhase,
    actions: readonly projectFormatV1.SequenceAction[],
  ) => boolean;
  readonly upsertStateMachine: (stateMachine: projectFormatV1.StateMachine) => boolean;
  readonly removeStateMachine: (stateMachineId: projectFormatV1.Id) => boolean;
  readonly addModifierStateMachine: (options: {
    readonly name: string;
    readonly activeValues: readonly projectFormatV1.StateValue[];
  }) => projectFormatV1.Id | null;
  readonly createReverseExitSequence: (sequenceId: projectFormatV1.Id, name: string) => projectFormatV1.Id | null;
}

/** Author v1 lifecycle phase actions, state machines, and reverse-exit sequences through the invariant-safe transform kernel. */
export function createProjectEditorAnimationStateActions(
  store: Pick<StoreApi<ProjectEditorState>, 'getState' | 'setState'>,
  createId: () => projectFormatV1.Id,
): ProjectEditorAnimationStateActions {
  const commit = (
    next: (project: projectFormatV1.BroadsetProjectV1, documentId: projectFormatV1.Id) => projectFormatV1.BroadsetProjectV1,
  ): boolean => {
    let changed = false;

    store.setState((state) => {
      const project = next(state.project, state.activeDocumentId);

      if (project === state.project) return {};
      changed = true;

      return { project };
    });

    return changed;
  };

  return {
    setLifecyclePhaseActions(phase, actions): boolean {
      return commit((project, documentId) =>
        setLifecyclePhaseActionsInProject({ project, documentId, phase, actions, createId }),
      );
    },
    upsertStateMachine(stateMachine): boolean {
      return commit((project, documentId) => upsertStateMachineInProject({ project, documentId, stateMachine }));
    },
    removeStateMachine(stateMachineId): boolean {
      return commit((project, documentId) => removeStateMachineInProject({ project, documentId, stateMachineId }));
    },
    addModifierStateMachine(options): projectFormatV1.Id | null {
      const { stateMachine } = createModifierStateMachine({
        name: options.name,
        createId,
        activeValues: options.activeValues,
      });
      const changed = commit((project, documentId) =>
        upsertStateMachineInProject({ project, documentId, stateMachine }),
      );

      return changed ? stateMachine.id : null;
    },
    createReverseExitSequence(sequenceId, name): projectFormatV1.Id | null {
      const state = store.getState();
      const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);
      const source = document?.sequences.find(({ id }) => id === sequenceId);

      if (source === undefined) return null;

      const reversed = reverseSequenceV1({ sequence: source, name, createId });
      const changed = commit((project, documentId) => addSequenceInProject({ project, documentId, sequence: reversed }));

      return changed ? reversed.id : null;
    },
  };
}
