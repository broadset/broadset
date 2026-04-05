import { z } from 'zod';

import { type AnimationDefinition, animationsSchema } from './animation';
import { type BroadsetElement, elementSchema } from './element';
import {
  hasAcyclicParentIds,
  hasUniqueElementIds,
  hasValidPageOverrideReferences,
  hasValidParentIds,
} from './page-validation';
import type { BroadsetElementStyle } from './style';

export interface SafeAreas {
  readonly actionSafe?: readonly [number, number, number, number] | undefined;
  readonly titleSafe?: readonly [number, number, number, number] | undefined;
  readonly custom?:
    | readonly {
        readonly name: string;
        readonly insets: readonly [number, number, number, number];
      }[]
    | undefined;
}

export interface Canvas {
  readonly width: number;
  readonly height: number;
  readonly unit: 'px' | 'mm' | 'in';
  readonly dpi: number;
  readonly padding: readonly [number, number, number, number];
  readonly backgroundColor?: string | undefined;
  readonly backgroundMode: 'transparent' | 'solid';
  readonly safeAreas?: SafeAreas | undefined;
}

export interface ElementOverride {
  readonly elementId: string;
  readonly content?: string | undefined;
  readonly assetId?: string | undefined;
  readonly visible?: boolean | undefined;
  readonly style?: Partial<BroadsetElementStyle> | undefined;
}

export interface Page {
  readonly id: string;
  readonly name: string;
  readonly overrides: readonly ElementOverride[];
  readonly locale: string | null;
  readonly extensions: Readonly<Record<string, unknown>>;
  /** Legacy compatibility field. New documents should use `document.elements`. */
  readonly elements?: readonly BroadsetElement[] | undefined;
}

export interface DataSchemaField {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  readonly label?: string | undefined;
  readonly defaultValue?: unknown;
  readonly constraints?: Readonly<Record<string, unknown>> | undefined;
  readonly arrayItemSchema?: readonly Readonly<Record<string, unknown>>[] | undefined;
}

export interface DataSchema {
  readonly description?: string | undefined;
  readonly fields: readonly DataSchemaField[];
}

export interface BroadsetDocument {
  readonly id: string;
  readonly name: string;
  readonly documentMode: 'screen' | 'print';
  readonly canvas: Canvas;
  readonly elements: readonly BroadsetElement[];
  readonly animations: readonly AnimationDefinition[];
  /** Legacy alias retained for compatibility with earlier phase fixtures. */
  readonly animationRegistry?: readonly AnimationDefinition[] | undefined;
  readonly pages: readonly Page[];
  readonly dataSchema: DataSchema;
  readonly output?: Readonly<Record<string, unknown>> | undefined;
  readonly extensions?: Readonly<Record<string, unknown>> | undefined;
}

export type PageElement = BroadsetElement;

const safeAreaInsetsSchema = z.tuple([
  z.number().min(0).max(50),
  z.number().min(0).max(50),
  z.number().min(0).max(50),
  z.number().min(0).max(50),
]);

const safeAreasSchema = z.object({
  actionSafe: safeAreaInsetsSchema.optional(),
  titleSafe: safeAreaInsetsSchema.optional(),
  custom: z
    .array(
      z.object({
        name: z.string().min(1),
        insets: safeAreaInsetsSchema,
      }),
    )
    .optional(),
});

const canvasSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['px', 'mm', 'in']).optional(),
  dpi: z.number().positive().optional(),
  padding: z.tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
  ]),
  backgroundColor: z.string().optional(),
  backgroundMode: z.enum(['transparent', 'solid']).optional(),
  safeAreas: safeAreasSchema.optional(),
});

const elementOverrideSchema: z.ZodType<ElementOverride> = z.object({
  elementId: z.string().min(1),
  content: z.string().optional(),
  assetId: z.string().optional(),
  visible: z.boolean().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

const pageSchema: z.ZodType<Page> = z.object({
  id: z.string().min(1),
  name: z.string().default('Page'),
  overrides: z.array(elementOverrideSchema),
  locale: z.string().nullable().default(null),
  extensions: z.record(z.string(), z.unknown()).default({}),
  elements: z.array(elementSchema).optional(),
});

const legacyPageSchema = z.object({
  id: z.string().min(1),
  elements: z.array(elementSchema),
});

const dataSchemaFieldSchema: z.ZodType<DataSchemaField> = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  label: z.string().optional(),
  defaultValue: z.unknown().optional(),
  constraints: z.record(z.string(), z.unknown()).optional(),
  arrayItemSchema: z.array(z.record(z.string(), z.unknown())).optional(),
});

