import { Button, Chip, Input } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { ChangeEvent, JSX, KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';

import { color, font, sp } from '../tokens';
import { rowStyle } from './state-machine-editor-styles';
import type { StateMachineEditorProps, StateOptionView } from './state-machine-editor-types';
import { NewTransitionRow, StateMachineTransitionRow } from './state-machine-transition-row';

const ICON_SIZE = 14;

function sectionStyle(): { display: 'flex'; flexDirection: 'column'; gap: string } {
  return { display: 'flex', flexDirection: 'column', gap: sp('sp-03') };
}

function resolveStateName(states: readonly StateOptionView[], stateId: string): string {
  return states.find((state) => state.id === stateId)?.name ?? stateId;
}

/* ------------------------------------------------------------------ */
/*  Existing state row                                                 */
/* ------------------------------------------------------------------ */

interface StateRowProps {
  readonly state: StateOptionView;
  readonly isInitial: boolean;
  readonly onRename: (stateId: string, name: string) => void;
  readonly onSetInitial: (stateId: string) => void;
  readonly onRemove: (stateId: string) => void;
}

/**
 * Buffers the rename input locally so keystrokes render immediately even though the parent
 * (a presentational, string-id-only view) may not echo the committed name back synchronously.
 */
function StateRow({ state, isInitial, onRename, onSetInitial, onRemove }: StateRowProps): JSX.Element {
  const [draftName, setDraftName] = useState(state.name);

  useEffect(() => {
    setDraftName(state.name);
  }, [state.name]);

  const commitName = (): void => {
    const trimmed = draftName.trim();

    if (trimmed === '') {
      setDraftName(state.name);

      return;
    }

    if (trimmed !== state.name) {
      onRename(state.id, trimmed);
    }
  };

  return (
    <div data-testid={`sm-state-${state.id}`} style={rowStyle()}>
      <Input
        aria-label="State name"
        value={draftName}
        onBlur={commitName}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setDraftName(event.currentTarget.value);
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') commitName();
        }}
      />

      {isInitial && <Chip size="sm">initial</Chip>}

      <Button
        aria-label="Set initial"
        isDisabled={isInitial}
        size="sm"
        variant="secondary"
        onPress={() => {
          onSetInitial(state.id);
        }}
      >
        Set initial
      </Button>

      <Button
        aria-label="Remove state"
        size="sm"
        variant="danger"
        onPress={() => {
          onRemove(state.id);
        }}
      >
        <Trash2 size={ICON_SIZE} />
        Remove
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  New-state row                                                      */
/* ------------------------------------------------------------------ */

function NewStateRow({ onAddState }: { readonly onAddState: (name: string) => void }): JSX.Element {
  const [name, setName] = useState('');

  const submit = (): void => {
    const trimmed = name.trim();

    if (trimmed === '') return;

    onAddState(trimmed);
    setName('');
  };

  return (
    <div style={rowStyle()}>
      <Input
        aria-label="New state name"
        placeholder="State name"
        value={name}
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setName(event.currentTarget.value);
        }}
      />
      <Button aria-label="Add state" data-testid="sm-add-state" size="sm" variant="secondary" onPress={submit}>
        <Plus size={ICON_SIZE} />
        Add state
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StateMachineEditor                                                 */
/* ------------------------------------------------------------------ */

/**
 * Presentational editor for a single state machine's states and transitions. String-ids-only,
 * store-agnostic — the host (demo/editor) owns persistence and translates callbacks into store
 * mutations. Guard-expression editing and per-transition sequence-action editing are out of
 * scope (see `project/spec` for the animation-state-machine authoring surface backlog).
 */
export function StateMachineEditor({
  machine,
  eventOptions,
  onAddState,
  onRenameState,
  onRemoveState,
  onSetInitialState,
  onAddTransition,
  onUpdateTransition,
  onRemoveTransition,
}: StateMachineEditorProps): JSX.Element {
  return (
    <section
      aria-label={`State machine: ${machine.name}`}
      data-testid={`state-machine-editor-${machine.id}`}
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-05'), fontSize: font('body-compact') }}
    >
      <div style={sectionStyle()}>
        <span style={{ color: color('muted'), fontSize: font('label') }}>States</span>

        {machine.states.map((state) => (
          <StateRow
            isInitial={state.id === machine.initialStateId}
            key={state.id}
            state={state}
            onRemove={onRemoveState}
            onRename={onRenameState}
            onSetInitial={onSetInitialState}
          />
        ))}

        <NewStateRow onAddState={onAddState} />
      </div>

      <div style={sectionStyle()}>
        <span style={{ color: color('muted'), fontSize: font('label') }}>Transitions</span>

        {machine.transitions.map((transition) => (
          <StateMachineTransitionRow
            eventOptions={eventOptions}
            key={transition.id}
            priority={transition.priority}
            sourceStateName={resolveStateName(machine.states, transition.sourceStateId)}
            states={machine.states}
            targetStateId={transition.targetStateId}
            transitionId={transition.id}
            trigger={transition.trigger}
            onChangePriority={(priority) => {
              onUpdateTransition(transition.id, { priority });
            }}
            onChangeTarget={(targetStateId) => {
              onUpdateTransition(transition.id, { targetStateId });
            }}
            onChangeTrigger={(trigger) => {
              onUpdateTransition(transition.id, { trigger });
            }}
            onRemove={() => {
              onRemoveTransition(transition.id);
            }}
          />
        ))}

        <NewTransitionRow eventOptions={eventOptions} states={machine.states} onAdd={onAddTransition} />
      </div>
    </section>
  );
}
