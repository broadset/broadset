import type { projectFormatV1 } from '@broadset/model';
import { projectFormatV1 as projectFormatV1Runtime } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { evaluateExpressionV1, type ExpressionContextV1 } from './expression-eval';

type ExpressionAst = projectFormatV1.ExpressionAst;
type TypedValue = projectFormatV1.TypedValue;
type Id = projectFormatV1.Id;
type BinaryOperator = Extract<ExpressionAst, { readonly kind: 'binary' }>['operator'];
type SafeFunctionId = Extract<ExpressionAst, { readonly kind: 'safe-function' }>['functionId'];

const VIEW_MODEL_ID = createId('view-model');
const FIELD_ID = createId('field');
const COLLECTION_ID = createId('collection');
const VARIABLE_ID = createId('variable');
const OBJECT_FIELD_ID = createId('object-field');
const MISSING_ID = createId('missing');

const EMPTY_CONTEXT: ExpressionContextV1 = {
  resolveField: () => undefined,
  resolveVariable: () => undefined,
};

function createId(value: string): Id {
  return projectFormatV1Runtime.idSchema.parse(value);
}

function literal(value: TypedValue): ExpressionAst {
  return { kind: 'literal', value };
}

function evaluate(expression: ExpressionAst, context: ExpressionContextV1 = EMPTY_CONTEXT): TypedValue | undefined {
  return evaluateExpressionV1(expression, context);
}

function binary(operator: BinaryOperator, left: TypedValue, right: TypedValue): ExpressionAst {
  return { kind: 'binary', operator, left: literal(left), right: literal(right) };
}

function safeFunction(functionId: SafeFunctionId, values: readonly TypedValue[]): ExpressionAst {
  return { kind: 'safe-function', functionId, arguments: values.map(literal) };
}

describe('evaluateExpressionV1 references and unary expressions', () => {
  it('returns literal values', () => {
    const value = { type: 'string', value: 'Broadset' } as const;

    expect(evaluate(literal(value))).toBe(value);
  });

  it('resolves fields and variables and fails softly when unresolved', () => {
    const fieldValue = { type: 'number', value: 12 } as const;
    const variableValue = { type: 'boolean', value: true } as const;
    const context: ExpressionContextV1 = {
      resolveField: (viewModelId, fieldId) =>
        viewModelId === VIEW_MODEL_ID && fieldId === FIELD_ID ? fieldValue : undefined,
      resolveVariable: (collectionId, variableId) =>
        collectionId === COLLECTION_ID && variableId === VARIABLE_ID ? variableValue : undefined,
    };

    expect(
      evaluate({ kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID }, context),
    ).toBe(fieldValue);
    expect(
      evaluate(
        { kind: 'variable', collectionId: COLLECTION_ID, variableId: VARIABLE_ID },
        context,
      ),
    ).toBe(variableValue);
    expect(
      evaluate({ kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: MISSING_ID }, context),
    ).toBeUndefined();
    expect(
      evaluate(
        { kind: 'variable', collectionId: COLLECTION_ID, variableId: MISSING_ID },
        context,
      ),
    ).toBeUndefined();
  });

  it('evaluates not and rejects non-boolean operands', () => {
    expect(
      evaluate(
        { kind: 'unary', operator: 'not', operand: literal({ type: 'boolean', value: true }) }),
    ).toEqual({ type: 'boolean', value: false });
    expect(
      evaluate(
        { kind: 'unary', operator: 'not', operand: literal({ type: 'string', value: 'true' }) }),
    ).toBeUndefined();
  });

  it.each([
    ['number', 1.5],
    ['integer', 4],
    ['length', 8],
    ['angle', 90],
  ] as const)('negates %s operands while retaining their type', (type, value) => {
    expect(
      evaluate(
        { kind: 'unary', operator: 'negate', operand: literal({ type, value }) }),
    ).toEqual({ type, value: -value });
  });

  it('rejects non-numeric negate operands', () => {
    expect(
      evaluate(
        { kind: 'unary', operator: 'negate', operand: literal({ type: 'boolean', value: true }) }),
    ).toBeUndefined();
  });
});

