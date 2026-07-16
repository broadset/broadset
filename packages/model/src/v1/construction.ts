import type { Appearance } from './appearance';
import type { ColorValue } from './color';
import type { BroadsetDocumentV1, DocumentColorConfiguration, SurfaceDefinition } from './document';
import type {
  AudioElement,
  ClockElement,
  ComponentInstanceElement,
  Element,
  ElementAccessibility,
  ElementBase,
  ElementGeometry,
  ElementTransform,
  ExposedPropertyValue,
  ForeignElement,
  GroupElement,
  ImageElement,
  PluginElement,
  QrCodeElement,
  TextElement,
  TextLayoutOptions,
  TickerElement,
  VectorGeometryData,
  VideoElement,
} from './element';
import { type Id, idSchema, type UtcTimestamp, utcTimestampSchema } from './identity';
import type { ExtensionEnvelope } from './json-value';
import type { PageDefinition } from './page';
import type { BroadsetProjectV1, ProjectMetadata, ProjectResources } from './project';
import type { ParagraphProperties, RunProperties, TextBody } from './text';
import type { Timebase } from './time';

/**
 * Identity affine transform: no translation, rotation, scale, or skew. Frozen so the shared reference
 * cannot be mutated by any consumer that receives it as a defaulted element transform.
 */
export const IDENTITY_AFFINE2D: ElementTransform = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] };
Object.freeze(IDENTITY_AFFINE2D);
Object.freeze(IDENTITY_AFFINE2D.matrix);

const DEFAULT_SURFACE_WIDTH = 1920;
const DEFAULT_SURFACE_HEIGHT = 1080;
const DEFAULT_DPI = 96;
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;
const DEFAULT_TIMESTAMP = '2025-01-01T00:00:00Z';
const PROJECT_SCHEMA_URL = 'https://schema.broadset.dev/v1/project.schema.json';

/** A fully opaque, effect-free appearance with no fills or strokes. */
export function createDefaultAppearance(): Appearance {
  return { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] };
}

/** Solid black in the sRGB working space. */
export function createBlackColorValue(): ColorValue {
  return { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 };
}

/** Element geometry with an identity transform and origin at the top-left. */
export function createElementGeometry(options: {
  readonly width: number;
  readonly height: number;
  readonly transform?: ElementTransform;
  readonly origin?: readonly [number, number, number];
}): ElementGeometry {
  return {
    bounds: { width: options.width, height: options.height },
    transform: options.transform ?? IDENTITY_AFFINE2D,
    origin: options.origin ?? [0, 0, 0],
  };
}

/** Common options shared by every element factory. */
export interface ElementBaseOptions {
  readonly id: Id;
  readonly name: string;
  readonly geometry: ElementGeometry;
  readonly parentId?: Id | null;
  readonly appearance?: Appearance;
  readonly locked?: boolean;
  readonly hiddenInEditor?: boolean;
  readonly sharedStyleIds?: readonly Id[];
  readonly accessibility?: ElementAccessibility;
  readonly extensions?: readonly ExtensionEnvelope[];
}

function createElementBase(options: ElementBaseOptions): ElementBase {
  const base: {
    id: Id;
    name: string;
    parentId: Id | null;
    locked: boolean;
    hiddenInEditor: boolean;
    geometry: ElementGeometry;
    appearance: Appearance;
    sharedStyleIds: readonly Id[];
    extensions: readonly ExtensionEnvelope[];
    accessibility?: ElementAccessibility;
  } = {
    id: options.id,
    name: options.name,
    parentId: options.parentId ?? null,
    locked: options.locked ?? false,
    hiddenInEditor: options.hiddenInEditor ?? false,
    geometry: options.geometry,
    appearance: options.appearance ?? createDefaultAppearance(),
    sharedStyleIds: options.sharedStyleIds ?? [],
    extensions: options.extensions ?? [],
  };

  return options.accessibility === undefined ? base : { ...base, accessibility: options.accessibility };
}

const DEFAULT_TEXT_LAYOUT: TextLayoutOptions = {
  verticalAlignment: 'top',
  overflow: 'visible',
  autoSize: 'none',
  columns: 1,
  columnGap: 0,
  padding: [0, 0, 0, 0],
};

Object.freeze(DEFAULT_TEXT_LAYOUT);

/** Default run typography, requiring the caller to supply the resolved font references. */
export function createRunProperties(options: {
  readonly fontFamilyId: Id;
  readonly fontFaceId: Id;
  readonly color?: ColorValue | undefined;
  readonly size?: number | undefined;
  readonly weight?: number | undefined;
}): RunProperties {
  return {
    fontFamilyId: options.fontFamilyId,
    fontFaceId: options.fontFaceId,
    size: options.size ?? DEFAULT_FONT_SIZE,
    color: options.color ?? createBlackColorValue(),
    weight: options.weight ?? DEFAULT_FONT_WEIGHT,
    variationAxes: [],
    openTypeFeatures: [],
    language: 'en',
    script: 'Latn',
    direction: 'ltr',
    decoration: { underline: false, strikeThrough: false, style: 'solid' },
    baselineShift: 0,
    tracking: 0,
    semanticRole: 'none',
  };
}

