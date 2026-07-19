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
 * All three kinds are fully editable and addable in `TransitionActionsEditor`.
 */
export type SequenceActionDraft =
  | { readonly kind: 'play-sequence'; readonly sequenceId: string; readonly behavior: 'restart' | 'resume' }
  | { readonly kind: 'stop-sequence'; readonly sequenceId: string }
  | { readonly kind: 'seek-sequence'; readonly sequenceId: string; readonly tick: number };

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

/* ---- Guard predicate builder ---- */

export type GuardValueType = 'boolean' | 'integer' | 'number' | 'string' | 'date-time';
export type GuardOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';

export interface GuardOperandOption {
  readonly id: string;
  readonly label: string;
  readonly valueType: GuardValueType;
  /** Present for enum-schema string fields (their literal editor becomes a Select). */
  readonly enumValues?: readonly string[];
}

export interface GuardLiteralDraft {
  readonly valueType: GuardValueType;
  readonly value: string | number | boolean;
}

export interface GuardClauseDraft {
  /** UI-minted local clause id (stable within an editing session); not a branded model id. */
  readonly id: string;
  /** References a {@link GuardOperandOption.id}. */
  readonly operandId: string;
  readonly operator: GuardOperator;
  readonly literal: GuardLiteralDraft;
}

export interface GuardDraft {
  readonly connective: 'all' | 'any';
  /** Empty clauses => no guard (model guard undefined). */
  readonly clauses: readonly GuardClauseDraft[];
}

export interface StateMachineTransitionView {
  readonly id: string;
  readonly sourceStateId: string;
  readonly targetStateId: string;
  readonly trigger: TransitionTriggerDraft;
  readonly priority: number;
  /** Optional so pre-PR-F callers keep compiling; treat an absent value as `[]` at the render boundary. */
  readonly actions?: readonly SequenceActionDraft[];
  /** Present when the model guard fits the flat builder shape. */
  readonly guard?: GuardDraft;
  /** True when a model guard exists but is NOT flat-representable; shown read-only and preserved. */
  readonly guardIsAdvanced?: boolean;
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
  /** Present => set/replace/clear (empty clauses => clear); absent => no change. */
  readonly guard?: GuardDraft;
}

export interface StateMachineEditorProps {
  readonly machine: StateMachineEditorView;
  readonly eventOptions: readonly EventOptionView[];
  /** Optional so pre-PR-F callers keep compiling; treat an absent value as `[]` at the render boundary. */
  readonly sequenceOptions?: readonly SequenceOptionView[];
  /** Optional so pre-PR-F callers keep compiling; treat an absent value as `[]` at the render boundary. */
  readonly guardOperands?: readonly GuardOperandOption[];
  /**
   * Injected schema check for a date-time guard literal's committed text, threaded verbatim into
   * every transition's {@link GuardOperandOption}-driven guard editor. Optional so pre-PR-F callers
   * keep compiling; `TransitionGuardEditor` defaults to accepting every value when absent.
   */
  readonly isValidDateTimeLiteral?: (value: string) => boolean;
  readonly onAddState: (name: string) => void;
  readonly onRenameState: (stateId: string, name: string) => void;
  readonly onRemoveState: (stateId: string) => void;
  readonly onSetInitialState: (stateId: string) => void;
  readonly onAddTransition: (draft: NewTransitionDraft) => void;
  readonly onUpdateTransition: (transitionId: string, patch: TransitionUpdatePatch) => void;
  readonly onRemoveTransition: (transitionId: string) => void;
}
