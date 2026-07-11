import { z } from 'zod';

import { type Id, idSchema, type PropertyTarget, propertyTargetSchema, utcTimestampSchema } from './identity';
import { compareExactIsoInstants } from './iso-instant';
import { mediaTypeSchema, nonEmptyStringSchema, validateUniqueIds } from './schema-helpers';
import { type TypedValue, typedValueSchema, type ValueType, valueTypeSchema } from './typed-value';

export type ValueSchema =
  | {
      readonly kind: 'string';
      readonly minLength?: number | undefined;
      readonly maxLength?: number | undefined;
    }
  | { readonly kind: 'number'; readonly minimum?: number | undefined; readonly maximum?: number | undefined }
  | { readonly kind: 'integer'; readonly minimum?: number | undefined; readonly maximum?: number | undefined }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'date-time'; readonly earliest?: string | undefined; readonly latest?: string | undefined }
  | { readonly kind: 'color' }
  | { readonly kind: 'asset'; readonly acceptedMediaTypes?: readonly string[] | undefined }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'object'; readonly fields: readonly ValueSchemaField[] }
  | {
      readonly kind: 'array';
      readonly items: ValueSchema;
      readonly minItems?: number | undefined;
      readonly maxItems?: number | undefined;
    };

export interface ValueSchemaField {
  readonly id: Id;
  readonly name: string;
  readonly label?: string | undefined;
  readonly required: boolean;
  readonly schema: ValueSchema;
}

export interface ViewModelField {
  readonly id: Id;
  readonly name: string;
  readonly label?: string | undefined;
  readonly schema: ValueSchema;
  readonly defaultValue?: TypedValue | undefined;
  readonly stalePolicy?: 'keep-last' | 'use-default' | 'hide' | 'error' | undefined;
}

export interface SampleDataSet {
  readonly id: Id;
  readonly name: string;
  readonly values: Readonly<Record<Id, TypedValue>>;
}

export interface ViewModel {
  readonly id: Id;
  readonly name: string;
  readonly fields: readonly ViewModelField[];
  readonly sampleDataSets: readonly SampleDataSet[];
}

export const SAFE_FUNCTION_IDS = [
  'coalesce',
  'length',
  'lowercase',
  'uppercase',
  'round',
  'min',
  'max',
  'clamp',
  'format-date',
] as const;
export type SafeFunctionId = (typeof SAFE_FUNCTION_IDS)[number];

export type ExpressionAst =
  | { readonly kind: 'literal'; readonly value: TypedValue }
  | { readonly kind: 'field'; readonly viewModelId: Id; readonly fieldId: Id }
  | { readonly kind: 'variable'; readonly collectionId: Id; readonly variableId: Id }
  | { readonly kind: 'unary'; readonly operator: 'not' | 'negate'; readonly operand: ExpressionAst }
  | {
      readonly kind: 'binary';
      readonly operator: 'and' | 'or' | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte' | 'add' | 'sub' | 'mul' | 'div';
      readonly left: ExpressionAst;
      readonly right: ExpressionAst;
    }
  | {
      readonly kind: 'conditional';
      readonly condition: ExpressionAst;
      readonly whenTrue: ExpressionAst;
      readonly whenFalse: ExpressionAst;
    }
  | { readonly kind: 'get'; readonly source: ExpressionAst; readonly fieldId: Id }
  | { readonly kind: 'index'; readonly source: ExpressionAst; readonly index: ExpressionAst }
  | { readonly kind: 'safe-function'; readonly functionId: SafeFunctionId; readonly arguments: readonly ExpressionAst[] };

export const FORMATTER_IDS = ['number', 'date-time', 'duration', 'prefix', 'suffix', 'truncate'] as const;
export type FormatterId = (typeof FORMATTER_IDS)[number];

export interface FormatterStep {
  readonly id: Id;
  readonly formatterId: FormatterId;
  readonly arguments: readonly TypedValue[];
}

export interface FormatterPipeline {
  readonly steps: readonly FormatterStep[];
}

