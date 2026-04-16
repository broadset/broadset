import type { BroadsetDocument, BroadsetElement, BroadsetProject } from '@broadset/model';
import type { VideoEncodingConfig } from 'mediabunny';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
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
  /** Callback that renders the scene at the given time (ms) before frame capture. May be async (e.g. when capturing DOM-rendered frames to canvas). */
  readonly renderFrame: (timeMs: number) => void | Promise<void>;
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
  /** Target container format. Defaults to 'webm'. */
  readonly format?: 'webm' | 'mp4';
}

/** Maximum bitrate in bits/sec, scaled by quality 0–1. */
const MAX_VIDEO_BITRATE = 4_000_000;

/**
 * Exports video as a Blob using mediabunny for proper container muxing.
 *
 * - WebM: VP9 codec (supports alpha transparency)
 * - MP4: H.264 (AVC) codec (opaque only — alpha is silently discarded)
 *
 * Rejects when VideoEncoder is unavailable or when encoding fails.
 */
export async function exportVideoBlob(options: VideoExportOptions): Promise<Blob> {
  const format = options.format ?? 'webm';

  if (!isVideoExportSupported()) {
    throw new Error('Video export is not supported: VideoEncoder API is unavailable');
  }

  const frameRate = options.frameRate ?? 30;
  const alpha = format === 'webm' ? (options.alpha ?? false) : false;
  const quality = options.quality ?? 0.8;

  if (frameRate <= 0) {
    throw new Error('frameRate must be positive');
  }

  if (options.durationMs <= 0 || !Number.isFinite(options.durationMs)) {
    throw new Error('durationMs must be a positive finite number');
  }

  if (quality < 0 || quality > 1) {
    throw new Error('quality must be in range [0, 1]');
  }

  options.onProgress?.(0, 'Initializing encoder');

  const bitrate = Math.round(quality * MAX_VIDEO_BITRATE);
  const codec = format === 'mp4' ? 'avc' : 'vp9';

  const encodingConfig: VideoEncodingConfig = {
    codec,
    bitrate,
    alpha: alpha ? 'keep' : 'discard',
  };

  const canvasSource = new CanvasSource(options.canvas, encodingConfig);
  const outputFormat = format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat();
  const target = new BufferTarget();
  const output = new Output({ format: outputFormat, target });

  output.addVideoTrack(canvasSource);
  await output.start();

  const totalFrames = Math.ceil((options.durationMs / 1000) * frameRate);
  const frameDurationSec = 1 / frameRate;

  options.onProgress?.(0.1, 'Rendering frames');

  for (let i = 0; i < totalFrames; i++) {
    const timeMs = (i / frameRate) * 1000;
    const timestampSec = i * frameDurationSec;

    await options.renderFrame(timeMs);
    await canvasSource.add(timestampSec, frameDurationSec);

    const frameProgress = 0.1 + 0.8 * ((i + 1) / totalFrames);

    options.onProgress?.(frameProgress, 'Rendering frames');
  }

  options.onProgress?.(0.9, 'Finalizing');

  await output.finalize();

  const buffer = target.buffer;

  if (!buffer) {
    throw new Error('Video export failed: output buffer is null after finalization');
  }

  options.onProgress?.(1, 'Complete');

  const mimeType = format === 'mp4' ? 'video/mp4' : 'video/webm';

  return new Blob([buffer], { type: mimeType });
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
  readonly renderRequirements: {
    readonly width: number;
    readonly height: number;
  };
  readonly stepCount: number;
  readonly customActions: readonly string[];
}

function buildElementStyle(element: BroadsetElement): string {
  const parts: string[] = [
    `position:absolute`,
    `left:${String(element.position.x)}px`,
    `top:${String(element.position.y)}px`,
    `width:${String(element.width)}px`,
    `height:${String(element.height)}px`,
  ];

  if (element.rotation !== 0) {
    parts.push(`transform:rotate(${String(element.rotation)}deg)`);
  }

  if (element.style.opacity !== 1) {
    parts.push(`opacity:${String(element.style.opacity)}`);
  }

  if (element.style.backgroundColor) {
    parts.push(`background:${element.style.backgroundColor}`);
  }

  if (element.style.fontFamily) {
    parts.push(`font-family:${element.style.fontFamily}`);
  }

  if (element.style.fontSize) {
    parts.push(`font-size:${String(element.style.fontSize)}px`);
  }

  if (element.style.fontColor) {
    parts.push(`color:${element.style.fontColor}`);
  }

  return parts.join(';');
}

function buildOGrafRuntime(element: BroadsetElement): string {
  const style = buildElementStyle(element);

  switch (element.type) {
    case 'qrcode': {
      const svg = generateQrSvgFragment(element.content);

      return svg !== null ? `<div style="${style}">${svg}</div>` : '';
    }

    case 'svg':
      return `<div style="${style}">${element.content}</div>`;
    case 'image':
    case 'video':
      return `<div data-element-id="${element.id}" data-type="${element.type}" data-asset="true" style="${style}"></div>`;
    default:
      return `<div data-element-id="${element.id}" data-type="${element.type}" style="${style}">${element.content}</div>`;
  }
}

function buildOGrafSchema(element: BroadsetElement): OGrafSchema {
  const defaults: Record<string, string> = {};
  const inputs: OGrafSchemaInput[] = [];

  // Text content binding
  if (element.type === 'text') {
    const key = `${element.id}-content`;

    defaults[key] = element.content;
    inputs.push({ name: key, type: 'text', defaultValue: element.content });
  }

  // Data binding field
  if (element.dataField != null) {
    const key = `${element.id}-data`;
    const fieldName = element.dataField.fieldName;

    defaults[key] = fieldName;
    inputs.push({ name: key, type: 'text', defaultValue: fieldName });
  }

  return {
    defaults: Object.freeze(defaults),
    inputs: Object.freeze(inputs),
  };
}

/**
 * Generates one OGraf broadcast package per top-level element.
 * Text content is exposed as schema defaults.
 * Image elements are not exposed as text inputs.
 * QR elements are pre-rendered to inline SVG.
 * Includes renderRequirements (canvas dimensions), stepCount (from animations), and customActions.
 */
export function generateOGrafPackages(document: BroadsetDocument): readonly OGrafPackage[] {
  const { canvas } = document;

  return document.elements.map((element) => {
    // Count animation timelines for this element as step states
    const elementAnimations = document.animations.filter((a) => a.elementId === element.id);
    const totalKeyframes = elementAnimations.reduce(
      (sum, a) => sum + a.config.timelines.reduce((ts, tl) => ts + tl.keyframes.length, 0),
      0,
    );

    return {
      elementId: element.id,
      name: sanitizeFilename(element.name) || element.id,
      schema: buildOGrafSchema(element),
      runtime: buildOGrafRuntime(element),
      renderRequirements: { width: canvas.width, height: canvas.height },
      stepCount: totalKeyframes,
      customActions: totalKeyframes > 0 ? ['set-step'] : [],
    };
  });
}
