import { type ProjectEditorStore, selectActiveDocumentV1, selectActiveElementsV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import {
  AnimationStateSections,
  color,
  type EventOptionView,
  font,
  KeyframeAuthoringPanel,
  type KeyframeAuthoringSequence,
  type KeyframeInterpolationPreset,
  type LifecyclePhase,
  type LifecycleSlotView,
  type SequenceNameView,
  type SequenceOptionView,
  sp,
  StateMachineEditor,
  type StateMachineEditorView,
  type StateMachineView,
  type TransitionTriggerDraft,
} from '@broadset/ui';
import { Button, ListBox, Select } from '@heroui/react';
import type { JSX } from 'react';
import { useState } from 'react';

import { useEditorSelector } from './helpers';
import { interpolationToPreset, presetToInterpolation } from './keyframe-interpolation-presets';
import {
  actionsDraftToModel,
  actionToDraft,
  buildGuardOperands,
  expressionToGuard,
  guardDraftToExpression,
  type GuardOperandRef,
} from './v1-guard-action-translation';

interface V1SequenceSidebarProps {
  readonly editorStore: ProjectEditorStore;
}

const DEFAULT_DISPLAY_SECONDS = 3;
const OPACITY_POINTER = '/appearance/opacity';
const LIFECYCLE_PHASES: readonly LifecyclePhase[] = ['in', 'hold', 'update', 'out'];
const REVERSE_EXIT_SUFFIX = ' (exit)';
const EVENT_ID_LABEL_LENGTH = 8;
const INITIAL_TRANSITION_PRIORITY = 0;
const TRANSITION_PRIORITY_INCREMENT = 1;

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

/**
 * Injected into `StateMachineEditor` as `isValidDateTimeLiteral` so the (model-agnostic)
 * `TransitionGuardEditor` validation-gates a date-time clause's committed literal against the
 * REAL model schema instead of its own accept-everything default. Without this, a bad keystroke
 * on a date-time guard field (e.g. the "Kickoff" view-model field) would be accepted client-side,
 * then silently rejected at `guardDraftToExpression -> upsertTransition -> isValidProject` with no
 * user-visible feedback (see PR-F final review, FIX 1).
 */
function isValidUtcTimestampLiteral(value: string): boolean {
  return projectFormatV1.utcTimestampSchema.safeParse(value).success;
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

/**
 * Presentational, string-id-only editor views for every document state machine, host-sorted by
 * name. `refById` (from {@link buildGuardOperands}) resolves each transition's model guard into a
 * flat {@link expressionToGuard} draft (or `guardIsAdvanced: true` when it doesn't fit), and every
 * transition's `SequenceAction`s are rendered 1:1 via {@link actionToDraft}.
 */
function toStateMachineEditorViews(
  document: projectFormatV1.BroadsetDocumentV1,
  refById: ReadonlyMap<string, GuardOperandRef>,
): readonly StateMachineEditorView[] {
  return [...document.stateMachines]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((machine) => ({
      id: machine.id,
      name: machine.name,
      initialStateId: machine.initialStateId,
      states: machine.states.map((state) => ({ id: state.id, name: state.name })),
      transitions: machine.transitions.map((transition) => {
        const { guard, guardIsAdvanced } = expressionToGuard({ expression: transition.guard, refById });

        return {
          id: transition.id,
          sourceStateId: transition.sourceStateId,
          targetStateId: transition.targetStateId,
          trigger: transition.trigger,
          priority: transition.priority,
          actions: transition.actions.map(actionToDraft),
          guardIsAdvanced,
          // `exactOptionalPropertyTypes` forbids assigning `guard: undefined` to the optional
          // `StateMachineTransitionView.guard` field — omit the key entirely instead.
          ...(guard === undefined ? {} : { guard }),
        };
      }),
    }));
}

/** Collects the unique event-triggered transition event ids on one machine so they can be re-selected. */
function toEventOptions(machine: StateMachineEditorView): readonly EventOptionView[] {
  const eventIds = new Set<string>();

  for (const transition of machine.transitions) {
    if (transition.trigger.kind === 'event') eventIds.add(transition.trigger.eventId);
  }

  return [...eventIds].map((eventId) => ({ id: eventId, label: `Event ${eventId.slice(0, EVENT_ID_LABEL_LENGTH)}` }));
}

/**
 * Brands a presentational trigger draft's event id back into the model's `TransitionTrigger`.
 * Returns `null` (never throws) for an unparseable event id — the `StateMachineEditor` should
 * never build one now that it stops offering the "Event" kind while `eventOptions` is empty, but
 * this stays a hard boundary check: a UI event handler must fail soft on user input, not `.parse`
 * and crash the app on an empty/invalid id.
 */
function toModelTransitionTrigger(draft: TransitionTriggerDraft): projectFormatV1.TransitionTrigger | null {
  if (draft.kind !== 'event') return draft;

  const eventId = projectFormatV1.idSchema.safeParse(draft.eventId);

  return eventId.success ? { kind: 'event', eventId: eventId.data } : null;
}

function transitionTriggersMatch(a: projectFormatV1.TransitionTrigger, b: projectFormatV1.TransitionTrigger): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'event' && b.kind === 'event') return a.eventId === b.eventId;
  if (a.kind === 'lifecycle' && b.kind === 'lifecycle') return a.phase === b.phase;
  if (a.kind === 'after' && b.kind === 'after') return a.ticks === b.ticks;

  return false;
}

