import { z } from 'zod';

import { type Appearance, appearanceSchema, type NormalizedRect, normalizedRectSchema } from './appearance';
import { type Id, idSchema } from './identity';
import { type ExtensionEnvelope, extensionEnvelopeSchema, type JsonValue, jsonValueSchema } from './json-value';
import { type BlobReference, blobReferenceSchema } from './resources';
import { mediaTypeSchema, nonEmptyStringSchema, validateUniqueIds, validateUniqueValues } from './schema-helpers';
import { type TextBody, textBodySchema } from './text';
import { type TypedValue, typedValueSchema } from './typed-value';

export type ElementKind =
  | 'text'
  | 'image'
  | 'vector'
  | 'group'
  | 'component-instance'
  | 'video'
  | 'audio'
  | 'clock'
  | 'ticker'
  | 'qrcode'
  | 'foreign'
  | 'plugin';

export type ElementTransform =
  | { readonly kind: 'affine2d'; readonly matrix: readonly [number, number, number, number, number, number] }
  | {
      readonly kind: 'matrix3d';
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
      ];
    };

export interface ElementGeometry {
  readonly bounds: { readonly width: number; readonly height: number };
  readonly transform: ElementTransform;
  readonly origin: readonly [number, number, number];
}

export interface ElementAccessibility {
  readonly decorative: boolean;
  readonly role?: 'img' | 'text' | 'group' | 'presentation' | 'timer' | 'marquee' | undefined;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
}

export interface ElementBase {
  readonly id: Id;
  readonly name: string;
  readonly parentId: Id | null;
  readonly locked: boolean;
  readonly hiddenInEditor: boolean;
  readonly geometry: ElementGeometry;
  readonly appearance: Appearance;
  readonly accessibility?: ElementAccessibility | undefined;
  readonly sharedStyleIds: readonly Id[];
  readonly extensions: readonly ExtensionEnvelope[];
}

export interface TextLayoutOptions {
  readonly verticalAlignment: 'top' | 'middle' | 'bottom';
  readonly overflow: 'clip' | 'visible' | 'ellipsis';
  readonly autoSize: 'none' | 'width' | 'height' | 'both';
  readonly columns: number;
  readonly columnGap: number;
}

export interface TextElement extends ElementBase {
  readonly kind: 'text';
  readonly text: TextBody;
  readonly layout: TextLayoutOptions;
  readonly textPath?:
    | { readonly vectorElementId: Id; readonly startOffset: number; readonly side: 'left' | 'right' }
    | undefined;
}

export interface ImageElement extends ElementBase {
  readonly kind: 'image';
  readonly image: {
    readonly assetId: Id;
    readonly fit: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    readonly crop?: NormalizedRect | undefined;
    readonly focalPoint?: readonly [number, number] | undefined;
  };
}

export interface PathPoint {
  readonly id: Id;
  readonly x: number;
  readonly y: number;
}

export type PathSegment =
  | { readonly id: Id; readonly kind: 'move' | 'line'; readonly pointId: Id }
  | { readonly id: Id; readonly kind: 'quadratic'; readonly control: readonly [number, number]; readonly pointId: Id }
  | {
      readonly id: Id;
      readonly kind: 'cubic';
      readonly control1: readonly [number, number];
      readonly control2: readonly [number, number];
      readonly pointId: Id;
    }
  | { readonly id: Id; readonly kind: 'close' };

export interface StructuredPath {
  readonly points: readonly PathPoint[];
  readonly segments: readonly PathSegment[];
  readonly closed: boolean;
}

export type VectorGeometryData =
  | { readonly kind: 'rectangle'; readonly cornerRadii: readonly [number, number, number, number] }
  | { readonly kind: 'ellipse' }
  | { readonly kind: 'path'; readonly path: StructuredPath; readonly fillRule: 'nonzero' | 'evenodd' }
  | {
      readonly kind: 'boolean';
      readonly operation: 'union' | 'subtract' | 'intersect' | 'exclude';
      readonly operandIds: readonly Id[];
    };

export interface VectorElement extends ElementBase {
  readonly kind: 'vector';
  readonly geometryData: VectorGeometryData;
}

export interface GroupElement extends ElementBase {
  readonly kind: 'group';
  readonly group: { readonly clipChildren: boolean };
}

export interface ExposedPropertyValue {
  readonly exposedPropertyId: Id;
  readonly value: TypedValue;
}

export interface ComponentInstanceElement extends ElementBase {
  readonly kind: 'component-instance';
  readonly componentId: Id;
  readonly propertyValues: readonly ExposedPropertyValue[];
}

export interface VideoElement extends ElementBase {
  readonly kind: 'video';
  readonly video: {
    readonly assetId: Id;
    readonly fit: 'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
    readonly autoplay: boolean;
    readonly loop: boolean;
    readonly muted: boolean;
    readonly controls: boolean;
  };
}

