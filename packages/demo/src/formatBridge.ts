import type * as FormatsNS from '@broadset/formats';
import type { Asset, BroadsetDocument } from '@broadset/model';
import { broadsetDocumentSchema } from '@broadset/model';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type FormatsModule = typeof FormatsNS;

export type ExportFormat =
  | 'html'
  | 'jpeg'
  | 'json'
  | 'mp4'
  | 'ograf'
  | 'pdf'
  | 'png'
  | 'pptx'
  | 'psd'
  | 'svg'
  | 'svg-embedded'
  | 'webm';

export interface SvgExportOptionsInput {
  readonly fontEmbedding?: 'embed' | 'reference' | 'flatten';
  readonly includeMetadata?: boolean;
  readonly includeElementTagging?: boolean;
  readonly flattenGroups?: boolean;
  /**
   * Project assets the SVG exporter walks for `FontAsset` byte
   * sources. Used to populate `SvgExportOptions.fonts` so embed /
   * reference / flatten modes have something to embed beyond the
   * font-family name. Optional: when absent, the exporter emits
   * preflight warnings for every text element using a non-system
   * family.
   */
  readonly projectAssets?: readonly Asset[];
}

export interface ExportContext {
  readonly document: BroadsetDocument;
  readonly snapshotCanvas?: HTMLCanvasElement;
  readonly renderFrame?: (timeMs: number) => void | Promise<void>;
  readonly playbackDurationMs?: number;
  readonly pixelRatio?: number;
  readonly jpegQuality?: number;
  readonly videoFrameRate?: number;
  readonly videoQuality?: number;
  readonly onProgress?: (progress: number, stage?: string) => void;
  /** SVG-specific options from the `FormatExportOptionsModal`. */
  readonly svgOptions?: SvgExportOptionsInput;
}

export interface ImportDocumentResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
  /**
   * Project-level asset list when the imported file was a
   * `BroadsetProject` (JSON / `.bsp` with a `documents` array).
   * Lets the demo replace its in-memory project assets so SVG
   * exports can embed fonts the imported project actually
   * declares — instead of defaulting to the bundled sample.
   */
  readonly projectAssets?: readonly Asset[] | undefined;
}

/* ------------------------------------------------------------------ */
/*  Lazy Loading                                                      */
/* ------------------------------------------------------------------ */

let formatsCache: FormatsModule | null = null;

/** Load the formats module on first use and cache it for subsequent calls. */
export async function loadFormats(): Promise<FormatsModule> {
  formatsCache ??= await import('@broadset/formats');

  return formatsCache;
}

/** Reset the cache (testing only). */
export function resetFormatsCache(): void {
  formatsCache = null;
}

/* ------------------------------------------------------------------ */
/*  Export Orchestration                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_PIXEL_RATIO = 2;
const DEFAULT_JPEG_QUALITY = 0.92;
const DEFAULT_VIDEO_FRAME_RATE = 30;
const DEFAULT_VIDEO_QUALITY = 0.8;

/**
 * Build the SVG-specific export options + font source map from the
 * caller's `svgOptions`, and route the result through
 * `exportSvgDocument`. Extracted from the main `exportDocument`
 * switch to keep that function's cognitive complexity below the
 * sonarjs threshold.
 */
async function exportSvgVia(formats: FormatsModule, context: ExportContext, name: string): Promise<void> {
  const projectAssets = context.svgOptions?.projectAssets ?? [];
  const fonts = projectAssets.length > 0 ? formats.buildSvgFontSourcesFromAssets(projectAssets) : undefined;
  const svgExportOptions = {
    ...(context.svgOptions?.fontEmbedding !== undefined ? { fontEmbedding: context.svgOptions.fontEmbedding } : {}),
    ...(context.svgOptions?.includeMetadata !== undefined ?
      { includeMetadata: context.svgOptions.includeMetadata }
    : {}),
    ...(context.svgOptions?.includeElementTagging !== undefined ?
      { includeElementTagging: context.svgOptions.includeElementTagging }
    : {}),
    ...(context.svgOptions?.flattenGroups !== undefined ? { flattenGroups: context.svgOptions.flattenGroups } : {}),
    ...(fonts !== undefined ? { fonts } : {}),
  };
  const result = await formats.exportSvgDocument(context.document, svgExportOptions);
  const blob = new Blob([result.svg], { type: 'image/svg+xml' });

  // Surface preflight warnings (missing fonts, restricted-
  // permission embeds) to the caller via the onProgress stage
  // channel so the toast layer can announce them.
  if (result.warnings.length > 0 && context.onProgress !== undefined) {
    const summary = `Exported with ${String(result.warnings.length)} font warning(s): ${result.warnings[0] ?? ''}`;

    context.onProgress(1, summary);
  }

  formats.triggerDownload(blob, `${name}.svg`);
}

