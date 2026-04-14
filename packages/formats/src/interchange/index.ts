import type { BroadsetDocument, BroadsetElement, BroadsetProject } from '@broadset/model';
import qrcode from 'qrcode-generator';

/* ------------------------------------------------------------------ */
/*  JSON Export                                                       */
/* ------------------------------------------------------------------ */

/**
 * Serializes a BroadsetProject to a JSON string.
 * The output is valid BroadsetProject JSON that can be parsed and validated
 * with broadsetProjectSchema.
 * Rejects with a descriptive error on serialization failure.
 */
export function exportProjectJson(project: BroadsetProject): string {
  try {
    return JSON.stringify(project, null, 2);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`JSON export failed: ${message}`, { cause: error });
  }
}

/* ------------------------------------------------------------------ */
/*  Filename Sanitization                                            */
/* ------------------------------------------------------------------ */

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const CONSECUTIVE_HYPHENS = /-{2,}/g;
const LEADING_TRAILING_HYPHENS = /^-+|-+$/g;

/**
 * Sanitizes a string for use as a filename.
 * Replaces spaces with hyphens, strips illegal filesystem characters,
 * collapses consecutive hyphens, and trims leading/trailing hyphens.
 * Returns empty string for whitespace-only input.
 */
export function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(ILLEGAL_FILENAME_CHARS, '-')
    .replace(CONSECUTIVE_HYPHENS, '-')
    .replace(LEADING_TRAILING_HYPHENS, '');
}

/* ------------------------------------------------------------------ */
/*  QR SVG Fragment Generation                                       */
/* ------------------------------------------------------------------ */

const QR_CELL_SIZE_PX = 4;

/**
 * Generates an SVG fragment for a QR code.
 * Returns null for empty content.
 */
