import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import {
  addKeyframeInProject,
  addSequenceInProject,
  createKeyframeV1,
  createSequenceV1,
  createTrackInProject,
  createTrackV1,
  removeKeyframeInProject,
  removeSequenceInProject,
  updateKeyframeInProject,
} from '../project-v1-sequence-mutations';
import type { ProjectEditorState } from './project-store';

type Id = projectFormatV1.Id;

export interface ProjectEditorSequenceState {
  readonly addSequence: (options: { readonly name: string; readonly durationTicks: number }) => Id | null;
  readonly removeSequence: (sequenceId: Id) => boolean;
  readonly createTrack: (options: {
    readonly sequenceId: Id;
    readonly name: string;
    readonly target: projectFormatV1.PropertyTarget;
    readonly valueType: projectFormatV1.ValueType;
    readonly tick: number;
    readonly value: projectFormatV1.TypedValue;
  }) => boolean;
  readonly addKeyframe: (options: {
    readonly sequenceId: Id;
    readonly trackId: Id;
    readonly tick: number;
    readonly value: projectFormatV1.TypedValue;
    readonly interpolation?: projectFormatV1.Interpolation | undefined;
  }) => boolean;
  readonly updateKeyframe: (options: {
    readonly sequenceId: Id;
    readonly trackId: Id;
    readonly keyframeId: Id;
    readonly value?: projectFormatV1.TypedValue | undefined;
    readonly interpolation?: projectFormatV1.Interpolation | undefined;
  }) => boolean;
  readonly removeKeyframe: (options: { readonly sequenceId: Id; readonly trackId: Id; readonly keyframeId: Id }) => boolean;
}

/** Author v1 sequences, tracks, and keyframes through the invariant-safe transform kernel. */
export function createProjectEditorSequenceActions(
  store: Pick<StoreApi<ProjectEditorState>, 'getState' | 'setState'>,
  createId: () => Id,
): ProjectEditorSequenceState {
  const commit = (next: (project: projectFormatV1.BroadsetProjectV1, documentId: Id) => projectFormatV1.BroadsetProjectV1): boolean => {
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
    addSequence(options): Id | null {
      const sequenceId = createId();
      const changed = commit((project, documentId) =>
        addSequenceInProject({
          project,
          documentId,
          sequence: createSequenceV1({ id: sequenceId, name: options.name, durationTicks: options.durationTicks }),
        }),
      );

      return changed ? sequenceId : null;
    },
    removeSequence(sequenceId): boolean {
      return commit((project, documentId) => removeSequenceInProject({ project, documentId, sequenceId }));
    },
    createTrack(options): boolean {
      const track = createTrackV1({
        id: createId(),
        name: options.name,
        target: options.target,
        valueType: options.valueType,
        keyframes: [createKeyframeV1({ id: createId(), tick: options.tick, value: options.value })],
      });

      return commit((project, documentId) =>
        createTrackInProject({ project, documentId, sequenceId: options.sequenceId, track }),
      );
    },
    addKeyframe(options): boolean {
      const keyframe = createKeyframeV1({
        id: createId(),
        tick: options.tick,
        value: options.value,
        interpolation: options.interpolation,
      });

      return commit((project, documentId) =>
        addKeyframeInProject({ project, documentId, sequenceId: options.sequenceId, trackId: options.trackId, keyframe }),
      );
    },
    updateKeyframe(options): boolean {
      return commit((project, documentId) =>
        updateKeyframeInProject({
          project,
          documentId,
          sequenceId: options.sequenceId,
          trackId: options.trackId,
          keyframeId: options.keyframeId,
          update: { value: options.value, interpolation: options.interpolation },
        }),
      );
    },
    removeKeyframe(options): boolean {
      return commit((project, documentId) =>
        removeKeyframeInProject({
          project,
          documentId,
          sequenceId: options.sequenceId,
          trackId: options.trackId,
          keyframeId: options.keyframeId,
        }),
      );
    },
  };
}
