import { describe, expect, it } from 'vitest';

import {
  bindingSchema,
  type ExpressionAst,
  expressionAstSchema,
  type ExpressionInferenceContext,
  expressionInferenceContextSchema,
  formatterPipelineSchema,
  inferBindingValueType,
  inferExpressionValueType,
  inferFormatterPipelineValueType,
  valueSchemaSchema,
  viewModelSchema,
} from './data';
import { propertyTargetSchema } from './identity';

const opacityTarget = propertyTargetSchema.parse({
  entity: { projectId: 'project-1', documentId: 'document-1', entityKind: 'element', entityId: 'headline' },
  pointer: '/appearance/opacity',
});

const inferenceContext = expressionInferenceContextSchema.parse({
  fields: [
    { viewModelId: 'scores', fieldId: 'home', schema: { kind: 'integer', minimum: 0 } },
    {
      viewModelId: 'scores',
      fieldId: 'teams',
      schema: {
        kind: 'array',
        items: { kind: 'object', fields: [{ id: 'name', name: 'Name', required: true, schema: { kind: 'string' } }] },
      },
    },
  ],
  variables: [{ collectionId: 'theme', variableId: 'accent', valueType: 'color' }],
  targets: [{ target: opacityTarget, valueType: 'number' }],
});

const literal = (
  type: 'integer' | 'number' | 'string' | 'boolean' | 'date-time' | 'null',
  value: unknown,
): ExpressionAst => expressionAstSchema.parse({ kind: 'literal', value: { type, value } });

function inferExpression(expression: unknown, context: ExpressionInferenceContext = inferenceContext) {
  return inferExpressionValueType({ expression: expressionAstSchema.parse(expression), context });
}

