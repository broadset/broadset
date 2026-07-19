import { Button, ListBox, Select } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useState } from 'react';

import { NumField } from '../inputs';
import { color, font, sp } from '../tokens';
import type { LifecyclePhase } from './animation-state-sections';
import { rowStyle } from './state-machine-editor-styles';
import type {
  EventOptionView,
  GuardDraft,
  GuardOperandOption,
  NewTransitionDraft,
  SequenceActionDraft,
  SequenceOptionView,
  StateOptionView,
  TransitionTriggerDraft,
} from './state-machine-editor-types';
import { TransitionActionsEditor } from './transition-actions-editor';
import { TransitionGuardEditor } from './transition-guard-editor';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_TICKS = 1;
const DEFAULT_TICKS = 1;
const MIN_PRIORITY = 0;
const NUMBER_STEP = 1;
const ICON_SIZE = 14;

const TRIGGER_KIND_OPTIONS_WITH_EVENT: readonly TransitionTriggerDraft['kind'][] = ['event', 'lifecycle', 'after'];
const TRIGGER_KIND_OPTIONS_WITHOUT_EVENT: readonly TransitionTriggerDraft['kind'][] = ['lifecycle', 'after'];

const TRIGGER_KIND_LABELS: Readonly<Record<TransitionTriggerDraft['kind'], string>> = {
  event: 'Event',
  lifecycle: 'Lifecycle',
  after: 'After',
};

const LIFECYCLE_PHASE_OPTIONS: readonly LifecyclePhase[] = ['in', 'hold', 'update', 'out'];

const LIFECYCLE_PHASE_LABELS: Readonly<Record<LifecyclePhase, string>> = {
  in: 'In',
  hold: 'Hold',
  update: 'Update',
  out: 'Out',
};

function isLifecyclePhase(value: string): value is LifecyclePhase {
  return value === 'in' || value === 'hold' || value === 'update' || value === 'out';
}

function isTriggerKind(value: string): value is TransitionTriggerDraft['kind'] {
  return value === 'event' || value === 'lifecycle' || value === 'after';
}

/** Builds a valid default draft for a newly selected trigger kind, picking the first event option when available. */
function defaultTriggerForKind(
  kind: TransitionTriggerDraft['kind'],
  eventOptions: readonly EventOptionView[],
): TransitionTriggerDraft {
  if (kind === 'event') return { kind: 'event', eventId: eventOptions[0]?.id ?? '' };
  if (kind === 'lifecycle') return { kind: 'lifecycle', phase: 'out' };

  return { kind: 'after', ticks: DEFAULT_TICKS };
}

/**
 * Never offers "Event" as a selectable trigger kind when there is no valid event to default to —
 * selecting it would otherwise build an unparseable `{kind:'event', eventId:''}` draft (the
 * empty-id crash this guard exists to prevent). The currently active kind is always kept in the
 * list so an existing event-kind row (whose own event id keeps `eventOptions` non-empty in
 * practice) still renders its current selection; only a kind change away from "Event" can drop it.
 */
function deriveTriggerKindOptions(
  eventOptions: readonly EventOptionView[],
  currentKind: TransitionTriggerDraft['kind'],
): readonly TransitionTriggerDraft['kind'][] {
  const eventKindIsSelectable = eventOptions.length > 0 || currentKind === 'event';

  return eventKindIsSelectable ? TRIGGER_KIND_OPTIONS_WITH_EVENT : TRIGGER_KIND_OPTIONS_WITHOUT_EVENT;
}

/* ------------------------------------------------------------------ */
/*  Trigger draft editor (kind select + kind-specific secondary field) */
/* ------------------------------------------------------------------ */

export interface TriggerDraftEditorProps {
  readonly trigger: TransitionTriggerDraft;
  readonly eventOptions: readonly EventOptionView[];
  readonly onChange: (trigger: TransitionTriggerDraft) => void;
}

