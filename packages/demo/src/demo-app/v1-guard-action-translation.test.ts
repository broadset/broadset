import { projectFormatV1 } from '@broadset/model';
import type { GuardDraft, SequenceActionDraft } from '@broadset/ui';
import { describe, expect, it } from 'vitest';

import {
  actionDraftToModel,
  actionsDraftToModel,
  actionToDraft,
  buildGuardOperands,
  expressionToGuard,
  guardDraftToExpression,
  guardOperandId,
  literalToTypedValue,
} from './v1-guard-action-translation';
import { buildProjectFixture, id, stripGuardIds } from './v1-guard-action-translation.test-support';

const SEEK_TICK = 500;
const SCORE_THRESHOLD = 10;
const NESTED_GUARD_SCORE_THRESHOLD = 3;
const ARITHMETIC_LITERAL_VALUE = 1;
const RED_CHANNEL = 1;
const NO_CHANNEL = 0;
const OPAQUE_ALPHA = 1;

describe('guardOperandId', () => {
  it('formats field and variable refs deterministically', () => {
    expect(guardOperandId({ kind: 'field', viewModelId: id('vm'), fieldId: id('fld') })).toBe('field:vm:fld');
    expect(guardOperandId({ kind: 'variable', collectionId: id('col'), variableId: id('var') })).toBe(
      'variable:col:var',
    );
  });
});

describe('buildGuardOperands', () => {
  it('maps supported field/variable value types and omits unsupported kinds', () => {
    const fixture = buildProjectFixture({});
    const { options, refById } = buildGuardOperands({ document: fixture.document, project: fixture.project });
    const byId = new Map(options.map((option) => [option.id, option]));

    expect(
      byId.get(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId })),
    ).toMatchObject({
      label: 'Live Data / Show Branding',
      valueType: 'boolean',
    });
    expect(
      byId.get(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.stringFieldId })),
    ).toMatchObject({ label: 'Live Data / Team Name', valueType: 'string' });
    expect(
      byId.get(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.enumFieldId })),
    ).toMatchObject({ label: 'Live Data / Period', valueType: 'string', enumValues: ['first', 'second'] });
    expect(
      byId.get(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.numberFieldId })),
    ).toMatchObject({ label: 'Live Data / Margin', valueType: 'number' });
    expect(
      byId.get(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.integerFieldId })),
    ).toMatchObject({ label: 'Live Data / fouls', valueType: 'integer' });
    expect(
      byId.get(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.dateFieldId })),
    ).toMatchObject({ label: 'Live Data / Kickoff', valueType: 'date-time' });
    expect(
      byId.has(guardOperandId({ kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.colorFieldId })),
    ).toBe(false);

    expect(
      byId.get(
        guardOperandId({ kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.scoreVariableId }),
      ),
    ).toMatchObject({ label: 'Globals / Score', valueType: 'number' });
    expect(
      byId.get(
        guardOperandId({ kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.flagVariableId }),
      ),
    ).toMatchObject({ label: 'Globals / Ready', valueType: 'boolean' });
    expect(
      byId.has(
        guardOperandId({ kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.lengthVariableId }),
      ),
    ).toBe(false);

    for (const option of options) {
      expect(refById.get(option.id)).toBeDefined();
    }
  });
});

describe('literalToTypedValue', () => {
  it('maps every GuardValueType to its TypedValue variant exactly', () => {
    expect(literalToTypedValue({ valueType: 'boolean', value: true })).toEqual({ type: 'boolean', value: true });
    expect(literalToTypedValue({ valueType: 'integer', value: 7 })).toEqual({ type: 'integer', value: 7 });
    expect(literalToTypedValue({ valueType: 'number', value: 3.5 })).toEqual({ type: 'number', value: 3.5 });
    expect(literalToTypedValue({ valueType: 'string', value: 'Home' })).toEqual({ type: 'string', value: 'Home' });
    expect(literalToTypedValue({ valueType: 'date-time', value: '2025-01-01T00:00:00Z' })).toEqual({
      type: 'date-time',
      value: '2025-01-01T00:00:00Z',
    });
  });
});

