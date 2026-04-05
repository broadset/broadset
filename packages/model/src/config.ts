import { z } from 'zod';

export interface FontVariant {
  readonly weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  readonly style: 'normal' | 'italic';
}

export type FontSource =
  | { readonly kind: 'system' }
  | { readonly kind: 'url'; readonly url: string }
  | { readonly kind: 'assetId'; readonly assetId: string };

export interface FontDefinition {
  readonly family: string;
  readonly variants?: readonly FontVariant[];
  readonly source?: FontSource;
}

const fontVariantSchema = z.object({
  weight: z.union([
    z.literal(100),
    z.literal(200),
    z.literal(300),
    z.literal(400),
    z.literal(500),
    z.literal(600),
    z.literal(700),
    z.literal(800),
    z.literal(900),
  ]),
  style: z.enum(['normal', 'italic']),
});

const fontSourceSchema = z.union([
  z.object({ kind: z.literal('system') }),
  z.object({ kind: z.literal('url'), url: z.string().min(1) }),
  z.object({ kind: z.literal('assetId'), assetId: z.string().min(1) }),
]);

const fontDefinitionSchema = z.object({
  family: z.string().min(1),
  variants: z.array(fontVariantSchema).optional(),
  source: fontSourceSchema.optional(),
});

export const FALLBACK_SYSTEM_FONTS: readonly FontDefinition[] = [
  { family: 'Arial', variants: [{ weight: 400, style: 'normal' }], source: { kind: 'system' } },
  { family: 'Courier New', variants: [{ weight: 400, style: 'normal' }], source: { kind: 'system' } },
  { family: 'Times New Roman', variants: [{ weight: 400, style: 'normal' }], source: { kind: 'system' } },
  { family: 'Georgia', variants: [{ weight: 400, style: 'normal' }], source: { kind: 'system' } },
];

export function resolveFonts(fonts: readonly FontDefinition[] | undefined): readonly FontDefinition[] {
  return fonts === undefined || fonts.length === 0 ? FALLBACK_SYSTEM_FONTS : fonts;
}

export interface ComponentPlugin {
  readonly type: string;
  readonly label: string;
  readonly rendererFactory: (...args: readonly unknown[]) => unknown;
  readonly icon?: string;
  readonly defaults?: {
    readonly width?: number;
    readonly height?: number;
    readonly content?: string;
  };
  readonly propertyPanel?: unknown;
  readonly capabilities?: Readonly<Record<string, boolean>>;
}

export interface MediaAssetConfig {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly thumbnailUrl?: string;
  readonly mimeType?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface MediaCategory {
  readonly id: string;
  readonly name: string;
}

export interface MediaSourceConfig {
  readonly assets: readonly MediaAssetConfig[];
  readonly categories?: readonly MediaCategory[];
  readonly onUploadRequest?: (file: File) => Promise<MediaAssetConfig | null>;
}

const mediaAssetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().min(1),
  thumbnailUrl: z.string().optional(),
  mimeType: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const mediaSourceSchema = z.object({
  assets: z.array(mediaAssetSchema),
  categories: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).optional(),
  onUploadRequest: z.function().optional(),
});

const componentPluginSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  rendererFactory: z.function(),
  icon: z.string().optional(),
  defaults: z
    .object({
      width: z.number().positive().optional(),
      height: z.number().positive().optional(),
      content: z.string().optional(),
    })
    .optional(),
  propertyPanel: z.unknown().optional(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
});

export const editorConfigSchema = z.object({
  allowedFonts: z.array(fontDefinitionSchema).optional(),
  defaultPalette: z.array(z.string()).optional(),
  allowedDocumentSizes: z
    .array(
      z.object({
        label: z.string().min(1),
        width: z.number().positive(),
        height: z.number().positive(),
      }),
    )
    .optional(),
  requiredElements: z.array(z.string()).optional(),
  mediaSource: mediaSourceSchema.optional(),
  shortcuts: z.record(z.string(), z.unknown()).optional(),
  gridDefaults: z.unknown().optional(),
  maxUndoSteps: z.number().int().positive().optional(),
  components: z.array(componentPluginSchema).optional(),
  onChanges: z.function().optional(),
  onSave: z.function().optional(),
});