export interface AudioElement extends ElementBase {
  readonly kind: 'audio';
  readonly audio: { readonly assetId: Id; readonly autoplay: boolean; readonly loop: boolean; readonly volume: number };
}

export interface ClockElement extends ElementBase {
  readonly kind: 'clock';
  readonly clock: { readonly format: string; readonly timeZone: string; readonly locale?: string | undefined };
}

export interface TickerItem {
  readonly id: Id;
  readonly text: string;
}

export interface TickerElement extends ElementBase {
  readonly kind: 'ticker';
  readonly ticker: {
    readonly items: readonly TickerItem[];
    readonly direction: 'left' | 'right' | 'up' | 'down';
    readonly speed: number;
    readonly gap: number;
    readonly repeat: boolean;
  };
}

export interface QrCodeElement extends ElementBase {
  readonly kind: 'qrcode';
  readonly qrcode: {
    readonly value: string;
    readonly errorCorrection: 'L' | 'M' | 'Q' | 'H';
    readonly quietZone: number;
  };
}

export interface ForeignElement extends ElementBase {
  readonly kind: 'foreign';
  readonly foreign: {
    readonly mediaType: string;
    readonly sourceBlob: BlobReference;
    readonly previewAssetId: Id;
    readonly safeRenderMode: 'preview-only' | 'sanitized-vector';
    readonly reason: string;
  };
}

export interface PluginElement extends ElementBase {
  readonly kind: 'plugin';
  readonly plugin: {
    readonly pluginId: string;
    readonly elementType: string;
    readonly schemaVersion: number;
    readonly payload: JsonValue;
    readonly previewAssetId?: Id | undefined;
  };
}

export type Element =
  | TextElement
  | ImageElement
  | VectorElement
  | GroupElement
  | ComponentInstanceElement
  | VideoElement
  | AudioElement
  | ClockElement
  | TickerElement
  | QrCodeElement
  | ForeignElement
  | PluginElement;

export const elementTransformSchema: z.ZodType<ElementTransform> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('affine2d'),
    matrix: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
  }),
  z.strictObject({
    kind: z.literal('matrix3d'),
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
    ]),
  }),
]);

export const elementGeometrySchema: z.ZodType<ElementGeometry> = z.strictObject({
  bounds: z.strictObject({ width: z.number().positive(), height: z.number().positive() }),
  transform: elementTransformSchema,
  origin: z.tuple([z.number(), z.number(), z.number()]),
});

const accessibilitySchema: z.ZodType<ElementAccessibility> = z.strictObject({
  decorative: z.boolean(),
  role: z.enum(['img', 'text', 'group', 'presentation', 'timer', 'marquee']).optional(),
  label: nonEmptyStringSchema.optional(),
  description: nonEmptyStringSchema.optional(),
});

const elementBaseShape = {
  id: idSchema,
  name: nonEmptyStringSchema,
  parentId: idSchema.nullable(),
  locked: z.boolean(),
  hiddenInEditor: z.boolean(),
  geometry: elementGeometrySchema,
  appearance: appearanceSchema,
  accessibility: accessibilitySchema.optional(),
  sharedStyleIds: z.array(idSchema),
  extensions: z.array(extensionEnvelopeSchema),
};

const textElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('text'),
  text: textBodySchema,
  layout: z.strictObject({
    verticalAlignment: z.enum(['top', 'middle', 'bottom']),
    overflow: z.enum(['clip', 'visible', 'ellipsis']),
    autoSize: z.enum(['none', 'width', 'height', 'both']),
    columns: z.number().int().positive(),
    columnGap: z.number().nonnegative(),
  }),
  textPath: z
    .strictObject({ vectorElementId: idSchema, startOffset: z.number(), side: z.enum(['left', 'right']) })
    .optional(),
});

const normalizedPointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
const imageElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('image'),
  image: z.strictObject({
    assetId: idSchema,
    fit: z.enum(['fill', 'contain', 'cover', 'none', 'scale-down']),
    crop: normalizedRectSchema.optional(),
    focalPoint: normalizedPointSchema.optional(),
  }),
});

const pathPointSchema: z.ZodType<PathPoint> = z.strictObject({ id: idSchema, x: z.number(), y: z.number() });
const pointSchema = z.tuple([z.number(), z.number()]);
const pathSegmentSchema: z.ZodType<PathSegment> = z.discriminatedUnion('kind', [
  z.strictObject({ id: idSchema, kind: z.literal('move'), pointId: idSchema }),
  z.strictObject({ id: idSchema, kind: z.literal('line'), pointId: idSchema }),
  z.strictObject({ id: idSchema, kind: z.literal('quadratic'), control: pointSchema, pointId: idSchema }),
  z.strictObject({
    id: idSchema,
    kind: z.literal('cubic'),
    control1: pointSchema,
    control2: pointSchema,
    pointId: idSchema,
  }),
  z.strictObject({ id: idSchema, kind: z.literal('close') }),
]);
const structuredPathSchema: z.ZodType<StructuredPath> = z
  .strictObject({ points: z.array(pathPointSchema), segments: z.array(pathSegmentSchema), closed: z.boolean() })
  .superRefine((path, context) => {
    validateUniqueIds({ items: path.points, context, path: ['points'] });
    validateUniqueIds({ items: path.segments, context, path: ['segments'] });
  });
