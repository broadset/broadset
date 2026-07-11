import { z } from 'zod';

import { type Paint, paintSchema } from './appearance';
import { type ColorSpace } from './color';
import { type ComponentDefinition, componentDefinitionSchema } from './component';
import { type Binding, bindingSchema, type ViewModel, viewModelSchema } from './data';
import { type Element, elementSchema } from './element';
import { type Id, idSchema } from './identity';
import { type ExtensionEnvelope, extensionEnvelopeSchema } from './json-value';
import { type PageDefinition, pageDefinitionSchema } from './page';
import { nonEmptyStringSchema, validateUniqueIds } from './schema-helpers';
import {
  type LifecycleDefinition,
  lifecycleDefinitionSchema,
  type Sequence,
  sequenceSchema,
  type StateMachine,
  stateMachineSchema,
} from './sequence';
import { type Timebase, timebaseSchema } from './time';

export interface DocumentMetadata {
  readonly description?: string | undefined;
  readonly authors: readonly string[];
  readonly keywords: readonly string[];
  readonly rights?: string | undefined;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface GuideDefinition {
  readonly id: Id;
  readonly name: string;
  readonly axis: 'x' | 'y';
  readonly position: number;
  readonly locked: boolean;
}

export interface NamedPercentageInsets {
  readonly id: Id;
  readonly name: string;
  readonly insets: readonly [number, number, number, number];
}

export type ColorSpaceDefinition =
  | { readonly kind: 'named'; readonly space: ColorSpace }
  | { readonly kind: 'icc'; readonly iccProfileAssetId: Id; readonly model: 'rgb' | 'cmyk' | 'gray' | 'lab' };

export interface SurfaceDefinition {
  readonly size: readonly [number, number];
  readonly unit: 'px' | 'mm' | 'in';
  readonly dpi: number;
  readonly coordinateSystem: { readonly origin: 'top-left'; readonly xAxis: 'right'; readonly yAxis: 'down' };
  readonly background: Paint;
  readonly padding: Insets;
  readonly guides: readonly GuideDefinition[];
  readonly broadcastSafeAreas: readonly NamedPercentageInsets[];
  readonly prepress?: { readonly bleed: Insets; readonly trim: Insets; readonly safe: Insets } | undefined;
}

export interface DocumentColorConfiguration {
  readonly workingSpace: ColorSpaceDefinition;
  readonly compositing: 'linear-premultiplied';
  readonly outputIntent?:
    | {
        readonly iccProfileAssetId: Id;
        readonly renderingIntent: 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric';
        readonly blackPointCompensation: boolean;
      }
    | undefined;
}

export interface BroadsetDocumentV1 {
  readonly id: Id;
  readonly name: string;
  readonly kind: 'motion' | 'static' | 'print';
  readonly metadata?: DocumentMetadata | undefined;
  readonly surface: SurfaceDefinition;
  readonly timebase?: Timebase | undefined;
  readonly color: DocumentColorConfiguration;
  readonly elements: readonly Element[];
  readonly components: readonly ComponentDefinition[];
  readonly pages: readonly PageDefinition[];
  readonly sequences: readonly Sequence[];
  readonly lifecycle?: LifecycleDefinition | undefined;
  readonly stateMachines: readonly StateMachine[];
  readonly viewModels: readonly ViewModel[];
  readonly bindings: readonly Binding[];
  readonly selectedVariableModes: Readonly<Record<Id, Id>>;
  readonly outputProfileIds: readonly Id[];
  readonly extensions: readonly ExtensionEnvelope[];
}

const insetsSchema: z.ZodType<Insets> = z.strictObject({
  top: z.number().nonnegative(),
  right: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
  left: z.number().nonnegative(),
});

const guideDefinitionSchema: z.ZodType<GuideDefinition> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  axis: z.enum(['x', 'y']),
  position: z.number(),
  locked: z.boolean(),
});

const namedPercentageInsetsSchema: z.ZodType<NamedPercentageInsets> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  insets: z.tuple([
    z.number().min(0).max(50),
    z.number().min(0).max(50),
    z.number().min(0).max(50),
    z.number().min(0).max(50),
  ]),
});

const colorSpaceDefinitionSchema: z.ZodType<ColorSpaceDefinition> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('named'),
    space: z.enum(['srgb', 'display-p3', 'rec2020', 'lab', 'oklab', 'oklch', 'cmyk', 'gray']),
  }),
  z.strictObject({
    kind: z.literal('icc'),
    iccProfileAssetId: idSchema,
    model: z.enum(['rgb', 'cmyk', 'gray', 'lab']),
  }),
]);

export const surfaceDefinitionSchema: z.ZodType<SurfaceDefinition> = z.strictObject({
  size: z.tuple([z.number().positive(), z.number().positive()]),
  unit: z.enum(['px', 'mm', 'in']),
  dpi: z.number().positive(),
  coordinateSystem: z.strictObject({
    origin: z.literal('top-left'),
    xAxis: z.literal('right'),
    yAxis: z.literal('down'),
  }),
  background: paintSchema,
  padding: insetsSchema,
  guides: z.array(guideDefinitionSchema),
  broadcastSafeAreas: z.array(namedPercentageInsetsSchema),
  prepress: z.strictObject({ bleed: insetsSchema, trim: insetsSchema, safe: insetsSchema }).optional(),
});

const documentColorConfigurationSchema: z.ZodType<DocumentColorConfiguration> = z.strictObject({
  workingSpace: colorSpaceDefinitionSchema,
  compositing: z.literal('linear-premultiplied'),
  outputIntent: z
    .strictObject({
      iccProfileAssetId: idSchema,
      renderingIntent: z.enum(['perceptual', 'relative-colorimetric', 'saturation', 'absolute-colorimetric']),
      blackPointCompensation: z.boolean(),
    })
    .optional(),
});

export const broadsetDocumentV1Schema: z.ZodType<BroadsetDocumentV1> = z
  .strictObject({
    id: idSchema,
    name: nonEmptyStringSchema,
    kind: z.enum(['motion', 'static', 'print']),
    metadata: z
      .strictObject({
        description: z.string().optional(),
        authors: z.array(nonEmptyStringSchema),
        keywords: z.array(nonEmptyStringSchema),
        rights: z.string().optional(),
      })
      .optional(),
    surface: surfaceDefinitionSchema,
    timebase: timebaseSchema.optional(),
    color: documentColorConfigurationSchema,
    elements: z.array(elementSchema),
    components: z.array(componentDefinitionSchema),
    pages: z.array(pageDefinitionSchema).min(1),
    sequences: z.array(sequenceSchema),
    lifecycle: lifecycleDefinitionSchema.optional(),
    stateMachines: z.array(stateMachineSchema),
    viewModels: z.array(viewModelSchema),
    bindings: z.array(bindingSchema),
    selectedVariableModes: z.record(idSchema, idSchema),
    outputProfileIds: z.array(idSchema),
    extensions: z.array(extensionEnvelopeSchema),
  })
  .superRefine((document, context) => {
    if (document.kind === 'motion' && document.timebase === undefined) {
      context.addIssue({ code: 'custom', message: 'Motion documents require a timebase', path: ['timebase'] });
    }

    validateUniqueIds({ items: document.surface.guides, context, path: ['surface', 'guides'] });
    validateUniqueIds({ items: document.surface.broadcastSafeAreas, context, path: ['surface', 'broadcastSafeAreas'] });
  });