export type EditorConfig = z.infer<typeof editorConfigSchema>;

export interface EditorFeatureConfig {
  readonly transforms3d: boolean;
  readonly clipChildren: boolean;
  readonly animations: boolean;
  readonly importSvg: boolean;
  readonly importPsd: boolean;
  readonly importPptx: boolean;
  readonly exportHtml: boolean;
  readonly exportSvg: boolean;
  readonly exportPdf: boolean;
  readonly exportPsd: boolean;
  readonly exportPptx: boolean;
  readonly exportPng: boolean;
  readonly exportJpeg: boolean;
  readonly exportSvgEmbedded: boolean;
  readonly exportOgraf: boolean;
  readonly exportMp4: boolean;
  readonly exportWebm: boolean;
  readonly broadcastPreview: boolean;
}

export const featureConfigSchema: z.ZodType<EditorFeatureConfig> = z.object({
  transforms3d: z.boolean(),
  clipChildren: z.boolean(),
  animations: z.boolean(),
  importSvg: z.boolean(),
  importPsd: z.boolean(),
  importPptx: z.boolean(),
  exportHtml: z.boolean(),
  exportSvg: z.boolean(),
  exportPdf: z.boolean(),
  exportPsd: z.boolean(),
  exportPptx: z.boolean(),
  exportPng: z.boolean(),
  exportJpeg: z.boolean(),
  exportSvgEmbedded: z.boolean(),
  exportOgraf: z.boolean(),
  exportMp4: z.boolean(),
  exportWebm: z.boolean(),
  broadcastPreview: z.boolean(),
});

const ENABLED_FEATURES: EditorFeatureConfig = {
  transforms3d: true,
  clipChildren: true,
  animations: true,
  importSvg: true,
  importPsd: true,
  importPptx: true,
  exportHtml: true,
  exportSvg: true,
  exportPdf: true,
  exportPsd: true,
  exportPptx: true,
  exportPng: true,
  exportJpeg: true,
  exportSvgEmbedded: true,
  exportOgraf: true,
  exportMp4: true,
  exportWebm: true,
  broadcastPreview: true,
};

export function createDefaultFeatureConfig(mode: 'screen' | 'print'): EditorFeatureConfig {
  if (mode === 'print') {
    return {
      ...ENABLED_FEATURES,
      transforms3d: false,
      animations: false,
      broadcastPreview: false,
    };
  }

  return { ...ENABLED_FEATURES };
}

export interface GridSettings {
  readonly gridSize: number;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly snapThreshold: number;
}

export function createDefaultGridSettings(): GridSettings {
  return {
    gridSize: 5,
    showGrid: false,
    snapToGrid: false,
    snapThreshold: 5,
  };
}

export interface Guide {
  readonly id: string;
  readonly type: 'h' | 'v';
  readonly pos: number;
  readonly locked: boolean;
}

export interface SafeAreaSettings {
  readonly actionSafe: readonly [number, number, number, number];
  readonly titleSafe: readonly [number, number, number, number];
  readonly custom?: readonly {
    readonly name: string;
    readonly insets: readonly [number, number, number, number];
  }[];
}

export interface CanvasSettings {
  readonly units: 'px' | 'mm' | 'in';
  readonly viewMode: 'broadcast' | 'print' | 'none';
  readonly showRulers: boolean;
  readonly originX: number;
  readonly originY: number;
  readonly perspective: number;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly guides: readonly Guide[];
  readonly grid: GridSettings;
  readonly frameRate: 23.976 | 24 | 25 | 29.97 | 30 | 50 | 59.94 | 60;
  readonly safeAreas: SafeAreaSettings;
  readonly backgroundPdf?: string;
}

export function createDefaultCanvasSettings(): CanvasSettings {
  return {
    units: 'px',
    viewMode: 'none',
    showRulers: true,
    originX: 0,
    originY: 0,
    perspective: 1000,
    zoom: 1,
    panX: 0,
    panY: 0,
    guides: [],
    grid: createDefaultGridSettings(),
    frameRate: 50,
    safeAreas: {
      actionSafe: [3.5, 3.5, 3.5, 3.5],
      titleSafe: [5, 5, 5, 5],
      custom: [],
    },
  };
}
