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
import { buildProjectFixture, id, stripClauseIds } from './v1-guard-action-translation.test-support';

const SEEK_TICK = 500;
const SCORE_THRESHOLD = 10;
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

  it('returns undefined for an empty clause list', () => {
    expect(guardDraftToExpression({ draft: { connective: 'all', clauses: [] }, refById })).toBeUndefined();
  });

  it('builds the exact binary comparison for a single clause', () => {
    const draft: GuardDraft = {
      connective: 'all',
      clauses: [{ id: 'c0', operandId: boolOperandId, operator: 'eq', literal: { valueType: 'boolean', value: true } }],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
  });

  it('left-folds two clauses under the "any" connective into an or of comparisons', () => {
    const draft: GuardDraft = {
      connective: 'any',
      clauses: [
        { id: 'c0', operandId: boolOperandId, operator: 'eq', literal: { valueType: 'boolean', value: true } },
        { id: 'c1', operandId: scoreOperandId, operator: 'eq', literal: { valueType: 'number', value: 3 } },
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

  it('drops clauses with an unresolvable operandId instead of throwing', () => {
    const draft: GuardDraft = {
      connective: 'all',
      clauses: [
        {
          id: 'c0',
          operandId: 'field:missing:missing',
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        { id: 'c1', operandId: boolOperandId, operator: 'eq', literal: { valueType: 'boolean', value: true } },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toEqual({
      kind: 'binary',
      operator: 'eq',
      left: { kind: 'field', viewModelId: fixture.viewModelId, fieldId: fixture.boolFieldId },
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
  });

  it('returns undefined when every clause is unresolvable', () => {
    const draft: GuardDraft = {
      connective: 'all',
      clauses: [
        {
          id: 'c0',
          operandId: 'field:missing:missing',
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
      ],
    };

    expect(guardDraftToExpression({ draft, refById })).toBeUndefined();
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
      connective: 'all',
      clauses: [{ id: 'x', operandId: boolOperandId, operator: 'eq', literal: { valueType: 'boolean', value: true } }],
    },
    {
      connective: 'all',
      clauses: [
        { id: 'x', operandId: flagOperandId, operator: 'neq', literal: { valueType: 'boolean', value: false } },
      ],
    },
    {
      connective: 'all',
      clauses: [
        { id: 'x', operandId: boolOperandId, operator: 'eq', literal: { valueType: 'boolean', value: true } },
        { id: 'y', operandId: scoreOperandId, operator: 'gte', literal: { valueType: 'number', value: 5 } },
      ],
    },
    {
      connective: 'any',
      clauses: [
        { id: 'x', operandId: integerOperandId, operator: 'lt', literal: { valueType: 'integer', value: 2 } },
        {
          id: 'y',
          operandId: dateOperandId,
          operator: 'lte',
          literal: { valueType: 'date-time', value: '2025-06-01T00:00:00Z' },
        },
      ],
    },
    {
      connective: 'all',
      clauses: [
        { id: 'x', operandId: boolOperandId, operator: 'eq', literal: { valueType: 'boolean', value: true } },
        { id: 'y', operandId: scoreOperandId, operator: 'gte', literal: { valueType: 'number', value: 5 } },
        { id: 'z', operandId: integerOperandId, operator: 'neq', literal: { valueType: 'integer', value: 0 } },
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

      expect(stripClauseIds(result.guard)).toEqual(stripClauseIds(draft));
    });
  });
});

describe('expressionToGuard: advanced (non-flat) guards', () => {
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

  it('flags a unary not as advanced', () => {
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

  it('flags a mixed and/or tree as advanced', () => {
    const eqTrue = (): projectFormatV1.ExpressionAst => ({
      kind: 'binary',
      operator: 'eq',
      left: booleanFieldExpr,
      right: { kind: 'literal', value: { type: 'boolean', value: true } },
    });
    const mixed: projectFormatV1.ExpressionAst = {
      kind: 'binary',
      operator: 'and',
      left: { kind: 'binary', operator: 'or', left: eqTrue(), right: eqTrue() },
      right: eqTrue(),
    };

    expect(expressionToGuard({ expression: mixed, refById })).toEqual({ guard: undefined, guardIsAdvanced: true });
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
   * A top-level arithmetic binary (`add`) is a `binary` node, so it clears `flattenGuardTree`'s
   * `and`/`or` check and reaches `leafToClauseDraft` as a single leaf — this exercises the
   * `isComparisonOperator` rejection specifically, distinct from the `unary not` case above (which
   * is rejected earlier, by `leaf.kind !== 'binary'`).
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
      connective: 'all',
      clauses: [
        {
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
      connective: 'all',
      clauses: [
        {
          id: 'c0',
          operandId: guardOperandId({ kind: 'field', viewModelId: base.viewModelId, fieldId: base.boolFieldId }),
          operator: 'eq',
          literal: { valueType: 'boolean', value: true },
        },
        {
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
});