describe('guardDraftToExpression', () => {
  const fixture = buildProjectFixture({});
  const { refById } = buildGuardOperands({ document: fixture.document, project: fixture.project });
  const boolOperandId = guardOperandId({
    kind: 'field',
    viewModelId: fixture.viewModelId,
    fieldId: fixture.boolFieldId,
  });
  const scoreOperandId = guardOperandId({
    kind: 'variable',
    collectionId: fixture.collectionId,
    variableId: fixture.scoreVariableId,
  });
  const flagOperandId = guardOperandId({
    kind: 'variable',
    collectionId: fixture.collectionId,
    variableId: fixture.flagVariableId,
  });
  const boolEqTrue = (nodeId: string): GuardDraft['children'][number] => ({
    kind: 'comparison',
    id: nodeId,
    operandId: boolOperandId,
    operator: 'eq',
    literal: { valueType: 'boolean', value: true },
  });

  it('returns undefined for an empty root group', () => {
    expect(
      guardDraftToExpression({
        draft: { kind: 'group', id: 'root', connective: 'all', negated: false, children: [] },
        refById,
      }),
    ).toBeUndefined();
  });

  it('builds the exact binary comparison for a single comparison child, with no group wrapper', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [boolEqTrue('c0')],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
  });

  it('left-folds two comparisons under the "any" connective into an or of comparisons', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'any',
      negated: false,
      children: [
        boolEqTrue('c0'),
        {
          kind: 'comparison',
          id: 'c1',
          operandId: scoreOperandId,
          operator: 'eq',
          literal: { valueType: 'number', value: 3 },
        },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'or',
      left: {
        kind: 'binary',
        operator: 'eq',
        left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
        right: { kind: 'literal', value: { type: 'boolean', value: true } },
      },
      right: {
        kind: 'binary',
        operator: 'eq',
        left: { kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.scoreVariableId },
        right: { kind: 'literal', value: { type: 'number', value: 3 } },
      },
    });
  });

  it('wraps a negated group in a unary not', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: true,
      children: [boolEqTrue('c0')],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'unary',
      operator: 'not',
      operand: {
        kind: 'binary',
        operator: 'eq',
        left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
        right: { kind: 'literal', value: { type: 'boolean', value: true } },
      },
    });
  });

  it('folds a NESTED group (root all, children=[c1, group{any,[c2,c3]}]) into and(c1, or(c2,c3))', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        boolEqTrue('c0'),
        {
          kind: 'group',
          id: 'inner',
          connective: 'any',
          negated: false,
          children: [
            {
              kind: 'comparison',
              id: 'c1',
              operandId: scoreOperandId,
              operator: 'gte',
              literal: { valueType: 'number', value: SCORE_THRESHOLD },
            },
            {
              kind: 'comparison',
              id: 'c2',
              operandId: flagOperandId,
              operator: 'neq',
              literal: { valueType: 'boolean', value: false },
            },
          ],
        },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'and',
      left: {
        kind: 'binary',
        operator: 'eq',
        left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
        right: { kind: 'literal', value: { type: 'boolean', value: true } },
      },
      right: {
        kind: 'binary',
        operator: 'or',
        left: {
          kind: 'binary',
          operator: 'gte',
          left: { kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.scoreVariableId },
          right: { kind: 'literal', value: { type: 'number', value: SCORE_THRESHOLD } },
        },
        right: {
          kind: 'binary',
          operator: 'neq',
          left: { kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.flagVariableId },
          right: { kind: 'literal', value: { type: 'boolean', value: false } },
        },
      },
    });
  });

  it('drops comparisons with an unresolvable operandId instead of throwing', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'c0',
          operandId: 'field:missing:missing',
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        boolEqTrue('c1'),
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
  });

  it('drops an unresolvable comparison nested inside a sub-group, without dropping the whole sub-group', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        boolEqTrue('c0'),
        {
          kind: 'group',
          id: 'inner',
          connective: 'any',
          negated: false,
          children: [
            {
              kind: 'comparison',
              id: 'c1',
              operandId: 'field:missing:missing',
              operator: 'eq',
              literal: { valueType: 'boolean', value: true },
            },
            {
              kind: 'comparison',
              id: 'c2',
              operandId: scoreOperandId,
              operator: 'eq',
              literal: { valueType: 'number', value: 3 },
            },
          ],
        },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'and',
      left: {
        kind: 'binary',
        operator: 'eq',
        left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
        right: { kind: 'literal', value: { type: 'boolean', value: true } },
      },
      right: {
        kind: 'binary',
        operator: 'eq',
        left: { kind: 'variable', collectionId: fixture.collectionId, variableId: fixture.scoreVariableId },
        right: { kind: 'literal', value: { type: 'number', value: 3 } },
      },
    });
  });

  it('returns undefined when every comparison is unresolvable', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'c0',
          operandId: 'field:missing:missing',
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toBeUndefined();
  });

  it('drops a nested sub-group that is empty (or becomes empty), leaving its siblings untouched', () => {
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        boolEqTrue('c0'),
        { kind: 'group', id: 'empty-inner', connective: 'all', negated: false, children: [] },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
  });
});

