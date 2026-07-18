import { type ProjectEditorStore, selectActiveDocumentV1, selectActiveElementsV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import {
  AnimationStateSections,
  KeyframeAuthoringPanel,
  type KeyframeAuthoringSequence,
  type KeyframeInterpolationPreset,
  type LifecyclePhase,
  type LifecycleSlotView,
  type SequenceNameView,
  type StateMachineView,
} from '@broadset/ui';
import type { JSX } from 'react';

import { useEditorSelector } from './helpers';
import { interpolationToPreset, presetToInterpolation } from './keyframe-interpolation-presets';

interface V1SequenceSidebarProps {
  readonly editorStore: ProjectEditorStore;
}

const DEFAULT_DISPLAY_SECONDS = 3;
const OPACITY_POINTER = '/appearance/opacity';
const LIFECYCLE_PHASES: readonly LifecyclePhase[] = ['in', 'hold', 'update', 'out'];
const REVERSE_EXIT_SUFFIX = ' (exit)';

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

function resolveSequenceName(document: projectFormatV1.BroadsetDocumentV1, sequenceId: projectFormatV1.Id): string {
  return document.sequences.find(({ id }) => id === sequenceId)?.name ?? sequenceId;
}

function resolveStateMachineName(
  document: projectFormatV1.BroadsetDocumentV1,
  stateMachineId: projectFormatV1.Id,
): string {
  return document.stateMachines.find(({ id }) => id === stateMachineId)?.name ?? stateMachineId;
}

/** Renders a lifecycle `SequenceAction` as a human-readable label, resolving ids to display names. */
function describeSequenceAction(
  document: projectFormatV1.BroadsetDocumentV1,
  action: projectFormatV1.SequenceAction,
): string {
  switch (action.kind) {
    case 'play-sequence':
      return `Play ${resolveSequenceName(document, action.sequenceId)} (${action.behavior})`;
    case 'stop-sequence':
      return `Stop ${resolveSequenceName(document, action.sequenceId)}`;
    case 'seek-sequence':
      return `Seek ${resolveSequenceName(document, action.sequenceId)} @ ${String(action.tick)}`;
    case 'send-event':
      return `Send event to ${resolveStateMachineName(document, action.stateMachineId)}`;
  }
}

function toLifecycleSlots(document: projectFormatV1.BroadsetDocumentV1): readonly LifecycleSlotView[] {
  const lifecycle = document.lifecycle;

  return LIFECYCLE_PHASES.map((phase) => ({
    phase,
    actionLabels: (lifecycle?.[phase] ?? []).map((action) => describeSequenceAction(document, action)),
  }));
}

function toStateMachineViews(document: projectFormatV1.BroadsetDocumentV1): readonly StateMachineView[] {
  return [...document.stateMachines]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((machine) => ({
      id: machine.id,
      name: machine.name,
      stateNames: machine.states.map(({ name }) => name),
    }));
}

function toSequenceNameViews(document: projectFormatV1.BroadsetDocumentV1): readonly SequenceNameView[] {
  return document.sequences.map((sequence) => ({ id: sequence.id, name: sequence.name }));
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
    <aside aria-label="Sequence editor">
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
        onSetDuration={(sequenceId, durationTicks) => {
          state.setSequenceDuration(projectFormatV1.idSchema.parse(sequenceId), durationTicks);
        }}
        onSetKeyframeInterpolation={(sequenceId, trackId, keyframeId, preset: KeyframeInterpolationPreset) => {
          state.updateKeyframe({
            sequenceId: projectFormatV1.idSchema.parse(sequenceId),
            trackId: projectFormatV1.idSchema.parse(trackId),
            keyframeId: projectFormatV1.idSchema.parse(keyframeId),
            interpolation: presetToInterpolation(preset),
          });
        }}
        onUpdateKeyframeTick={(sequenceId, trackId, keyframeId, tick) => {
          state.updateKeyframe({
            sequenceId: projectFormatV1.idSchema.parse(sequenceId),
            trackId: projectFormatV1.idSchema.parse(trackId),
            keyframeId: projectFormatV1.idSchema.parse(keyframeId),
            tick,
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
      <AnimationStateSections
        lifecycleSlots={toLifecycleSlots(document)}
        sequenceNames={toSequenceNameViews(document)}
        stateMachines={toStateMachineViews(document)}
        onAddModifier={(name) => {
          state.addModifierStateMachine({ name, activeValues: [] });
        }}
        onAssignLifecycleSequence={(phase, sequenceId) => {
          state.setLifecyclePhaseActions(phase, [
            { kind: 'play-sequence', sequenceId: projectFormatV1.idSchema.parse(sequenceId), behavior: 'restart' },
          ]);
        }}
        onClearLifecyclePhase={(phase) => {
          state.setLifecyclePhaseActions(phase, []);
        }}
        onCreateReverseExit={(sequenceId) => {
          const parsedSequenceId = projectFormatV1.idSchema.parse(sequenceId);

          state.createReverseExitSequence(
            parsedSequenceId,
            resolveSequenceName(document, parsedSequenceId) + REVERSE_EXIT_SUFFIX,
          );
        }}
        onRemoveStateMachine={(stateMachineId) => {
          state.removeStateMachine(projectFormatV1.idSchema.parse(stateMachineId));
        }}
      />
    </aside>
  );
}
