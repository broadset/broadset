/**
 * Presentational view/callback contract for {@link StateMachineEditor}. Kept in its own module so
 * the demo layer (PR-E T3) can import these types verbatim without pulling in component internals.
 */

import type { LifecyclePhase } from './animation-state-sections';

export type TransitionTriggerDraft =
  | { readonly kind: 'event'; readonly eventId: string }
  | { readonly kind: 'lifecycle'; readonly phase: LifecyclePhase }
  | { readonly kind: 'after'; readonly ticks: number };

/**
 * A presentational, string-id-only draft of a `SequenceAction` (see `project/spec/model/format-reference.md`).
 * `send-event` is included only so an existing transition action round-trips losslessly through the
 * editor — it is never offered in the add-action menu and is rendered read-only, because it is
 * runtime-inert in the shipped playback pipeline.
 */
export type SequenceActionDraft =
  | { readonly kind: 'play-sequence'; readonly sequenceId: string; readonly behavior: 'restart' | 'resume' }
  | { readonly kind: 'stop-sequence'; readonly sequenceId: string }
  | { readonly kind: 'seek-sequence'; readonly sequenceId: string; readonly tick: number }
  | { readonly kind: 'send-event'; readonly stateMachineId: string; readonly eventId: string };

export interface StateOptionView {
  readonly id: string;
  readonly name: string;
}

export interface SequenceOptionView {
  readonly id: string;
  readonly name: string;
  /** Seek-sequence tick drafts are clamped to this value — never emitted above it. */
  readonly durationTicks: number;
}

export interface StateMachineTransitionView {
  readonly id: string;
  readonly sourceStateId: string;
  readonly targetStateId: string;
  readonly trigger: TransitionTriggerDraft;
  readonly priority: number;
  /** Optional so pre-PR-F callers keep compiling; treat an absent value as `[]` at the render boundary. */
  readonly actions?: readonly SequenceActionDraft[];
}

export interface StateMachineEditorView {
  readonly id: string;
  readonly name: string;
  readonly initialStateId: string;
  readonly states: readonly StateOptionView[];
  readonly transitions: readonly StateMachineTransitionView[];
}

export interface EventOptionView {
  readonly id: string;
  readonly label: string;
}

export interface NewTransitionDraft {
  readonly sourceStateId: string;
  readonly targetStateId: string;
  readonly trigger: TransitionTriggerDraft;
}

export interface TransitionUpdatePatch {
  readonly targetStateId?: string;
  readonly trigger?: TransitionTriggerDraft;
  readonly priority?: number;
  readonly actions?: readonly SequenceActionDraft[];
}

export interface StateMachineEditorProps {
  readonly machine: StateMachineEditorView;
  readonly eventOptions: readonly EventOptionView[];
  /** Optional so pre-PR-F callers keep compiling; treat an absent value as `[]` at the render boundary. */
  readonly sequenceOptions?: readonly SequenceOptionView[];
  readonly onAddState: (name: string) => void;
  readonly onRenameState: (stateId: string, name: string) => void;
  readonly onRemoveState: (stateId: string) => void;
  readonly onSetInitialState: (stateId: string) => void;
  readonly onAddTransition: (draft: NewTransitionDraft) => void;
  readonly onUpdateTransition: (transitionId: string, patch: TransitionUpdatePatch) => void;
  readonly onRemoveTransition: (transitionId: string) => void;
}
