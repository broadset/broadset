import { describe, expect, it } from 'vitest';

import {
  bindingSchema,
  expressionAstSchema,
  type ExpressionInferenceContext,
  expressionInferenceContextSchema,
  formatterPipelineSchema,
  inferBindingValueType,
  inferExpressionValueType,
  inferFormatterPipelineValueType,
} from './data';
import { propertyTargetSchema } from './identity';

const target = propertyTargetSchema.parse({
  entity: { projectId: 'project', documentId: 'document', entityKind: 'element', entityId: 'headline' },
  pointer: '/appearance/opacity',
});

const context = expressionInferenceContextSchema.parse({
  fields: [
    { viewModelId: 'vm', fieldId: 'count', schema: { kind: 'integer' } },
    {
      viewModelId: 'vm',
      fieldId: 'rows',
      schema: {
        kind: 'array',
        items: { kind: 'object', fields: [{ id: 'label', name: 'Label', required: true, schema: { kind: 'string' } }] },
      },
    },
  ],
  variables: [{ collectionId: 'theme', variableId: 'accent', valueType: 'color' }],
  targets: [{ target, valueType: 'number' }],
});

function infer(expression: unknown, inferenceContext: ExpressionInferenceContext = context) {
  return inferExpressionValueType({ expression: expressionAstSchema.parse(expression), context: inferenceContext });
}

const literal = (type: string, value: unknown) => ({ kind: 'literal', value: { type, value } });

describe('expression inference error evidence', () => {
  it('diagnoses invalid operands for both unary operators', () => {
    const cases = [
      { operator: 'not', operand: literal('string', 'yes') },
      { operator: 'negate', operand: literal('boolean', true) },
    ];

    for (const expression of cases) {
      expect(infer({ kind: 'unary', ...expression }).diagnostics.map(({ code }) => code)).toEqual([
        'expression.invalid-operand',
      ]);
    }
  });

  it('covers valid and incompatible operands for every binary operator family', () => {
    const cases = [
      {
        family: 'boolean',
        valid: { operator: 'and', left: literal('boolean', true), right: literal('boolean', false) },
        invalid: { operator: 'or', left: literal('boolean', true), right: literal('string', 'false') },
        valueType: 'boolean',
      },
      {
        family: 'equality',
        valid: { operator: 'eq', left: literal('integer', 1), right: literal('number', 1.5) },
        invalid: { operator: 'neq', left: literal('string', '1'), right: literal('integer', 1) },
        valueType: 'boolean',
      },
      {
        family: 'ordering',
        valid: { operator: 'gte', left: literal('date-time', '2026-01-01T00:00:00Z'), right: literal('date-time', '2025-01-01T00:00:00Z') },
        invalid: { operator: 'lt', left: literal('boolean', false), right: literal('boolean', true) },
        valueType: 'boolean',
      },
      {
        family: 'arithmetic',
        valid: { operator: 'mul', left: literal('integer', 2), right: literal('number', 1.5) },
        invalid: { operator: 'sub', left: literal('string', '2'), right: literal('integer', 1) },
        valueType: 'number',
      },
    ];

    for (const { valid, invalid, valueType } of cases) {
      expect(infer({ kind: 'binary', ...valid })).toEqual({ valueType, diagnostics: [] });
      expect(infer({ kind: 'binary', ...invalid }).diagnostics.map(({ code }) => code)).toEqual([
        'expression.invalid-operand',
      ]);
    }
  });

  it('diagnoses missing variables and invalid get and index access', () => {
    const cases = [
      {
        expression: { kind: 'variable', collectionId: 'theme', variableId: 'missing' },
        codes: ['expression.variable-not-found'],
      },
      {
        expression: { kind: 'get', source: literal('string', 'not-object'), fieldId: 'label' },
        codes: ['expression.invalid-get-source'],
      },
      {
        expression: {
          kind: 'get',
          source: {
            kind: 'index',
            source: { kind: 'field', viewModelId: 'vm', fieldId: 'rows' },
            index: literal('integer', 0),
          },
          fieldId: 'missing',
        },
        codes: ['expression.object-field-not-found'],
      },
      {
        expression: { kind: 'index', source: literal('string', 'not-array'), index: literal('integer', 0) },
        codes: ['expression.invalid-index-source'],
      },
      {
        expression: {
          kind: 'index',
          source: { kind: 'field', viewModelId: 'vm', fieldId: 'rows' },
          index: literal('number', 0.5),
        },
        codes: ['expression.invalid-index'],
      },
    ];

    for (const { expression, codes } of cases) {
      expect(infer(expression).diagnostics.map(({ code }) => code)).toEqual(codes);
    }
  });

  it('diagnoses arity failures for every safe function', () => {
    const cases = [
      ['coalesce', [literal('string', 'one')]],
      ['length', []],
      ['lowercase', []],
      ['uppercase', [literal('string', 'one'), literal('string', 'two')]],
      ['round', [literal('number', 1), literal('integer', 1), literal('integer', 2)]],
      ['min', [literal('integer', 1)]],
      ['max', [literal('integer', 1)]],
      ['clamp', [literal('integer', 1), literal('integer', 0)]],
      ['format-date', [literal('date-time', '2026-01-01T00:00:00Z')]],
    ] as const;

    for (const [functionId, argumentsList] of cases) {
      expect(
        infer({ kind: 'safe-function', functionId, arguments: argumentsList }).diagnostics.map(({ code }) => code),
      ).toEqual(['expression.invalid-function-arity']);
    }
  });

  it('diagnoses argument-type failures for every safe function', () => {
    const cases = [
      ['coalesce', [literal('string', 'one'), literal('integer', 2)]],
      ['length', [literal('boolean', true)]],
      ['lowercase', [literal('integer', 1)]],
      ['uppercase', [literal('boolean', false)]],
      ['round', [literal('string', '1')]],
      ['min', [literal('integer', 1), literal('string', '2')]],
      ['max', [literal('boolean', true), literal('number', 2)]],
      ['clamp', [literal('integer', 1), literal('string', '0'), literal('integer', 5)]],
      [
        'format-date',
        [
          literal('string', 'not-a-date'),
          literal('string', 'yyyy'),
          literal('string', 'en-US'),
          literal('string', 'UTC'),
        ],
      ],
    ] as const;

    for (const [functionId, argumentsList] of cases) {
      expect(
        infer({ kind: 'safe-function', functionId, arguments: argumentsList }).diagnostics.map(({ code }) => code),
      ).toEqual(['expression.invalid-function-argument']);
    }
  });

  it('infers all-null coalesce and rejects incompatible non-null coalesce types', () => {
    expect(
      infer({ kind: 'safe-function', functionId: 'coalesce', arguments: [literal('null', null), literal('null', null)] }),
    ).toEqual({ valueType: 'null', diagnostics: [] });
    expect(
      infer({
        kind: 'safe-function',
        functionId: 'coalesce',
        arguments: [literal('null', null), literal('string', 'one'), literal('integer', 2)],
      }).diagnostics.map(({ code }) => code),
    ).toEqual(['expression.invalid-function-argument']);
  });

  it('rejects duplicate field, variable, and target context addresses', () => {
    const cases = [
      expressionInferenceContextSchema.parse({ ...context, fields: [...context.fields, context.fields[0]] }),
      expressionInferenceContextSchema.parse({ ...context, variables: [...context.variables, context.variables[0]] }),
      expressionInferenceContextSchema.parse({ ...context, targets: [...context.targets, context.targets[0]] }),
    ];

    for (const duplicateContext of cases) {
      expect(
        infer({ kind: 'field', viewModelId: 'vm', fieldId: 'count' }, duplicateContext).diagnostics.map(({ code }) => code),
      ).toEqual(['expression.duplicate-context-address']);
    }
  });
});