describe('evaluateExpressionV1 binary expressions', () => {
  it.each([
    ['add', 10, 4, 14],
    ['sub', 10, 4, 6],
    ['mul', 10, 4, 40],
    ['div', 10, 4, 2.5],
  ] as const)('applies number %s arithmetic', (operator, left, right, expected) => {
    expect(
      evaluate(
        binary(operator, { type: 'number', value: left }, { type: 'number', value: right })),
    ).toEqual({ type: 'number', value: expected });
  });

  it.each([
    ['integer', 'add', 7, 2, 9],
    ['integer', 'sub', 7, 2, 5],
    ['integer', 'mul', 7, 2, 14],
    ['integer', 'div', 7, 2, 3],
    ['length', 'add', 7, 2, 9],
    ['length', 'sub', 7, 2, 5],
    ['length', 'mul', 7, 2, 14],
    ['length', 'div', 7, 2, 3.5],
    ['angle', 'add', 7, 2, 9],
    ['angle', 'sub', 7, 2, 5],
    ['angle', 'mul', 7, 2, 14],
    ['angle', 'div', 7, 2, 3.5],
  ] as const)('retains the %s type for %s arithmetic', (type, operator, left, right, expected) => {
    expect(
      evaluate(binary(operator, { type, value: left }, { type, value: right })),
    ).toEqual({ type, value: expected });
  });

  it('truncates integer division and rejects division by zero', () => {
    expect(
      evaluate(
        binary('div', { type: 'integer', value: 7 }, { type: 'integer', value: 2 })),
    ).toEqual({ type: 'integer', value: 3 });
    expect(
      evaluate(
        binary('div', { type: 'length', value: 7 }, { type: 'length', value: 0 })),
    ).toBeUndefined();
  });

  it('rejects mismatched numeric types and non-finite arithmetic results', () => {
    expect(
      evaluate(
        binary('add', { type: 'number', value: 1 }, { type: 'length', value: 1 })),
    ).toBeUndefined();
    expect(
      evaluate(
        binary('mul', { type: 'number', value: Number.MAX_VALUE }, { type: 'number', value: 2 })),
    ).toBeUndefined();
    expect(
      evaluate(
        binary('add', { type: 'integer', value: 1.5 }, { type: 'integer', value: 2 })),
    ).toBeUndefined();
  });

  it.each([
    ['lt', false],
    ['lte', true],
    ['gt', false],
    ['gte', true],
  ] as const)('applies %s comparisons to same-type numeric operands', (operator, expected) => {
    expect(
      evaluate(
        binary(operator, { type: 'angle', value: 45 }, { type: 'angle', value: 45 })),
    ).toEqual({ type: 'boolean', value: expected });
  });

  it('rejects ordered comparisons across numeric types', () => {
    expect(
      evaluate(
        binary('lt', { type: 'number', value: 1 }, { type: 'integer', value: 2 })),
    ).toBeUndefined();
  });

  it('evaluates boolean and/or and rejects wrong types', () => {
    expect(
      evaluate(
        binary('and', { type: 'boolean', value: true }, { type: 'boolean', value: false })),
    ).toEqual({ type: 'boolean', value: false });
    expect(
      evaluate(
        binary('or', { type: 'boolean', value: true }, { type: 'boolean', value: false })),
    ).toEqual({ type: 'boolean', value: true });
    expect(
      evaluate(
        binary('and', { type: 'boolean', value: true }, { type: 'number', value: 1 })),
    ).toBeUndefined();
  });

  it('performs deep equality and treats different types as unequal', () => {
    const firstObject: TypedValue = {
      type: 'object',
      fields: {
        [OBJECT_FIELD_ID]: { type: 'list', items: [{ type: 'integer', value: 3 }] },
      },
    };
    const secondObject: TypedValue = {
      type: 'object',
      fields: {
        [OBJECT_FIELD_ID]: { type: 'list', items: [{ type: 'integer', value: 3 }] },
      },
    };

    expect(evaluate(binary('eq', firstObject, secondObject))).toEqual({
      type: 'boolean',
      value: true,
    });
    expect(evaluate(binary('neq', firstObject, secondObject))).toEqual({
      type: 'boolean',
      value: false,
    });
    expect(
      evaluate(
        binary('eq', { type: 'integer', value: 3 }, { type: 'number', value: 3 })),
    ).toEqual({ type: 'boolean', value: false });
    expect(
      evaluate(
        binary('neq', { type: 'integer', value: 3 }, { type: 'number', value: 3 })),
    ).toEqual({ type: 'boolean', value: true });
  });

  it('compares color payloads structurally including color space', () => {
    const srgb: TypedValue = {
      type: 'color',
      value: { kind: 'color', space: 'srgb', channels: [0.1, 0.2, 0.3], alpha: 1 },
    };
    const equalSrgb: TypedValue = {
      type: 'color',
      value: { kind: 'color', space: 'srgb', channels: [0.1, 0.2, 0.3], alpha: 1 },
    };
    const displayP3: TypedValue = {
      type: 'color',
      value: { kind: 'color', space: 'display-p3', channels: [0.1, 0.2, 0.3], alpha: 1 },
    };

    expect(evaluate(binary('eq', srgb, equalSrgb))).toEqual({
      type: 'boolean',
      value: true,
    });
    expect(evaluate(binary('eq', srgb, displayP3))).toEqual({
      type: 'boolean',
      value: false,
    });
  });
});

