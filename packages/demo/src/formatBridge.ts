import type * as FormatsNS from '@broadset/formats';
import type { BroadsetDocument } from '@broadset/model';
import { broadsetDocumentSchema } from '@broadset/model';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type FormatsModule = typeof FormatsNS;

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
}

export interface ImportDocumentResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
}

/* ------------------------------------------------------------------ */
/*  Lazy Loading                                                      */
/* ------------------------------------------------------------------ */

let formatsCache: FormatsModule | null = null;

/** Load the formats module on first use and cache it for subsequent calls. */
export async function loadFormats(): Promise<FormatsModule> {
  if (formatsCache === null) {
    formatsCache = await import('@broadset/formats');
  }

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
      const svgStr = formats.exportSvg(doc);
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });

      formats.triggerDownload(blob, `${name}.svg`);
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

export async function importDocument(file: File): Promise<ImportDocumentResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    case 'json': // falls through

    case 'bsp': {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const candidate = hasDocumentsArray(parsed) ? parsed['documents'][0] : parsed;

      return {
        document: broadsetDocumentSchema.parse(candidate),
        warnings: [],
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
