import { z } from 'zod';

import { type ColorValue, colorValueSchema } from './color';
import { type Id, idSchema, utcTimestampSchema } from './identity';

export const VALUE_TYPES = [
  'null',
  'boolean',
  'integer',
  'number',
  'string',
  'date-time',
  'length',
  'angle',
  'color',
  'asset',
  'point2d',
  'point3d',
  'list',
  'object',
] as const;

export type ValueType = (typeof VALUE_TYPES)[number];

export type TypedValue =
  | { readonly type: 'null'; readonly value: null }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'integer'; readonly value: number }
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'date-time'; readonly value: string }
  | { readonly type: 'length'; readonly value: number }
  | { readonly type: 'angle'; readonly value: number }
  | { readonly type: 'color'; readonly value: ColorValue }
  | { readonly type: 'asset'; readonly assetId: Id }
  | { readonly type: 'point2d'; readonly value: readonly [number, number] }
  | { readonly type: 'point3d'; readonly value: readonly [number, number, number] }
  | { readonly type: 'list'; readonly items: readonly TypedValue[] }
  | { readonly type: 'object'; readonly fields: Readonly<Record<Id, TypedValue>> };

export const valueTypeSchema: z.ZodType<ValueType> = z.enum(VALUE_TYPES);

const finiteNumberSchema = z.number();

export const typedValueSchema: z.ZodType<TypedValue> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('null'), value: z.null() }),
    z.strictObject({ type: z.literal('boolean'), value: z.boolean() }),
    z.strictObject({ type: z.literal('integer'), value: z.number().int() }),
    z.strictObject({ type: z.literal('number'), value: finiteNumberSchema }),
    z.strictObject({ type: z.literal('string'), value: z.string() }),
    z.strictObject({ type: z.literal('date-time'), value: utcTimestampSchema }),
    z.strictObject({ type: z.literal('length'), value: finiteNumberSchema }),
    z.strictObject({ type: z.literal('angle'), value: finiteNumberSchema }),
    z.strictObject({ type: z.literal('color'), value: colorValueSchema }),
    z.strictObject({ type: z.literal('asset'), assetId: idSchema }),
    z.strictObject({ type: z.literal('point2d'), value: z.tuple([finiteNumberSchema, finiteNumberSchema]) }),
    z.strictObject({
      type: z.literal('point3d'),
      value: z.tuple([finiteNumberSchema, finiteNumberSchema, finiteNumberSchema]),
    }),
    z.strictObject({ type: z.literal('list'), items: z.array(typedValueSchema) }),
    z.strictObject({ type: z.literal('object'), fields: z.record(idSchema, typedValueSchema) }),
  ]),
);
