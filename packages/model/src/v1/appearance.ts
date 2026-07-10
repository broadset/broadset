import { z } from 'zod';

import { type ColorValue, colorValueSchema } from './color';
import { type Id, idSchema } from './identity';
import { nonEmptyStringSchema, validateUniqueIds } from './schema-helpers';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export interface Affine2D {
  readonly kind: 'affine2d';
  readonly matrix: readonly [number, number, number, number, number, number];
}

export interface NormalizedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface GradientStop {
  readonly id: Id;
  readonly color: ColorValue;
  readonly opacity: number;
  readonly offset: number;
  readonly midpoint?: number | undefined;
}

interface GradientBase {
  readonly stops: readonly GradientStop[];
  readonly coordinateSpace: 'user-space' | 'object-bounds';
  readonly transform: Affine2D;
  readonly spread: 'pad' | 'repeat' | 'reflect';
  readonly interpolation: 'srgb' | 'linear-srgb' | 'oklab';
}

export type Gradient =
  | (GradientBase & {
      readonly kind: 'linear';
      readonly start: readonly [number, number];
      readonly end: readonly [number, number];
    })
  | (GradientBase & {
      readonly kind: 'radial';
      readonly center: readonly [number, number];
      readonly radius: readonly [number, number];
      readonly focalPoint?: readonly [number, number] | undefined;
    })
  | (GradientBase & { readonly kind: 'conic'; readonly center: readonly [number, number]; readonly startAngle: number })
  | (GradientBase & {
      readonly kind: 'diamond';
      readonly center: readonly [number, number];
      readonly radius: readonly [number, number];
    })
  | (GradientBase & { readonly kind: 'producer-preserved'; readonly producer: string; readonly typeName: string });

export type Paint =
  | { readonly kind: 'none' }
  | { readonly kind: 'solid'; readonly color: ColorValue }
  | { readonly kind: 'gradient'; readonly gradient: Gradient }
  | { readonly kind: 'pattern'; readonly assetId: Id; readonly transform: Affine2D; readonly repeat: PatternRepeat }
  | {
      readonly kind: 'picture';
      readonly assetId: Id;
      readonly fit: PictureFit;
      readonly crop?: NormalizedRect | undefined;
    };

export type PatternRepeat = 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat' | 'mirror';
export type PictureFit = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';

export interface FillLayer {
  readonly id: Id;
  readonly enabled: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly paint: Paint;
}

export interface ArrowEnding {
  readonly kind: 'none' | 'triangle' | 'stealth' | 'diamond' | 'circle' | 'square';
  readonly length?: number | undefined;
  readonly width?: number | undefined;
}

export interface StrokeLayer extends FillLayer {
  readonly width: number;
  readonly alignment: 'inside' | 'center' | 'outside';
  readonly cap: 'butt' | 'round' | 'square';
  readonly join: 'miter' | 'round' | 'bevel';
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashOffset: number;
  readonly startArrow?: ArrowEnding | undefined;
  readonly endArrow?: ArrowEnding | undefined;
}

interface EffectBase {
  readonly id: Id;
  readonly enabled: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
}

