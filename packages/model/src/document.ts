import { z } from 'zod';

import { type AnimationDefinition, animationsSchema } from './animation';
import { type BroadsetGradient, broadsetGradientSchema } from './broadset-gradient';
import { type BroadsetElement, elementSchema } from './element';
import { refineExtensionsAgainstRegistry } from './extensions-types';
import { type OutputSpec, outputSpecSchema } from './output-spec';
import {
  hasAcyclicParentIds,
  hasUniqueElementIds,
  hasValidPageElementReferences,
  hasValidParentIds,
} from './page-validation';
import { type BroadsetElementStyleInput } from './style';
import { type TextBody, textBodySchema } from './text-body';
import { hasValidTextPathReferences } from './text-path-validation';

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

/** `[top, right, bottom, left]` inset tuple for a print prepress box, expressed in the canvas-declared unit. */
export type PrepressInset = readonly [number, number, number, number];

export interface Canvas {
  readonly width: number;
  readonly height: number;
  readonly unit: 'px' | 'mm' | 'in';
  readonly dpi: number;
  readonly padding: readonly [number, number, number, number];
  readonly backgroundColor?: string | undefined;
  readonly backgroundGradient?: BroadsetGradient | undefined;
  readonly backgroundMode: 'transparent' | 'solid' | 'gradient';
  readonly safeAreas?: SafeAreas | undefined;
  readonly bleed?: PrepressInset | undefined;
  readonly trim?: PrepressInset | undefined;
  readonly safeArea?: PrepressInset | undefined;
}

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PageElementTransform {
  readonly position: Vector3;
  readonly rotation: Vector3;
  readonly scale: Vector3;
}

export interface PageElementInstance {
  readonly elementId: string;
  readonly transform: PageElementTransform;
  readonly visible: boolean;
  /**
   * Per-page override of the element's `content`. When present, supersedes
   * the document-level element's content for this page only. Use case:
   * the same template element rendered with different copy per page (e.g.
   * "Page 1 of 5", localized text variants, repeating-data renders).
   */
  readonly content?: string | TextBody | undefined;
  /**
   * Partial per-page style override, merged on top of the document-level
   * element's style. Only the keys present in the override are applied;
   * absent keys fall through to the element-level style. Mirrors the
   * input shape accepted by `styleSchema` so a page-author can provide
   * convenience inputs (string fills, number border radius) the same
   * way the element-level style accepts them.
   */
  readonly style?: Partial<BroadsetElementStyleInput> | undefined;
  /**
   * Per-page asset reference override. Lets a page swap an `image`
   * element's bitmap (or any element's `assetId`-bearing asset) without
   * forking the element. The override id resolves against the project's
   * `assets` registry the same way the element-level `assetId` does.
   */
  readonly assetId?: string | undefined;
}

export interface Page {
  readonly id: string;
  readonly name: string;
  readonly elements: readonly PageElementInstance[];
  readonly locale: string | null;
  readonly extensions: Readonly<Record<string, unknown>>;
  readonly notes?: string | undefined;
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

export interface DocumentMetadata {
  readonly title?: string | undefined;
  readonly author?: string | undefined;
  readonly subject?: string | undefined;
  readonly keywords?: readonly string[] | undefined;
  readonly rights?: string | undefined;
  readonly producer?: string | undefined;
}

export type OutputColorSpace = 'rgb' | 'cmyk' | 'gray' | 'lab';

export interface DocumentOutputIntent {
  readonly iccProfileAssetId: string;
  readonly colorSpace: OutputColorSpace;
  readonly identifier?: string | undefined;
}

export interface BroadsetDocument {
  readonly id: string;
  readonly name: string;
  readonly documentMode: 'screen' | 'print';
  readonly canvas: Canvas;
  readonly elements: readonly BroadsetElement[];
  readonly animations: readonly AnimationDefinition[];
  readonly pages: readonly Page[];
  readonly dataSchema: DataSchema;
  readonly output?: OutputSpec | undefined;
  readonly metadata?: DocumentMetadata | undefined;
  readonly outputIntent?: DocumentOutputIntent | undefined;
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

const prepressInsetSchema = z.tuple([
  z.number().nonnegative(),
  z.number().nonnegative(),
  z.number().nonnegative(),
  z.number().nonnegative(),
]);

const canvasSchema = z
  .object({
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
    backgroundGradient: broadsetGradientSchema.optional(),
    backgroundMode: z.enum(['transparent', 'solid', 'gradient']).optional(),
    safeAreas: safeAreasSchema.optional(),
    bleed: prepressInsetSchema.optional(),
    trim: prepressInsetSchema.optional(),
    safeArea: prepressInsetSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.backgroundMode === 'gradient' && value.backgroundGradient === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'backgroundGradient is required when backgroundMode is gradient',
        path: ['backgroundGradient'],
      });
    }
  });

