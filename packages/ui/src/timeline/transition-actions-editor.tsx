import { Button, Chip, ListBox, Select } from '@heroui/react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useState } from 'react';

import { NumField } from '../inputs';
import { color, font, sp } from '../tokens';
import { rowStyle } from './state-machine-editor-styles';
import type { SequenceActionDraft, SequenceOptionView } from './state-machine-editor-types';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ICON_SIZE = 14;
const MIN_TICK = 0;
const TICK_STEP = 1;

type AddableActionKind = Exclude<SequenceActionDraft['kind'], 'send-event'>;
type PlaySequenceBehavior = Extract<SequenceActionDraft, { readonly kind: 'play-sequence' }>['behavior'];

const ADDABLE_ACTION_KIND_OPTIONS: readonly AddableActionKind[] = ['play-sequence', 'stop-sequence', 'seek-sequence'];

const ADDABLE_ACTION_KIND_LABELS: Readonly<Record<AddableActionKind, string>> = {
  'play-sequence': 'Play sequence',
  'stop-sequence': 'Stop sequence',
  'seek-sequence': 'Seek sequence',
};

const BEHAVIOR_OPTIONS: readonly PlaySequenceBehavior[] = ['restart', 'resume'];

const BEHAVIOR_LABELS: Readonly<Record<PlaySequenceBehavior, string>> = {
  restart: 'Restart',
  resume: 'Resume',
};

function isAddableActionKind(value: string): value is AddableActionKind {
  return value === 'play-sequence' || value === 'stop-sequence' || value === 'seek-sequence';
}

function isPlaySequenceBehavior(value: string): value is PlaySequenceBehavior {
  return value === 'restart' || value === 'resume';
}

/** Builds a valid default draft for a newly added action kind, seeded from the first sequence option. */
function defaultDraftForKind(
  kind: AddableActionKind,
  sequenceOptions: readonly SequenceOptionView[],
): SequenceActionDraft | null {
  const firstSequenceId = sequenceOptions[0]?.id;

  if (firstSequenceId === undefined) return null;
  if (kind === 'play-sequence') return { kind: 'play-sequence', sequenceId: firstSequenceId, behavior: 'restart' };
  if (kind === 'stop-sequence') return { kind: 'stop-sequence', sequenceId: firstSequenceId };

  return { kind: 'seek-sequence', sequenceId: firstSequenceId, tick: MIN_TICK };
}

function replaceAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

function removeAt<T>(items: readonly T[], index: number): readonly T[] {
  return items.filter((_, i) => i !== index);
}

/** Swaps two entries by index. Returns the original array unchanged if either index is out of range. */
function swapAt<T>(items: readonly T[], indexA: number, indexB: number): readonly T[] {
  const itemA = items[indexA];
  const itemB = items[indexB];

  if (itemA === undefined || itemB === undefined) return items;

  return items.map((item, i) => {
    if (i === indexA) return itemB;
    if (i === indexB) return itemA;

    return item;
  });
}

/* ------------------------------------------------------------------ */
/*  Sequence select — shared by play/stop/seek action rows             */
/* ------------------------------------------------------------------ */

interface SequenceSelectProps {
  readonly sequenceId: string;
  readonly sequenceOptions: readonly SequenceOptionView[];
  readonly onChange: (sequenceId: string) => void;
}