/**
 * A new transition must carry a priority unique among transitions sharing the same source state
 * and an equivalent trigger (semantic validation rejects a duplicate [source, trigger, priority]
 * tuple). Picking one past the current maximum for that (source, trigger) group keeps the add
 * always valid without asking the author to manage priorities by hand.
 */
function nextTransitionPriority(
  machine: projectFormatV1.StateMachine,
  sourceStateId: projectFormatV1.Id,
  trigger: projectFormatV1.TransitionTrigger,
): number {
  const priorities = machine.transitions
    .filter(
      (transition) =>
        transition.sourceStateId === sourceStateId && transitionTriggersMatch(transition.trigger, trigger),
    )
    .map((transition) => transition.priority);

  if (priorities.length === 0) return INITIAL_TRANSITION_PRIORITY;

  return Math.max(...priorities) + TRANSITION_PRIORITY_INCREMENT;
}

interface ReverseExitWireControlProps {
  readonly machineName: string;
  readonly sequenceNames: readonly SequenceNameView[];
  readonly onWire: (sequenceId: string) => void;
}

/**
 * Separate from the standalone lifecycle-OUT "create reverse exit" generator: this control both
 * generates the reversed sequence AND assigns its id to the modifier's deactivation transition in
 * one step (spec timeline.md:229-235), rather than leaving the generated sequence unassigned.
 */