const vector3Schema: z.ZodType<Vector3> = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const pageElementTransformSchema: z.ZodType<PageElementTransform> = z.object({
  position: vector3Schema,
  rotation: vector3Schema,
  scale: vector3Schema,
});

/**
 * Per-page `content` override accepts the same plain-string / `TextBody`
 * union the element-level `content` accepts, so a page can substitute
 * either shape without forcing the document author to commit to one.
 */
const pageElementContentOverrideSchema = z.union([z.string(), textBodySchema]);

/**
 * Per-page `style` override is a partial subset of `BroadsetElementStyleInput`.
 * We accept the same loose record shape `elementSchema` uses for `style`
 * — the override is merged into the element's persisted style at the
 * exporter / renderer boundary, where the full `styleSchema` runs to
 * normalize the merged result.
 */
const pageElementStyleOverrideSchema = z.record(z.string(), z.unknown());

const pageElementInstanceSchema: z.ZodType<PageElementInstance> = z.object({
  elementId: z.string().min(1),
  transform: pageElementTransformSchema,
  visible: z.boolean(),
  content: pageElementContentOverrideSchema.optional(),
  style: pageElementStyleOverrideSchema.optional(),
  assetId: z.string().min(1).optional(),
});

const pageSchema: z.ZodType<Page> = z.object({
  id: z.string().min(1),
  name: z.string().default('Page'),
  elements: z.array(pageElementInstanceSchema),
  locale: z.string().nullable().default(null),
  extensions: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().optional(),
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

const documentMetadataSchema: z.ZodType<DocumentMetadata> = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  subject: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  rights: z.string().optional(),
  producer: z.string().optional(),
});

const outputColorSpaceSchema: z.ZodType<OutputColorSpace> = z.enum(['rgb', 'cmyk', 'gray', 'lab']);

const documentOutputIntentSchema: z.ZodType<DocumentOutputIntent> = z.object({
  iccProfileAssetId: z.string().min(1),
  colorSpace: outputColorSpaceSchema,
  identifier: z.string().optional(),
});

const DEFAULT_SCREEN_CANVAS_DPI = 96;
const DEFAULT_PRINT_CANVAS_DPI = 300;

function lockDocumentMode(document: BroadsetDocument): BroadsetDocument {
  Object.defineProperty(document, 'documentMode', {
    configurable: false,
    enumerable: true,
    value: document.documentMode,
    writable: false,
  });

  return document;
}

function defaultCanvasForMode(mode: 'screen' | 'print', canvas: z.infer<typeof canvasSchema>): Canvas {
  return {
    width: canvas.width,
    height: canvas.height,
    unit: canvas.unit ?? (mode === 'screen' ? 'px' : 'mm'),
    dpi: canvas.dpi ?? (mode === 'screen' ? DEFAULT_SCREEN_CANVAS_DPI : DEFAULT_PRINT_CANVAS_DPI),
    padding: canvas.padding,
    backgroundColor: canvas.backgroundColor,
    backgroundGradient: canvas.backgroundGradient,
    backgroundMode: canvas.backgroundMode ?? (mode === 'screen' ? 'transparent' : 'solid'),
    safeAreas: canvas.safeAreas,
    bleed: canvas.bleed,
    trim: canvas.trim,
    safeArea: canvas.safeArea,
  };
}