export interface Binding {
  readonly id: Id;
  readonly target: PropertyTarget;
  readonly expression: ExpressionAst;
  readonly formatter?: FormatterPipeline | undefined;
  readonly fallback?: TypedValue | undefined;
}

const constrainedLengthSchema = z.number().int().nonnegative();
const numericBoundsShape = { minimum: z.number().optional(), maximum: z.number().optional() };
const integerBoundsShape = { minimum: z.number().int().optional(), maximum: z.number().int().optional() };

function chronologicallyOrdered(earliest: string | undefined, latest: string | undefined): boolean {
  if (earliest === undefined || latest === undefined) {
    return true;
  }

  const comparison = compareExactIsoInstants(earliest, latest);

  return comparison !== undefined && comparison <= 0;
}

export const valueSchemaSchema: z.ZodType<ValueSchema> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z
      .strictObject({
        kind: z.literal('string'),
        minLength: constrainedLengthSchema.optional(),
        maxLength: constrainedLengthSchema.optional(),
      })
      .refine(({ minLength, maxLength }) => minLength === undefined || maxLength === undefined || minLength <= maxLength, {
        message: 'minLength must not exceed maxLength',
      }),
    z
      .strictObject({ kind: z.literal('number'), ...numericBoundsShape })
      .refine(({ minimum, maximum }) => minimum === undefined || maximum === undefined || minimum <= maximum, {
        message: 'minimum must not exceed maximum',
      }),
    z
      .strictObject({ kind: z.literal('integer'), ...integerBoundsShape })
      .refine(({ minimum, maximum }) => minimum === undefined || maximum === undefined || minimum <= maximum, {
        message: 'minimum must not exceed maximum',
      }),
    z.strictObject({ kind: z.literal('boolean') }),
    z
      .strictObject({ kind: z.literal('date-time'), earliest: utcTimestampSchema.optional(), latest: utcTimestampSchema.optional() })
      .refine(({ earliest, latest }) => chronologicallyOrdered(earliest, latest), {
        message: 'earliest must not exceed latest',
      }),
    z.strictObject({ kind: z.literal('color') }),
    z.strictObject({ kind: z.literal('asset'), acceptedMediaTypes: z.array(mediaTypeSchema).optional() }),
    z
      .strictObject({ kind: z.literal('enum'), values: z.array(nonEmptyStringSchema).min(1) })
      .superRefine(({ values }, context) => {
        const seen = new Set<string>();

        values.forEach((value, index) => {
          if (seen.has(value)) {
            context.addIssue({ code: 'custom', message: `Duplicate enum value: ${value}`, path: ['values', index] });
          }

          seen.add(value);
        });
      }),
    z
      .strictObject({
        kind: z.literal('object'),
        fields: z.array(
          z.strictObject({
            id: idSchema,
            name: nonEmptyStringSchema,
            label: nonEmptyStringSchema.optional(),
            required: z.boolean(),
            schema: valueSchemaSchema,
          }),
        ),
      })
      .superRefine(({ fields }, context) => { validateUniqueIds({ items: fields, context, path: ['fields'] }); }),
    z
      .strictObject({
        kind: z.literal('array'),
        items: valueSchemaSchema,
        minItems: constrainedLengthSchema.optional(),
        maxItems: constrainedLengthSchema.optional(),
      })
      .refine(({ minItems, maxItems }) => minItems === undefined || maxItems === undefined || minItems <= maxItems, {
        message: 'minItems must not exceed maxItems',
      }),
  ]),
);

