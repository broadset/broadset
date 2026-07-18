/**
 * Presentational view/callback contract for {@link StateMachineEditor}. Kept in its own module so
 * the demo layer (PR-E T3) can import these types verbatim without pulling in component internals.
 */

import type { LifecyclePhase } from './animation-state-sections';

export type TransitionTriggerDraft =
  | { readonly kind: 'event'; readonly eventId: string }
  | { readonly kind: 'lifecycle'; readonly phase: LifecyclePhase }
  | { readonly kind: 'after'; readonly ticks: number };

export interface StateOptionView {
  readonly id: string;
  readonly name: string;
}

export interface StateMachineTransitionView {
  readonly id: string;
  readonly sourceStateId: string;
  readonly targetStateId: string;
  readonly trigger: TransitionTriggerDraft;
  readonly priority: number;
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
}

export interface StateMachineEditorProps {
  readonly machine: StateMachineEditorView;
  readonly eventOptions: readonly EventOptionView[];
  readonly onAddState: (name: string) => void;
  readonly onRenameState: (stateId: string, name: string) => void;
  readonly onRemoveState: (stateId: string) => void;
  readonly onSetInitialState: (stateId: string) => void;
  readonly onAddTransition: (draft: NewTransitionDraft) => void;
  readonly onUpdateTransition: (transitionId: string, patch: TransitionUpdatePatch) => void;
  readonly onRemoveTransition: (transitionId: string) => void;
}