export const broadsetDocumentSchema: z.ZodType<BroadsetDocument> = z
  .object({
    id: z.string().min(1),
    name: z.string().default('Untitled Document'),
    documentMode: z.enum(['screen', 'print']),
    canvas: canvasSchema,
    elements: z.array(elementSchema),
    pages: z.array(pageSchema).min(1),
    animations: animationsSchema,
    dataSchema: dataSchemaSchema,
    output: outputSpecSchema.optional(),
    metadata: documentMetadataSchema.optional(),
    outputIntent: documentOutputIntentSchema.optional(),
    extensions: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, context) => {
    const effectiveElements = value.elements;

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

    if (!hasValidPageElementReferences({ elements: effectiveElements, pages: value.pages })) {
      context.addIssue({
        code: 'custom',
        message: 'Page elements must reference document root elements',
        path: ['pages'],
      });
    }

    if (!hasValidTextPathReferences(effectiveElements)) {
      context.addIssue({
        code: 'custom',
        message:
          'textPathElementId must be set only on text elements and point to an existing path element in the same document',
        path: ['elements'],
      });
    }

    refineExtensionsAgainstRegistry(value.extensions, context);
  })
  .transform(
    (value): BroadsetDocument =>
      lockDocumentMode({
        id: value.id,
        name: value.name,
        documentMode: value.documentMode,
        canvas: defaultCanvasForMode(value.documentMode, value.canvas),
        elements: value.elements,
        animations: value.animations,
        pages: value.pages,
        dataSchema: value.dataSchema,
        output: value.output,
        metadata: value.metadata,
        outputIntent: value.outputIntent,
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
    pages: [
      {
        id: 'page-1',
        name: 'Default',
        elements: [],
        locale: null,
        extensions: {},
      },
    ],
    dataSchema: { fields: [] },
    extensions: {},
  });
}

/**
 * Build a {@link PageElementInstance} that places `element` on a page
 * at its own document-level position/rotation. The active-page renderer
 * (`buildRenderableDocumentForActivePage` and friends) only includes
 * root elements that have a `PageElementInstance` on the active page,
 * and uses the instance's transform — not the element's own
 * `position`/`rotation` — as the rendered geometry. Importers (PDF,
 * PSD, PPTX, SVG) MUST therefore create one of these for every imported
 * root element, otherwise the document parses cleanly but the canvas
 * and layer panel render nothing. The instance copies the element's
 * geometry so the imported document looks the way the source file
 * looked the moment it was loaded.
 */
export function createPageElementInstanceForElement(element: BroadsetElement): PageElementInstance {
  return {
    elementId: element.id,
    transform: {
      position: { x: element.position.x, y: element.position.y, z: 0 },
      rotation: { x: 0, y: 0, z: element.rotation },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  };
}

/**
 * Defensive post-processing for importers that rehydrate a serialized
 * Broadset document (PPTX fast-path, custom-XML payload, project JSON
 * stored in third-party metadata, etc.). Older / externally-edited
 * payloads can carry root elements without matching `PageElementInstance`
 * entries — the document parses but renders empty. This helper appends
 * an identity-transform instance for every root element that is
 * missing from the first page so the canvas always has something to
 * render. Existing instance entries on any page are kept as-is.
 */
export function ensureRootElementsHavePageInstances(document: BroadsetDocument): BroadsetDocument {
  const rootElements = document.elements.filter((el) => el.parentId === null);

  if (rootElements.length === 0) return document;

  const referencedIds = new Set(
    document.pages.flatMap((page) => page.elements.map((inst) => inst.elementId)),
  );
  const missingInstances = rootElements
    .filter((el) => !referencedIds.has(el.id))
    .map(createPageElementInstanceForElement);

  if (missingInstances.length === 0) return document;

  if (document.pages.length === 0) {
    return {
      ...document,
      pages: [
        {
          id: 'page-1',
          name: 'Default',
          elements: missingInstances,
          locale: null,
          extensions: {},
        },
      ],
    };
  }

  return {
    ...document,
    pages: document.pages.map((page, index) =>
      index === 0 ? { ...page, elements: [...page.elements, ...missingInstances] } : page,
    ),
  };
}
