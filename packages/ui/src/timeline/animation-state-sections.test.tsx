import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AnimationStateSectionsProps } from './animation-state-sections';
import { AnimationStateSections } from './animation-state-sections';

function setup(overrides: Partial<AnimationStateSectionsProps> = {}): AnimationStateSectionsProps {
  const props: AnimationStateSectionsProps = {
    lifecycleSlots: [
      { phase: 'in', actionLabels: [] },
      { phase: 'hold', actionLabels: [] },
      { phase: 'update', actionLabels: [] },
      { phase: 'out', actionLabels: ['play Outro'] },
    ],
    stateMachines: [{ id: 'sm-1', name: 'Highlight', stateNames: ['inactive', 'active'] }],
    sequenceNames: [{ id: 'seq-1', name: 'Intro' }],
    onAssignLifecycleSequence: vi.fn(),
    onClearLifecyclePhase: vi.fn(),
    onAddModifier: vi.fn(),
    onRemoveStateMachine: vi.fn(),
    onCreateReverseExit: vi.fn(),
    ...overrides,
  };

  render(<AnimationStateSections {...props} />);

  return props;
}

describe('AnimationStateSections', () => {
  it('orders sections lifecycle-IN first and lifecycle-OUT last with machines between', () => {
    setup();

    const headings = screen.getAllByTestId(/animation-state-section-/).map((node) => node.dataset['testid']);

    expect(headings[0]).toBe('animation-state-section-lifecycle-in');
    expect(headings.at(-1)).toBe('animation-state-section-lifecycle-out');
    expect(headings).toContain('animation-state-section-machine-sm-1');
  });

  it('shows an empty hint for unassigned phases and labels for assigned ones', () => {
    setup();
    expect(screen.getAllByText('Empty').length).toBeGreaterThan(0);
    expect(screen.getByText('play Outro')).toBeDefined();
  });

  it('creates a modifier from the name input and removes machines by stable id', () => {
    const props = setup();

    fireEvent.change(screen.getByRole('textbox', { name: 'New modifier name' }), { target: { value: 'Flash' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add modifier' }));
    expect(props.onAddModifier).toHaveBeenCalledWith('Flash');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Highlight' }));
    expect(props.onRemoveStateMachine).toHaveBeenCalledWith('sm-1');
  });

  it('requests a reverse exit for a sequence', () => {
    const props = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Create reverse exit for Intro' }));
    expect(props.onCreateReverseExit).toHaveBeenCalledWith('seq-1');
  });
});