/** Default paragraph layout with normal spacing and no list decoration. */
export function createParagraphProperties(): ParagraphProperties {
  return {
    alignment: 'start',
    direction: 'ltr',
    lineSpacing: { kind: 'normal' },
    spaceBefore: 0,
    spaceAfter: 0,
    firstLineIndent: 0,
    startIndent: 0,
    endIndent: 0,
    tabs: [],
    list: { kind: 'none' },
    hyphenation: 'none',
    keepTogether: false,
    keepWithNext: false,
    widowControl: true,
  };
}

/**
 * A single-paragraph, single-run text body. Font references are required because
 * v1 semantic validation resolves them against the project's font resources.
 */
export function createEmptyTextBody(options: {
  readonly paragraphId: Id;
  readonly runId: Id;
  readonly fontFamilyId: Id;
  readonly fontFaceId: Id;
  readonly text?: string;
  readonly color?: ColorValue;
  readonly size?: number;
  readonly weight?: number;
}): TextBody {
  return {
    paragraphs: [
      {
        id: options.paragraphId,
        properties: createParagraphProperties(),
        runs: [
          {
            id: options.runId,
            text: options.text ?? '',
            properties: createRunProperties({
              fontFamilyId: options.fontFamilyId,
              fontFaceId: options.fontFaceId,
              color: options.color,
              size: options.size,
              weight: options.weight,
            }),
          },
        ],
      },
    ],
  };
}

/** Rectangle vector geometry with per-corner radii (default sharp corners). */
export function createRectangleGeometry(
  cornerRadii: readonly [number, number, number, number] = [0, 0, 0, 0],
): VectorGeometryData {
  return { kind: 'rectangle', cornerRadii };
}

/** Ellipse vector geometry. */
export function createEllipseGeometry(): VectorGeometryData {
  return { kind: 'ellipse' };
}

/** Discriminated input for {@link createElementV1}; carries the base options plus the kind payload. */
export type CreateElementV1Input =
  | (ElementBaseOptions & { readonly kind: 'text'; readonly text: TextBody; readonly layout?: TextLayoutOptions })
  | (ElementBaseOptions & { readonly kind: 'image'; readonly image: ImageElement['image'] })
  | (ElementBaseOptions & { readonly kind: 'vector'; readonly geometryData: VectorGeometryData })
  | (ElementBaseOptions & { readonly kind: 'group'; readonly clipChildren?: boolean })
  | (ElementBaseOptions & {
      readonly kind: 'component-instance';
      readonly componentId: Id;
      readonly propertyValues?: readonly ExposedPropertyValue[];
    })
  | (ElementBaseOptions & { readonly kind: 'video'; readonly video: VideoElement['video'] })
  | (ElementBaseOptions & { readonly kind: 'audio'; readonly audio: AudioElement['audio'] })
  | (ElementBaseOptions & { readonly kind: 'clock'; readonly clock: ClockElement['clock'] })
  | (ElementBaseOptions & { readonly kind: 'ticker'; readonly ticker: TickerElement['ticker'] })
  | (ElementBaseOptions & { readonly kind: 'qrcode'; readonly qrcode: QrCodeElement['qrcode'] })
  | (ElementBaseOptions & { readonly kind: 'foreign'; readonly foreign: ForeignElement['foreign'] })
  | (ElementBaseOptions & { readonly kind: 'plugin'; readonly plugin: PluginElement['plugin'] });

/**
 * Build a structurally-valid v1 element of the requested kind from valid inputs (positive bounds,
 * non-empty name, valid references). Kinds that reference project resources (image asset, component,
 * foreign blob, plugin) require those references as input rather than fabricating placeholders; those
 * referenced resources must exist in the owning project for semantic validation to pass.
 */
export function createElementV1(input: CreateElementV1Input): Element {
  const base = createElementBase(input);

  switch (input.kind) {
    case 'text': {
      const element: TextElement = { ...base, kind: 'text', text: input.text, layout: input.layout ?? DEFAULT_TEXT_LAYOUT };

      return element;
    }

    case 'image':
      return { ...base, kind: 'image', image: input.image };
    case 'vector':
      return { ...base, kind: 'vector', geometryData: input.geometryData };

    case 'group': {
      const element: GroupElement = { ...base, kind: 'group', group: { clipChildren: input.clipChildren ?? false } };

      return element;
    }

    case 'component-instance': {
      const element: ComponentInstanceElement = {
        ...base,
        kind: 'component-instance',
        componentId: input.componentId,
        propertyValues: input.propertyValues ?? [],
      };

      return element;
    }

    case 'video':
      return { ...base, kind: 'video', video: input.video };
    case 'audio':
      return { ...base, kind: 'audio', audio: input.audio };
    case 'clock':
      return { ...base, kind: 'clock', clock: input.clock };
    case 'ticker':
      return { ...base, kind: 'ticker', ticker: input.ticker };
    case 'qrcode':
      return { ...base, kind: 'qrcode', qrcode: input.qrcode };
    case 'foreign':
      return { ...base, kind: 'foreign', foreign: input.foreign };
    case 'plugin':
      return { ...base, kind: 'plugin', plugin: input.plugin };
  }
}

