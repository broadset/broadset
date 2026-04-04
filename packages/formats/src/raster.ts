import { toBlob, toSvg } from 'html-to-image';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Data attribute used to mark the raster canvas target element. */
export const CANVAS_DATA_MARKER = 'data-broadset-canvas';

/** Default JPEG quality matching HTML Canvas toDataURL default. */
export const DEFAULT_JPEG_QUALITY = 0.92;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for raster export operations. */
interface RasterExportOptions {
  /** Device pixel ratio. 1 = native, 2 = 2x resolution. */
  readonly pixelRatio: number;
  /** JPEG quality (0–1). Ignored for PNG. */
  readonly quality?: number | undefined;
}

// ---------------------------------------------------------------------------
// Canvas Element Discovery
// ---------------------------------------------------------------------------

/**
 * Discover the active raster canvas element using the canvas data marker.
 * Returns null when no matching element exists.
 */
export function findCanvasElement(): HTMLElement | null {
  return document.querySelector(`[${CANVAS_DATA_MARKER}]`);
}

// ---------------------------------------------------------------------------
// PNG Export
// ---------------------------------------------------------------------------

/**
 * Export a target element as a PNG image blob.
 * Quality parameter is ignored (PNG is always lossless).
 */
export async function exportPngBlob(target: HTMLElement, options: RasterExportOptions): Promise<Blob> {
  const width = target.offsetWidth;
  const height = target.offsetHeight;

  const blob = await toBlob(target, {
    pixelRatio: options.pixelRatio,
    canvasWidth: width * options.pixelRatio,
    canvasHeight: height * options.pixelRatio,
    type: 'image/png',
  });

  if (!blob) {
    throw new Error('PNG export failed: toBlob returned null');
  }

  return blob;
}

// ---------------------------------------------------------------------------
// JPEG Export
// ---------------------------------------------------------------------------

/**
 * Export a target element as a JPEG image blob.
 * Accepts an optional quality parameter (0–1, default 0.92).
 */
export async function exportJpegBlob(target: HTMLElement, options: RasterExportOptions): Promise<Blob> {
  const width = target.offsetWidth;
  const height = target.offsetHeight;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  const blob = await toBlob(target, {
    pixelRatio: options.pixelRatio,
    canvasWidth: width * options.pixelRatio,
    canvasHeight: height * options.pixelRatio,
    quality,
    type: 'image/jpeg',
  });

  if (!blob) {
    throw new Error('JPEG export failed: toBlob returned null');
  }

  return blob;
}

// ---------------------------------------------------------------------------
// Embedded SVG Export
// ---------------------------------------------------------------------------

/**
 * Export a target element as an embedded SVG blob.
 * Returns a blob with image/svg+xml MIME type.
 */
export async function exportEmbeddedSvgBlob(target: HTMLElement): Promise<Blob> {
  const dataUrl = await toSvg(target);

  // Extract SVG content from data URL
  const prefix = 'data:image/svg+xml;charset=utf-8,';
  const svgContent = dataUrl.startsWith(prefix) ? decodeURIComponent(dataUrl.slice(prefix.length)) : dataUrl;

  return new Blob([svgContent], { type: 'image/svg+xml' });
}

// ---------------------------------------------------------------------------
// Download Wrappers
// ---------------------------------------------------------------------------

/** Trigger a browser download for a blob with the given filename. */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Download a PNG export of the target element. */
export async function downloadPng(
  target: HTMLElement,
  filename: string,
  options?: Partial<RasterExportOptions>,
): Promise<void> {
  const blob = await exportPngBlob(target, {
    pixelRatio: options?.pixelRatio ?? 1,
  });

  triggerDownload(blob, filename);
}

/** Download a JPEG export of the target element. */
export async function downloadJpeg(
  target: HTMLElement,
  filename: string,
  options?: Partial<RasterExportOptions>,
): Promise<void> {
  const blob = await exportJpegBlob(target, {
    pixelRatio: options?.pixelRatio ?? 1,
    quality: options?.quality,
  });

  triggerDownload(blob, filename);
}

/** Download an embedded SVG export of the target element. */
export async function downloadEmbeddedSvg(target: HTMLElement, filename: string): Promise<void> {
  const blob = await exportEmbeddedSvgBlob(target);

  triggerDownload(blob, filename);
}