export function typedValueMatchesSchema(value: TypedValue, schema: ValueSchema): boolean {
  switch (schema.kind) {
    case 'string':
      return (
        value.type === 'string' &&
        (schema.minLength === undefined || value.value.length >= schema.minLength) &&
        (schema.maxLength === undefined || value.value.length <= schema.maxLength)
      );
    case 'number':
      return (
        (value.type === 'number' || value.type === 'integer') &&
        (schema.minimum === undefined || value.value >= schema.minimum) &&
        (schema.maximum === undefined || value.value <= schema.maximum)
      );
    case 'integer':
      return (
        value.type === 'integer' &&
        (schema.minimum === undefined || value.value >= schema.minimum) &&
        (schema.maximum === undefined || value.value <= schema.maximum)
      );
    case 'boolean':
      return value.type === 'boolean';
    case 'date-time':
      if (value.type !== 'date-time') {
        return false;
      }

      return chronologicallyOrdered(schema.earliest, value.value) && chronologicallyOrdered(value.value, schema.latest);
    case 'color':
      return value.type === 'color';
    case 'asset':
      return value.type === 'asset';
    case 'enum':
      return value.type === 'string' && schema.values.includes(value.value);
    case 'array':
      return (
        value.type === 'list' &&
        (schema.minItems === undefined || value.items.length >= schema.minItems) &&
        (schema.maxItems === undefined || value.items.length <= schema.maxItems) &&
        value.items.every((item) => typedValueMatchesSchema(item, schema.items))
      );
    case 'object':
      return (
        value.type === 'object' &&
        Object.keys(value.fields).every((fieldId) => schema.fields.some((field) => field.id === fieldId)) &&
        schema.fields.every((field) => {
          const fieldValue = value.fields[field.id];

          return fieldValue === undefined ? !field.required : typedValueMatchesSchema(fieldValue, field.schema);
        })
      );
  }
}

const viewModelFieldSchema: z.ZodType<ViewModelField> = z
  .strictObject({
    id: idSchema,
    name: nonEmptyStringSchema,
    label: nonEmptyStringSchema.optional(),
    schema: valueSchemaSchema,
    defaultValue: typedValueSchema.optional(),
    stalePolicy: z.enum(['keep-last', 'use-default', 'hide', 'error']).optional(),
  })
  .superRefine((field, context) => {
    if (field.defaultValue !== undefined && !typedValueMatchesSchema(field.defaultValue, field.schema)) {
      context.addIssue({ code: 'custom', message: 'Default value does not match the field schema', path: ['defaultValue'] });
    }
  });

const sampleDataSetSchema: z.ZodType<SampleDataSet> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  values: z.record(idSchema, typedValueSchema),
});

export const viewModelSchema: z.ZodType<ViewModel> = z
  .strictObject({
    id: idSchema,
    name: nonEmptyStringSchema,
    fields: z.array(viewModelFieldSchema),
    sampleDataSets: z.array(sampleDataSetSchema),
  })
  .superRefine((viewModel, context) => {
    validateUniqueIds({ items: viewModel.fields, context, path: ['fields'] });
    validateUniqueIds({ items: viewModel.sampleDataSets, context, path: ['sampleDataSets'] });
    viewModel.sampleDataSets.forEach((sample, sampleIndex) => {
      viewModel.fields.forEach((field) => {
        if (!Object.keys(sample.values).includes(field.id)) {
          context.addIssue({
            code: 'custom',
            message: 'Sample data set omits a declared field',
            path: ['sampleDataSets', sampleIndex, 'values', field.id],
          });
        }
      });

      for (const fieldId of Object.keys(sample.values)) {
        const field = viewModel.fields.find((candidate) => candidate.id === fieldId);
        const sampleValue = Object.entries(sample.values).find(([candidateId]) => candidateId === fieldId)?.[1];

        if (field === undefined || sampleValue === undefined || !typedValueMatchesSchema(sampleValue, field.schema)) {
          context.addIssue({
            code: 'custom',
            message: field === undefined ? 'Sample value references an unknown field' : 'Sample value does not match the field schema',
            path: ['sampleDataSets', sampleIndex, 'values', fieldId],
          });
        }
      }
    });
  });

