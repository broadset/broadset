import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SequenceActionDraft, SequenceOptionView } from './state-machine-editor-types';
import { TransitionActionsEditor } from './transition-actions-editor';

const SEQUENCE_OPTIONS: readonly SequenceOptionView[] = [
  { id: 'seq-1', name: 'Intro', durationTicks: 100 },
  { id: 'seq-2', name: 'Outro', durationTicks: 50 },
];

const LONG_SHORT_SEQUENCE_OPTIONS: readonly SequenceOptionView[] = [
  { id: 'seq-long', name: 'Long', durationTicks: 1000 },
  { id: 'seq-short', name: 'Short', durationTicks: 100 },
];

function setup(
  actions: readonly SequenceActionDraft[],
  sequenceOptions: readonly SequenceOptionView[] = SEQUENCE_OPTIONS,
): { readonly onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();

  render(
    <TransitionActionsEditor
      actions={actions}
      sequenceOptions={sequenceOptions}
      transitionId="t-1"
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe('TransitionActionsEditor', () => {
  /** @description Every action kind in a mixed drafts array renders its own indexed row. */
  it('renders a row for every action kind in a mixed drafts array', () => {
    const actions: readonly SequenceActionDraft[] = [
      { kind: 'play-sequence', sequenceId: 'seq-1', behavior: 'restart' },
      { kind: 'stop-sequence', sequenceId: 'seq-2' },
      { kind: 'seek-sequence', sequenceId: 'seq-1', tick: 10 },
    ];

    setup(actions);

    expect(screen.getByTestId('sm-transition-t-1-actions')).toBeTruthy();
    expect(screen.getByTestId('sm-transition-t-1-action-0')).toBeTruthy();
    expect(screen.getByTestId('sm-transition-t-1-action-1')).toBeTruthy();
    expect(screen.getByTestId('sm-transition-t-1-action-2')).toBeTruthy();
  });

  /** @description Picking "Seek sequence" in the add-action control and pressing Add action appends a valid default seek draft. */
  it('adds a seek-sequence action from the add-action control', () => {
    const { onChange } = setup([]);
    const addControl = screen.getByTestId('sm-transition-t-1-add-action');

    fireEvent.click(within(addControl).getByRole('button', { name: /action kind/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Seek sequence' }));

    fireEvent.click(within(addControl).getByRole('button', { name: 'Add action' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'seek-sequence', sequenceId: 'seq-1', tick: 0 }]);
  });

  /** @description Changing a play-sequence row's behavior Select emits the full drafts array with only that index updated. */
  it("updates a play-sequence action's behavior in place", () => {
    const actions: readonly SequenceActionDraft[] = [{ kind: 'play-sequence', sequenceId: 'seq-1', behavior: 'restart' }];
    const { onChange } = setup(actions);
    const row = screen.getByTestId('sm-transition-t-1-action-0');

    fireEvent.click(within(row).getByRole('button', { name: /behavior/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Resume' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'play-sequence', sequenceId: 'seq-1', behavior: 'resume' }]);
  });

  /** @description A seek tick beyond the selected sequence's durationTicks is rejected (no onChange call); a valid tick commits. */
  it('rejects a seek tick beyond the sequence duration but accepts a valid tick', () => {
    const actions: readonly SequenceActionDraft[] = [{ kind: 'seek-sequence', sequenceId: 'seq-2', tick: 0 }];
    const { onChange } = setup(actions);
    const row = screen.getByTestId('sm-transition-t-1-action-0');
    const tickInput = within(row).getByLabelText('Tick', { selector: 'input' });

    fireEvent.change(tickInput, { target: { value: '999' } });
    fireEvent.blur(tickInput);

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(tickInput, { target: { value: '25' } });
    fireEvent.blur(tickInput);

    expect(onChange).toHaveBeenCalledWith([{ kind: 'seek-sequence', sequenceId: 'seq-2', tick: 25 }]);
  });

  /**
   * @description Switching a seek-sequence action's sequence Select to a sequence with a smaller
   * durationTicks must clamp the stale tick down — never emit an out-of-bounds {sequenceId, tick}.
   */
  it('clamps the seek tick when switching to a sequence with a smaller duration', () => {
    const actions: readonly SequenceActionDraft[] = [{ kind: 'seek-sequence', sequenceId: 'seq-long', tick: 900 }];
    const { onChange } = setup(actions, LONG_SHORT_SEQUENCE_OPTIONS);
    const row = screen.getByTestId('sm-transition-t-1-action-0');

    fireEvent.click(within(row).getByRole('button', { name: /sequence/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Short' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'seek-sequence', sequenceId: 'seq-short', tick: 100 }]);
  });

  /** @description Switching to a sequence with a larger duration leaves an in-bounds tick unchanged. */
  it('keeps the seek tick unchanged when switching to a sequence with a larger duration', () => {
    const actions: readonly SequenceActionDraft[] = [{ kind: 'seek-sequence', sequenceId: 'seq-short', tick: 80 }];
    const { onChange } = setup(actions, LONG_SHORT_SEQUENCE_OPTIONS);
    const row = screen.getByTestId('sm-transition-t-1-action-0');

    fireEvent.click(within(row).getByRole('button', { name: /sequence/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Long' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'seek-sequence', sequenceId: 'seq-long', tick: 80 }]);
  });

  /**
   * @description When a seek action's sequenceId is not resolvable in sequenceOptions (an orphaned
   * reference), the tick's upper bound falls back to its own current value — it can be lowered but
   * never raised past a bound that can't be validated.
   */
  it('does not allow raising the tick when the action references a sequence missing from sequenceOptions', () => {
    const actions: readonly SequenceActionDraft[] = [{ kind: 'seek-sequence', sequenceId: 'seq-deleted', tick: 40 }];
    const { onChange } = setup(actions, LONG_SHORT_SEQUENCE_OPTIONS);
    const row = screen.getByTestId('sm-transition-t-1-action-0');
    const tickInput = within(row).getByLabelText('Tick', { selector: 'input' });

    fireEvent.change(tickInput, { target: { value: '50' } });
    fireEvent.blur(tickInput);

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(tickInput, { target: { value: '20' } });
    fireEvent.blur(tickInput);

    expect(onChange).toHaveBeenCalledWith([{ kind: 'seek-sequence', sequenceId: 'seq-deleted', tick: 20 }]);
  });

  /** @description Clicking Remove on a row emits the drafts array with that index removed. */
  it('removes an action at the given index', () => {
    const actions: readonly SequenceActionDraft[] = [
      { kind: 'stop-sequence', sequenceId: 'seq-1' },
      { kind: 'stop-sequence', sequenceId: 'seq-2' },
    ];
    const { onChange } = setup(actions);
    const row = screen.getByTestId('sm-transition-t-1-action-0');

    fireEvent.click(within(row).getByRole('button', { name: 'Remove action' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'stop-sequence', sequenceId: 'seq-2' }]);
  });

  /** @description Move-up swaps a row with its predecessor; the first row's move-up and the last row's move-down stay disabled. */
  it('moves an action up, swapping with the previous entry, and disables edge move buttons', () => {
    const actions: readonly SequenceActionDraft[] = [
      { kind: 'stop-sequence', sequenceId: 'seq-1' },
      { kind: 'stop-sequence', sequenceId: 'seq-2' },
    ];
    const { onChange } = setup(actions);
    const firstRow = screen.getByTestId('sm-transition-t-1-action-0');
    const secondRow = screen.getByTestId('sm-transition-t-1-action-1');

    expect(within(firstRow).getByRole('button', { name: 'Move action up' })).toBeDisabled();
    expect(within(secondRow).getByRole('button', { name: 'Move action down' })).toBeDisabled();

    fireEvent.click(within(secondRow).getByRole('button', { name: 'Move action up' }));

    expect(onChange).toHaveBeenCalledWith([
      { kind: 'stop-sequence', sequenceId: 'seq-2' },
      { kind: 'stop-sequence', sequenceId: 'seq-1' },
    ]);
  });

  /** @description With no sequence options available, the add-action kind select and button are both disabled so an invalid draft can never be built. */
  it('disables the add-action control when there are no sequence options', () => {
    setup([], []);

    const addControl = screen.getByTestId('sm-transition-t-1-add-action');

    expect(within(addControl).getByRole('button', { name: /action kind/i })).toBeDisabled();
    expect(within(addControl).getByRole('button', { name: 'Add action' })).toBeDisabled();
  });
});
