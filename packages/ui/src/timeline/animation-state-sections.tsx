import { Accordion, Button, Chip, Input, ListBox, Select } from '@heroui/react';
import { Plus, Trash2 } from 'lucide-react';
import type { JSX } from 'react';
import { useState } from 'react';

import { color, font, sp } from '../tokens';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LifecyclePhase = 'in' | 'hold' | 'update' | 'out';

export interface LifecycleSlotView {
  readonly phase: LifecyclePhase;
  readonly actionLabels: readonly string[];
}

export interface StateMachineView {
  readonly id: string;
  readonly name: string;
  readonly stateNames: readonly string[];
}

export interface SequenceNameView {
  readonly id: string;
  readonly name: string;
}

export interface AnimationStateSectionsProps {
  /** Always all four phases, in `in | hold | update | out` order. */
  readonly lifecycleSlots: readonly LifecycleSlotView[];
  /** Custom (modifier) state machines, host-sorted alphabetically by name. */
  readonly stateMachines: readonly StateMachineView[];
  readonly sequenceNames: readonly SequenceNameView[];
  readonly onAssignLifecycleSequence: (phase: 'in' | 'out', sequenceId: string) => void;
  readonly onClearLifecyclePhase: (phase: LifecyclePhase) => void;
  readonly onAddModifier: (name: string) => void;
  readonly onRemoveStateMachine: (stateMachineId: string) => void;
  readonly onCreateReverseExit: (sequenceId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function findLifecycleSlot(slots: readonly LifecycleSlotView[], phase: LifecyclePhase): LifecycleSlotView | undefined {
  return slots.find((slot) => slot.phase === phase);
}

function ActionLabelList({ actionLabels }: { readonly actionLabels: readonly string[] }): JSX.Element {
  if (actionLabels.length === 0) {
    return (
      <span style={{ color: color('muted'), fontSize: font('label') }} data-testid="animation-state-empty-hint">
        Empty
      </span>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}>
      {actionLabels.map((label) => (
        <span key={label} style={{ color: color('foreground'), fontSize: font('label') }}>
          {label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  IN / OUT lifecycle slot (assignable)                                */
/* ------------------------------------------------------------------ */

interface AssignableLifecycleSlotProps {
  readonly phase: 'in' | 'out';
  readonly actionLabels: readonly string[];
  readonly sequenceNames: readonly SequenceNameView[];
  readonly onAssign: (phase: 'in' | 'out', sequenceId: string) => void;
  readonly onClear: (phase: LifecyclePhase) => void;
}

function AssignableLifecycleSlot({
  phase,
  actionLabels,
  sequenceNames,
  onAssign,
  onClear,
}: AssignableLifecycleSlotProps): JSX.Element {
  const [selectedSequenceId, setSelectedSequenceId] = useState<string>(sequenceNames[0]?.id ?? '');
  const phaseLabel = phase.toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03') }}>
      <ActionLabelList actionLabels={actionLabels} />

      <div style={{ display: 'flex', alignItems: 'center', gap: sp('sp-02') }}>
        <Select
          aria-label={`${phaseLabel} sequence`}
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
          aria-label={`Assign ${phase} sequence`}
          isDisabled={selectedSequenceId === ''}
          size="sm"
          variant="secondary"
          onPress={() => {
            if (selectedSequenceId !== '') onAssign(phase, selectedSequenceId);
          }}
        >
          Assign
        </Button>
        <Button
          aria-label={`Clear ${phase}`}
          isDisabled={actionLabels.length === 0}
          size="sm"
          variant="ghost"
          onPress={() => {
            onClear(phase);
          }}
        >
          <Trash2 size={14} />
          Clear
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reverse-exit generator list                                        */
/* ------------------------------------------------------------------ */

function ReverseExitList({
  sequenceNames,
  onCreateReverseExit,
}: {
  readonly sequenceNames: readonly SequenceNameView[];
  readonly onCreateReverseExit: (sequenceId: string) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-02') }}>
      <span style={{ color: color('muted'), fontSize: font('label') }}>Reverse exit from sequence</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}>
        {sequenceNames.map((sequence) => (
          <Button
            key={sequence.id}
            aria-label={`Create reverse exit for ${sequence.name}`}
            size="sm"
            variant="ghost"
            onPress={() => {
              onCreateReverseExit(sequence.id);
            }}
          >
            {`Reverse exit for ${sequence.name}`}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  New modifier creation row                                          */
/* ------------------------------------------------------------------ */

function NewModifierRow({ onAddModifier }: { readonly onAddModifier: (name: string) => void }): JSX.Element {
  const [modifierName, setModifierName] = useState<string>('');

  const submit = (): void => {
    const trimmed = modifierName.trim();

    if (trimmed === '') return;

    onAddModifier(trimmed);
    setModifierName('');
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: sp('sp-02'),
        paddingBottom: sp('sp-03'),
        borderBottom: `1px solid ${color('border')}`,
      }}
    >
      <Input
        aria-label="New modifier name"
        placeholder="Modifier name"
        value={modifierName}
        onChange={(event) => {
          setModifierName(event.currentTarget.value);
        }}
      />
      <Button aria-label="Add modifier" size="sm" variant="secondary" onPress={submit}>
        <Plus size={14} />
        Add modifier
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AnimationStateSections                                             */
/* ------------------------------------------------------------------ */

/**
 * Presentational lifecycle + state-machine authoring surface (animation-state.md). Lifecycle IN is
 * authored first, HOLD/UPDATE are shown read-only in a middle section (no editing UI yet — see the
 * timeline.md Spec Gaps entry), custom modifier state machines render as their own sections in
 * host-sorted order, and lifecycle OUT is last with reverse-exit generation from any sequence.
 */
export function AnimationStateSections({
  lifecycleSlots,
  stateMachines,
  sequenceNames,
  onAssignLifecycleSequence,
  onClearLifecyclePhase,
  onAddModifier,
  onRemoveStateMachine,
  onCreateReverseExit,
}: AnimationStateSectionsProps): JSX.Element {
  const inSlot = findLifecycleSlot(lifecycleSlots, 'in');
  const holdSlot = findLifecycleSlot(lifecycleSlots, 'hold');
  const updateSlot = findLifecycleSlot(lifecycleSlots, 'update');
  const outSlot = findLifecycleSlot(lifecycleSlots, 'out');
  const defaultExpandedKeys = [
    'lifecycle-in',
    'lifecycle',
    ...stateMachines.map((machine) => `machine-${machine.id}`),
    'lifecycle-out',
  ];

  return (
    <section
      aria-label="Lifecycle and state machines"
      style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03'), fontSize: font('body-compact') }}
    >
      <NewModifierRow onAddModifier={onAddModifier} />

      <Accordion allowsMultipleExpanded defaultExpandedKeys={defaultExpandedKeys}>
        <Accordion.Item data-testid="animation-state-section-lifecycle-in" id="lifecycle-in">
          <Accordion.Heading>
            <Accordion.Trigger>Lifecycle: In</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <AssignableLifecycleSlot
              actionLabels={inSlot?.actionLabels ?? []}
              phase="in"
              sequenceNames={sequenceNames}
              onAssign={onAssignLifecycleSequence}
              onClear={onClearLifecyclePhase}
            />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item data-testid="animation-state-section-lifecycle" id="lifecycle">
          <Accordion.Heading>
            <Accordion.Trigger>Lifecycle: Hold &amp; Update</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03') }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}>
                <span style={{ color: color('muted'), fontSize: font('label') }}>Hold</span>
                <ActionLabelList actionLabels={holdSlot?.actionLabels ?? []} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-01') }}>
                <span style={{ color: color('muted'), fontSize: font('label') }}>Update</span>
                <ActionLabelList actionLabels={updateSlot?.actionLabels ?? []} />
              </div>
            </div>
          </Accordion.Panel>
        </Accordion.Item>

        {stateMachines.map((machine) => (
          <Accordion.Item
            data-testid={`animation-state-section-machine-${machine.id}`}
            id={`machine-${machine.id}`}
            key={machine.id}
          >
            <Accordion.Heading>
              <Accordion.Trigger>{machine.name}</Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-03') }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: sp('sp-01') }}>
                  {machine.stateNames.map((stateName) => (
                    <Chip key={stateName} size="sm">
                      {stateName}
                    </Chip>
                  ))}
                </div>
                <Button
                  aria-label={`Delete ${machine.name}`}
                  size="sm"
                  variant="danger"
                  onPress={() => {
                    onRemoveStateMachine(machine.id);
                  }}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </Accordion.Panel>
          </Accordion.Item>
        ))}

        <Accordion.Item data-testid="animation-state-section-lifecycle-out" id="lifecycle-out">
          <Accordion.Heading>
            <Accordion.Trigger>Lifecycle: Out</Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: sp('sp-04') }}>
              <AssignableLifecycleSlot
                actionLabels={outSlot?.actionLabels ?? []}
                phase="out"
                sequenceNames={sequenceNames}
                onAssign={onAssignLifecycleSequence}
                onClear={onClearLifecyclePhase}
              />
              <ReverseExitList sequenceNames={sequenceNames} onCreateReverseExit={onCreateReverseExit} />
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </section>
  );
}