/** A 1920×1080 sRGB screen surface with no guides or safe areas. */
export function createDefaultSurface(): SurfaceDefinition {
  return {
    size: [DEFAULT_SURFACE_WIDTH, DEFAULT_SURFACE_HEIGHT],
    unit: 'px',
    dpi: DEFAULT_DPI,
    coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down' },
    background: { kind: 'none' },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    guides: [],
    broadcastSafeAreas: [],
  };
}

/** Linear-premultiplied compositing in the sRGB working space. */
export function createDefaultColorConfiguration(): DocumentColorConfiguration {
  return { workingSpace: { kind: 'named', space: 'srgb' }, compositing: 'linear-premultiplied' };
}

/** An empty page override layer with no placed instances. */
export function createPageV1(options: {
  readonly id: Id;
  readonly name?: string;
  readonly rootInstances?: PageDefinition['rootInstances'];
}): PageDefinition {
  return {
    id: options.id,
    name: options.name ?? 'Page 1',
    rootInstances: options.rootInstances ?? [],
    descendantOverrides: [],
    selectedVariableModes: {},
    selectedSampleDataSets: {},
    extensions: [],
  };
}

type CreateDocumentV1Options = {
  readonly id: Id;
  readonly name?: string;
  readonly surface?: SurfaceDefinition;
  readonly color?: DocumentColorConfiguration;
  readonly elements?: readonly Element[];
  readonly pages?: readonly PageDefinition[];
} & (
  | { readonly kind?: 'static' | 'print'; readonly timebase?: Timebase }
  | { readonly kind: 'motion'; readonly timebase: Timebase }
);

/**
 * Build a valid v1 document for valid inputs. A document requires at least one page, so an empty page is
 * created when none (or an empty array) is supplied. The `kind: 'motion'` variant statically requires a
 * `timebase`, matching the schema's motion-document invariant.
 */
export function createDocumentV1(options: CreateDocumentV1Options): BroadsetDocumentV1 {
  const pages =
    options.pages !== undefined && options.pages.length > 0
      ? options.pages
      : [createPageV1({ id: idSchema.parse(`${options.id}-page`) })];
  const document: BroadsetDocumentV1 = {
    id: options.id,
    name: options.name ?? 'Document',
    kind: options.kind ?? 'static',
    surface: options.surface ?? createDefaultSurface(),
    color: options.color ?? createDefaultColorConfiguration(),
    elements: options.elements ?? [],
    components: [],
    pages,
    sequences: [],
    stateMachines: [],
    viewModels: [],
    bindings: [],
    selectedVariableModes: {},
    outputProfileIds: [],
    extensions: [],
  };

  return options.timebase === undefined ? document : { ...document, timebase: options.timebase };
}

function createEmptyResources(): ProjectResources {
  return { assets: [], fonts: [], swatches: [], variables: [], styles: [], outputProfiles: [] };
}

function createProjectMetadata(name: string, timestamp: UtcTimestamp): ProjectMetadata {
  return { name, createdAt: timestamp, updatedAt: timestamp };
}

/** Build a valid v1 project. With no documents supplied, one empty static document with a single page is created. */
export function createProjectV1(options?: {
  readonly id?: Id;
  readonly name?: string;
  readonly documents?: readonly BroadsetDocumentV1[];
  readonly resources?: ProjectResources;
  readonly timestamp?: UtcTimestamp;
}): BroadsetProjectV1 {
  const timestamp = options?.timestamp ?? utcTimestampSchema.parse(DEFAULT_TIMESTAMP);
  const projectId = options?.id ?? idSchema.parse('project');
  const documents =
    options?.documents !== undefined && options.documents.length > 0
      ? options.documents
      : [createDocumentV1({ id: idSchema.parse('document'), name: 'Document' })];

  return {
    $schema: PROJECT_SCHEMA_URL,
    format: 'broadset-project',
    schemaVersion: 1,
    id: projectId,
    metadata: createProjectMetadata(options?.name ?? 'Project', timestamp),
    resources: options?.resources ?? createEmptyResources(),
    documents,
    templateGroups: [],
    interop: { sources: [], records: [] },
    extensions: [],
  };
}
