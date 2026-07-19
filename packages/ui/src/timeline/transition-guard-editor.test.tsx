import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { GuardClauseDraft, GuardDraft, GuardOperandOption } from './state-machine-editor-types';
import { TransitionGuardEditor } from './transition-guard-editor';

const OPERANDS: readonly GuardOperandOption[] = [
  { id: 'f1', label: 'Show Branding', valueType: 'boolean' },
  { id: 'f2', label: 'Match Period', valueType: 'string', enumValues: ['H1', 'H2'] },
  { id: 'f3', label: 'Score', valueType: 'number' },
];

function buildClause(overrides: Partial<GuardClauseDraft> = {}): GuardClauseDraft {
  return {
    id: 'clause-1',
    operandId: 'f1',
    operator: 'eq',
    literal: { valueType: 'boolean', value: false },
    ...overrides,
  };
}

interface SetupOptions {
  readonly guard?: GuardDraft | undefined;
  readonly guardIsAdvanced?: boolean;
  readonly operands?: readonly GuardOperandOption[];
}

function setup(options: SetupOptions = {}): { readonly onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();

  render(
    <TransitionGuardEditor
      guard={options.guard}
      guardIsAdvanced={options.guardIsAdvanced ?? false}
      operands={options.operands ?? OPERANDS}
      transitionId="t-1"
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe('TransitionGuardEditor', () => {
  /** @description An empty/undefined guard shows the no-guard hint; add-clause appends a default clause referencing operands[0]. */
  it('shows the no-guard hint and appends a default clause from the add-clause control', () => {
    const { onChange } = setup({ guard: undefined });

    expect(screen.getByText('No guard (always eligible)')).toBeTruthy();

    fireEvent.click(screen.getByTestId('sm-transition-t-1-guard-add-clause'));

    expect(onChange).toHaveBeenCalledWith({
      connective: 'all',
      clauses: [
        expect.objectContaining({
          operandId: 'f1',
          operator: 'eq',
          literal: { valueType: 'boolean', value: false },
        }),
      ],
    });
  });

  /** @description A boolean operand's operator Select offers only eq/neq, and its literal editor is a Switch. */
  it('restricts a boolean operand to eq/neq and renders a Switch literal', () => {
    setup({ guard: { connective: 'all', clauses: [buildClause()] } });

    const row = screen.getByTestId('sm-transition-t-1-guard-clause-0');

    expect(within(row).getByRole('switch', { name: 'Guard literal' })).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: /guard operator/i }));

    expect(screen.getByRole('option', { name: 'Equals' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Not equals' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Less than' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Greater than' })).toBeNull();
  });

  /** @description A number operand's operator Select offers all six operators, and its literal editor is a NumField. */
  it('offers all six operators for a number operand and renders a NumField literal', () => {
    setup({
      guard: {
        connective: 'all',
        clauses: [buildClause({ operandId: 'f3', operator: 'gte', literal: { valueType: 'number', value: 12 } })],
      },
    });

    const row = screen.getByTestId('sm-transition-t-1-guard-clause-0');

    expect(within(row).getByLabelText('Guard literal', { selector: 'input' })).toBeTruthy();

    fireEvent.click(within(row).getByRole('button', { name: /guard operator/i }));

    expect(screen.getByRole('option', { name: 'Equals' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Not equals' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Less than' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Less than or equal' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Greater than' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Greater than or equal' })).toBeTruthy();
  });

  /** @description An enum-schema string operand renders a Select literal populated from operand.enumValues. */
  it('renders a Select literal over enumValues for an enum string operand', () => {
    setup({
      guard: {
        connective: 'all',
        clauses: [buildClause({ operandId: 'f2', operator: 'eq', literal: { valueType: 'string', value: 'H1' } })],
      },
    });

    const row = screen.getByTestId('sm-transition-t-1-guard-clause-0');

    fireEvent.click(within(row).getByRole('button', { name: /guard literal/i }));

    expect(screen.getByRole('option', { name: 'H1' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'H2' })).toBeTruthy();
  });

  /** @description Switching the connective Select to Any emits onChange with connective 'any'. */
  it('emits connective "any" when the connective Select is switched to Any', () => {
    const { onChange } = setup({ guard: { connective: 'all', clauses: [buildClause()] } });

    const connectiveSelect = screen.getByTestId('sm-transition-t-1-guard-connective');

    fireEvent.click(within(connectiveSelect).getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: 'Any' }));

    expect(onChange).toHaveBeenCalledWith({ connective: 'any', clauses: [buildClause()] });
  });

  /** @description Removing a clause emits onChange with that clause dropped and the rest preserved in order. */
  it('removes a clause at the given index', () => {
    const clauseA = buildClause({ id: 'clause-a', operandId: 'f1' });
    const clauseB = buildClause({ id: 'clause-b', operandId: 'f3', operator: 'gt', literal: { valueType: 'number', value: 1 } });
    const { onChange } = setup({ guard: { connective: 'all', clauses: [clauseA, clauseB] } });

    fireEvent.click(
      within(screen.getByTestId('sm-transition-t-1-guard-clause-0')).getByRole('button', { name: 'Remove clause' }),
    );

    expect(onChange).toHaveBeenCalledWith({ connective: 'all', clauses: [clauseB] });
  });

  /** @description With no operands available, the add-clause button is disabled so an empty-operandId clause can never be emitted. */
  it('disables the add-clause control when operands is empty', () => {
    setup({ guard: undefined, operands: [] });

    expect(screen.getByTestId('sm-transition-t-1-guard-add-clause')).toBeDisabled();
  });

  /** @description An advanced (non-flat) guard renders read-only with no clause editors; Clear guard emits an empty-clauses draft. */
  it('renders an advanced guard read-only and clears it', () => {
    const { onChange } = setup({ guard: undefined, guardIsAdvanced: true });

    expect(screen.getByText('Advanced guard (edit not supported)')).toBeTruthy();
    expect(screen.queryByTestId('sm-transition-t-1-guard-clause-0')).toBeNull();
    expect(screen.queryByTestId('sm-transition-t-1-guard-add-clause')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear guard' }));

    expect(onChange).toHaveBeenCalledWith({ connective: 'all', clauses: [] });
  });
});