describe('formatter and binding error evidence', () => {
  it('rejects argument failures for every formatter and duplicate step ids', () => {
    const invalidSteps = [
      { id: 'number', formatterId: 'number', arguments: [{ type: 'integer', value: 1 }] },
      { id: 'date', formatterId: 'date-time', arguments: [{ type: 'string', value: 'yyyy' }] },
      {
        id: 'duration',
        formatterId: 'duration',
        arguments: [{ type: 'string', value: 'days' }, { type: 'string', value: 'en-US' }],
      },
      { id: 'prefix', formatterId: 'prefix', arguments: [{ type: 'number', value: 1 }] },
      { id: 'suffix', formatterId: 'suffix', arguments: [] },
      { id: 'truncate', formatterId: 'truncate', arguments: [{ type: 'integer', value: -1 }] },
    ];

    for (const step of invalidSteps) {
      expect(formatterPipelineSchema.safeParse({ steps: [step] }).success).toBe(false);
    }

    const duplicate = {
      id: 'same',
      formatterId: 'prefix',
      arguments: [{ type: 'string', value: '$' }],
    };

    expect(formatterPipelineSchema.safeParse({ steps: [duplicate, duplicate] }).success).toBe(false);
  });

  it('diagnoses invalid inputs for every formatter transition', () => {
    const cases = [
      ['string', { id: 'number', formatterId: 'number', arguments: [{ type: 'string', value: 'en-US' }] }],
      [
        'string',
        {
          id: 'date',
          formatterId: 'date-time',
          arguments: [
            { type: 'string', value: 'yyyy' },
            { type: 'string', value: 'en-US' },
            { type: 'string', value: 'UTC' },
          ],
        },
      ],
      [
        'string',
        {
          id: 'duration',
          formatterId: 'duration',
          arguments: [{ type: 'string', value: 'seconds' }, { type: 'string', value: 'en-US' }],
        },
      ],
      ['integer', { id: 'prefix', formatterId: 'prefix', arguments: [{ type: 'string', value: '$' }] }],
      ['integer', { id: 'suffix', formatterId: 'suffix', arguments: [{ type: 'string', value: '%' }] }],
      ['integer', { id: 'truncate', formatterId: 'truncate', arguments: [{ type: 'integer', value: 4 }] }],
    ] as const;

    for (const [inputType, step] of cases) {
      const pipeline = formatterPipelineSchema.parse({ steps: [step] });

      expect(inferFormatterPipelineValueType({ inputType, pipeline }).diagnostics.map(({ code }) => code)).toEqual([
        'formatter.invalid-input',
      ]);
    }
  });

  it('diagnoses incompatible final result and fallback types against an exact target', () => {
    const incompatibleResult = bindingSchema.parse({
      id: 'result',
      target,
      expression: literal('string', 'opaque'),
    });
    const incompatibleFallback = bindingSchema.parse({
      id: 'fallback',
      target,
      expression: literal('integer', 1),
      fallback: { type: 'string', value: 'none' },
    });

    expect(inferBindingValueType({ binding: incompatibleResult, context }).diagnostics.map(({ code }) => code)).toEqual([
      'binding.incompatible-target',
    ]);
    expect(inferBindingValueType({ binding: incompatibleFallback, context }).diagnostics.map(({ code }) => code)).toEqual([
      'binding.incompatible-fallback',
    ]);
  });
});