export type Effect =
  | (EffectBase & { readonly kind: 'blur'; readonly radius: number })
  | (EffectBase & {
      readonly kind: 'drop-shadow' | 'inner-shadow';
      readonly offset: readonly [number, number];
      readonly radius: number;
      readonly spread: number;
      readonly color: ColorValue;
    })
  | (EffectBase & {
      readonly kind: 'glow';
      readonly radius: number;
      readonly spread: number;
      readonly color: ColorValue;
      readonly inner: boolean;
    })
  | (EffectBase & {
      readonly kind: 'color-matrix';
      readonly matrix: readonly [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
    })
  | (EffectBase & {
      readonly kind: 'bevel';
      readonly depth: number;
      readonly angle: number;
      readonly altitude: number;
      readonly soften: number;
      readonly highlightColor: ColorValue;
      readonly shadowColor: ColorValue;
    })
  | (EffectBase & {
      readonly kind: 'displacement';
      readonly assetId: Id;
      readonly scale: readonly [number, number];
      readonly channelX: ColorChannel;
      readonly channelY: ColorChannel;
    })
  | (EffectBase & { readonly kind: 'opacity'; readonly amount: number })
  | (EffectBase & { readonly kind: 'backdrop-blur'; readonly radius: number });

export type ColorChannel = 'red' | 'green' | 'blue' | 'alpha' | 'luminance';

export type ClipDefinition =
  | { readonly kind: 'vector'; readonly vectorElementId: Id; readonly fillRule: 'nonzero' | 'evenodd' }
  | {
      readonly kind: 'component-path';
      readonly componentInstanceId: Id;
      readonly vectorElementId: Id;
      readonly fillRule: 'nonzero' | 'evenodd';
    };

export type MaskDefinition =
  | { readonly kind: 'vector'; readonly vectorElementId: Id; readonly mode: 'alpha' | 'luminance' }
  | {
      readonly kind: 'component-path';
      readonly componentInstanceId: Id;
      readonly vectorElementId: Id;
      readonly mode: 'alpha' | 'luminance';
    }
  | { readonly kind: 'asset'; readonly assetId: Id; readonly mode: 'alpha' | 'luminance' };

export interface Appearance {
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly isolation: boolean;
  readonly fills: readonly FillLayer[];
  readonly strokes: readonly StrokeLayer[];
  readonly effects: readonly Effect[];
  readonly clip?: ClipDefinition | undefined;
  readonly mask?: MaskDefinition | undefined;
}

const normalizedNumberSchema = z.number().min(0).max(1);
const nonNegativeNumberSchema = z.number().nonnegative();
const pointSchema = z.tuple([z.number(), z.number()]);

export const blendModeSchema: z.ZodType<BlendMode> = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

export const affine2dSchema: z.ZodType<Affine2D> = z.strictObject({
  kind: z.literal('affine2d'),
  matrix: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
});

export const normalizedRectSchema: z.ZodType<NormalizedRect> = z
  .strictObject({
    x: normalizedNumberSchema,
    y: normalizedNumberSchema,
    width: normalizedNumberSchema,
    height: normalizedNumberSchema,
  })
  .superRefine((rect, context) => {
    if (rect.x + rect.width > 1 || rect.y + rect.height > 1) {
      context.addIssue({ code: 'custom', message: 'Normalized rectangle must remain within bounds' });
    }
  });

const gradientStopSchema: z.ZodType<GradientStop> = z.strictObject({
  id: idSchema,
  color: colorValueSchema,
  opacity: normalizedNumberSchema,
  offset: normalizedNumberSchema,
  midpoint: normalizedNumberSchema.optional(),
});

const gradientBaseShape = {
  stops: z.array(gradientStopSchema),
  coordinateSpace: z.enum(['user-space', 'object-bounds']),
  transform: affine2dSchema,
  spread: z.enum(['pad', 'repeat', 'reflect']),
  interpolation: z.enum(['srgb', 'linear-srgb', 'oklab']),
};

export const gradientSchema: z.ZodType<Gradient> = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...gradientBaseShape, kind: z.literal('linear'), start: pointSchema, end: pointSchema }),
    z.strictObject({
      ...gradientBaseShape,
      kind: z.literal('radial'),
      center: pointSchema,
      radius: pointSchema,
      focalPoint: pointSchema.optional(),
    }),
    z.strictObject({ ...gradientBaseShape, kind: z.literal('conic'), center: pointSchema, startAngle: z.number() }),
    z.strictObject({ ...gradientBaseShape, kind: z.literal('diamond'), center: pointSchema, radius: pointSchema }),
    z.strictObject({
      ...gradientBaseShape,
      kind: z.literal('producer-preserved'),
      producer: nonEmptyStringSchema,
      typeName: nonEmptyStringSchema,
    }),
  ])
  .superRefine((gradient, context) => {
    validateUniqueIds({ items: gradient.stops, context, path: ['stops'] });
  });

export const paintSchema: z.ZodType<Paint> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('none') }),
  z.strictObject({ kind: z.literal('solid'), color: colorValueSchema }),
  z.strictObject({ kind: z.literal('gradient'), gradient: gradientSchema }),
  z.strictObject({
    kind: z.literal('pattern'),
    assetId: idSchema,
    transform: affine2dSchema,
    repeat: z.enum(['repeat', 'repeat-x', 'repeat-y', 'no-repeat', 'mirror']),
  }),
  z.strictObject({
    kind: z.literal('picture'),
    assetId: idSchema,
    fit: z.enum(['fill', 'contain', 'cover', 'none', 'scale-down']),
    crop: normalizedRectSchema.optional(),
  }),
]);

const layerBaseShape = {
  id: idSchema,
  enabled: z.boolean(),
  opacity: normalizedNumberSchema,
  blendMode: blendModeSchema,
  paint: paintSchema,
};

export const fillLayerSchema: z.ZodType<FillLayer> = z.strictObject(layerBaseShape);

const arrowEndingSchema: z.ZodType<ArrowEnding> = z.strictObject({
  kind: z.enum(['none', 'triangle', 'stealth', 'diamond', 'circle', 'square']),
  length: nonNegativeNumberSchema.optional(),
  width: nonNegativeNumberSchema.optional(),
});

