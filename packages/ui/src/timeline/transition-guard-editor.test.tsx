import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import type { GuardComparisonDraft, GuardDraft, GuardGroupDraft, GuardOperandOption } from './state-machine-editor-types';
import { TransitionGuardEditor } from './transition-guard-editor';

const OPERANDS: readonly GuardOperandOption[] = [
  { id: 'f1', label: 'Show Branding', valueType: 'boolean' },
  { id: 'f2', label: 'Match Period', valueType: 'string', enumValues: ['H1', 'H2'] },
  { id: 'f3', label: 'Score', valueType: 'number' },
];

function buildComparison(overrides: Partial<GuardComparisonDraft> = {}): GuardComparisonDraft {
  return {
    kind: 'comparison',
    id: 'cmp-1',
    operandId: 'f1',
    operator: 'eq',
    literal: { valueType: 'boolean', value: false },
    ...overrides,
  };
}

function buildGroup(overrides: Partial<GuardGroupDraft> = {}): GuardGroupDraft {
  return {
    kind: 'group',
    id: 'grp-root',
    connective: 'all',
    negated: false,
    children: [],
    ...overrides,
  };
}

const DATE_TIME_OPERAND: GuardOperandOption = { id: 'f4', label: 'Kickoff', valueType: 'date-time' };
const VALID_UTC_TIMESTAMP = '2025-06-01T12:00:00Z';
const INVALID_UTC_TIMESTAMP = 'not-a-date';
const NESTED_GROUP_ID = 'grp-nested';

interface SetupOptions {
  readonly guard?: GuardDraft | undefined;
  readonly guardIsAdvanced?: boolean;
  readonly operands?: readonly GuardOperandOption[];
  readonly isValidDateTimeLiteral?: (value: string) => boolean;
}

function setup(options: SetupOptions = {}): { readonly onChange: Mock<(guard: GuardDraft) => void> } {
  const onChange = vi.fn<(guard: GuardDraft) => void>();

  render(
    <TransitionGuardEditor
      guard={options.guard}
      guardIsAdvanced={options.guardIsAdvanced ?? false}
      operands={options.operands ?? OPERANDS}
      transitionId="t-1"
      onChange={onChange}
      {...(options.isValidDateTimeLiteral === undefined ?
        {}
      : { isValidDateTimeLiteral: options.isValidDateTimeLiteral })}
    />,
  );

  return { onChange };
}