const vectorGeometryDataSchema: z.ZodType<VectorGeometryData> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('rectangle'),
    cornerRadii: z.tuple([
      z.number().nonnegative(),
      z.number().nonnegative(),
      z.number().nonnegative(),
      z.number().nonnegative(),
    ]),
  }),
  z.strictObject({ kind: z.literal('ellipse') }),
  z.strictObject({ kind: z.literal('path'), path: structuredPathSchema, fillRule: z.enum(['nonzero', 'evenodd']) }),
  z
    .strictObject({
      kind: z.literal('boolean'),
      operation: z.enum(['union', 'subtract', 'intersect', 'exclude']),
      operandIds: z.array(idSchema),
    })
    .superRefine((data, context) => {
      validateUniqueValues({ items: data.operandIds, context, path: ['operandIds'] });
    }),
]);
const vectorElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('vector'),
  geometryData: vectorGeometryDataSchema,
});
const groupElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('group'),
  group: z.strictObject({ clipChildren: z.boolean() }),
});

const propertyValueSchema: z.ZodType<ExposedPropertyValue> = z.strictObject({
  exposedPropertyId: idSchema,
  value: typedValueSchema,
});
const componentInstanceElementSchema = z
  .strictObject({
    ...elementBaseShape,
    kind: z.literal('component-instance'),
    componentId: idSchema,
    propertyValues: z.array(propertyValueSchema),
  })
  .superRefine((element, context) => {
    const values = element.propertyValues.map(({ exposedPropertyId }) => ({ id: exposedPropertyId }));

    validateUniqueIds({ items: values, context, path: ['propertyValues'] });
  });

const videoElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('video'),
  video: z.strictObject({
    assetId: idSchema,
    fit: z.enum(['fill', 'contain', 'cover', 'none', 'scale-down']),
    autoplay: z.boolean(),
    loop: z.boolean(),
    muted: z.boolean(),
    controls: z.boolean(),
  }),
});
const audioElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('audio'),
  audio: z.strictObject({
    assetId: idSchema,
    autoplay: z.boolean(),
    loop: z.boolean(),
    volume: z.number().min(0).max(1),
  }),
});
const clockElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('clock'),
  clock: z.strictObject({
    format: nonEmptyStringSchema,
    timeZone: nonEmptyStringSchema,
    locale: nonEmptyStringSchema.optional(),
  }),
});
const tickerItemSchema: z.ZodType<TickerItem> = z.strictObject({ id: idSchema, text: z.string() });
const tickerElementSchema = z
  .strictObject({
    ...elementBaseShape,
    kind: z.literal('ticker'),
    ticker: z.strictObject({
      items: z.array(tickerItemSchema),
      direction: z.enum(['left', 'right', 'up', 'down']),
      speed: z.number().nonnegative(),
      gap: z.number().nonnegative(),
      repeat: z.boolean(),
    }),
  })
  .superRefine((element, context) => {
    validateUniqueIds({ items: element.ticker.items, context, path: ['ticker', 'items'] });
  });
const qrCodeElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('qrcode'),
  qrcode: z.strictObject({
    value: nonEmptyStringSchema,
    errorCorrection: z.enum(['L', 'M', 'Q', 'H']),
    quietZone: z.number().int().nonnegative(),
  }),
});
const foreignElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('foreign'),
  foreign: z.strictObject({
    mediaType: mediaTypeSchema,
    sourceBlob: blobReferenceSchema,
    previewAssetId: idSchema,
    safeRenderMode: z.enum(['preview-only', 'sanitized-vector']),
    reason: nonEmptyStringSchema,
  }),
});
const pluginElementSchema = z.strictObject({
  ...elementBaseShape,
  kind: z.literal('plugin'),
  plugin: z.strictObject({
    pluginId: nonEmptyStringSchema,
    elementType: nonEmptyStringSchema,
    schemaVersion: z.number().int().positive(),
    payload: jsonValueSchema,
    previewAssetId: idSchema.optional(),
  }),
});

export const elementSchema: z.ZodType<Element> = z.discriminatedUnion('kind', [
  textElementSchema,
  imageElementSchema,
  vectorElementSchema,
  groupElementSchema,
  componentInstanceElementSchema,
  videoElementSchema,
  audioElementSchema,
  clockElementSchema,
  tickerElementSchema,
  qrCodeElementSchema,
  foreignElementSchema,
  pluginElementSchema,
]);