export function generateQrSvgFragment(content: string): string | null {
  if (content.trim() === '') {
    return null;
  }

  const qr = qrcode(0, 'M');

  qr.addData(content);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellSize = QR_CELL_SIZE_PX;
  const size = moduleCount * cellSize;
  const rects: string[] = [];

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        rects.push(
          `<rect x="${String(col * cellSize)}" y="${String(row * cellSize)}" width="${String(cellSize)}" height="${String(cellSize)}"/>`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(size)} ${String(size)}">`,
    `<rect width="${String(size)}" height="${String(size)}" fill="#ffffff"/>`,
    `<g fill="#000000">`,
    ...rects,
    `</g>`,
    `</svg>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Video Export Support Detection                                   */
/* ------------------------------------------------------------------ */

/**
 * Returns true if VideoEncoder API is available in the current environment.
 */
export function isVideoExportSupported(): boolean {
  return typeof globalThis.VideoEncoder !== 'undefined';
}

/** Options for frame-by-frame video export. */
export interface VideoExportOptions {
  /** Target canvas to capture frames from. */
  readonly canvas: HTMLCanvasElement;
  /** Callback that renders the scene at the given time (ms) before frame capture. */
  readonly renderFrame: (timeMs: number) => void;
  /** Total animation duration in milliseconds. */
  readonly durationMs: number;
  /** Frames per second (defaults to 30). */
  readonly frameRate?: number;
  /** Enable alpha channel transparency for broadcast overlay (defaults to false). */
  readonly alpha?: boolean;
  /** Encoding quality 0–1 (defaults to 0.8). */
  readonly quality?: number;
  /** Progress callback invoked with a value in [0, 1] and an optional stage descriptor. */
  readonly onProgress?: (progress: number, stage?: string) => void;
  /** Target container format. MP4 is reserved for a future true container mux path. */
  readonly format?: 'webm' | 'mp4';
}

/**
 * Exports video as a Blob using the VideoEncoder API.
 * Rejects when VideoEncoder is unavailable or when encoding fails.
 */
export async function exportVideoBlob(options: VideoExportOptions): Promise<Blob> {
  const format = options.format ?? 'webm';

  if (format === 'mp4') {
    throw new Error('MP4 export is not yet supported in the current browser encoder pipeline. Use WebM instead.');
  }

  if (!isVideoExportSupported()) {
    throw new Error('Video export is not supported: VideoEncoder API is unavailable');
  }

  const frameRate = options.frameRate ?? 30;
  const alpha = options.alpha ?? false;
  const quality = options.quality ?? 0.8;

  if (frameRate <= 0) {
    throw new Error('frameRate must be positive');
  }

  if (options.durationMs <= 0) {
    throw new Error('durationMs must be positive');
  }

  options.onProgress?.(0, 'Initializing encoder');

  const totalFrames = Math.ceil((options.durationMs / 1000) * frameRate);
  const frameDurationUs = Math.round(1_000_000 / frameRate);
  const collectedChunks: EncodedVideoChunk[] = [];
  const encoderState = { error: null as Error | null };

  const encoder = new VideoEncoder({
    output(chunk: EncodedVideoChunk) {
      collectedChunks.push(chunk);
    },
    error(err: DOMException) {
      encoderState.error = new Error('VideoEncoder error during video export', { cause: err });
    },
  });

  /** VP9 max bitrate in bits/sec, scaled by quality 0–1 */
  const MAX_BITRATE = 4_000_000;
  const bitrate = Math.round(quality * MAX_BITRATE);
  /** VP9 codec profile: 01 (profile 1, alpha) or 00 (profile 0, opaque), 10-bit, level 08 */
  const codecString = alpha ? 'vp09.01.10.08' : 'vp09.00.10.08';

  encoder.configure({
    codec: codecString,
    width: options.canvas.width,
    height: options.canvas.height,
    bitrate,
    framerate: frameRate,
    alpha: alpha ? 'keep' : 'discard',
  });

  options.onProgress?.(0.1, 'Rendering frames');

  for (let i = 0; i < totalFrames; i++) {
    if (encoderState.error) throw encoderState.error;

    const timeMs = (i / frameRate) * 1000;

    options.renderFrame(timeMs);

    const frame = new VideoFrame(options.canvas, {
      timestamp: i * frameDurationUs,
      alpha: alpha ? 'keep' : 'discard',
    });

    encoder.encode(frame);
    frame.close();

    // Report progress: 10% for init, 80% for frames, 10% for flushing
    const frameProgress = 0.1 + 0.8 * ((i + 1) / totalFrames);

    options.onProgress?.(frameProgress, 'Rendering frames');
  }

  options.onProgress?.(0.9, 'Flushing encoder');

  await encoder.flush();

  if (encoderState.error) throw encoderState.error;

  const totalSize = collectedChunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const buffer = new Uint8Array(totalSize);
  let offset = 0;

  for (const chunk of collectedChunks) {
    chunk.copyTo(buffer.subarray(offset));
    offset += chunk.byteLength;
  }

  options.onProgress?.(1, 'Complete');

  return new Blob([buffer], { type: 'video/webm' });
}

/* ------------------------------------------------------------------ */
/*  OGraf Package Generation                                         */
/* ------------------------------------------------------------------ */

interface OGrafSchemaInput {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string;
}

interface OGrafSchema {
  readonly defaults: Readonly<Record<string, string>>;
  readonly inputs: readonly OGrafSchemaInput[];
}

interface OGrafPackage {
  readonly elementId: string;
  readonly name: string;
  readonly schema: OGrafSchema;
  readonly runtime: string;
}

function buildOGrafRuntime(element: BroadsetElement): string {
  switch (element.type) {
    case 'qrcode': {
      const svg = generateQrSvgFragment(element.content);

      return svg ?? '';
    }

    case 'svg':
      return element.content;
    case 'image':
    case 'video':
      return `<div data-element-id="${element.id}" data-type="${element.type}" data-asset="true"></div>`;
    default:
      return `<div data-element-id="${element.id}" data-type="${element.type}">${element.content}</div>`;
  }
}

function buildOGrafSchema(element: BroadsetElement): OGrafSchema {
  if (element.type === 'text') {
    const key = `${element.id}-content`;

    return {
      defaults: Object.freeze({ [key]: element.content }),
      inputs: Object.freeze([{ name: key, type: 'text', defaultValue: element.content }]),
    };
  }

  return { defaults: Object.freeze({}), inputs: Object.freeze([]) };
}

/**
 * Generates one OGraf broadcast package per top-level element.
 * Text content is exposed as schema defaults.
 * Image elements are not exposed as text inputs.
 * QR elements are pre-rendered to inline SVG.
 */
export function generateOGrafPackages(document: BroadsetDocument): readonly OGrafPackage[] {
  return document.elements.map((element) => ({
    elementId: element.id,
    name: sanitizeFilename(element.name) || element.id,
    schema: buildOGrafSchema(element),
    runtime: buildOGrafRuntime(element),
  }));
}
