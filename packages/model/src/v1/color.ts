import { z } from 'zod';

import { type Id, idSchema } from './identity';

export type ColorSpace = 'srgb' | 'display-p3' | 'rec2020' | 'lab' | 'oklab' | 'oklch' | 'cmyk' | 'gray';

export interface ConcreteColorValue {
  readonly kind: 'color';
  readonly space: ColorSpace;
  readonly channels: readonly number[];
  readonly alpha: number;
}

export interface TintColorAdjustment {
  readonly kind: 'tint';
  readonly amount: number;
}

export type ColorAdjustment = TintColorAdjustment;

export interface SwatchColorValue {
  readonly kind: 'swatch';
  readonly swatchId: Id;
  readonly adjustments?: readonly ColorAdjustment[] | undefined;
}

export type ColorValue = ConcreteColorValue | SwatchColorValue;

export interface SwatchProducerAlias {
  readonly id: Id;
  readonly producer: string;
  readonly name: string;
}

export type Swatch =
  | {
      readonly id: Id;
      readonly kind: 'process';
      readonly name: string;
      readonly color: ConcreteColorValue;
      readonly producerAliases: readonly SwatchProducerAlias[];
    }
  | {
      readonly id: Id;
      readonly kind: 'spot';
      readonly name: string;
      readonly inkName: string;
      readonly alternateColor: ConcreteColorValue;
      readonly tintBehavior: 'linear';
      readonly producerAliases: readonly SwatchProducerAlias[];
    };

const normalizedChannelSchema = z.number().min(0).max(1);
const alphaSchema = normalizedChannelSchema;
const labAxisSchema = z.number().min(-125).max(125);
const oklabAxisSchema = z.number().min(-0.4).max(0.4);
const oklchChromaSchema = z.number().min(0).max(0.4);
const hueSchema = z.number().min(0).max(360);

export const concreteColorValueSchema: z.ZodType<ConcreteColorValue> = z.union([
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('srgb'),
    channels: z.tuple([normalizedChannelSchema, normalizedChannelSchema, normalizedChannelSchema]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('display-p3'),
    channels: z.tuple([normalizedChannelSchema, normalizedChannelSchema, normalizedChannelSchema]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('rec2020'),
    channels: z.tuple([normalizedChannelSchema, normalizedChannelSchema, normalizedChannelSchema]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('lab'),
    channels: z.tuple([z.number().min(0).max(100), labAxisSchema, labAxisSchema]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('oklab'),
    channels: z.tuple([normalizedChannelSchema, oklabAxisSchema, oklabAxisSchema]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('oklch'),
    channels: z.tuple([normalizedChannelSchema, oklchChromaSchema, hueSchema]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('cmyk'),
    channels: z.tuple([
      normalizedChannelSchema,
      normalizedChannelSchema,
      normalizedChannelSchema,
      normalizedChannelSchema,
    ]),
    alpha: alphaSchema,
  }),
  z.strictObject({
    kind: z.literal('color'),
    space: z.literal('gray'),
    channels: z.tuple([normalizedChannelSchema]),
    alpha: alphaSchema,
  }),
]);

export const colorAdjustmentSchema: z.ZodType<ColorAdjustment> = z.strictObject({
  kind: z.literal('tint'),
  amount: normalizedChannelSchema,
});

export const swatchColorValueSchema: z.ZodType<SwatchColorValue> = z.strictObject({
  kind: z.literal('swatch'),
  swatchId: idSchema,
  adjustments: z.array(colorAdjustmentSchema).optional(),
});

export const colorValueSchema: z.ZodType<ColorValue> = z.union([concreteColorValueSchema, swatchColorValueSchema]);