const dataSchemaSchema: z.ZodType<DataSchema> = z.object({
  description: z.string().optional(),
  fields: z.array(dataSchemaFieldSchema).default([]),
});

const DEFAULT_SCREEN_CANVAS_DPI = 96;
const DEFAULT_PRINT_CANVAS_DPI = 300;

function defaultCanvasForMode(mode: 'screen' | 'print', canvas: z.infer<typeof canvasSchema>): Canvas {
  return {
    width: canvas.width,
    height: canvas.height,
    unit: canvas.unit ?? (mode === 'screen' ? 'px' : 'mm'),
    dpi: canvas.dpi ?? (mode === 'screen' ? DEFAULT_SCREEN_CANVAS_DPI : DEFAULT_PRINT_CANVAS_DPI),
    padding: canvas.padding,
    backgroundColor: canvas.backgroundColor,
    backgroundMode: canvas.backgroundMode ?? (mode === 'screen' ? 'transparent' : 'solid'),
    safeAreas: canvas.safeAreas,
  };
}

function normalizePages(rawPages: readonly (Page | z.infer<typeof legacyPageSchema>)[]): readonly Page[] {
  return rawPages.map((page) => {
    if ('overrides' in page) {
      return {
        id: page.id,
        name: page.name,
        overrides: page.overrides,
        locale: page.locale ?? null,
        extensions: page.extensions,
        elements: page.elements ?? [],
      };
    }

    return {
      id: page.id,
      name: page.id,
      overrides: [],
      locale: null,
      extensions: {},
      elements: page.elements,
    };
  });
}

function getLegacyElements(rawPages: readonly (Page | z.infer<typeof legacyPageSchema>)[]): readonly BroadsetElement[] {
  const firstLegacyPage = rawPages.find((page): page is z.infer<typeof legacyPageSchema> => 'elements' in page);

  return firstLegacyPage === undefined ? [] : firstLegacyPage.elements;
}

export const broadsetDocumentSchema: z.ZodType<BroadsetDocument> = z
  .object({
    id: z.string().min(1),
    name: z.string().default('Untitled Document'),
    documentMode: z.enum(['screen', 'print']),
    canvas: canvasSchema,
    elements: z.array(elementSchema).optional(),
    pages: z.array(z.union([pageSchema, legacyPageSchema])).min(1),
    animations: animationsSchema.optional(),
    animationRegistry: animationsSchema.optional(),
    dataSchema: dataSchemaSchema.optional(),
    output: z.record(z.string(), z.unknown()).optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    const effectiveElements = value.elements ?? getLegacyElements(value.pages);

    if (!hasUniqueElementIds(effectiveElements)) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate element IDs within document',
        path: ['elements'],
      });
    }

    if (!hasValidParentIds(effectiveElements)) {
      context.addIssue({
        code: 'custom',
        message: 'parentId references a non-existent element',
        path: ['elements'],
      });
    }

    if (!hasAcyclicParentIds(effectiveElements)) {
      context.addIssue({
        code: 'custom',
        message: 'Circular parentId references detected',
        path: ['elements'],
      });
    }

    const normalizedPages = normalizePages(value.pages);

    if (!hasValidPageOverrideReferences({ elements: effectiveElements, pages: normalizedPages })) {
      context.addIssue({
        code: 'custom',
        message: 'Page overrides must reference elements defined on the document',
        path: ['pages'],
      });
    }
  })
  .transform(
    (value): BroadsetDocument => ({
      id: value.id,
      name: value.name,
      documentMode: value.documentMode,
      canvas: defaultCanvasForMode(value.documentMode, value.canvas),
      elements: value.elements ?? getLegacyElements(value.pages),
      animations: value.animations ?? value.animationRegistry ?? [],
      animationRegistry: value.animations ?? value.animationRegistry ?? [],
      pages: normalizePages(value.pages),
      dataSchema: value.dataSchema ?? { fields: [] },
      output: value.output,
      extensions: value.extensions,
    }),
  );

export function createEmptyBroadsetDocument(): BroadsetDocument {
  return broadsetDocumentSchema.parse({
    id: crypto.randomUUID(),
    name: 'Untitled Document',
    documentMode: 'screen',
    canvas: {
      width: 1920,
      height: 1080,
      unit: 'px',
      dpi: 96,
      padding: [0, 0, 0, 0],
    },
    elements: [],
    animations: [],
    animationRegistry: [],
    pages: [
      {
        id: 'page-1',
        name: 'Default',
        overrides: [],
        locale: null,
        extensions: {},
        elements: [],
      },
    ],
    dataSchema: { fields: [] },
    extensions: {},
  });
}