export function TriggerDraftEditor({ trigger, eventOptions, onChange }: TriggerDraftEditorProps): JSX.Element {
  return (
    <div style={rowStyle()}>
      <Select
        aria-label="Trigger kind"
        value={trigger.kind}
        onChange={(key) => {
          if (key === null) return;

          const kind = String(key);

          if (!isTriggerKind(kind)) return;

          onChange(defaultTriggerForKind(kind, eventOptions));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {deriveTriggerKindOptions(eventOptions, trigger.kind).map((kind) => (
              <ListBox.Item id={kind} key={kind} textValue={TRIGGER_KIND_LABELS[kind]}>
                {TRIGGER_KIND_LABELS[kind]}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      {trigger.kind === 'event' && (
        <Select
          aria-label="Event"
          isDisabled={eventOptions.length === 0}
          value={trigger.eventId}
          onChange={(key) => {
            if (key === null) return;

            onChange({ kind: 'event', eventId: String(key) });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {eventOptions.map((option) => (
                <ListBox.Item id={option.id} key={option.id} textValue={option.label}>
                  {option.label}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}

      {trigger.kind === 'lifecycle' && (
        <Select
          aria-label="Lifecycle phase"
          value={trigger.phase}
          onChange={(key) => {
            if (key === null) return;

            const phase = String(key);

            if (!isLifecyclePhase(phase)) return;

            onChange({ kind: 'lifecycle', phase });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {LIFECYCLE_PHASE_OPTIONS.map((phase) => (
                <ListBox.Item id={phase} key={phase} textValue={LIFECYCLE_PHASE_LABELS[phase]}>
                  {LIFECYCLE_PHASE_LABELS[phase]}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      )}

      {trigger.kind === 'after' && (
        <NumField
          label="Ticks"
          min={MIN_TICKS}
          step={NUMBER_STEP}
          value={trigger.ticks}
          onChange={(value) => {
            const ticks = Math.round(value);

            if (!Number.isSafeInteger(ticks) || ticks < MIN_TICKS) return;

            onChange({ kind: 'after', ticks });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Existing transition row                                            */
/* ------------------------------------------------------------------ */

export interface StateMachineTransitionRowProps {
  readonly transitionId: string;
  readonly sourceStateName: string;
  readonly targetStateId: string;
  readonly trigger: TransitionTriggerDraft;
  readonly priority: number;
  readonly states: readonly StateOptionView[];
  readonly eventOptions: readonly EventOptionView[];
  readonly actions: readonly SequenceActionDraft[];
  readonly sequenceOptions: readonly SequenceOptionView[];
  readonly guard: GuardDraft | undefined;
  readonly guardIsAdvanced: boolean;
  readonly guardOperands: readonly GuardOperandOption[];
  readonly isValidDateTimeLiteral: (value: string) => boolean;
  readonly onChangeTarget: (targetStateId: string) => void;
  readonly onChangeTrigger: (trigger: TransitionTriggerDraft) => void;
  readonly onChangePriority: (priority: number) => void;
  readonly onChangeActions: (actions: readonly SequenceActionDraft[]) => void;
  readonly onChangeGuard: (guard: GuardDraft) => void;
  readonly onRemove: () => void;
}

export function StateMachineTransitionRow({
  transitionId,
  sourceStateName,
  targetStateId,
  trigger,
  priority,
  states,
  eventOptions,
  actions,
  sequenceOptions,
  guard,
  guardIsAdvanced,
  guardOperands,
  isValidDateTimeLiteral,
  onChangeTarget,
  onChangeTrigger,
  onChangePriority,
  onChangeActions,
  onChangeGuard,
  onRemove,
}: StateMachineTransitionRowProps): JSX.Element {
  const handlePriorityChange = (value: number): void => {
    const nextPriority = Math.round(value);

    if (!Number.isSafeInteger(nextPriority) || nextPriority < MIN_PRIORITY) return;

    onChangePriority(nextPriority);
  };

  return (
    <div
      data-testid={`sm-transition-${transitionId}`}
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}
    >
      <div style={rowStyle()}>
        <span style={{ color: color('muted'), fontSize: font('label') }}>{sourceStateName}</span>

        <Select
          aria-label="Target state"
          value={targetStateId}
          onChange={(key) => {
            if (key === null) return;

            onChangeTarget(String(key));
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {states.map((state) => (
                <ListBox.Item id={state.id} key={state.id} textValue={state.name}>
                  {state.name}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <TriggerDraftEditor eventOptions={eventOptions} trigger={trigger} onChange={onChangeTrigger} />

        <NumField
          label="Priority"
          min={MIN_PRIORITY}
          step={NUMBER_STEP}
          value={priority}
          onChange={handlePriorityChange}
        />

        <Button aria-label="Remove transition" size="sm" variant="danger" onPress={onRemove}>
          <Trash2 size={ICON_SIZE} />
          Remove
        </Button>
      </div>

      <TransitionActionsEditor
        actions={actions}
        sequenceOptions={sequenceOptions}
        transitionId={transitionId}
        onChange={onChangeActions}
      />

      <TransitionGuardEditor
        guard={guard}
        guardIsAdvanced={guardIsAdvanced}
        isValidDateTimeLiteral={isValidDateTimeLiteral}
        operands={guardOperands}
        transitionId={transitionId}
        onChange={onChangeGuard}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add-transition row                                                 */
/* ------------------------------------------------------------------ */

export interface NewTransitionRowProps {
  readonly states: readonly StateOptionView[];
  readonly eventOptions: readonly EventOptionView[];
  readonly onAdd: (draft: NewTransitionDraft) => void;
}

/**
 * Local draft state for a not-yet-created transition. Defaults to the first state as both
 * source and target (self-transitions are allowed by the model) and a lifecycle/out trigger.
 */
export function NewTransitionRow({ states, eventOptions, onAdd }: NewTransitionRowProps): JSX.Element {
  const firstStateId = states[0]?.id ?? '';
  const hasStates = states.length > 0;
  const [sourceStateId, setSourceStateId] = useState(firstStateId);
  const [targetStateId, setTargetStateId] = useState(firstStateId);
  const [trigger, setTrigger] = useState<TransitionTriggerDraft>({ kind: 'lifecycle', phase: 'out' });

  const submit = (): void => {
    if (sourceStateId === '' || targetStateId === '') return;

    onAdd({ sourceStateId, targetStateId, trigger });
  };

  return (
    <div data-testid="sm-add-transition-row" style={rowStyle()}>
      <Select
        aria-label="Source state"
        isDisabled={!hasStates}
        value={sourceStateId}
        onChange={(key) => {
          if (key === null) return;

          setSourceStateId(String(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {states.map((state) => (
              <ListBox.Item id={state.id} key={state.id} textValue={state.name}>
                {state.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <Select
        aria-label="Target state"
        isDisabled={!hasStates}
        value={targetStateId}
        onChange={(key) => {
          if (key === null) return;

          setTargetStateId(String(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {states.map((state) => (
              <ListBox.Item id={state.id} key={state.id} textValue={state.name}>
                {state.name}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <TriggerDraftEditor eventOptions={eventOptions} trigger={trigger} onChange={setTrigger} />

      <Button
        aria-label="Add transition"
        data-testid="sm-add-transition"
        isDisabled={!hasStates}
        size="sm"
        variant="secondary"
        onPress={submit}
      >
        <Plus size={ICON_SIZE} />
        Add transition
      </Button>
    </div>
  );
}
