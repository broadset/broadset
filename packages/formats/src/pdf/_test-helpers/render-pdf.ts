import { createCanvas } from '@napi-rs/canvas';

/**
 * Test-only helper for rasterising a PDF byte stream to a PNG via
 * `pdfjs-dist` + `@napi-rs/canvas`. Used by the visual-regression
 * suite to compare exported PDFs pixel-for-pixel against pinned
 * reference renders — catches silent breakage that structural tests
 * (XMP / OutputIntent / operator presence) cannot detect.
 *
 * Returns RGBA pixel data + dimensions so the caller can hand the
 * buffer straight to `pixelmatch` for diffing.
 */

interface RasteriseOptions {
  /**
   * 1-based page number. Defaults to 1.
   */
  readonly page?: number;
  /**
   * Render scale. 1.0 produces ~72 dpi at PDF point coordinates;
   * 2.0 produces ~144 dpi. Higher values give more precise pixel
   * comparisons at the cost of test runtime + memory.
   */
  readonly scale?: number;
}

interface RasterisedPage {
  readonly width: number;
  readonly height: number;
  /** RGBA pixel data, length = width × height × 4. */
  readonly pixels: Uint8Array;
  readonly png: Uint8Array;
}

interface PdfJsModuleShape {
  readonly getDocument: (params: {
    readonly data: Uint8Array;
    readonly disableFontFace: boolean;
    readonly verbosity: number;
    readonly isEvalSupported: boolean;
    readonly useSystemFonts: boolean;
  }) => { readonly promise: Promise<PdfJsDocument> };
}

interface PdfJsDocument {
  readonly numPages: number;
  getPage(n: number): Promise<PdfJsPage>;
  destroy(): Promise<void>;
}

interface PdfJsPage {
  getViewport(opts: { readonly scale: number }): { readonly width: number; readonly height: number };
  render(opts: {
    readonly canvasContext: unknown;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly canvas?: unknown;
  }): { readonly promise: Promise<void> };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

let cachedPdfJs: PdfJsModuleShape | undefined;

async function loadPdfJs(): Promise<PdfJsModuleShape> {
  if (cachedPdfJs !== undefined) return cachedPdfJs;

  const moduleSpecifier = 'pdfjs-dist/legacy/build/pdf.mjs';
  const moduleResult: unknown = await import(moduleSpecifier);

  if (!isObject(moduleResult)) throw new TypeError('pdfjs-dist did not resolve to a module');

  const getDocument = moduleResult['getDocument'];

  if (typeof getDocument !== 'function') throw new TypeError('pdfjs-dist getDocument export missing');

  cachedPdfJs = { getDocument: getDocument as PdfJsModuleShape['getDocument'] };

  return cachedPdfJs;
}

/**
 * Rasterise a single PDF page to a `Uint8Array` of RGBA pixels + a
 * PNG representation. pdfjs-dist + `@napi-rs/canvas` produce
 * deterministic output across runs on the same node version, which
 * is what makes the byte-level diff tractable.
 */
export async function rasterisePdfPage(bytes: Uint8Array, options: RasteriseOptions = {}): Promise<RasterisedPage> {
  const pageNumber = options.page ?? 1;
  const scale = options.scale ?? 1;
  const pdfJs = await loadPdfJs();
  const loadingTask = pdfJs.getDocument({
    // pdfjs mutates the input buffer, so hand it a fresh copy.
    data: new Uint8Array(bytes),
    // Disable font face since @napi-rs/canvas can't load PDF fonts;
    // pdfjs falls back to its bundled standard-font replacements
    // (Liberation Sans for Helvetica, etc.).
    disableFontFace: true,
    // Quieten pdfjs's console.warn spam during tests.
    verbosity: 0,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const width = Math.ceil(viewport.width);
    const height = Math.ceil(viewport.height);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const imageData = context.getImageData(0, 0, width, height);
    const png = canvas.toBuffer('image/png');

    return {
      width,
      height,
      pixels: new Uint8Array(imageData.data.buffer),
      png: new Uint8Array(png),
    };
  } finally {
    await pdf.destroy();
  }
}