describe('round trip: guardDraftToExpression -> expressionToGuard', () => {
  const fixture = buildProjectFixture({});
  const { refById } = buildGuardOperands({ document: fixture.document, project: fixture.project });
  const boolOperandId = guardOperandId({
    kind: 'field',
    viewModelId: fixture.viewModelId,
    fieldId: fixture.boolFieldId,
  });
  const integerOperandId = guardOperandId({
    kind: 'field',
    viewModelId: fixture.viewModelId,
    fieldId: fixture.integerFieldId,
  });
  const dateOperandId = guardOperandId({
    kind: 'field',
    viewModelId: fixture.viewModelId,
    fieldId: fixture.dateFieldId,
  });
  const scoreOperandId = guardOperandId({
    kind: 'variable',
    collectionId: fixture.collectionId,
    variableId: fixture.scoreVariableId,
  });
  const flagOperandId = guardOperandId({
    kind: 'variable',
    collectionId: fixture.collectionId,
    variableId: fixture.flagVariableId,
  });

  const cases: readonly GuardDraft[] = [
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
      ],
    },
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: flagOperandId,
          operator: 'neq',
          literal: { valueType: 'boolean', value: false },
        },
      ],
    },
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'comparison',
          id: 'y',
          operandId: scoreOperandId,
          operator: 'gte',
          literal: { valueType: 'number', value: 5 },
        },
      ],
    },
    {
      kind: 'group',
      id: 'root',
      connective: 'any',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: integerOperandId,
          operator: 'lt',
          literal: { valueType: 'integer', value: 2 },
        },
        {
          kind: 'comparison',
          id: 'y',
          operandId: dateOperandId,
          operator: 'lte',
          literal: { valueType: 'date-time', value: '2025-06-01T00:00:00Z' },
        },
      ],
    },
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'comparison',
          id: 'y',
          operandId: scoreOperandId,
          operator: 'gte',
          literal: { valueType: 'number', value: 5 },
        },
        {
          kind: 'comparison',
          id: 'z',
          operandId: integerOperandId,
          operator: 'neq',
          literal: { valueType: 'integer', value: 0 },
        },
      ],
    },
    // Negated root wrapping multiple children: NOT(bool = true AND flag != false).
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: true,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'comparison',
          id: 'y',
          operandId: flagOperandId,
          operator: 'neq',
          literal: { valueType: 'boolean', value: false },
        },
      ],
    },
    // 2-level nesting: bool = true AND (integer < 2 OR date <= X).
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'group',
          id: 'inner',
          connective: 'any',
          negated: false,
          children: [
            {
              kind: 'comparison',
              id: 'y',
              operandId: integerOperandId,
              operator: 'lt',
              literal: { valueType: 'integer', value: 2 },
            },
            {
              kind: 'comparison',
              id: 'z',
              operandId: dateOperandId,
              operator: 'lte',
              literal: { valueType: 'date-time', value: '2025-06-01T00:00:00Z' },
            },
          ],
        },
      ],
    },
    // 2-level nesting with the inner group negated: bool = true AND NOT(score >= 5 OR integer != 0).
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'group',
          id: 'inner',
          connective: 'any',
          negated: true,
          children: [
            {
              kind: 'comparison',
              id: 'y',
              operandId: scoreOperandId,
              operator: 'gte',
              literal: { valueType: 'number', value: 5 },
            },
            {
              kind: 'comparison',
              id: 'z',
              operandId: integerOperandId,
              operator: 'neq',
              literal: { valueType: 'integer', value: 0 },
            },
          ],
        },
      ],
    },
    // 3-level nesting: bool = true AND (score >= 5 OR (integer != 0 AND date <= X)).
    {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'x',
          operandId: boolOperandId,
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'group',
          id: 'mid',
          connective: 'any',
          negated: false,
          children: [
            {
              kind: 'comparison',
              id: 'y',
              operandId: scoreOperandId,
              operator: 'gte',
              literal: { valueType: 'number', value: 5 },
            },
            {
              kind: 'group',
              id: 'deep',
              connective: 'all',
              negated: false,
              children: [
                {
                  kind: 'comparison',
                  id: 'z',
                  operandId: integerOperandId,
                  operator: 'neq',
                  literal: { valueType: 'integer', value: 0 },
                },
                {
                  kind: 'comparison',
                  id: 'w',
                  operandId: dateOperandId,
                  operator: 'lte',
                  literal: { valueType: 'date-time', value: '2025-06-01T00:00:00Z' },
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  cases.forEach((draft, index) => {
    it(`round-trips case ${String(index)} without flagging it advanced`, () => {
      const expression = guardDraftToExpression({ draft, refById });

      if (expression === undefined) throw new Error('Expected an expression for a non-empty guard');

      const result = expressionToGuard({ expression, refById });

      expect(result.guardIsAdvanced).toBe(false);

      if (result.guard === undefined) throw new Error('Expected a resolved guard draft');

      expect(stripGuardIds(result.guard)).toEqual(stripGuardIds(draft));
    });
  });
});

describe('expressionToGuard: nested and/or trees are directly representable', () => {
  it('parses a nested and(or(eq,eq), eq) expression into a 2-level nested group tree with deterministic path ids', () => {
    const fixture = buildProjectFixture({});
    const { refById } = buildGuardOperands({ document: fixture.document, project: fixture.project });
    const boolOperandId = guardOperandId({
      kind: 'field',
      viewModelId: fixture.viewModelId,
      fieldId: fixture.boolFieldId,
    });
    const booleanFieldExpr: projectFormatV1.ExpressionAst = {
      kind: 'field',
      viewModelId: fixture.viewModelId,
      fieldId: fixture.boolFieldId,
    };
    const eqTrue = (): projectFormatV1.ExpressionAst => ({
      kind: 'binary',
      operator: 'eq',
      left: booleanFieldExpr,
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'and',
      left: { kind: 'binary', operator: 'or', left: eqTrue(), right: eqTrue() },
      right: eqTrue(),
    };
    const literal = { valueType: 'boolean' as const, value: true };

    const result = expressionToGuard({ expression, refById });

    expect(result.guardIsAdvanced).toBe(false);
    expect(result.guard).toEqual({
      kind: 'group',
      id: 'grp-root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'group',
          id: 'grp-0',
          connective: 'any',
          negated: false,
          children: [
            { kind: 'comparison', id: 'cmp-0-0', operandId: boolOperandId, operator: 'eq', literal },
            { kind: 'comparison', id: 'cmp-0-1', operandId: boolOperandId, operator: 'eq', literal },
          ],
        },
        { kind: 'comparison', id: 'cmp-1', operandId: boolOperandId, operator: 'eq', literal },
      ],
    });
  });

  it('parses not(and(eq,eq)) by flipping negated on the reused inner group, not by adding another level', () => {
    const fixture = buildProjectFixture({});
    const { refById } = buildGuardOperands({ document: fixture.document, project: fixture.project });
    const boolOperandId = guardOperandId({
      kind: 'field',
      viewModelId: fixture.viewModelId,
      fieldId: fixture.boolFieldId,
    });
    const booleanFieldExpr: projectFormatV1.ExpressionAst = {
      kind: 'field',
      viewModelId: fixture.viewModelId,
      fieldId: fixture.boolFieldId,
    };
    const eqTrue = (): projectFormatV1.ExpressionAst => ({
      kind: 'binary',
      operator: 'eq',
      left: booleanFieldExpr,
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'unary',
      operator: 'not',
      operand: { kind: 'binary', operator: 'and', left: eqTrue(), right: eqTrue() },
    };
    const literal = { valueType: 'boolean' as const, value: true };

    const result = expressionToGuard({ expression, refById });

    expect(result.guardIsAdvanced).toBe(false);
    expect(result.guard).toEqual({
      kind: 'group',
      id: 'grp-root',
      connective: 'all',
      negated: true,
      children: [
        { kind: 'comparison', id: 'cmp-0', operandId: boolOperandId, operator: 'eq', literal },
        { kind: 'comparison', id: 'cmp-1', operandId: boolOperandId, operator: 'eq', literal },
      ],
    });
  });
});

describe('expressionToGuard: advanced (non-representable) guards', () => {
  const fixture = buildProjectFixture({});
  const { refById } = buildGuardOperands({ document: fixture.document, project: fixture.project });
  const booleanFieldExpr: projectFormatV1.ExpressionAst = {
    kind: 'field',
    viewModelId: fixture.viewModelId,
    fieldId: fixture.boolFieldId,
  };
  const stringFieldExpr: projectFormatV1.ExpressionAst = {
    kind: 'field',
    viewModelId: fixture.viewModelId,
    fieldId: fixture.stringFieldId,
  };

  it('returns { guard: undefined, guardIsAdvanced: false } when there is no guard', () => {
    expect(expressionToGuard({ expression: undefined, refById })).toEqual({ guard: undefined, guardIsAdvanced: false });
  });

  /**
   * A `not` of a bare field reference (not a comparison, and not an and/or group) has nothing for
   * the `not(E)` parse rule to reuse or wrap into a comparison leaf — this stays advanced even
   * though `not` of a COMPARISON or a GROUP is now fully representable (see the "directly
   * representable" describe block above).
   */
  it('flags a not-of-a-bare-field (neither a comparison nor a group) as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = { kind: 'unary', operator: 'not', operand: booleanFieldExpr };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  it('flags a safe-function call as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'safe-function',
      functionId: 'length',
      arguments: [stringFieldExpr],
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  it('flags a "get" expression as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = { kind: 'get', source: booleanFieldExpr, fieldId: id('nested') };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  it('flags an "index" expression as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'index',
      source: stringFieldExpr,
      index: { kind: 'literal', value: { type: 'integer', value: 0 } },
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  it('flags a comparison whose right side is a field, not a literal, as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'eq',
      left: booleanFieldExpr,
      right: stringFieldExpr,
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  it('flags a comparison referencing a removed field as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId: id('vm-missing'), fieldId: id('field-missing') },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  /**
   * A top-level arithmetic binary (`add`) is a `binary` node, so it clears the `and`/`or`/`not`
   * checks in `parseGuardExpression` and reaches `parseComparisonLeaf` as a single leaf — this
   * exercises the `isComparisonOperator` rejection specifically.
   */
  it('flags a top-level arithmetic binary (add) as advanced', () => {
    const numberFieldExpr: projectFormatV1.ExpressionAst = {
      kind: 'field',
      viewModelId: fixture.viewModelId,
      fieldId: fixture.numberFieldId,
    };
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'add',
      left: numberFieldExpr,
      right: { kind: 'literal', value: { type: 'number', value: ARITHMETIC_LITERAL_VALUE } },
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  /** A comparison's LEFT side must be a field/variable operand; a literal on the left has no `GuardOperandRef` to resolve. */
  it('flags a comparison whose left side is a literal, not a field/variable, as advanced', () => {
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'literal', value: { type: 'boolean', value: true } },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  /** `typedValueToLiteral` only maps boolean/integer/number/string/date-time; a `color` literal has no `GuardValueType` representation. */
  it('flags a comparison whose right literal has a TypedValue type outside GuardValueType (color) as advanced', () => {
    const colorLiteral: projectFormatV1.TypedValue = {
      type: 'color',
      value: { kind: 'color', space: 'srgb', channels: [RED_CHANNEL, NO_CHANNEL, NO_CHANNEL], alpha: OPAQUE_ALPHA },
    };
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'eq',
      left: booleanFieldExpr,
      right: { kind: 'literal', value: colorLiteral },
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });

  /**
   * A single unparseable leaf ANYWHERE in an otherwise fully-nestable tree still poisons the WHOLE
   * guard — a guard tree has no way to show "3 of 4 clauses" read-only inside an editable group.
   */
  it('flags the whole guard as advanced when one leaf inside an otherwise-nestable and/or tree fails to parse', () => {
    const eqTrue = (): projectFormatV1.ExpressionAst => ({
      kind: 'binary',
      operator: 'eq',
      left: booleanFieldExpr,
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
    const numberFieldExpr: projectFormatV1.ExpressionAst = {
      kind: 'field',
      viewModelId: fixture.viewModelId,
      fieldId: fixture.numberFieldId,
    };
    const badArithmeticLeaf: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'add',
      left: numberFieldExpr,
      right: { kind: 'literal', value: { type: 'number', value: ARITHMETIC_LITERAL_VALUE } },
    };
    const expression: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'and',
      left: eqTrue(),
      right: { kind: 'binary', operator: 'or', left: eqTrue(), right: badArithmeticLeaf },
    };

    expect(expressionToGuard({ expression, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
  });
});

describe('actionToDraft / actionDraftToModel', () => {
  it('round-trips play-sequence, stop-sequence, and seek-sequence', () => {
    const seqId = id('seq-intro');
    const actions: readonly projectFormatV1.SequenceAction[] = [
      { kind: 'play-sequence', sequenceId: seqId, behavior: 'resume' },
      { kind: 'stop-sequence', sequenceId: seqId },
      { kind: 'seek-sequence', sequenceId: seqId, tick: 42 },
    ];

    for (const action of actions) {
      expect(actionDraftToModel(actionToDraft(action))).toEqual(action);
    }
  });

  it('returns null for an unparseable id instead of throwing', () => {
    expect(actionDraftToModel({ kind: 'play-sequence', sequenceId: '', behavior: 'restart' })).toBeNull();
    expect(actionDraftToModel({ kind: 'stop-sequence', sequenceId: '' })).toBeNull();
    expect(actionDraftToModel({ kind: 'seek-sequence', sequenceId: '', tick: 0 })).toBeNull();
  });
});

describe('actionsDraftToModel', () => {
  it('maps valid drafts and drops unparseable ones', () => {
    const drafts: readonly SequenceActionDraft[] = [
      { kind: 'stop-sequence', sequenceId: 'seq-intro' },
      { kind: 'stop-sequence', sequenceId: '' },
    ];

    expect(actionsDraftToModel(drafts)).toEqual([{ kind: 'stop-sequence', sequenceId: id('seq-intro') }]);
  });
});

describe('semantic validity', () => {
  it('a guard built from a boolean field infers to boolean', () => {
    const base = buildProjectFixture({});
    const { refById } = buildGuardOperands({ document: base.document, project: base.project });
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'c0',
          operandId: guardOperandId({ kind: 'field', viewModelId: base.viewModelId, fieldId: base.boolFieldId }),
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
      ],
    };
    const guard = guardDraftToExpression({ draft, refById });

    if (guard === undefined) throw new Error('Expected guard expression');

    const fixture = buildProjectFixture({ guard });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(fixture.project)).toEqual([]);
  });

  it('produces a semantically valid project for a combined field+variable guard and translated actions', () => {
    const base = buildProjectFixture({});
    const { refById } = buildGuardOperands({ document: base.document, project: base.project });
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'c0',
          operandId: guardOperandId({ kind: 'field', viewModelId: base.viewModelId, fieldId: base.boolFieldId }),
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'comparison',
          id: 'c1',
          operandId: guardOperandId({
            kind: 'variable',
            collectionId: base.collectionId,
            variableId: base.scoreVariableId,
          }),
          operator: 'gte',
          literal: { valueType: 'number', value: SCORE_THRESHOLD },
        },
      ],
    };
    const guard = guardDraftToExpression({ draft, refById });

    if (guard === undefined) throw new Error('Expected guard expression');

    const actionDrafts: readonly SequenceActionDraft[] = [
      { kind: 'play-sequence', sequenceId: base.sequenceId, behavior: 'restart' },
      { kind: 'seek-sequence', sequenceId: base.sequenceId, tick: SEEK_TICK },
      { kind: 'stop-sequence', sequenceId: base.sequenceId },
    ];
    const fixture = buildProjectFixture({ guard, actions: actionsDraftToModel(actionDrafts) });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(fixture.project)).toEqual([]);
  });

  /**
   * @description PR-G contract: a NESTED guard — `(Show Branding is true) AND (Score > 3 OR
   * NOT(Period == 'first'))`, i.e. `and(eq, or(gt, not(eq)))` — must translate to a valid
   * `ExpressionAst`, keep the whole project semantically valid, and structurally infer to boolean
   * (via `validateBooleanExpressionStructure`, independent of `validateBroadsetProjectV1Semantics`'s
   * whole-project check).
   */
  it('a NESTED guard tree (AND of a comparison and a nested OR/NOT group) infers to boolean and keeps the project valid', () => {
    const base = buildProjectFixture({});
    const { refById } = buildGuardOperands({ document: base.document, project: base.project });
    const draft: GuardDraft = {
      kind: 'group',
      id: 'root',
      connective: 'all',
      negated: false,
      children: [
        {
          kind: 'comparison',
          id: 'c0',
          operandId: guardOperandId({ kind: 'field', viewModelId: base.viewModelId, fieldId: base.boolFieldId }),
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
          kind: 'group',
          id: 'inner',
          connective: 'any',
          negated: false,
          children: [
            {
              kind: 'comparison',
              id: 'c1',
              operandId: guardOperandId({
                kind: 'variable',
                collectionId: base.collectionId,
                variableId: base.scoreVariableId,
              }),
              operator: 'gt',
              literal: { valueType: 'number', value: NESTED_GUARD_SCORE_THRESHOLD },
            },
            {
              kind: 'group',
              id: 'not-period',
              connective: 'all',
              negated: true,
              children: [
                {
                  kind: 'comparison',
                  id: 'c2',
                  operandId: guardOperandId({
                    kind: 'field',
                    viewModelId: base.viewModelId,
                    fieldId: base.enumFieldId,
                  }),
                  operator: 'eq',
                  literal: { valueType: 'string', value: 'first' },
                },
              ],
            },
          ],
        },
      ],
    };
    const guard = guardDraftToExpression({ draft, refById });

    if (guard === undefined) throw new Error('Expected guard expression');

    const structuralResult = projectFormatV1.validateBooleanExpressionStructure(guard);

    expect(structuralResult.diagnostics).toEqual([]);
    expect(structuralResult.valueType).toBe('boolean');

    const fixture = buildProjectFixture({ guard });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(fixture.project)).toEqual([]);

    const reverse = expressionToGuard({ expression: guard, refById });

    expect(reverse.guardIsAdvanced).toBe(false);
    expect(reverse.guard === undefined ? undefined : stripGuardIds(reverse.guard)).toEqual(stripGuardIds(draft));
  });
});