function SequenceSelect({ sequenceId, sequenceOptions, onChange }: SequenceSelectProps): JSX.Element {
  return (
    <Select
      aria-label="Sequence"
      value={sequenceId}
      onChange={(key) => {
        if (key === null) return;

        onChange(String(key));
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {sequenceOptions.map((option) => (
            <ListBox.Item id={option.id} key={option.id} textValue={option.name}>
              {option.name}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/* ------------------------------------------------------------------ */
/*  Remove / move controls — shared by every action row                */
/* ------------------------------------------------------------------ */

interface ActionRowControlsProps {
  readonly transitionId: string;
  readonly index: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onRemove: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
}

function ActionRowControls({
  transitionId,
  index,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ActionRowControlsProps): JSX.Element {
  return (
    <>
      <Button
        aria-label="Move action up"
        data-testid={`sm-transition-${transitionId}-move-action-up-${String(index)}`}
        isDisabled={isFirst}
        size="sm"
        variant="secondary"
        onPress={onMoveUp}
      >
        <ArrowUp size={ICON_SIZE} />
      </Button>
      <Button
        aria-label="Move action down"
        data-testid={`sm-transition-${transitionId}-move-action-down-${String(index)}`}
        isDisabled={isLast}
        size="sm"
        variant="secondary"
        onPress={onMoveDown}
      >
        <ArrowDown size={ICON_SIZE} />
      </Button>
      <Button
        aria-label="Remove action"
        data-testid={`sm-transition-${transitionId}-remove-action-${String(index)}`}
        size="sm"
        variant="danger"
        onPress={onRemove}
      >
        <Trash2 size={ICON_SIZE} />
        Remove
      </Button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  A single action row, switched on the draft's kind                  */
/* ------------------------------------------------------------------ */

interface TransitionActionRowProps {
  readonly transitionId: string;
  readonly action: SequenceActionDraft;
  readonly index: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly sequenceOptions: readonly SequenceOptionView[];
  readonly onChangeAction: (action: SequenceActionDraft) => void;
  readonly onRemove: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
}

function TransitionActionRow({
  transitionId,
  action,
  index,
  isFirst,
  isLast,
  sequenceOptions,
  onChangeAction,
  onRemove,
  onMoveUp,
  onMoveDown,
}: TransitionActionRowProps): JSX.Element {
  const testId = `sm-transition-${transitionId}-action-${String(index)}`;
  const controls = (
    <ActionRowControls
      index={index}
      isFirst={isFirst}
      isLast={isLast}
      transitionId={transitionId}
      onMoveDown={onMoveDown}
      onMoveUp={onMoveUp}
      onRemove={onRemove}
    />
  );

  if (action.kind === 'play-sequence') {
    return (
      <div data-testid={testId} style={rowStyle()}>
        <SequenceSelect
          sequenceId={action.sequenceId}
          sequenceOptions={sequenceOptions}
          onChange={(sequenceId) => {
            onChangeAction({ ...action, sequenceId });
          }}
        />
        <Select
          aria-label="Behavior"
          value={action.behavior}
          onChange={(key) => {
            if (key === null) return;

            const behavior = String(key);

            if (!isPlaySequenceBehavior(behavior)) return;

            onChangeAction({ ...action, behavior });
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {BEHAVIOR_OPTIONS.map((behavior) => (
                <ListBox.Item id={behavior} key={behavior} textValue={BEHAVIOR_LABELS[behavior]}>
                  {BEHAVIOR_LABELS[behavior]}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        {controls}
      </div>
    );
  }

  if (action.kind === 'stop-sequence') {
    return (
      <div data-testid={testId} style={rowStyle()}>
        <SequenceSelect
          sequenceId={action.sequenceId}
          sequenceOptions={sequenceOptions}
          onChange={(sequenceId) => {
            onChangeAction({ ...action, sequenceId });
          }}
        />
        {controls}
      </div>
    );
  }

  if (action.kind === 'seek-sequence') {
    const selectedSequence = sequenceOptions.find((option) => option.id === action.sequenceId);

    return (
      <div data-testid={testId} style={rowStyle()}>
        <SequenceSelect
          sequenceId={action.sequenceId}
          sequenceOptions={sequenceOptions}
          onChange={(sequenceId) => {
            onChangeAction({ ...action, sequenceId });
          }}
        />
        <NumField
          label="Tick"
          min={MIN_TICK}
          step={TICK_STEP}
          value={action.tick}
          onChange={(value) => {
            const tick = Math.round(value);

            if (!Number.isSafeInteger(tick) || tick < MIN_TICK) return;
            if (selectedSequence !== undefined && tick > selectedSequence.durationTicks) return;

            onChangeAction({ ...action, tick });
          }}
        />
        {controls}
      </div>
    );
  }

  // send-event: runtime-inert in the shipped pipeline — preserved read-only for lossless round-trip.
  return (
    <div data-testid={testId} style={rowStyle()}>
      <Chip size="sm">Send event (host-dispatched)</Chip>
      {controls}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add-action row                                                     */
/* ------------------------------------------------------------------ */

interface AddActionRowProps {
  readonly transitionId: string;
  readonly sequenceOptions: readonly SequenceOptionView[];
  readonly onAdd: (action: SequenceActionDraft) => void;
}

function AddActionRow({ transitionId, sequenceOptions, onAdd }: AddActionRowProps): JSX.Element {
  const [kind, setKind] = useState<AddableActionKind>('play-sequence');
  const canAdd = sequenceOptions.length > 0;

  const submit = (): void => {
    const draft = defaultDraftForKind(kind, sequenceOptions);

    if (draft === null) return;

    onAdd(draft);
  };

  return (
    <div data-testid={`sm-transition-${transitionId}-add-action`} style={rowStyle()}>
      <Select
        aria-label="Action kind"
        isDisabled={!canAdd}
        value={kind}
        onChange={(key) => {
          if (key === null) return;

          const value = String(key);

          if (!isAddableActionKind(value)) return;

          setKind(value);
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {ADDABLE_ACTION_KIND_OPTIONS.map((option) => (
              <ListBox.Item id={option} key={option} textValue={ADDABLE_ACTION_KIND_LABELS[option]}>
                {ADDABLE_ACTION_KIND_LABELS[option]}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <Button aria-label="Add action" isDisabled={!canAdd} size="sm" variant="secondary" onPress={submit}>
        <Plus size={ICON_SIZE} />
        Add action
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  TransitionActionsEditor                                            */
/* ------------------------------------------------------------------ */

export interface TransitionActionsEditorProps {
  readonly transitionId: string;
  readonly actions: readonly SequenceActionDraft[];
  readonly sequenceOptions: readonly SequenceOptionView[];
  readonly onChange: (actions: readonly SequenceActionDraft[]) => void;
}

/**
 * Presentational, ordered editor for one transition's `SequenceAction` drafts. Runtime-LIVE kinds
 * (play/stop/seek-sequence) are fully editable and addable; `send-event` is preserved read-only
 * because it is not dispatched by the shipped playback pipeline (see `SequenceActionDraft`).
 */
export function TransitionActionsEditor({
  transitionId,
  actions,
  sequenceOptions,
  onChange,
}: TransitionActionsEditorProps): JSX.Element {
  return (
    <div
      data-testid={`sm-transition-${transitionId}-actions`}
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}
    >
      <span style={{ color: color('muted'), fontSize: font('label') }}>Actions</span>

      {actions.map((action, index) => (
        <TransitionActionRow
          action={action}
          index={index}
          isFirst={index === 0}
          isLast={index === actions.length - 1}
          key={`${action.kind}-${String(index)}`}
          sequenceOptions={sequenceOptions}
          transitionId={transitionId}
          onChangeAction={(nextAction) => {
            onChange(replaceAt(actions, index, nextAction));
          }}
          onMoveDown={() => {
            onChange(swapAt(actions, index, index + 1));
          }}
          onMoveUp={() => {
            onChange(swapAt(actions, index, index - 1));
          }}
          onRemove={() => {
            onChange(removeAt(actions, index));
          }}
        />
      ))}

      <AddActionRow
        sequenceOptions={sequenceOptions}
        transitionId={transitionId}
        onAdd={(action) => {
          onChange([...actions, action]);
        }}
      />
    </div>
  );
}
