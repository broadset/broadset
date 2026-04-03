import { z } from 'zod';

// ---------------------------------------------------------------------------
// Font types
// ---------------------------------------------------------------------------

const fontDefinitionSchema = z.object({
  family: z.string().min(1),
});

type FontDefinition = z.infer<typeof fontDefinitionSchema>;

// ---------------------------------------------------------------------------
// Fallback system fonts
// ---------------------------------------------------------------------------

export const FALLBACK_SYSTEM_FONTS: readonly FontDefinition[] = [
  { family: 'Arial' },
  { family: 'Courier New' },
  { family: 'Times New Roman' },
  { family: 'Georgia' },
] as const;

export function resolveFonts(fonts: readonly FontDefinition[]): readonly FontDefinition[] {
  return fonts.length > 0 ? fonts : FALLBACK_SYSTEM_FONTS;
}

// ---------------------------------------------------------------------------
// Document size preset
// ---------------------------------------------------------------------------

const documentSizeSchema = z.object({
  label: z.string().min(1),
  width: z.number().positive(),
  height: z.number().positive(),
});

// ---------------------------------------------------------------------------
// Component plugin
// ---------------------------------------------------------------------------

const componentPluginSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1),
  rendererFactory: z.function(),
  icon: z.string().optional(),
  defaults: z
    .object({
      width: z.number().optional(),
      height: z.number().optional(),
      content: z.string().optional(),
    })
    .optional(),
  propertyPanel: z.unknown().optional(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
});

// ---------------------------------------------------------------------------
// EditorConfig schema
// ---------------------------------------------------------------------------

export const editorConfigSchema = z.object({
  allowedFonts: z.array(fontDefinitionSchema),
  defaultPalette: z.array(z.string()).optional(),
  allowedDocumentSizes: z.array(documentSizeSchema).optional(),
  requiredElements: z.array(z.string()).optional(),
  mediaSource: z.unknown().optional(),
  shortcuts: z.unknown().optional(),
  gridDefaults: z.unknown().optional(),
  maxUndoSteps: z.number().int().positive().optional(),
  components: z.array(componentPluginSchema).optional(),
  onChanges: z.function().optional(),
  onSave: z.function().optional(),
});

export type EditorConfig = z.infer<typeof editorConfigSchema>;

// ---------------------------------------------------------------------------
// Feature config
// ---------------------------------------------------------------------------

export interface EditorFeatureConfig {
  transforms3d: boolean;
  clipChildren: boolean;
  animations: boolean;
  importSvg: boolean;
  importPsd: boolean;
  importPptx: boolean;
  exportHtml: boolean;
  exportSvg: boolean;
  exportPdf: boolean;
  exportPsd: boolean;
  exportPptx: boolean;
  exportPng: boolean;
  exportJpeg: boolean;
  exportSvgEmbedded: boolean;
  exportOgraf: boolean;
  exportMp4: boolean;
  exportWebm: boolean;
  broadcastPreview: boolean;
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

type DocumentMode = 'screen' | 'print';

const ALL_ENABLED: EditorFeatureConfig = {
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

export function createDefaultFeatureConfig(mode: DocumentMode): EditorFeatureConfig {
  if (mode === 'print') {
    return {
      ...ALL_ENABLED,
      transforms3d: false,
      animations: false,
      broadcastPreview: false,
    };
  }

  return { ...ALL_ENABLED };
}

// ---------------------------------------------------------------------------
// Grid settings
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Canvas settings
// ---------------------------------------------------------------------------

export interface Guide {
  readonly id: string;
  readonly type: 'h' | 'v';
  readonly pos: number;
  readonly locked: boolean;
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
  readonly backgroundPdf?: string | undefined;
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
  };
}
