import type { BroadsetDocument, PageElement } from '@broadset/model';
import type { FontInput } from '@libpdf/core';
import { PDF, rgb, StandardFonts } from '@libpdf/core';
import qrcode from 'qrcode-generator';

import { parseColor } from './color-parsing';

export type { ParsedColor } from './color-parsing';
export { parseColor } from './color-parsing';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Conversion factor: 1 mm = 72 / 25.4 PDF points. */
const MM_TO_PT = 72 / 25.4;

// ---------------------------------------------------------------------------
// Font Family Normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a font family name for deduplication: strips quotes, hyphens,
 * and lowercases.
 */
export function normalizeFontFamily(family: string): string {
  return family.replace(/['"]/g, '').replace(/-/g, ' ').toLowerCase();
}

// ---------------------------------------------------------------------------
// Standard Font Resolution
// ---------------------------------------------------------------------------

/** Maps normalized family names to Standard 14 PDF font names. */
const STANDARD_FONT_MAP: ReadonlyMap<string, FontInput> = new Map([
  ['helvetica', StandardFonts.Helvetica],
  ['arial', StandardFonts.Helvetica],
  ['courier', StandardFonts.Courier],
  ['courier new', StandardFonts.Courier],
  ['times', StandardFonts.TimesRoman],
  ['times new roman', StandardFonts.TimesRoman],
  ['times roman', StandardFonts.TimesRoman],
  ['symbol', StandardFonts.Symbol],
  ['zapf dingbats', StandardFonts.ZapfDingbats],
  ['zapfdingbats', StandardFonts.ZapfDingbats],
]);

/** Type for a font fetcher callback. */
export type FontFetcher = (url: string) => Promise<Uint8Array>;

/** Options for PDF export. */
export interface PdfExportOptions {
  readonly fontFetcher?: FontFetcher;
}

/**
 * Extracts the font binary URL from a Google Fonts CSS response.
 * Returns the first `url(...)` from a `src:` line, or undefined.
 */
export function parseGoogleFontsCss(css: string): string | undefined {
  const match = /url\(([^)]+)\)/.exec(css);

  return match?.[1];
}

/**
 * Resolves fonts for all text elements in a document, deduplicating by
 * normalized family name. Standard PDF fonts are used when available;
 * otherwise a Google Fonts lookup is attempted.
 */
export async function resolveFonts(
  elements: readonly PageElement[],
  pdf: PDF,
  fetchFn: FontFetcher,
): Promise<ReadonlyMap<string, FontInput>> {
  const cache = new Map<string, FontInput>();
  const attempted = new Set<string>();

  for (const el of elements) {
    if (el.type !== 'text') continue;

    const rawFamily = el.style?.['fontFamily'];

    if (typeof rawFamily !== 'string' || rawFamily === '') continue;

    const normalized = normalizeFontFamily(rawFamily);

    if (attempted.has(normalized)) continue;
    attempted.add(normalized);

    // Check standard fonts first
    const standard = STANDARD_FONT_MAP.get(normalized);

    if (standard !== undefined) {
      cache.set(normalized, standard);
      continue;
    }

    // Try Google Fonts resolution
    try {
      const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(rawFamily)}&display=swap`;
      const cssBytes = await fetchFn(cssUrl);
      const css = new TextDecoder().decode(cssBytes);
      const fontUrl = parseGoogleFontsCss(css);

      if (fontUrl !== undefined) {
        const fontBytes = await fetchFn(fontUrl);
        const embedded = pdf.embedFont(fontBytes);

        cache.set(normalized, embedded);
      }
    } catch {
      // Font resolution failed — will use default font
    }
  }

  return cache;
}

// ---------------------------------------------------------------------------
// Data URI Decoding
// ---------------------------------------------------------------------------

/** Result of decoding a data URI. */
interface DecodedDataUri {
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

/**
 * Decodes a data URI (base64 or UTF-8) into MIME type and raw bytes.
 * Returns undefined if the URI is not a valid data URI.
 */
export function decodeDataUri(uri: string): DecodedDataUri | undefined {
  const match = /^data:([^;,]+)(?:;([^,]*))?(?:,(.*))?$/.exec(uri);

  if (match === null) return undefined;

  const mimeType = match[1] ?? 'application/octet-stream';
  const encoding = match[2] ?? '';
  const data = match[3] ?? '';

  if (encoding === 'base64') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return { mimeType, bytes };
  }

  // utf8 or plain text encoding
  const encoder = new TextEncoder();

  return { mimeType, bytes: encoder.encode(decodeURIComponent(data)) };
}

// ---------------------------------------------------------------------------
// Text Wrapping
// ---------------------------------------------------------------------------

/** Type for a text measurement function. */
type MeasureFn = (text: string, size: number) => number;

/**
 * Wraps text at word boundaries respecting maximum width.
 * Explicit newlines are preserved, including empty lines.
 */
export function wrapText(text: string, maxWidth: number, fontSize: number, measure: MeasureFn): readonly string[] {
  const result: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      result.push('');
      continue;
    }

    const words = paragraph.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (currentLine === '') {
        currentLine = word;
        continue;
      }

      const testLine = `${currentLine} ${word}`;
      let width: number;

      try {
        width = measure(testLine, fontSize);
      } catch {
        // Fall back to per-character measurement
        width = testLine.length * measure('M', fontSize);
      }

      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        result.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine !== '') {
      result.push(currentLine);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// SVG Mask Building
// ---------------------------------------------------------------------------

export function buildMaskedSvgSource(content: string, width: number, height: number, clipPath: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" preserveAspectRatio="xMidYMid meet">`,
    `<defs><clipPath id="clip0"><path d="${clipPathToSvgPath(clipPath)}"/></clipPath></defs>`,
    `<g clip-path="url(#clip0)">${content}</g>`,
    '</svg>',
  ].join('');
}

function clipPathToSvgPath(clip: string): string {
  if (clip.startsWith('polygon(')) {
    const inner = clip.slice(8, -1);
    const points = inner.split(',').map((p) => p.trim());

    return (
      points
        .map((pt, i) => {
          const cmd = i === 0 ? 'M' : 'L';

          return `${cmd}${pt.replace(/\s+/g, ',')}`;
        })
        .join(' ') + ' Z'
    );
  }

  return clip;
}

// ---------------------------------------------------------------------------
// QR Code Drawing
// ---------------------------------------------------------------------------

function drawQrCode(page: ReturnType<PDF['addPage']>, el: PageElement): void {
  const x = el.position.x * MM_TO_PT;
  const y = el.position.y * MM_TO_PT;
  const w = el.width * MM_TO_PT;
  const h = el.height * MM_TO_PT;

  // White background
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1) });

  if (el.content === '') return;

  const qr = qrcode(0, 'M');

  qr.addData(el.content);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellW = w / moduleCount;
  const cellH = h / moduleCount;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        page.drawRectangle({
          x: x + col * cellW,
          y: y + (moduleCount - 1 - row) * cellH,
          width: cellW,
          height: cellH,
          color: rgb(0, 0, 0),
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

/** Safe accessor for element style properties. */
function getStyleProp(el: PageElement, key: string): unknown {
  return el.style?.[key];
}

/** Safe accessor for element screen properties. */
function getScreenProp(el: PageElement, key: string): unknown {
  return el.screen?.[key];
}

/**
 * Exports a BroadsetDocument to a PDF file as a Uint8Array.
 * Canvas dimensions are in mm and converted to PDF points.
 * Animated elements are rendered at their default/rest state (t=0).
 */
export async function exportPdf(doc: BroadsetDocument, options?: PdfExportOptions): Promise<Uint8Array> {
  const { canvas } = doc;
  const pageWidth = canvas.width * MM_TO_PT;
  const pageHeight = canvas.height * MM_TO_PT;
  const elements = doc.pages[0]?.elements ?? [];

  const pdf = PDF.create();
  const page = pdf.addPage({ width: pageWidth, height: pageHeight });

  // Resolve fonts with deduplication
  const fetchFn = options?.fontFetcher;
  const fontMap = fetchFn !== undefined ? await resolveFonts(elements, pdf, fetchFn) : new Map<string, FontInput>();

  for (const el of elements) {
    const x = el.position.x * MM_TO_PT;
    const y = pageHeight - (el.position.y + el.height) * MM_TO_PT;
    const w = el.width * MM_TO_PT;
    const h = el.height * MM_TO_PT;

    switch (el.type) {
      case 'text':
        drawTextElement(page, el, x, y, w, pageHeight, fontMap);
        break;
      case 'image':
        drawImageElement(pdf, page, el, x, y, w, h);
        break;
      case 'path':
        drawPathElement(page, el, x, y);
        break;
      case 'svg':
        drawSvgElement(pdf, page, el, x, y, w, h);
        break;
      case 'qrcode':
        drawQrCode(page, el);
        break;
      case 'rectangle':
        drawRectElement(page, el, x, y, w, h);
        break;
      default:
        drawRectElement(page, el, x, y, w, h);
        break;
    }
  }

  return pdf.save();
}

// ---------------------------------------------------------------------------
// Element Drawing Helpers
// ---------------------------------------------------------------------------

function drawTextElement(
  page: ReturnType<PDF['addPage']>,
  el: PageElement,
  x: number,
  y: number,
  _w: number,
  _pageHeight: number,
  fontMap: ReadonlyMap<string, FontInput>,
): void {
  const fontColor = getStyleProp(el, 'fontColor');
  const fontSize = getStyleProp(el, 'fontSize');
  const rawFamily = getStyleProp(el, 'fontFamily');
  const color = typeof fontColor === 'string' ? parseColor(fontColor) : undefined;
  const size = typeof fontSize === 'number' ? fontSize : 12;

  // Look up resolved font, fall back to Helvetica
  let font: FontInput = StandardFonts.Helvetica;

  if (typeof rawFamily === 'string' && rawFamily !== '') {
    const resolved = fontMap.get(normalizeFontFamily(rawFamily));

    if (resolved !== undefined) {
      font = resolved;
    }
  }

  page.drawText(el.content, {
    x,
    y,
    font,
    size,
    color: color !== undefined ? rgb(color.r, color.g, color.b) : rgb(0, 0, 0),
  });
}

function drawImageElement(
  pdf: PDF,
  page: ReturnType<PDF['addPage']>,
  el: PageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const decoded = decodeDataUri(el.content);

  if (decoded === undefined) return;

  try {
    let image;

    if (decoded.mimeType === 'image/jpeg' || decoded.mimeType === 'image/jpg') {
      image = pdf.embedJpeg(decoded.bytes);
    } else {
      image = pdf.embedPng(decoded.bytes);
    }

    page.drawImage(image, { x, y, width: w, height: h });
  } catch {
    // Unsupported image format — skip
  }
}

function drawPathElement(page: ReturnType<PDF['addPage']>, el: PageElement, x: number, y: number): void {
  const stroke = getStyleProp(el, 'stroke');
  const fill = getStyleProp(el, 'fill');
  const color = typeof stroke === 'string' ? parseColor(stroke) : undefined;
  const fillColor = typeof fill === 'string' ? parseColor(fill) : undefined;

  try {
    const opts: { x: number; y: number; color?: ReturnType<typeof rgb>; borderColor?: ReturnType<typeof rgb> } = {
      x,
      y,
    };

    if (fillColor !== undefined) {
      opts.color = rgb(fillColor.r, fillColor.g, fillColor.b);
    }

    if (color !== undefined) {
      opts.borderColor = rgb(color.r, color.g, color.b);
    }

    page.drawSvgPath(el.content, opts);
  } catch {
    // Invalid SVG path — skip
  }
}

function drawSvgElement(
  pdf: PDF,
  page: ReturnType<PDF['addPage']>,
  el: PageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const clipPath = getScreenProp(el, 'customClipPath');

  let svgContent = el.content;

  if (typeof clipPath === 'string' && clipPath !== '') {
    svgContent = buildMaskedSvgSource(el.content, el.width, el.height, clipPath);
  }

  // Wrap SVG content in a full SVG document for embedding as image
  const svgDoc =
    svgContent.startsWith('<svg') ? svgContent : (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${String(el.width)}" height="${String(el.height)}">${svgContent}</svg>`
    );

  const encoder = new TextEncoder();
  const svgBytes = encoder.encode(svgDoc);

  try {
    const image = pdf.embedPng(svgBytes);

    page.drawImage(image, { x, y, width: w, height: h });
  } catch {
    // SVG embedding failed — draw a placeholder rectangle
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 0.5,
    });
  }
}

function drawRectElement(
  page: ReturnType<PDF['addPage']>,
  el: PageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const bg = getStyleProp(el, 'backgroundColor');
  const borderColor = getStyleProp(el, 'borderColor');
  const borderWidth = getStyleProp(el, 'borderWidth');
  const parsedBg = typeof bg === 'string' ? parseColor(bg) : undefined;
  const parsedBorder = typeof borderColor === 'string' ? parseColor(borderColor) : undefined;

  const opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    color?: ReturnType<typeof rgb>;
    borderColor?: ReturnType<typeof rgb>;
    borderWidth?: number;
  } = { x, y, width: w, height: h };

  if (parsedBg !== undefined) {
    opts.color = rgb(parsedBg.r, parsedBg.g, parsedBg.b);
  }

  if (parsedBorder !== undefined) {
    opts.borderColor = rgb(parsedBorder.r, parsedBorder.g, parsedBorder.b);
  }

  if (typeof borderWidth === 'number') {
    opts.borderWidth = borderWidth * MM_TO_PT;
  }

  page.drawRectangle(opts);
}
