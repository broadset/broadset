import { type PDFDocument, type PDFImage, type PDFPage, rgb } from 'pdf-lib';

/** Placeholder border for image elements that fail to embed. */
const PLACEHOLDER_BORDER = rgb(0.8, 0.8, 0.8);

/** Placeholder border width for image elements that fail to embed. */
const PLACEHOLDER_BORDER_WIDTH = 0.5;

/**
 * Embed image bytes into a PDFDocument by MIME-routing to either
 * `embedJpg` (JPEG inputs avoid re-encoding) or `embedPng` (every
 * other raster input). pdf-lib has no `embedImage(bytes)` umbrella
 * since the two embedders have different parsing paths.
 *
 * Real ICC-profile preservation on image assets via the Phase 4
 * asset-pipeline `IccProfileAsset` round-trip lands with the
 * colour-mode follow-up tracked in `project/spec/formats/pdf.md`
 * §Spec Gaps.
 */
export async function embedImageFromBytes(pdf: PDFDocument, mime: string, bytes: Uint8Array): Promise<PDFImage> {
  const normalized = mime.toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return await pdf.embedJpg(bytes);
  }

  return await pdf.embedPng(bytes);
}

/**
 * Fetch image bytes from a URL via the caller-supplied `fetchFn`.
 * Returns `undefined` on any error (no fetch impl, network failure,
 * non-OK status, malformed body) so the caller can fall through to
 * the placeholder border.
 */
export async function fetchImageBytes(
  url: string,
  fetchFn?: typeof globalThis.fetch,
): Promise<{ readonly mime: string; readonly bytes: Uint8Array } | undefined> {
  if (fetchFn === undefined) {
    return undefined;
  }

  try {
    const response = await fetchFn(url);

    if (!response.ok) {
      return undefined;
    }

    const mime = response.headers.get('content-type') ?? 'image/png';
    const bytes = new Uint8Array(await response.arrayBuffer());

    return { mime, bytes };
  } catch {
    return undefined;
  }
}

/**
 * Rasterise an SVG byte stream to PNG bytes via `<canvas>`. PDF has
 * no native SVG support; the prior `@libpdf/core` pipeline rasterised
 * SVGs to PNG before embedding and the pdf-lib pipeline preserves
 * that behaviour. Returns `undefined` when no `document` global is
 * available (server-side without DOM polyfill) so the caller falls
 * through to a placeholder.
 */
export async function rasterizeSvgToPngBytes(svgBytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (context === null) {
    return undefined;
  }

  const svgText = new TextDecoder().decode(svgBytes);
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });

  return await rasterizeSvgBlob(svgBlob, canvas, context);
}

function rasterizeSvgBlob(
  svgBlob: Blob,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
): Promise<Uint8Array | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(svgBlob);

    image.onload = () => {
      finalizeRasterizedSvg(image, canvas, context, objectUrl, resolve);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(undefined);
    };

    image.src = objectUrl;
  });
}

function finalizeRasterizedSvg(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  objectUrl: string,
  resolve: (value: Uint8Array | undefined) => void,
): void {
  const width = Math.max(1, image.naturalWidth || image.width || 1);
  const height = Math.max(1, image.naturalHeight || image.height || 1);

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0);

  canvas.toBlob((blob) => {
    URL.revokeObjectURL(objectUrl);

    if (blob === null) {
      resolve(undefined);

      return;
    }

    void blob.arrayBuffer().then((buffer) => {
      resolve(new Uint8Array(buffer));
    });
  }, 'image/png');
}

/**
 * Draw a placeholder rectangle in place of an image element when the
 * image bytes are missing or fail to embed. The thin grey border
 * preserves the bounding box so layout stays predictable.
 */
export function drawImagePlaceholder(
  page: PDFPage,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
  opacity: number,
): void {
  page.drawRectangle({
    x: xPt,
    y: yPt,
    width: wPt,
    height: hPt,
    borderColor: PLACEHOLDER_BORDER,
    borderWidth: PLACEHOLDER_BORDER_WIDTH,
    opacity,
  });
}