describe('evaluateExpressionV1 conditional and collection access', () => {
  it.each([
    [true, 'yes'],
    [false, 'no'],
  ] as const)('evaluates only the selected conditional branch for %s', (condition, expected) => {
    const expression: ExpressionAst = {
      kind: 'conditional',
      condition: literal({ type: 'boolean', value: condition }),
      whenTrue: literal({ type: 'string', value: 'yes' }),
      whenFalse: literal({ type: 'string', value: 'no' }),
    };

    expect(evaluate(expression)).toEqual({ type: 'string', value: expected });
  });

  it('rejects a non-boolean conditional condition', () => {
    const expression: ExpressionAst = {
      kind: 'conditional',
      condition: literal({ type: 'integer', value: 1 }),
      whenTrue: literal({ type: 'string', value: 'yes' }),
      whenFalse: literal({ type: 'string', value: 'no' }),
    };

    expect(evaluate(expression)).toBeUndefined();
  });

  it('gets an object field and fails softly for absent fields or wrong sources', () => {
    const source = literal({
      type: 'object',
      fields: { [OBJECT_FIELD_ID]: { type: 'string', value: 'found' } },
    });

    expect(
      evaluate({ kind: 'get', source, fieldId: OBJECT_FIELD_ID }),
    ).toEqual({ type: 'string', value: 'found' });
    expect(evaluate({ kind: 'get', source, fieldId: MISSING_ID })).toBeUndefined();
    expect(
      evaluate(
        { kind: 'get', source: literal({ type: 'string', value: 'wrong' }), fieldId: OBJECT_FIELD_ID }),
    ).toBeUndefined();
  });

  it('indexes a list with an in-range integer and rejects invalid indexes', () => {
    const source = literal({
      type: 'list',
      items: [
        { type: 'string', value: 'first' },
        { type: 'string', value: 'second' },
      ],
    });

    expect(
      evaluate(
        { kind: 'index', source, index: literal({ type: 'integer', value: 1 }) }),
    ).toEqual({ type: 'string', value: 'second' });
    expect(
      evaluate(
        { kind: 'index', source, index: literal({ type: 'integer', value: 2 }) }),
    ).toBeUndefined();
    expect(
      evaluate(
        { kind: 'index', source, index: literal({ type: 'number', value: 1 }) }),
    ).toBeUndefined();
  });
});

