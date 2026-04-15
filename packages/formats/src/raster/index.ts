/* ------------------------------------------------------------------ */
/*  Raster Export — PNG, JPEG, Embedded SVG, Canvas Discovery        */
/* ------------------------------------------------------------------ */

import type { VideoEncodingConfig } from 'mediabunny';
import { BufferTarget, CanvasSource, Output, WebMOutputFormat } from 'mediabunny';

const CANVAS_MARKER = 'data-broadset-canvas';
const DEFAULT_JPEG_QUALITY = 0.92;
const DEFAULT_WEBM_QUALITY = 0.8;
const DEFAULT_WEBM_FRAME_RATE = 50;

/* ------------------------------------------------------------------ */
/*  Types                                                            */
/* ------------------------------------------------------------------ */

export interface RasterExportOptions {
  readonly pixelRatio: number;
  readonly quality?: number;
}

export interface WebMExportOptions {
  readonly alpha?: boolean;
  readonly frameRate?: number;
  readonly durationMs: number;
  readonly quality?: number;
}

/**
 * Callback that renders the scene at a given time (in milliseconds).
 * Called once per frame during WebM export to advance the animation.
 */
export type FrameRenderer = (timeMs: number) => void;

/* ------------------------------------------------------------------ */
/*  Canvas Element Discovery                                         */
/* ------------------------------------------------------------------ */

/**
 * Discovers the active raster canvas element by its data marker.
 * Returns null when no matching element exists.
 */
export function discoverCanvasElement(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(`canvas[${CANVAS_MARKER}]`);
}

/* ------------------------------------------------------------------ */
/*  Internal Helpers                                                 */
/* ------------------------------------------------------------------ */

function scaleCanvas(source: HTMLCanvasElement, pixelRatio: number): HTMLCanvasElement {
  if (pixelRatio === 1) {
    return source;
  }

  const scaledWidth = Math.round(source.width * pixelRatio);
  const scaledHeight = Math.round(source.height * pixelRatio);
  const scaled = document.createElement('canvas');

  scaled.width = scaledWidth;
  scaled.height = scaledHeight;

  const ctx = scaled.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to obtain 2D context for scaled canvas');
  }

  ctx.drawImage(source, 0, 0, scaledWidth, scaledHeight);

  return scaled;
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Failed to create ${mimeType} blob from canvas`));
        }
      },
      mimeType,
      quality,
    );
  });
}

/* ------------------------------------------------------------------ */
/*  PNG Export                                                        */
/* ------------------------------------------------------------------ */

/**
 * Exports a canvas element as a PNG image blob.
 * Quality parameter is ignored for PNG (always lossless).
 */
export function exportPngBlob(canvas: HTMLCanvasElement, options: RasterExportOptions): Promise<Blob> {
  const scaled = scaleCanvas(canvas, options.pixelRatio);

  return canvasToBlob(scaled, 'image/png');
}

/* ------------------------------------------------------------------ */
/*  JPEG Export                                                      */
/* ------------------------------------------------------------------ */

/**
 * Exports a canvas element as a JPEG image blob.
 * Default quality is 0.92 when not specified.
 */
export function exportJpegBlob(canvas: HTMLCanvasElement, options: RasterExportOptions): Promise<Blob> {
  const scaled = scaleCanvas(canvas, options.pixelRatio);
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  return canvasToBlob(scaled, 'image/jpeg', quality);
}

/* ------------------------------------------------------------------ */
/*  Embedded SVG Export                                               */
/* ------------------------------------------------------------------ */

/**
 * Exports a canvas element as an embedded SVG blob.
 * The SVG wraps the canvas content as a base64-encoded image.
 */
export function exportEmbeddedSvgBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const dataUrl = canvas.toDataURL('image/png');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(canvas.width)}" height="${String(canvas.height)}">`,
    `<image href="${dataUrl}" width="${String(canvas.width)}" height="${String(canvas.height)}"/>`,
    `</svg>`,
  ].join('\n');

  return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
}

/* ------------------------------------------------------------------ */
/*  WebM Alpha Video Export                                          */
/* ------------------------------------------------------------------ */

/**
 * Calculates the total number of frames for a given duration and frame rate.
 */
function computeFrameCount(durationMs: number, frameRate: number): number {
  return Math.round((durationMs / 1000) * frameRate);
}

/**
 * Exports an animated canvas sequence as a WebM video blob with VP9 codec
 * using mediabunny for proper container muxing.
 *
 * The caller provides a `renderFrame` callback that updates the canvas content
 * for each time step. The encoder captures each frame, encodes it with VP9,
 * and produces a valid WebM container blob.
 *
 * When `alpha` is true, the VP9 encoder is configured for alpha channel
 * transparency (transparent background, no canvas background fill).
 * When `alpha` is false, the output has an opaque background.
 *
 * Note: For new code, prefer `exportVideoBlob` with `format: 'webm'` from the
 * interchange module, which provides a unified video export API for both
 * WebM and MP4 formats.
 */
export async function exportWebMBlob(
  canvas: HTMLCanvasElement,
  options: WebMExportOptions,
  renderFrame: FrameRenderer,
): Promise<Blob> {
  if (typeof globalThis.VideoEncoder === 'undefined') {
    throw new Error('WebM export requires the VideoEncoder API');
  }

  const alpha = options.alpha ?? false;
  const frameRate = options.frameRate ?? DEFAULT_WEBM_FRAME_RATE;
  const quality = options.quality ?? DEFAULT_WEBM_QUALITY;

  if (frameRate <= 0) {
    throw new Error('frameRate must be positive');
  }

  if (options.durationMs <= 0) {
    throw new Error('durationMs must be positive');
  }

  if (quality < 0 || quality > 1) {
    throw new Error('quality must be in range [0, 1]');
  }

  const bitrate = Math.round(quality * 4_000_000);

  const encodingConfig: VideoEncodingConfig = {
    codec: 'vp9',
    bitrate,
    alpha: alpha ? 'keep' : 'discard',
  };

  const canvasSource = new CanvasSource(canvas, encodingConfig);
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });

  output.addVideoTrack(canvasSource);
  await output.start();

  const totalFrames = computeFrameCount(options.durationMs, frameRate);
  const frameDurationSec = 1 / frameRate;

  for (let i = 0; i < totalFrames; i++) {
    const timeMs = (i / frameRate) * 1000;

    renderFrame(timeMs);
    await canvasSource.add(i * frameDurationSec, frameDurationSec);
  }

  await output.finalize();

  const buffer = target.buffer;

  if (!buffer) {
    throw new Error('WebM export failed: output buffer is null after finalization');
  }

  return new Blob([buffer], { type: 'video/webm' });
}

/* ------------------------------------------------------------------ */
/*  Download Wrapper                                                 */
/* ------------------------------------------------------------------ */

/**
 * Triggers a browser download for a blob with the specified filename.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