function ReverseExitWireControl({ machineName, sequenceNames, onWire }: ReverseExitWireControlProps): JSX.Element {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>(sequenceNames[0]?.id ?? '');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02') }}>
      <span style={{ color: color('muted'), fontSize: font('label') }}>Reverse exit into {machineName}</span>
      <Select
        aria-label={`Reverse exit source sequence for ${machineName}`}
        isDisabled={sequenceNames.length === 0}
        value={selectedSequenceId}
        onChange={(key) => {
          if (key !== null) setSelectedSequenceId(String(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {sequenceNames.map((sequence) => (
              <ListBox.Item id={sequence.id} key={sequence.id} textValue={sequence.name}>
                {sequence.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
      <Button
        aria-label={`Wire reverse exit into ${machineName}`}
        isDisabled={selectedSequenceId === ''}
        size="sm"
        variant="secondary"
        onPress={() => {
          if (selectedSequenceId !== '') onWire(selectedSequenceId);
        }}
      >
        Wire reverse exit
      </Button>
    </div>
  );
}

export function V1SequenceSidebar({ editorStore }: V1SequenceSidebarProps): JSX.Element {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);

  if (document === undefined) {
    return <div style={{ padding: 12 }}>No active document.</div>;
  }

  const selectedElement = selectActiveElementsV1(state)[0];
  const ticksPerSecond = document.timebase?.ticksPerSecond ?? 1000;
  const { options: guardOperands, refById } = buildGuardOperands({ document, project: state.project });
  const sequenceOptions: readonly SequenceOptionView[] = document.sequences.map((sequence) => ({
    id: sequence.id,
    name: sequence.name,
    durationTicks: sequence.durationTicks,
  }));

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
      <section
        aria-label="State machine editors"
        style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04') }}
      >
        {toStateMachineEditorViews(document, refById).map((machineView) => {
          const machineId = projectFormatV1.idSchema.parse(machineView.id);

          return (
            <div key={machineView.id} style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
              <StateMachineEditor
                eventOptions={toEventOptions(machineView)}
                guardOperands={guardOperands}
                isValidDateTimeLiteral={isValidUtcTimestampLiteral}
                machine={machineView}
                onAddState={(name) => {
                  state.upsertState(machineId, {
                    id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
                    name,
                    values: [],
                    entryActions: [],
                    exitActions: [],
                  });
                }}
                onAddTransition={(draft) => {
                  const machine = document.stateMachines.find(({ id }) => id === machineId);

                  if (machine === undefined) return;

                  const trigger = toModelTransitionTrigger(draft.trigger);

                  if (trigger === null) return;

                  const sourceStateId = projectFormatV1.idSchema.parse(draft.sourceStateId);

                  state.upsertTransition(machineId, {
                    id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
                    sourceStateId,
                    targetStateId: projectFormatV1.idSchema.parse(draft.targetStateId),
                    trigger,
                    priority: nextTransitionPriority(machine, sourceStateId, trigger),
                    actions: [],
                  });
                }}
                onRemoveState={(stateId) => {
                  state.removeState(machineId, projectFormatV1.idSchema.parse(stateId));
                }}
                onRemoveTransition={(transitionId) => {
                  state.removeTransition(machineId, projectFormatV1.idSchema.parse(transitionId));
                }}
                onRenameState={(stateId, name) => {
                  const machine = document.stateMachines.find(({ id }) => id === machineId);
                  const found = machine?.states.find(({ id }) => id === stateId);

                  if (found === undefined) return;

                  state.upsertState(machineId, { ...found, name });
                }}
                onSetInitialState={(stateId) => {
                  const machine = document.stateMachines.find(({ id }) => id === machineId);

                  if (machine === undefined) return;

                  state.upsertStateMachine({ ...machine, initialStateId: projectFormatV1.idSchema.parse(stateId) });
                }}
                onUpdateTransition={(transitionId, patch) => {
                  const machine = document.stateMachines.find(({ id }) => id === machineId);
                  const found = machine?.transitions.find(({ id }) => id === transitionId);

                  if (found === undefined) return;

                  const trigger = patch.trigger === undefined ? found.trigger : toModelTransitionTrigger(patch.trigger);

                  if (trigger === null) return;

                  state.upsertTransition(machineId, {
                    ...found,
                    ...(patch.targetStateId === undefined ?
                      {}
                    : { targetStateId: projectFormatV1.idSchema.parse(patch.targetStateId) }),
                    trigger,
                    ...(patch.priority === undefined ? {} : { priority: patch.priority }),
                    ...(patch.guard === undefined ?
                      {}
                    : { guard: guardDraftToExpression({ draft: patch.guard, refById }) }),
                    ...(patch.actions === undefined ? {} : { actions: actionsDraftToModel(patch.actions) }),
                  });
                }}
                sequenceOptions={sequenceOptions}
              />
              <ReverseExitWireControl
                machineName={machineView.name}
                sequenceNames={toSequenceNameViews(document)}
                onWire={(sequenceId) => {
                  const parsedSequenceId = projectFormatV1.idSchema.parse(sequenceId);

                  state.setModifierReverseExit({
                    stateMachineId: machineId,
                    sourceSequenceId: parsedSequenceId,
                    name: resolveSequenceName(document, parsedSequenceId) + REVERSE_EXIT_SUFFIX,
                  });
                }}
              />
            </div>
          );
        })}
      </section>
    </aside>
  );
}
