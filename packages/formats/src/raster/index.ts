/* ------------------------------------------------------------------ */
/*  Raster Export — PNG, JPEG, Embedded SVG, Canvas Discovery        */
/* ------------------------------------------------------------------ */

import type { VideoEncodingConfig } from 'mediabunny';
import { BufferTarget, CanvasSource, Output, WebMOutputFormat } from 'mediabunny';

const CANVAS_MARKER = 'data-broadset-canvas';
const RENDERER_ROOT_MARKER = 'data-broadset-canvas-root';
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
/*  Canvas & Renderer Element Discovery                              */
/* ------------------------------------------------------------------ */

/**
 * Discovers the active raster canvas element by its data marker.
 * Returns null when no matching element exists.
 */
export function discoverCanvasElement(): HTMLCanvasElement | null {
  return document.querySelector<HTMLCanvasElement>(`canvas[${CANVAS_MARKER}]`);
}

/**
 * Discovers the DOM-based renderer's content root element.
 * The renderer marks its canvasRoot with `data-broadset-canvas-root`.
 * Returns null when no matching element exists.
 */
export function discoverRendererRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${RENDERER_ROOT_MARKER}]`);
}

// Cache the modern-screenshot module to avoid repeated dynamic import() calls
// which can hang in some bundler/browser contexts.
let domToCanvasFn: ((node: Node, options?: Record<string, unknown>) => Promise<HTMLCanvasElement>) | null = null;
let createContextFn: ((node: Node, options?: Record<string, unknown>) => Promise<Record<string, unknown>>) | null =
  null;
let destroyContextFn: ((context: Record<string, unknown>) => void) | null = null;

async function ensureScreenshotModule(): Promise<void> {
  if (domToCanvasFn === null) {
    const mod = await import('modern-screenshot');

    domToCanvasFn = mod.domToCanvas as unknown as NonNullable<typeof domToCanvasFn>;
    createContextFn = mod.createContext as unknown as NonNullable<typeof createContextFn>;
    destroyContextFn = mod.destroyContext as unknown as NonNullable<typeof destroyContextFn>;
  }
}

/**
 * Captures a DOM element's visual content to a canvas of the specified dimensions
 * using modern-screenshot's domToCanvas. This enables video/raster export from
 * the DOM-based renderer when no native `<canvas>` element exists.
 */
export async function captureElementToCanvas(
  element: HTMLElement,
  width: number,
  height: number,
): Promise<HTMLCanvasElement> {
  await ensureScreenshotModule();

  if (domToCanvasFn === null) {
    throw new Error('modern-screenshot module failed to load');
  }

  const capture = domToCanvasFn;

  // Yield to the browser's event loop before capturing. This ensures
  // pending DOM mutations are painted and the Image onload callback
  // (used internally by modern-screenshot) can fire even when called
  // repeatedly inside a tight video-encoding loop.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

  try {
    // Disable modern-screenshot's Safari/Firefox per-image draw throttle
    // for single-frame exports as well. Without this, image-heavy PNG/JPEG
    // exports can spend ~100ms per image before encoding starts.
    return await capture(element, { width, height, scale: 1, drawImageInterval: 0 });
  } catch (error: unknown) {
    // modern-screenshot may reject with a non-Error (e.g. Event from image load failure).
    // Wrap it in a proper Error for diagnostics.
    throw new Error(`DOM-to-canvas capture failed: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/** Handle to a batch capture session. Call `capture()` per frame, then `destroy()` when done. */
export interface BatchCaptureSession {
  /** Capture the element to a canvas. Uses pre-cached fonts/images from context creation. */
  readonly capture: () => Promise<HTMLCanvasElement>;
  /** Destroy the batch capture context and free resources. */
  readonly destroy: () => void;
}

/**
 * Creates a batch capture session for efficient multi-frame capture.
 *
 * Uses modern-screenshot's `createContext` to pre-embed fonts and images ONCE,
 * then reuses that cached data for every subsequent frame capture. This is
 * orders of magnitude faster than calling `captureElementToCanvas` per frame,
 * which re-embeds all resources from scratch each time.
 *
 * Usage:
 * ```ts
 * const session = await createBatchCapture(element, width, height);
 * for (const frame of frames) {
 *   seekToFrame(frame);
 *   const canvas = await session.capture();
 *   // process canvas...
 * }
 * session.destroy();
 * ```
 */
export async function createBatchCapture(
  element: HTMLElement,
  width: number,
  height: number,
): Promise<BatchCaptureSession> {
  await ensureScreenshotModule();

  if (domToCanvasFn === null || createContextFn === null || destroyContextFn === null) {
    throw new Error('modern-screenshot module failed to load');
  }

  const capture = domToCanvasFn;
  const createCtx = createContextFn;
  const destroyCtx = destroyContextFn;

  // Create a context that pre-embeds all fonts and images. This is the
  // expensive step (~seconds), but it only runs once. The context stores
  // the node reference, so subsequent captures will re-read the DOM
  // (picking up CSS changes from seek()) while reusing cached fonts.
  //
  // `drawImageInterval: 0` disables modern-screenshot's default 100ms
  // per-image Safari/Firefox throttle — on a video encoding loop that
  // throttle translates into seconds of wall-clock delay per frame.
  const context = await createCtx(element, {
    width,
    height,
    scale: 1,
    autoDestruct: false,
    drawImageInterval: 0,
  });

  return {
    capture: async (): Promise<HTMLCanvasElement> => {
      try {
        // Pass the pre-built context directly. modern-screenshot will
        // re-read the live DOM (reflecting seek changes) but skip the
        // expensive font/image embedding because that data is cached.
        return await capture(context as unknown as Node);
      } catch (error: unknown) {
        throw new Error(
          `Batch DOM-to-canvas capture failed: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    },
    destroy: (): void => {
      destroyCtx(context);
    },
  };
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
