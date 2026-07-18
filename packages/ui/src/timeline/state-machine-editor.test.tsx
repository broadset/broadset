import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StateMachineEditor } from './state-machine-editor';
import type { StateMachineEditorProps, StateMachineEditorView } from './state-machine-editor-types';

function buildMachine(overrides: Partial<StateMachineEditorView> = {}): StateMachineEditorView {
  return {
    id: 'sm-1',
    name: 'Highlight',
    initialStateId: 'inactive',
    states: [
      { id: 'inactive', name: 'Inactive' },
      { id: 'active', name: 'Active' },
    ],
    transitions: [
      {
        id: 't-1',
        sourceStateId: 'active',
        targetStateId: 'inactive',
        trigger: { kind: 'lifecycle', phase: 'out' },
        priority: 0,
      },
    ],
    ...overrides,
  };
}

function setup(overrides: Partial<StateMachineEditorProps> = {}): StateMachineEditorProps {
  const props: StateMachineEditorProps = {
    machine: buildMachine(),
    eventOptions: [{ id: 'evt-1', label: 'Click' }],
    onAddState: vi.fn(),
    onRenameState: vi.fn(),
    onRemoveState: vi.fn(),
    onSetInitialState: vi.fn(),
    onAddTransition: vi.fn(),
    onUpdateTransition: vi.fn(),
    onRemoveTransition: vi.fn(),
    ...overrides,
  };

  render(<StateMachineEditor {...props} />);

  return props;
}

describe('StateMachineEditor', () => {
  /** @description Root, state rows, and transition rows render with their contract testids. */
  it('renders the machine root, state rows, and transition rows', () => {
    setup();

    expect(screen.getByTestId('state-machine-editor-sm-1')).toBeTruthy();
    expect(screen.getByTestId('sm-state-inactive')).toBeTruthy();
    expect(screen.getByTestId('sm-state-active')).toBeTruthy();
    expect(screen.getByTestId('sm-transition-t-1')).toBeTruthy();
    expect(within(screen.getByTestId('sm-state-inactive')).getByText('initial')).toBeTruthy();
  });

  /** @description Typing a trimmed name and clicking Add state fires onAddState with the trimmed value. */
  it('adds a state from the trimmed new-state name input', () => {
    const props = setup();

    fireEvent.change(screen.getByRole('textbox', { name: 'New state name' }), {
      target: { value: '  Highlighted  ' },
    });
    fireEvent.click(screen.getByTestId('sm-add-state'));

    expect(props.onAddState).toHaveBeenCalledWith('Highlighted');
  });

  /** @description Committing a new value in the priority number field fires onUpdateTransition with the parsed integer. */
  it("updates a transition's priority via the number field", () => {
    const props = setup();
    const row = screen.getByTestId('sm-transition-t-1');
    const priorityInput = within(row).getByLabelText('Priority', { selector: 'input' });

    fireEvent.change(priorityInput, { target: { value: '5' } });
    fireEvent.blur(priorityInput);

    expect(props.onUpdateTransition).toHaveBeenCalledWith('t-1', { priority: 5 });
  });

  /** @description Clicking Remove on a transition row fires onRemoveTransition with that transition's id. */
  it('removes a transition', () => {
    const props = setup();
    const row = screen.getByTestId('sm-transition-t-1');

    fireEvent.click(within(row).getByRole('button', { name: 'Remove transition' }));

    expect(props.onRemoveTransition).toHaveBeenCalledWith('t-1');
  });

  /** @description Clicking Set initial on a non-initial state row fires onSetInitialState with that state's id. */
  it('sets a non-initial state as the initial state', () => {
    const props = setup();
    const row = screen.getByTestId('sm-state-active');

    fireEvent.click(within(row).getByRole('button', { name: 'Set initial' }));

    expect(props.onSetInitialState).toHaveBeenCalledWith('active');
  });

  /** @description Picking a target and trigger kind in the add-transition row and clicking Add transition fires onAddTransition with the assembled draft. */
  it('adds a transition using the add-transition row draft', () => {
    const props = setup();
    const addRow = screen.getByTestId('sm-add-transition-row');

    fireEvent.click(within(addRow).getByRole('button', { name: /target state/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Active' }));

    fireEvent.click(within(addRow).getByRole('button', { name: /trigger kind/i }));
    fireEvent.click(screen.getByRole('option', { name: 'After' }));

    const ticksInput = within(addRow).getByLabelText('Ticks', { selector: 'input' });

    fireEvent.change(ticksInput, { target: { value: '3' } });
    fireEvent.blur(ticksInput);

    fireEvent.click(screen.getByTestId('sm-add-transition'));

    expect(props.onAddTransition).toHaveBeenCalledWith({
      sourceStateId: 'inactive',
      targetStateId: 'active',
      trigger: { kind: 'after', ticks: 3 },
    });
  });
});