export async function exportDocument(format: ExportFormat, context: ExportContext): Promise<void> {
  const formats = await loadFormats();
  const { document: doc } = context;
  const name = formats.sanitizeFilename(doc.name || 'broadset-document');

  switch (format) {
    case 'json': {
      const json = JSON.stringify(doc, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      formats.triggerDownload(blob, `${name}.json`);
      break;
    }

    case 'svg': {
      await exportSvgVia(formats, context, name);
      break;
    }

    case 'html': {
      const html = formats.exportHtmlStandalone(doc);
      const blob = new Blob([html], { type: 'text/html' });

      formats.triggerDownload(blob, `${name}.html`);
      break;
    }

    case 'pdf': {
      const pdfBytes = await formats.exportPdfBytes(doc);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

      formats.triggerDownload(blob, `${name}.pdf`);
      break;
    }

    case 'pptx': {
      const pptxBytes = formats.exportPptxBytes(doc);
      const blob = new Blob([pptxBytes.buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });

      formats.triggerDownload(blob, `${name}.pptx`);
      break;
    }

    case 'psd': {
      const psdBytes = await formats.exportPsdBytesAsync(doc);
      const blob = new Blob([psdBytes.buffer as ArrayBuffer], { type: 'image/vnd.adobe.photoshop' });

      formats.triggerDownload(blob, `${name}.psd`);
      break;
    }

    case 'png': {
      requireSnapshotCanvas(context);

      const pngBlob = await formats.exportPngBlob(context.snapshotCanvas, {
        pixelRatio: context.pixelRatio ?? DEFAULT_PIXEL_RATIO,
      });

      formats.triggerDownload(pngBlob, `${name}.png`);
      break;
    }

    case 'jpeg': {
      requireSnapshotCanvas(context);

      const jpegBlob = await formats.exportJpegBlob(context.snapshotCanvas, {
        pixelRatio: context.pixelRatio ?? DEFAULT_PIXEL_RATIO,
        quality: context.jpegQuality ?? DEFAULT_JPEG_QUALITY,
      });

      formats.triggerDownload(jpegBlob, `${name}.jpeg`);
      break;
    }

    case 'svg-embedded': {
      requireSnapshotCanvas(context);

      const embeddedBlob = await formats.exportEmbeddedSvgBlob(context.snapshotCanvas);

      formats.triggerDownload(embeddedBlob, `${name}-embedded.svg`);
      break;
    }

    case 'mp4': {
      requireVideoSettings(context);

      const mp4Blob = await formats.exportVideoBlob({
        canvas: context.snapshotCanvas,
        renderFrame: context.renderFrame,
        durationMs: context.playbackDurationMs,
        frameRate: context.videoFrameRate ?? DEFAULT_VIDEO_FRAME_RATE,
        quality: context.videoQuality ?? DEFAULT_VIDEO_QUALITY,
        format: 'mp4',
        ...(context.onProgress !== undefined ? { onProgress: context.onProgress } : {}),
      });

      formats.triggerDownload(mp4Blob, `${name}.mp4`);
      break;
    }

    case 'webm': {
      requireVideoSettings(context);

      const videoBlob = await formats.exportVideoBlob({
        canvas: context.snapshotCanvas,
        renderFrame: context.renderFrame,
        durationMs: context.playbackDurationMs,
        frameRate: context.videoFrameRate ?? DEFAULT_VIDEO_FRAME_RATE,
        quality: context.videoQuality ?? DEFAULT_VIDEO_QUALITY,
        format: 'webm',
        ...(context.onProgress !== undefined ? { onProgress: context.onProgress } : {}),
      });

      formats.triggerDownload(videoBlob, `${name}.webm`);
      break;
    }

    case 'ograf': {
      const packages = formats.generateOGrafPackages(doc);
      const jsonStr = JSON.stringify(packages, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });

      formats.triggerDownload(blob, `${name}-ograf.json`);
      break;
    }

    default: {
      const _exhaustive: never = format;

      throw new Error(`Unsupported export format: ${_exhaustive as string}`);
    }
  }
}

function requireSnapshotCanvas(context: ExportContext): asserts context is ExportContext & {
  readonly snapshotCanvas: HTMLCanvasElement;
} {
  if (context.snapshotCanvas === undefined) {
    throw new Error('Raster export requires a snapshot renderer. No snapshot canvas is available.');
  }
}

function requireVideoSettings(context: ExportContext): asserts context is ExportContext & {
  readonly snapshotCanvas: HTMLCanvasElement;
  readonly renderFrame: (timeMs: number) => void | Promise<void>;
  readonly playbackDurationMs: number;
} {
  if (context.renderFrame === undefined || context.playbackDurationMs === undefined) {
    throw new Error('Video export requires a playback controller and video settings.');
  }

  if (context.snapshotCanvas === undefined) {
    throw new Error('Video export requires a snapshot canvas for frame rendering.');
  }
}

/* ------------------------------------------------------------------ */
/*  Import Orchestration                                              */
/* ------------------------------------------------------------------ */

/** Detect if a parsed JSON has a `documents` array (BroadsetProject wrapper). */
function hasDocumentsArray(value: unknown): value is { readonly documents: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documents' in value &&
    Array.isArray((value as Record<string, unknown>)['documents'])
  );
}

/** Detect a `BroadsetProject`-shaped wrapper carrying both `documents` AND `assets`. */
function hasProjectShape(
  value: unknown,
): value is { readonly documents: readonly unknown[]; readonly assets: readonly Asset[] } {
  return hasDocumentsArray(value) && 'assets' in value && Array.isArray((value as Record<string, unknown>)['assets']);
}

export async function importDocument(file: File): Promise<ImportDocumentResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    case 'json': // falls through

    case 'bsp': {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const candidate = hasDocumentsArray(parsed) ? parsed['documents'][0] : parsed;
      const projectAssets = hasProjectShape(parsed) ? parsed.assets : undefined;

      return {
        document: broadsetDocumentSchema.parse(candidate),
        warnings: [],
        ...(projectAssets !== undefined ? { projectAssets } : {}),
      };
    }

    case 'psd': {
      const formats = await loadFormats();
      const buffer = await file.arrayBuffer();

      return formats.importPsdDocument(new Uint8Array(buffer));
    }

    case 'pptx': {
      const formats = await loadFormats();
      const buffer = await file.arrayBuffer();

      return formats.importPptxDocument(new Uint8Array(buffer));
    }

    case 'svg': {
      const formats = await loadFormats();
      const text = await file.text();

      return formats.importSvgDocument(text, file.name);
    }

    default:
      throw new Error(`Unsupported file format: .${ext}`);
  }
}
