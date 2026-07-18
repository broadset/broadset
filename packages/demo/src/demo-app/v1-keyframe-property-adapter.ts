import type { ProjectEditorStore } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import type { KeyframePropertyAdapter, KeyframePropertyTargetRef } from '@broadset/ui';

interface ResolvedKeyframeTarget {
  readonly track: projectFormatV1.Track;
  readonly keyframe: projectFormatV1.Keyframe;
}

function resolveKeyframeTarget(options: {
  readonly store: ProjectEditorStore;
  readonly sequenceId: projectFormatV1.Id;
  readonly trackId: projectFormatV1.Id;
  readonly keyframeId: projectFormatV1.Id;
}): ResolvedKeyframeTarget | null {
  const state = options.store.getState();
  const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);
  const sequence = document?.sequences.find(({ id }) => id === options.sequenceId);
  const track = sequence?.tracks.find(({ id }) => id === options.trackId);
  const keyframe = track?.keyframes.find(({ id }) => id === options.keyframeId);

  return track === undefined || keyframe === undefined ? null : { track, keyframe };
}

/**
 * panels.md "Property Editing Context for Keyframes": builds the properties-sidebar adapter for
 * the timeline's selected keyframe, or null when the ids no longer resolve (e.g. the keyframe or
 * its track was removed after selection). All reads re-resolve from the live store so the
 * adapter never holds a stale snapshot across renders.
 */
export function createKeyframePropertyAdapter(options: {
  readonly store: ProjectEditorStore;
  readonly sequenceId: projectFormatV1.Id;
  readonly trackId: projectFormatV1.Id;
  readonly keyframeId: projectFormatV1.Id;
}): KeyframePropertyAdapter | null {
  const initial = resolveKeyframeTarget(options);

  if (initial === null) return null;

  return {
    target: { entityId: initial.track.target.entity.entityId, pointer: initial.track.target.pointer },
    getValue: (): number | null => {
      const current = resolveKeyframeTarget(options);

      return current?.keyframe.value.type === 'number' ? current.keyframe.value.value : null;
    },
    updateValue: (value: number): boolean =>
      options.store.getState().updateKeyframe({
        sequenceId: options.sequenceId,
        trackId: options.trackId,
        keyframeId: options.keyframeId,
        value: { type: 'number', value },
      }),
    createTrack: (target: KeyframePropertyTargetRef, tick: number, initialValue: number): boolean => {
      const state = options.store.getState();
      const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);

      if (document === undefined) return false;

      return state.createTrack({
        sequenceId: options.sequenceId,
        name: target.pointer.split('/').pop() ?? target.pointer,
        target: {
          entity: {
            projectId: state.project.id,
            documentId: document.id,
            entityKind: 'element',
            entityId: projectFormatV1.idSchema.parse(target.entityId),
          },
          pointer: target.pointer,
        },
        valueType: 'number',
        tick,
        value: { type: 'number', value: initialValue },
      });
    },
    removeKeyframe: (trackId: string, keyframeId: string): boolean =>
      options.store.getState().removeKeyframe({
        sequenceId: options.sequenceId,
        trackId: projectFormatV1.idSchema.parse(trackId),
        keyframeId: projectFormatV1.idSchema.parse(keyframeId),
      }),
  };
}