export const strokeLayerSchema: z.ZodType<StrokeLayer> = z.strictObject({
  ...layerBaseShape,
  width: nonNegativeNumberSchema,
  alignment: z.enum(['inside', 'center', 'outside']),
  cap: z.enum(['butt', 'round', 'square']),
  join: z.enum(['miter', 'round', 'bevel']),
  miterLimit: nonNegativeNumberSchema,
  dash: z.array(nonNegativeNumberSchema),
  dashOffset: z.number(),
  startArrow: arrowEndingSchema.optional(),
  endArrow: arrowEndingSchema.optional(),
});

const effectBaseShape = {
  id: idSchema,
  enabled: z.boolean(),
  opacity: normalizedNumberSchema,
  blendMode: blendModeSchema,
};
const shadowSchemas = [
  z.strictObject({
    ...effectBaseShape,
    kind: z.literal('drop-shadow'),
    offset: pointSchema,
    radius: nonNegativeNumberSchema,
    spread: z.number(),
    color: colorValueSchema,
  }),
  z.strictObject({
    ...effectBaseShape,
    kind: z.literal('inner-shadow'),
    offset: pointSchema,
    radius: nonNegativeNumberSchema,
    spread: z.number(),
    color: colorValueSchema,
  }),
] as const;

export const effectSchema: z.ZodType<Effect> = z.discriminatedUnion('kind', [
  z.strictObject({ ...effectBaseShape, kind: z.literal('blur'), radius: nonNegativeNumberSchema }),
  ...shadowSchemas,
  z.strictObject({
    ...effectBaseShape,
    kind: z.literal('glow'),
    radius: nonNegativeNumberSchema,
    spread: z.number(),
    color: colorValueSchema,
    inner: z.boolean(),
  }),
  z.strictObject({
    ...effectBaseShape,
    kind: z.literal('color-matrix'),
    matrix: z.tuple([
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
      z.number(),
    ]),
  }),
  z.strictObject({
    ...effectBaseShape,
    kind: z.literal('bevel'),
    depth: nonNegativeNumberSchema,
    angle: z.number(),
    altitude: z.number(),
    soften: nonNegativeNumberSchema,
    highlightColor: colorValueSchema,
    shadowColor: colorValueSchema,
  }),
  z.strictObject({
    ...effectBaseShape,
    kind: z.literal('displacement'),
    assetId: idSchema,
    scale: pointSchema,
    channelX: z.enum(['red', 'green', 'blue', 'alpha', 'luminance']),
    channelY: z.enum(['red', 'green', 'blue', 'alpha', 'luminance']),
  }),
  z.strictObject({ ...effectBaseShape, kind: z.literal('opacity'), amount: normalizedNumberSchema }),
  z.strictObject({ ...effectBaseShape, kind: z.literal('backdrop-blur'), radius: nonNegativeNumberSchema }),
]);

const clipDefinitionSchema: z.ZodType<ClipDefinition> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('vector'), vectorElementId: idSchema, fillRule: z.enum(['nonzero', 'evenodd']) }),
  z.strictObject({
    kind: z.literal('component-path'),
    componentInstanceId: idSchema,
    vectorElementId: idSchema,
    fillRule: z.enum(['nonzero', 'evenodd']),
  }),
]);

const maskDefinitionSchema: z.ZodType<MaskDefinition> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('vector'), vectorElementId: idSchema, mode: z.enum(['alpha', 'luminance']) }),
  z.strictObject({
    kind: z.literal('component-path'),
    componentInstanceId: idSchema,
    vectorElementId: idSchema,
    mode: z.enum(['alpha', 'luminance']),
  }),
  z.strictObject({ kind: z.literal('asset'), assetId: idSchema, mode: z.enum(['alpha', 'luminance']) }),
]);

export const appearanceSchema: z.ZodType<Appearance> = z
  .strictObject({
    opacity: normalizedNumberSchema,
    blendMode: blendModeSchema,
    isolation: z.boolean(),
    fills: z.array(fillLayerSchema),
    strokes: z.array(strokeLayerSchema),
    effects: z.array(effectSchema),
    clip: clipDefinitionSchema.optional(),
    mask: maskDefinitionSchema.optional(),
  })
  .superRefine((appearance, context) => {
    validateUniqueIds({ items: appearance.fills, context, path: ['fills'] });
    validateUniqueIds({ items: appearance.strokes, context, path: ['strokes'] });
    validateUniqueIds({ items: appearance.effects, context, path: ['effects'] });
  });