describe('TransitionGuardEditor', () => {
  /** @description An empty/undefined root group shows the no-guard hint; add-condition appends a default comparison referencing operands[0]. */
  it('shows the no-guard hint and appends a default comparison from the add-condition control', () => {
    const { onChange } = setup({ guard: undefined });

    expect(screen.getByText('No guard (always eligible)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'group',
        connective: 'all',
        negated: false,
        children: [
          expect.objectContaining({
            kind: 'comparison',
            operandId: 'f1',
            operator: 'eq',
            literal: { valueType: 'boolean', value: false },
          }),
        ],
      }),
    );
  });

  /** @description A boolean operand's operator Select offers only eq/neq, and its literal editor is a Switch. */
  it('restricts a boolean operand to eq/neq and renders a Switch literal', () => {
    setup({ guard: buildGroup({ children: [buildComparison()] }) });

    const row = screen.getByTestId('sm-guard-comparison-cmp-1');

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
      guard: buildGroup({
        children: [
          buildComparison({ operandId: 'f3', operator: 'gte', literal: { valueType: 'number', value: 12 } }),
        ],
      }),
    });

    const row = screen.getByTestId('sm-guard-comparison-cmp-1');

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
      guard: buildGroup({
        children: [
          buildComparison({ operandId: 'f2', operator: 'eq', literal: { valueType: 'string', value: 'H1' } }),
        ],
      }),
    });

    const row = screen.getByTestId('sm-guard-comparison-cmp-1');

    fireEvent.click(within(row).getByRole('button', { name: /guard literal/i }));

    expect(screen.getByRole('option', { name: 'H1' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'H2' })).toBeTruthy();
  });

  /** @description Switching the root connective Select to Any emits a root group with connective 'any'. */
  it('emits connective "any" when the root connective Select is switched to Any', () => {
    const rootGroup = buildGroup({ children: [buildComparison()] });
    const { onChange } = setup({ guard: rootGroup });

    fireEvent.click(screen.getByRole('button', { name: /guard connective/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Any' }));

    expect(onChange).toHaveBeenCalledWith({ ...rootGroup, connective: 'any' });
  });

  /** @description Switching the NOT toggle on emits the root group with negated:true. */
  it('emits negated:true when the NOT toggle is switched on', () => {
    const rootGroup = buildGroup({ children: [buildComparison()] });
    const { onChange } = setup({ guard: rootGroup });

    fireEvent.click(screen.getByRole('switch', { name: 'Negate group' }));

    expect(onChange).toHaveBeenCalledWith({ ...rootGroup, negated: true });
  });

  /** @description The root group renders no "Remove group" control — only non-root groups are removable. */
  it('does not render a remove-group control for the root group', () => {
    setup({ guard: buildGroup({ children: [buildComparison()] }) });

    expect(screen.queryByRole('button', { name: 'Remove group' })).toBeNull();
  });

  /**
   * @description "Add group" on the root appends a nested group seeded with exactly one default
   * comparison child (operands[0], its first legal operator, a type-default literal), leaving
   * existing children untouched. A nested group must NOT be left empty: the editor is fully
   * controlled from a store-derived `ExpressionAst`, and the guard translation drops empty AND/OR
   * groups entirely (no model representation) — an empty nested group would be pruned on the very
   * next round-trip, before the user could ever add a condition inside it, making nesting
   * impossible to create through the UI. The root group staying empty when it has no children is a
   * separate, still-correct case ("no guard") — see the no-guard-hint test.
   */
  it('appends a nested group seeded with one default comparison via the root add-group control', () => {
    const rootComparison = buildComparison({ id: 'cmp-root' });
    const rootGroup = buildGroup({ children: [rootComparison] });
    const { onChange } = setup({ guard: rootGroup });

    fireEvent.click(screen.getByRole('button', { name: 'Add group' }));

    expect(onChange).toHaveBeenCalledWith({
      ...rootGroup,
      children: [
        rootComparison,
        expect.objectContaining({
          kind: 'group',
          connective: 'all',
          negated: false,
          children: [
            expect.objectContaining({
              kind: 'comparison',
              operandId: 'f1',
              operator: 'eq',
              literal: { valueType: 'boolean', value: false },
            }),
          ],
        }),
      ],
    });
  });

  /** @description "Add group" is disabled (like "Add condition") when there are no operands to default a seed comparison from. */
  it('disables the add-group control when operands is empty', () => {
    setup({ guard: undefined, operands: [] });

    expect(screen.getByRole('button', { name: 'Add group' })).toBeDisabled();
  });

  /** @description Adding a condition inside a nested group only updates that group's children — sibling nodes at every level are preserved. */
  it('scopes an inner add-condition to only the nested group children', () => {
    const rootComparison = buildComparison({ id: 'cmp-root' });
    const nestedComparison = buildComparison({
      id: 'cmp-nested',
      operandId: 'f3',
      operator: 'gt',
      literal: { valueType: 'number', value: 1 },
    });
    const nestedGroup = buildGroup({ id: NESTED_GROUP_ID, children: [nestedComparison] });
    const rootGroup = buildGroup({ children: [rootComparison, nestedGroup] });
    const { onChange } = setup({ guard: rootGroup });

    const nestedGroupEl = screen.getByTestId(`sm-guard-group-${NESTED_GROUP_ID}`);

    fireEvent.click(within(nestedGroupEl).getByRole('button', { name: 'Add condition' }));

    expect(onChange).toHaveBeenCalledWith({
      ...rootGroup,
      children: [
        rootComparison,
        {
          ...nestedGroup,
          children: [nestedComparison, expect.objectContaining({ kind: 'comparison', operandId: 'f1', operator: 'eq' })],
        },
      ],
    });
  });

  /** @description Removing a nested comparison removes only it — the sibling nested comparison and the root-level comparison are preserved. */
  it('removes a nested comparison without affecting siblings', () => {
    const rootComparison = buildComparison({ id: 'cmp-root' });
    const nestedComparisonA = buildComparison({
      id: 'cmp-nested-a',
      operandId: 'f3',
      operator: 'gt',
      literal: { valueType: 'number', value: 1 },
    });
    const nestedComparisonB = buildComparison({
      id: 'cmp-nested-b',
      operandId: 'f3',
      operator: 'lt',
      literal: { valueType: 'number', value: 5 },
    });
    const nestedGroup = buildGroup({ id: NESTED_GROUP_ID, children: [nestedComparisonA, nestedComparisonB] });
    const rootGroup = buildGroup({ children: [rootComparison, nestedGroup] });
    const { onChange } = setup({ guard: rootGroup });

    const nestedRow = screen.getByTestId('sm-guard-comparison-cmp-nested-a');

    fireEvent.click(within(nestedRow).getByRole('button', { name: 'Remove condition' }));

    expect(onChange).toHaveBeenCalledWith({
      ...rootGroup,
      children: [rootComparison, { ...nestedGroup, children: [nestedComparisonB] }],
    });
  });

  /** @description Removing a nested group removes it and all of its children in a single action, leaving the rest of the tree untouched. */
  it('removes a nested group and all of its children in one action', () => {
    const rootComparison = buildComparison({ id: 'cmp-root' });
    const nestedComparison = buildComparison({ id: 'cmp-nested', operandId: 'f3' });
    const nestedGroup = buildGroup({ id: NESTED_GROUP_ID, children: [nestedComparison] });
    const rootGroup = buildGroup({ children: [rootComparison, nestedGroup] });
    const { onChange } = setup({ guard: rootGroup });

    const nestedGroupEl = screen.getByTestId(`sm-guard-group-${NESTED_GROUP_ID}`);

    fireEvent.click(within(nestedGroupEl).getByRole('button', { name: 'Remove group' }));

    expect(onChange).toHaveBeenCalledWith({ ...rootGroup, children: [rootComparison] });
  });

  /** @description With no operands available, every add-condition control is disabled so an empty-operandId comparison can never be emitted. */
  it('disables the add-condition control when operands is empty', () => {
    setup({ guard: undefined, operands: [] });

    expect(screen.getByRole('button', { name: 'Add condition' })).toBeDisabled();
  });

  /** @description An advanced (non-tree) guard renders read-only with no group/comparison editors; Clear guard emits an empty root group. */
  it('renders an advanced guard read-only and clears it to an empty root group', () => {
    const { onChange } = setup({ guard: undefined, guardIsAdvanced: true });

    expect(screen.getByText('Advanced guard (edit not supported)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add condition' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add group' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear guard' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'group', connective: 'all', negated: false, children: [] }),
    );
  });

  /**
   * @description Regression for the date-time silent-no-op (PR-F final review, FIX 1): the model's
   * `utcTimestampSchema` rejects `''`, so a fresh date-time comparison must default to a
   * schema-valid ISO timestamp, not the empty string, or downstream
   * `guardDraftToExpression -> upsertTransition` rejects the whole edit with zero feedback.
   */
  it('defaults a fresh date-time comparison literal to a valid, non-empty ISO timestamp', () => {
    const { onChange } = setup({ guard: undefined, operands: [DATE_TIME_OPERAND] });

    fireEvent.click(screen.getByRole('button', { name: 'Add condition' }));

    expect(onChange).toHaveBeenCalledTimes(1);

    const emittedGuard = onChange.mock.calls[0]?.[0];

    if (emittedGuard === undefined) throw new Error('Expected onChange to receive a guard draft');

    const emittedComparison = emittedGuard.children[0];

    if (emittedComparison?.kind !== 'comparison') {
      throw new Error('Expected a comparison child');
    }

    expect(emittedComparison.literal.valueType).toBe('date-time');
    expect(emittedComparison.literal.value).not.toBe('');
    expect(typeof emittedComparison.literal.value).toBe('string');
  });

  /**
   * @description Regression for the date-time silent-no-op (PR-F final review, FIX 1): typing an
   * invalid date-time string into the literal Input must NOT emit `onChange` (an invalid literal
   * must never reach the committed guard) and must mark the Input `aria-invalid`; typing a valid
   * ISO string emits it and clears the invalid marker.
   */
  it('gates date-time literal onChange on isValidDateTimeLiteral and marks the Input invalid', () => {
    const isValidDateTimeLiteral = (value: string): boolean =>
      value === VALID_UTC_TIMESTAMP || value === '2000-01-01T00:00:00Z';
    const dateTimeComparison = buildComparison({
      operandId: 'f4',
      literal: { valueType: 'date-time', value: '2000-01-01T00:00:00Z' },
    });
    const rootGroup = buildGroup({ children: [dateTimeComparison] });
    const { onChange } = setup({
      guard: rootGroup,
      operands: [DATE_TIME_OPERAND],
      isValidDateTimeLiteral,
    });

    const row = screen.getByTestId('sm-guard-comparison-cmp-1');
    const input = within(row).getByLabelText('Guard literal', { selector: 'input' });

    fireEvent.change(input, { target: { value: INVALID_UTC_TIMESTAMP } });

    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: VALID_UTC_TIMESTAMP } });

    expect(onChange).toHaveBeenCalledWith({
      ...rootGroup,
      children: [{ ...dateTimeComparison, literal: { valueType: 'date-time', value: VALID_UTC_TIMESTAMP } }],
    });
    expect(input.getAttribute('aria-invalid')).not.toBe('true');
  });
});