export const expressionAstSchema: z.ZodType<ExpressionAst> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('literal'), value: typedValueSchema }),
    z.strictObject({ kind: z.literal('field'), viewModelId: idSchema, fieldId: idSchema }),
    z.strictObject({ kind: z.literal('variable'), collectionId: idSchema, variableId: idSchema }),
    z.strictObject({ kind: z.literal('unary'), operator: z.enum(['not', 'negate']), operand: expressionAstSchema }),
    z.strictObject({
      kind: z.literal('binary'),
      operator: z.enum(['and', 'or', 'eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'add', 'sub', 'mul', 'div']),
      left: expressionAstSchema,
      right: expressionAstSchema,
    }),
    z.strictObject({
      kind: z.literal('conditional'),
      condition: expressionAstSchema,
      whenTrue: expressionAstSchema,
      whenFalse: expressionAstSchema,
    }),
    z.strictObject({ kind: z.literal('get'), source: expressionAstSchema, fieldId: idSchema }),
    z.strictObject({ kind: z.literal('index'), source: expressionAstSchema, index: expressionAstSchema }),
    z.strictObject({
      kind: z.literal('safe-function'),
      functionId: z.enum(SAFE_FUNCTION_IDS),
      arguments: z.array(expressionAstSchema),
    }),
  ]),
);

const stringArgumentSchema = z.strictObject({ type: z.literal('string'), value: z.string() });
const integerArgumentSchema = z.strictObject({ type: z.literal('integer'), value: z.number().int().nonnegative() });
const formatterStepSchema: z.ZodType<FormatterStep> = z.discriminatedUnion('formatterId', [
  z.strictObject({ id: idSchema, formatterId: z.literal('number'), arguments: z.tuple([stringArgumentSchema]) }),
  z.strictObject({
    id: idSchema,
    formatterId: z.literal('date-time'),
    arguments: z.tuple([stringArgumentSchema, stringArgumentSchema, stringArgumentSchema]),
  }),
  z.strictObject({
    id: idSchema,
    formatterId: z.literal('duration'),
    arguments: z.tuple([
      z.strictObject({
        type: z.literal('string'),
        value: z.enum(['milliseconds', 'seconds', 'minutes', 'hours']),
      }),
      stringArgumentSchema,
    ]),
  }),
  z.strictObject({ id: idSchema, formatterId: z.literal('prefix'), arguments: z.tuple([stringArgumentSchema]) }),
  z.strictObject({ id: idSchema, formatterId: z.literal('suffix'), arguments: z.tuple([stringArgumentSchema]) }),
  z.strictObject({ id: idSchema, formatterId: z.literal('truncate'), arguments: z.tuple([integerArgumentSchema]) }),
]);

export const formatterPipelineSchema: z.ZodType<FormatterPipeline> = z
  .strictObject({ steps: z.array(formatterStepSchema) })
  .superRefine(({ steps }, context) => { validateUniqueIds({ items: steps, context, path: ['steps'] }); });

export const bindingSchema: z.ZodType<Binding> = z.strictObject({
  id: idSchema,
  target: propertyTargetSchema,
  expression: expressionAstSchema,
  formatter: formatterPipelineSchema.optional(),
  fallback: typedValueSchema.optional(),
});

export interface ExpressionFieldContext {
  readonly viewModelId: Id;
  readonly fieldId: Id;
  readonly schema: ValueSchema;
}

export interface ExpressionVariableContext {
  readonly collectionId: Id;
  readonly variableId: Id;
  readonly valueType: ValueType;
}

export interface ExpressionTargetContext {
  readonly target: PropertyTarget;
  readonly valueType: ValueType;
}

export interface ExpressionInferenceContext {
  readonly fields: readonly ExpressionFieldContext[];
  readonly variables: readonly ExpressionVariableContext[];
  readonly targets: readonly ExpressionTargetContext[];
}

export const expressionInferenceContextSchema: z.ZodType<ExpressionInferenceContext> = z.strictObject({
  fields: z.array(z.strictObject({ viewModelId: idSchema, fieldId: idSchema, schema: valueSchemaSchema })),
  variables: z.array(
    z.strictObject({ collectionId: idSchema, variableId: idSchema, valueType: valueTypeSchema }),
  ),
  targets: z.array(z.strictObject({ target: propertyTargetSchema, valueType: valueTypeSchema })),
});

export {
  inferBindingValueType,
  inferExpressionValueType,
  inferFormatterPipelineValueType,
  valueSchemaValueType,
} from './data-inference';
export { inferExpressionStructuralValueType, validateBooleanExpressionStructure } from './expression-structure';
