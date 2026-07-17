import { type ProjectEditorStore, selectActiveDocumentV1, selectActiveElementsV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { KeyframeAuthoringPanel, type KeyframeAuthoringSequence, type KeyframeInterpolationPreset } from '@broadset/ui';
import type { JSX } from 'react';

import { useEditorSelector } from './helpers';
import { interpolationToPreset, presetToInterpolation } from './keyframe-interpolation-presets';

interface V1SequenceSidebarProps {
  readonly editorStore: ProjectEditorStore;
}

const DEFAULT_DISPLAY_SECONDS = 3;
const OPACITY_POINTER = '/appearance/opacity';

function toPanelSequences(document: projectFormatV1.BroadsetDocumentV1): readonly KeyframeAuthoringSequence[] {
  return document.sequences.map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    durationTicks: sequence.durationTicks,
    tracks: sequence.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      keyframes: track.keyframes.map((keyframe) => ({
        id: keyframe.id,
        tick: keyframe.tick,
        numberValue: keyframe.value.type === 'number' ? keyframe.value.value : null,
        interpolation: interpolationToPreset(keyframe.interpolation),
      })),
    })),
  }));
}

export function V1SequenceSidebar({ editorStore }: V1SequenceSidebarProps): JSX.Element {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);

  if (document === undefined) {
    return <div style={{ padding: 12 }}>No active document.</div>;
  }

  const selectedElement = selectActiveElementsV1(state)[0];
  const ticksPerSecond = document.timebase?.ticksPerSecond ?? 1000;

  const trackById = (sequenceId: string, trackId: string): projectFormatV1.Track | undefined =>
    document.sequences.find(({ id }) => id === sequenceId)?.tracks.find(({ id }) => id === trackId);

  const setPageSequence = (sequenceId: projectFormatV1.Id): void => {
    state.setPlaybackSequence(sequenceId);
    state.updateActiveDocument((current) => ({
      ...current,
      pages: current.pages.map((page) => (page.id === state.activePageId ? { ...page, sequenceId } : page)),
    }));
  };

  return (
    <KeyframeAuthoringPanel
      canAddTrack={selectedElement !== undefined}
      currentTick={state.playbackTick}
      selectedSequenceId={state.playbackSequenceId}
      sequences={toPanelSequences(document)}
      onAddKeyframe={(sequenceId, trackId) => {
        const track = trackById(sequenceId, trackId);

        if (track === undefined) return;

        const seededElement = document.elements.find(({ id }) => id === track.target.entity.entityId);
        const value: projectFormatV1.TypedValue = { type: 'number', value: seededElement?.appearance.opacity ?? 1 };

        state.addKeyframe({
          sequenceId: projectFormatV1.idSchema.parse(sequenceId),
          trackId: projectFormatV1.idSchema.parse(trackId),
          tick: state.playbackTick,
          value,
        });
      }}
      onAddOpacityTrack={(sequenceId) => {
        if (selectedElement === undefined) return;

        state.createTrack({
          sequenceId: projectFormatV1.idSchema.parse(sequenceId),
          name: 'Opacity',
          target: {
            entity: {
              projectId: state.project.id,
              documentId: document.id,
              entityKind: 'element',
              entityId: selectedElement.id,
            },
            pointer: OPACITY_POINTER,
          },
          valueType: 'number',
          tick: state.playbackTick,
          value: { type: 'number', value: selectedElement.appearance.opacity },
        });
      }}
      onAddSequence={() => {
        const sequenceId = state.addSequence({
          name: `Sequence ${String(document.sequences.length + 1)}`,
          durationTicks: DEFAULT_DISPLAY_SECONDS * ticksPerSecond,
        });

        if (sequenceId !== null) setPageSequence(sequenceId);
      }}
      onRemoveKeyframe={(sequenceId, trackId, keyframeId) => {
        state.removeKeyframe({
          sequenceId: projectFormatV1.idSchema.parse(sequenceId),
          trackId: projectFormatV1.idSchema.parse(trackId),
          keyframeId: projectFormatV1.idSchema.parse(keyframeId),
        });
      }}
      onRemoveSequence={(sequenceId) => {
        state.removeSequence(projectFormatV1.idSchema.parse(sequenceId));
      }}
      onSelectSequence={(sequenceId) => {
        const parsed = projectFormatV1.idSchema.safeParse(sequenceId);

        if (parsed.success) setPageSequence(parsed.data);
      }}
      onSetKeyframeInterpolation={(sequenceId, trackId, keyframeId, preset: KeyframeInterpolationPreset) => {
        state.updateKeyframe({
          sequenceId: projectFormatV1.idSchema.parse(sequenceId),
          trackId: projectFormatV1.idSchema.parse(trackId),
          keyframeId: projectFormatV1.idSchema.parse(keyframeId),
          interpolation: presetToInterpolation(preset),
        });
      }}
      onUpdateKeyframeValue={(sequenceId, trackId, keyframeId, value) => {
        state.updateKeyframe({
          sequenceId: projectFormatV1.idSchema.parse(sequenceId),
          trackId: projectFormatV1.idSchema.parse(trackId),
          keyframeId: projectFormatV1.idSchema.parse(keyframeId),
          value: { type: 'number', value },
        });
      }}
    />
  );
}