describe('valueSchemaSchema and viewModelSchema', () => {
  it('preserves every value-schema discriminant and recursive object and array fields', () => {
    const schemas = [
      { kind: 'string', minLength: 1, maxLength: 80 },
      { kind: 'number', minimum: 0, maximum: 1 },
      { kind: 'integer', minimum: 0, maximum: 100 },
      { kind: 'boolean' },
      { kind: 'date-time', earliest: '2026-01-01T00:00:00Z', latest: '2026-12-31T23:59:59Z' },
      { kind: 'color' },
      {
        kind: 'asset',
        acceptedAssetKinds: ['image', 'vector'],
        acceptedMediaTypes: ['image/png', 'image/jpeg'],
      },
      { kind: 'enum', values: ['draft', 'published'] },
      {
        kind: 'object',
        fields: [
          { id: 'title', name: 'Title', label: 'Title', required: true, schema: { kind: 'string', minLength: 1 } },
          { id: 'tags', name: 'Tags', required: false, schema: { kind: 'array', items: { kind: 'string' } } },
        ],
      },
      { kind: 'array', items: { kind: 'integer' }, minItems: 1, maxItems: 5 },
    ] as const;

    expect(schemas.map((schema) => valueSchemaSchema.parse(schema))).toEqual(schemas);
  });

  it('rejects unknown cross-kind constraints and duplicate recursive field ids', () => {
    expect(valueSchemaSchema.safeParse({ kind: 'boolean', minLength: 1 }).success).toBe(false);
    expect(
      valueSchemaSchema.safeParse({
        kind: 'object',
        fields: [
          { id: 'duplicate', name: 'First', required: true, schema: { kind: 'string' } },
          { id: 'duplicate', name: 'Second', required: true, schema: { kind: 'number' } },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects fractional integer bounds and malformed asset media types', () => {
    expect(valueSchemaSchema.safeParse({ kind: 'integer', minimum: 0.5 }).success).toBe(false);
    expect(valueSchemaSchema.safeParse({ kind: 'asset', acceptedMediaTypes: ['not-a-media-type'] }).success).toBe(false);
  });

  it('requires accepted asset kinds to be a unique non-empty closed set when present', () => {
    expect(valueSchemaSchema.safeParse({ kind: 'asset', acceptedAssetKinds: ['image'] }).success).toBe(true);
    expect(valueSchemaSchema.safeParse({ kind: 'asset', acceptedAssetKinds: [] }).success).toBe(false);
    expect(valueSchemaSchema.safeParse({ kind: 'asset', acceptedAssetKinds: ['image', 'image'] }).success).toBe(false);
    expect(valueSchemaSchema.safeParse({ kind: 'asset', acceptedAssetKinds: ['spreadsheet'] }).success).toBe(false);
  });

  it('orders date-time schema bounds by chronological instant across unequal offsets', () => {
    expect(
      valueSchemaSchema.safeParse({
        kind: 'date-time',
        earliest: '2026-01-01T00:00:00+14:00',
        latest: '2025-12-31T23:00:00-12:00',
      }).success,
    ).toBe(true);
    expect(
      valueSchemaSchema.safeParse({
        kind: 'date-time',
        earliest: '2026-01-01T00:00:00-12:00',
        latest: '2026-01-01T01:00:00+14:00',
      }).success,
    ).toBe(false);
  });

  it('validates date-time defaults and sample values by chronological instant', () => {
    const createDateViewModel = (defaultValue: string, sampleValue: string) => ({
      id: 'schedule',
      name: 'Schedule',
      fields: [
        {
          id: 'starts-at',
          name: 'Starts at',
          schema: { kind: 'date-time', earliest: '2026-01-01T00:00:00Z', latest: '2026-01-02T00:00:00Z' },
          defaultValue: { type: 'date-time', value: defaultValue },
        },
      ],
      sampleDataSets: [
        { id: 'sample', name: 'Sample', values: { 'starts-at': { type: 'date-time', value: sampleValue } } },
      ],
    });

    expect(
      viewModelSchema.safeParse(
        createDateViewModel('2025-12-31T23:00:00-02:00', '2026-01-02T01:00:00+02:00'),
      ).success,
    ).toBe(true);
    expect(
      viewModelSchema.safeParse(
        createDateViewModel('2026-01-01T01:00:00+02:00', '2026-01-01T23:00:00-02:00'),
      ).success,
    ).toBe(false);
  });

  it('orders date-time bounds exactly beyond millisecond precision', () => {
    expect(
      valueSchemaSchema.safeParse({
        kind: 'date-time',
        earliest: '2026-01-01T00:00:00.123456789001Z',
        latest: '2026-01-01T00:00:00.123456789002Z',
      }).success,
    ).toBe(true);
    expect(
      valueSchemaSchema.safeParse({
        kind: 'date-time',
        earliest: '2026-01-01T00:00:00.123456789002Z',
        latest: '2026-01-01T00:00:00.123456789001Z',
      }).success,
    ).toBe(false);
  });

  it('treats trailing zeros and unequal-offset representations of one exact instant as equal', () => {
    expect(
      valueSchemaSchema.safeParse({
        kind: 'date-time',
        earliest: '2026-01-01T00:00:00.1234000Z',
        latest: '2026-01-01T00:00:00.1234Z',
      }).success,
    ).toBe(true);
    expect(
      valueSchemaSchema.safeParse({
        kind: 'date-time',
        earliest: '2026-01-01T00:00:00.123456789+02:00',
        latest: '2025-12-31T22:00:00.123456789000Z',
      }).success,
    ).toBe(true);
  });

  it('validates defaults and samples exactly beyond millisecond precision', () => {
    const createPreciseViewModel = (defaultValue: string, sampleValue: string) => ({
      id: 'precise-schedule',
      name: 'Precise schedule',
      fields: [
        {
          id: 'timestamp',
          name: 'Timestamp',
          schema: {
            kind: 'date-time',
            earliest: '2026-01-01T00:00:00.123456789002Z',
            latest: '2026-01-01T00:00:00.123456789004Z',
          },
          defaultValue: { type: 'date-time', value: defaultValue },
        },
      ],
      sampleDataSets: [
        { id: 'sample', name: 'Sample', values: { timestamp: { type: 'date-time', value: sampleValue } } },
      ],
    });

    expect(
      viewModelSchema.safeParse(
        createPreciseViewModel('2026-01-01T00:00:00.123456789003Z', '2026-01-01T00:00:00.1234567890040Z'),
      ).success,
    ).toBe(true);
    expect(
      viewModelSchema.safeParse(
        createPreciseViewModel('2026-01-01T00:00:00.123456789001Z', '2026-01-01T00:00:00.123456789005Z'),
      ).success,
    ).toBe(false);
  });

  it('validates field defaults and sample values against recursive schemas', () => {
    const viewModel = {
      id: 'news',
      name: 'News',
      fields: [
        {
          id: 'headline',
          name: 'Headline',
          schema: { kind: 'string', minLength: 3 },
          defaultValue: { type: 'string', value: 'Latest' },
          stalePolicy: 'use-default',
        },
      ],
      sampleDataSets: [
        { id: 'sample-a', name: 'Sample A', values: { headline: { type: 'string', value: 'Bulletin' } } },
      ],
    } as const;

    expect(viewModelSchema.parse(viewModel)).toEqual(viewModel);
    expect(
      viewModelSchema.safeParse({
        ...viewModel,
        fields: [{ ...viewModel.fields[0], defaultValue: { type: 'string', value: 'x' } }],
      }).success,
    ).toBe(false);
    expect(
      viewModelSchema.safeParse({
        ...viewModel,
        sampleDataSets: [{ ...viewModel.sampleDataSets[0], values: { headline: { type: 'number', value: 3 } } }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate view-model field and sample-data ids and unknown fields', () => {
    const field = { id: 'title', name: 'Title', schema: { kind: 'string' } };
    const sample = { id: 'sample', name: 'Sample', values: {} };

    expect(
      viewModelSchema.safeParse({ id: 'vm', name: 'VM', fields: [field, field], sampleDataSets: [] }).success,
    ).toBe(false);
    expect(
      viewModelSchema.safeParse({ id: 'vm', name: 'VM', fields: [], sampleDataSets: [sample, sample] }).success,
    ).toBe(false);
    expect(valueSchemaSchema.safeParse({ kind: 'string', unexpected: true }).success).toBe(false);
  });

  it('rejects sample data sets that omit declared fields', () => {
    expect(
      viewModelSchema.safeParse({
        id: 'vm',
        name: 'VM',
        fields: [{ id: 'title', name: 'Title', schema: { kind: 'string' } }],
        sampleDataSets: [{ id: 'sample', name: 'Sample', values: {} }],
      }).success,
    ).toBe(false);
  });
});

describe('expressionAstSchema', () => {
  it('preserves every recursive AST discriminant', () => {
    const expression = {
      kind: 'conditional',
      condition: { kind: 'unary', operator: 'not', operand: literal('boolean', false) },
      whenTrue: {
        kind: 'safe-function',
        functionId: 'uppercase',
        arguments: [
          {
            kind: 'get',
            source: {
              kind: 'index',
              source: { kind: 'field', viewModelId: 'scores', fieldId: 'teams' },
              index: literal('integer', 0),
            },
            fieldId: 'name',
          },
        ],
      },
      whenFalse: {
        kind: 'binary',
        operator: 'add',
        left: literal('string', 'Team '),
        right: { kind: 'variable', collectionId: 'copy', variableId: 'fallback' },
      },
    } as const;

    expect(expressionAstSchema.parse(expression)).toEqual(expression);
  });

  it('rejects unparsed strings, executable values, unknown operators, and unregistered functions', () => {
    expect(expressionAstSchema.safeParse('score > 0').success).toBe(false);
    expect(expressionAstSchema.safeParse({ kind: 'literal', value: () => 1 }).success).toBe(false);
    expect(
      expressionAstSchema.safeParse({ kind: 'unary', operator: 'execute', operand: literal('boolean', true) }).success,
    ).toBe(false);
    expect(expressionAstSchema.safeParse({ kind: 'safe-function', functionId: 'eval', arguments: [] }).success).toBe(
      false,
    );
  });
});

describe('structural expression inference', () => {
  it('infers field, variable, get, and index references without evaluation', () => {
    expect(
      inferExpression({
          kind: 'get',
          source: {
            kind: 'index',
            source: { kind: 'field', viewModelId: 'scores', fieldId: 'teams' },
            index: literal('integer', 0),
          },
          fieldId: 'name',
      }),
    ).toEqual({ valueType: 'string', diagnostics: [] });
    expect(
      inferExpression({ kind: 'variable', collectionId: 'theme', variableId: 'accent' }),
    ).toEqual({ valueType: 'color', diagnostics: [] });
  });

  it('returns diagnostics for missing references and invalid operands', () => {
    const missing = inferExpression({ kind: 'field', viewModelId: 'scores', fieldId: 'away' });
    const invalid = inferExpression({
      kind: 'binary',
      operator: 'mul',
      left: literal('string', 'x'),
      right: literal('integer', 2),
    });

    expect(missing.valueType).toBeUndefined();
    expect(missing.diagnostics.map((item) => item.code)).toEqual(['expression.field-not-found']);
    expect(invalid.valueType).toBeUndefined();
    expect(invalid.diagnostics.map((item) => item.code)).toContain('expression.invalid-operand');
  });

  it('requires boolean conditions and agreeing conditional branch types', () => {
    const result = inferExpression({
        kind: 'conditional',
        condition: literal('string', 'truthy'),
        whenTrue: literal('integer', 1),
        whenFalse: literal('string', 'one'),
    });

    expect(result.valueType).toBeUndefined();
    expect(result.diagnostics.map((item) => item.code)).toEqual([
      'expression.invalid-condition',
      'expression.branch-type-mismatch',
    ]);
  });

  it('implements every registered safe-function signature and numeric return transition', () => {
    const cases = [
      ['coalesce', [literal('null', null), literal('string', 'x')], 'string'],
      ['length', [literal('string', 'abc')], 'integer'],
      ['lowercase', [literal('string', 'ABC')], 'string'],
      ['uppercase', [literal('string', 'abc')], 'string'],
      ['round', [literal('number', 1.5), literal('integer', 1)], 'number'],
      ['min', [literal('integer', 1), literal('integer', 2)], 'integer'],
      ['max', [literal('integer', 1), literal('number', 2.5)], 'number'],
      ['clamp', [literal('integer', 1), literal('integer', 0), literal('integer', 5)], 'integer'],
      [
        'format-date',
        [
          literal('date-time', '2026-07-10T12:00:00Z'),
          literal('string', 'yyyy-MM-dd'),
          literal('string', 'fi-FI'),
          literal('string', 'Europe/Helsinki'),
        ],
        'string',
      ],
    ] as const;

    for (const [functionId, args, valueType] of cases) {
      expect(
        inferExpression({ kind: 'safe-function', functionId, arguments: args }),
      ).toEqual({ valueType, diagnostics: [] });
    }
  });

  it('diagnoses safe-function arity and argument mismatches and duplicate context addresses', () => {
    const arity = inferExpression({
      kind: 'safe-function',
      functionId: 'clamp',
      arguments: [literal('integer', 1)],
    });
    const duplicates = inferExpression(
      { kind: 'field', viewModelId: 'scores', fieldId: 'home' },
      expressionInferenceContextSchema.parse({
        ...inferenceContext,
        fields: [...inferenceContext.fields, { viewModelId: 'scores', fieldId: 'home', schema: { kind: 'integer' } }],
      }),
    );

    expect(arity.diagnostics.map((item) => item.code)).toEqual(['expression.invalid-function-arity']);
    expect(duplicates.diagnostics.map((item) => item.code)).toContain('expression.duplicate-context-address');
  });
});

describe('formatter and binding inference', () => {
  it('preserves every registered formatter discriminant with exact literal arguments', () => {
    const pipelines = [
      { steps: [{ id: 'number', formatterId: 'number', arguments: [{ type: 'string', value: 'fi-FI' }] }] },
      {
        steps: [
          {
            id: 'date',
            formatterId: 'date-time',
            arguments: [
              { type: 'string', value: 'yyyy-MM-dd' },
              { type: 'string', value: 'fi-FI' },
              { type: 'string', value: 'Europe/Helsinki' },
            ],
          },
        ],
      },
      {
        steps: [
          {
            id: 'duration',
            formatterId: 'duration',
            arguments: [
              { type: 'string', value: 'seconds' },
              { type: 'string', value: 'en-US' },
            ],
          },
        ],
      },
      { steps: [{ id: 'prefix', formatterId: 'prefix', arguments: [{ type: 'string', value: '$' }] }] },
      { steps: [{ id: 'suffix', formatterId: 'suffix', arguments: [{ type: 'string', value: '%' }] }] },
      { steps: [{ id: 'truncate', formatterId: 'truncate', arguments: [{ type: 'integer', value: 20 }] }] },
    ] as const;

    expect(pipelines.map((pipeline) => formatterPipelineSchema.parse(pipeline))).toEqual(pipelines);
  });

  it('preserves registered formatter pipelines and rejects unknown formatters', () => {
    const pipeline = {
      steps: [
        { id: 'number', formatterId: 'number', arguments: [{ type: 'string', value: 'fi-FI' }] },
        { id: 'prefix', formatterId: 'prefix', arguments: [{ type: 'string', value: 'Score: ' }] },
        { id: 'truncate', formatterId: 'truncate', arguments: [{ type: 'integer', value: 12 }] },
      ],
    } as const;
    const parsedPipeline = formatterPipelineSchema.parse(pipeline);

    expect(parsedPipeline).toEqual(pipeline);
    expect(inferFormatterPipelineValueType({ inputType: 'integer', pipeline: parsedPipeline })).toEqual({
      valueType: 'string',
      diagnostics: [],
    });
    expect(
      formatterPipelineSchema.safeParse({ steps: [{ id: 'x', formatterId: 'eval', arguments: [] }] }).success,
    ).toBe(false);
  });

  it('checks formatter transitions and exact typed literal arguments', () => {
    const invalid = inferFormatterPipelineValueType({
      inputType: 'string',
      pipeline: formatterPipelineSchema.parse({
        steps: [{ id: 'number', formatterId: 'number', arguments: [{ type: 'string', value: 'fi-FI' }] }],
      }),
    });

    expect(invalid.valueType).toBeUndefined();
    expect(invalid.diagnostics.map((item) => item.code)).toEqual(['formatter.invalid-input']);
    expect(
      formatterPipelineSchema.safeParse({
        steps: [{ id: 'truncate', formatterId: 'truncate', arguments: [{ type: 'integer', value: -1 }] }],
      }).success,
    ).toBe(false);
  });

  it('checks final and fallback compatibility with an exact structural target', () => {
    const compatibleInput = {
      id: 'opacity-binding',
      target: opacityTarget,
      expression: { kind: 'field', viewModelId: 'scores', fieldId: 'home' },
      fallback: { type: 'number', value: 0 },
    } as const;
    const compatible = bindingSchema.parse(compatibleInput);
    const incompatible = bindingSchema.parse({
      ...compatibleInput,
      target: { ...opacityTarget, pointer: '/text/value' },
    });

    expect(compatible).toEqual(compatibleInput);
    expect(inferBindingValueType({ binding: compatible, context: inferenceContext })).toEqual({
      valueType: 'integer',
      diagnostics: [],
    });
    expect(inferBindingValueType({ binding: incompatible, context: inferenceContext }).diagnostics.map((item) => item.code)).toEqual([
      'binding.target-not-found',
    ]);
    expect(
      inferBindingValueType({
        binding: bindingSchema.parse({ ...compatibleInput, fallback: { type: 'string', value: 'none' } }),
        context: inferenceContext,
      }).diagnostics.map((item) => item.code),
    ).toEqual(['binding.incompatible-fallback']);
  });
});