describe('evaluateExpressionV1 safe functions', () => {
  it('coalesces past unresolved and null arguments', () => {
    const expression: ExpressionAst = {
      kind: 'safe-function',
      functionId: 'coalesce',
      arguments: [
        { kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: MISSING_ID },
        literal({ type: 'null', value: null }),
        literal({ type: 'string', value: 'fallback' }),
      ],
    };

    expect(evaluate(expression)).toEqual({ type: 'string', value: 'fallback' });
    expect(
      evaluate(safeFunction('coalesce', [{ type: 'null', value: null }])),
    ).toBeUndefined();
  });

  it('returns string and list lengths', () => {
    expect(
      evaluate(safeFunction('length', [{ type: 'string', value: 'four' }])),
    ).toEqual({ type: 'integer', value: 4 });
    expect(
      evaluate(
        safeFunction('length', [
          { type: 'list', items: [{ type: 'null', value: null }, { type: 'boolean', value: true }] },
        ])),
    ).toEqual({ type: 'integer', value: 2 });
  });

  it('lowercases and uppercases strings', () => {
    expect(
      evaluate(safeFunction('lowercase', [{ type: 'string', value: 'MiXeD' }])),
    ).toEqual({ type: 'string', value: 'mixed' });
    expect(
      evaluate(safeFunction('uppercase', [{ type: 'string', value: 'MiXeD' }])),
    ).toEqual({ type: 'string', value: 'MIXED' });
  });

  it('rounds each numeric type to an integer', () => {
    expect(
      evaluate(safeFunction('round', [{ type: 'length', value: 4.6 }])),
    ).toEqual({ type: 'integer', value: 5 });
  });

  it('calculates same-type numeric minimum and maximum', () => {
    const values: readonly TypedValue[] = [
      { type: 'angle', value: 30 },
      { type: 'angle', value: 10 },
      { type: 'angle', value: 20 },
    ];

    expect(evaluate(safeFunction('min', values))).toEqual({
      type: 'angle',
      value: 10,
    });
    expect(evaluate(safeFunction('max', values))).toEqual({
      type: 'angle',
      value: 30,
    });
  });

  it('clamps same-type numeric values', () => {
    expect(
      evaluate(
        safeFunction('clamp', [
          { type: 'number', value: 12 },
          { type: 'number', value: 0 },
          { type: 'number', value: 10 },
        ])),
    ).toEqual({ type: 'number', value: 10 });
  });

  it('passes date-time ISO strings through format-date', () => {
    const isoInstant = '2026-07-12T10:30:00.000Z';

    expect(
      evaluate(
        safeFunction('format-date', [{ type: 'date-time', value: isoInstant }])),
    ).toEqual({ type: 'string', value: isoInstant });
  });

  it('rejects wrong argument types, unresolved required arguments, and invalid arity', () => {
    const wrongTypeExpressions: readonly ExpressionAst[] = [
      safeFunction('length', [{ type: 'integer', value: 1 }]),
      safeFunction('lowercase', [{ type: 'integer', value: 1 }]),
      safeFunction('uppercase', [{ type: 'boolean', value: true }]),
      safeFunction('round', [{ type: 'string', value: '1' }]),
      safeFunction('min', [{ type: 'number', value: 1 }, { type: 'length', value: 2 }]),
      safeFunction('max', [{ type: 'number', value: 1 }, { type: 'string', value: '2' }]),
      safeFunction('clamp', [
        { type: 'number', value: 1 },
        { type: 'integer', value: 0 },
        { type: 'number', value: 2 },
      ]),
      safeFunction('format-date', [{ type: 'string', value: '2026-07-12T10:30:00.000Z' }]),
    ];

    for (const expression of wrongTypeExpressions) {
      expect(evaluate(expression)).toBeUndefined();
    }

    expect(
      evaluate(
        {
          kind: 'safe-function',
          functionId: 'length',
          arguments: [{ kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: MISSING_ID }],
        }),
    ).toBeUndefined();
    expect(evaluate(safeFunction('min', []))).toBeUndefined();
    expect(
      evaluate(
        safeFunction('round', [
          { type: 'number', value: 1.2 },
          { type: 'number', value: 2.3 },
        ])),
    ).toBeUndefined();
  });
});

describe('evaluateExpressionV1 nested fail-soft evaluation', () => {
  it('evaluates a deeply nested expression end-to-end', () => {
    const context: ExpressionContextV1 = {
      resolveField: () => ({
        type: 'object',
        fields: {
          [OBJECT_FIELD_ID]: {
            type: 'list',
            items: [{ type: 'number', value: 4.4 }, { type: 'number', value: 9.6 }],
          },
        },
      }),
      resolveVariable: () => ({ type: 'number', value: 5 }),
    };
    const selectedNumber: ExpressionAst = {
      kind: 'index',
      source: {
        kind: 'get',
        source: { kind: 'field', viewModelId: VIEW_MODEL_ID, fieldId: FIELD_ID },
        fieldId: OBJECT_FIELD_ID,
      },
      index: literal({ type: 'integer', value: 1 }),
    };
    const expression: ExpressionAst = {
      kind: 'conditional',
      condition: {
        kind: 'binary',
        operator: 'gt',
        left: selectedNumber,
        right: { kind: 'variable', collectionId: COLLECTION_ID, variableId: VARIABLE_ID },
      },
      whenTrue: { kind: 'safe-function', functionId: 'round', arguments: [selectedNumber] },
      whenFalse: literal({ type: 'integer', value: 0 }),
    };

    expect(evaluate(expression, context)).toEqual({ type: 'integer', value: 10 });
  });

  it('never returns NaN or Infinity from numeric operations', () => {
    const expressions: readonly ExpressionAst[] = [
      binary('div', { type: 'number', value: 0 }, { type: 'number', value: 0 }),
      binary('mul', { type: 'number', value: Number.MAX_VALUE }, { type: 'number', value: 2 }),
      safeFunction('round', [{ type: 'number', value: Number.POSITIVE_INFINITY }]),
    ];

    for (const expression of expressions) {
      expect(evaluate(expression)).toBeUndefined();
    }
  });
});
