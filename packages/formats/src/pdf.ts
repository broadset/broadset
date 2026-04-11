import type { BroadsetDocument, BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';
import { type EmbeddedFont, PDF, type PDFPage, rgb, type Standard14FontName, StandardFonts } from '@libpdf/core';
import qrcode from 'qrcode-generator';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** 1 mm = 72/25.4 PDF points */
const MM_TO_PT = 72 / 25.4;

/** 1 inch = 72 PDF points */
const IN_TO_PT = 72;

/** Fallback character width in PDF points when font measurement fails. */
const FALLBACK_CHAR_WIDTH_PT = 8;

/** Placeholder border for elements that cannot be rendered natively in PDF (e.g. SVG). */
const SVG_PLACEHOLDER_BORDER = rgb(0.8, 0.8, 0.8);

/** Placeholder border width for non-renderable elements. */
const SVG_PLACEHOLDER_BORDER_WIDTH = 0.5;

/** Default line-height multiplier (typical PDF/CSS default). */
const LINE_HEIGHT_MULTIPLIER = 1.2;

/** Approximate width ratio for standard 14 PDF fonts (avg char width / fontSize). */
const STANDARD_FONT_WIDTH_RATIO = 0.5;

/* ------------------------------------------------------------------ */
/*  Color Parsing                                                      */
/* ------------------------------------------------------------------ */

interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_4 = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Extract a regex match group as a guaranteed string.
 * Only call after a successful match where the group is known to exist.
 */
function group(m: RegExpMatchArray, i: number): string {
  return m[i] ?? '';
}

/**
 * Parse hex (3/4/6/8 digit) and rgb()/rgba() strings into normalized RGBA.
 * Returns undefined for unsupported formats (HSL, named colors, etc.).
 */
export function parseCssColor(color: string): RgbaColor | undefined {
  let m: RegExpMatchArray | null;

  m = color.match(HEX_3);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1) + group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2) + group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3) + group(m, 3), 16) / 255),
      a: 1,
    };
  }

  m = color.match(HEX_4);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1) + group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2) + group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3) + group(m, 3), 16) / 255),
      a: clamp01(parseInt(group(m, 4) + group(m, 4), 16) / 255),
    };
  }

  m = color.match(HEX_6);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3), 16) / 255),
      a: 1,
    };
  }

  m = color.match(HEX_8);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1), 16) / 255),
      g: clamp01(parseInt(group(m, 2), 16) / 255),
      b: clamp01(parseInt(group(m, 3), 16) / 255),
      a: clamp01(parseInt(group(m, 4), 16) / 255),
    };
  }

  m = color.match(RGB_FN);

  if (m) {
    return {
      r: clamp01(parseInt(group(m, 1), 10) / 255),
      g: clamp01(parseInt(group(m, 2), 10) / 255),
      b: clamp01(parseInt(group(m, 3), 10) / 255),
      a: m[4] !== undefined ? clamp01(parseFloat(group(m, 4))) : 1,
    };
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Font Utilities                                                     */
/* ------------------------------------------------------------------ */

/**
 * Normalize font family name for deduplication.
 * Strips quotes, hyphens, trims, and lowercases.
 */
export function normalizeFontFamily(family: string): string {
  return family.replace(/['"]/g, '').replace(/-/g, '').trim().toLowerCase();
}

/**
 * Build a Google Fonts CSS URL for a given family name.
 */
export function resolveGoogleFontUrl(familyName: string): string {
  const encoded = encodeURIComponent(familyName);

  return `https://fonts.googleapis.com/css2?family=${encoded}&display=swap`;
}

/* ------------------------------------------------------------------ */
/*  Text Wrapping                                                      */
/* ------------------------------------------------------------------ */

/**
 * Wrap text at word boundaries respecting maximum width.
 * Explicit newlines are preserved including empty lines.
 * Falls back to per-character measurement when full-string measurement throws.
 */
export function wrapText(text: string, maxWidth: number, measure: (text: string) => number): readonly string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    const words = paragraph.split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let currentLine = '';

    for (const word of words) {
      const candidate = currentLine === '' ? word : `${currentLine} ${word}`;

      let width: number;

      try {
        width = measure(candidate);
      } catch {
        // Fallback: per-character measurement
        width = measurePerChar(candidate, measure);
      }

      if (width <= maxWidth || currentLine === '') {
        currentLine = candidate;
      } else {
        lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine !== '') {
      lines.push(currentLine);
    }
  }

  return lines;
}

function measurePerChar(text: string, measure: (t: string) => number): number {
  let total = 0;

  for (const ch of text) {
    try {
      total += measure(ch);
    } catch {
      total += FALLBACK_CHAR_WIDTH_PT;
    }
  }

  return total;
}

/* ------------------------------------------------------------------ */
/*  QR Code Drawing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Draw QR code modules as rectangles on a PDF page.
 * Empty content draws only the white background rectangle.
 */
export function drawQrOnPage(
  page: PDFPage,
  content: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  // Draw white background
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(1, 1, 1),
  });

  if (content.trim() === '') {
    return;
  }

  const qr = qrcode(0, 'M');

  qr.addData(content);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const cellW = width / moduleCount;
  const cellH = height / moduleCount;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        page.drawRectangle({
          x: x + col * cellW,
          y: y + height - (row + 1) * cellH,
          width: cellW,
          height: cellH,
          color: rgb(0, 0, 0),
        });
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Masked SVG Fallback                                                */
/* ------------------------------------------------------------------ */

/**
 * Build a masked SVG fallback source for clipped elements.
 * Wraps content in a <clipPath> definition for preserveAspectRatio support.
 */
export function buildMaskedSvgSource(
  width: number,
  height: number,
  clipPathValue: string,
  innerContent: string,
): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}" preserveAspectRatio="xMidYMid meet">`,
    '  <defs>',
    `    <clipPath id="clip0">`,
    `      <rect width="${String(width)}" height="${String(height)}" style="clip-path: ${clipPathValue}"/>`,
    '    </clipPath>',
    '  </defs>',
    `  <g clip-path="url(#clip0)">`,
    `    ${innerContent}`,
    '  </g>',
    '</svg>',
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Data URI Decoding                                                  */
/* ------------------------------------------------------------------ */

interface DecodedDataUri {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

export function decodeDataUri(uri: string): DecodedDataUri | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);

  if (!match) {
    return undefined;
  }

  const mime = group(match, 1);
  const encoding = match[2] ?? '';
  const data = group(match, 3);

  if (encoding === 'base64') {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return { mime, bytes };
    } catch {
      return undefined;
    }
  }

  // UTF-8 or other non-base64 encoding
  const encoder = new TextEncoder();

  return { mime, bytes: encoder.encode(decodeURIComponent(data)) };
}

/* ------------------------------------------------------------------ */
/*  Coordinate Conversion                                              */
/* ------------------------------------------------------------------ */

export function canvasToPoints(canvas: Canvas): { readonly widthPt: number; readonly heightPt: number } {
  switch (canvas.unit) {
    case 'mm':
      return { widthPt: canvas.width * MM_TO_PT, heightPt: canvas.height * MM_TO_PT };
    case 'in':
      return { widthPt: canvas.width * IN_TO_PT, heightPt: canvas.height * IN_TO_PT };
    case 'px':
      return {
        widthPt: (canvas.width / canvas.dpi) * IN_TO_PT,
        heightPt: (canvas.height / canvas.dpi) * IN_TO_PT,
      };
  }
}

function elementToPoints(canvas: Canvas, value: number): number {
  switch (canvas.unit) {
    case 'mm':
      return value * MM_TO_PT;
    case 'in':
      return value * IN_TO_PT;
    case 'px':
      return (value / canvas.dpi) * IN_TO_PT;
  }
}

/* ------------------------------------------------------------------ */
/*  Element Rendering                                                  */
/* ------------------------------------------------------------------ */

function resolveColor(
  style: Partial<BroadsetElementStyle>,
  prop: 'fontColor' | 'backgroundColor' | 'borderColor' | 'fill' | 'stroke',
): ReturnType<typeof rgb> | undefined {
  const raw = style[prop];

  if (typeof raw !== 'string') {
    return undefined;
  }

  const parsed = parseCssColor(raw);

  if (!parsed) {
    return undefined;
  }

  return rgb(parsed.r, parsed.g, parsed.b);
}

function resolveOpacity(style: Partial<BroadsetElementStyle>): number {
  return typeof style.opacity === 'number' ? clamp01(style.opacity) : 1;
}

/* ------------------------------------------------------------------ */
/*  Font Resolution                                                    */
/* ------------------------------------------------------------------ */

type FontInput = Standard14FontName | EmbeddedFont;

/** Map of normalized family name → Standard14 font name. */
const STANDARD_FONT_MAP: ReadonlyMap<string, Standard14FontName> = new Map([
  ['helvetica', StandardFonts.Helvetica],
  ['arial', StandardFonts.Helvetica],
  ['timesroman', StandardFonts.TimesRoman],
  ['times', StandardFonts.TimesRoman],
  ['times new roman', StandardFonts.TimesRoman],
  ['courier', StandardFonts.Courier],
  ['courier new', StandardFonts.Courier],
]);

/**
 * Resolve fonts for all text elements, deduplicating by normalized family name.
 * Attempts standard font match first, then Google Fonts fetch+embed, then falls back
 * to Helvetica.
 */
async function resolveFonts(
  doc: BroadsetDocument,
  pdf: PDF,
  fetchFn?: typeof globalThis.fetch,
): Promise<ReadonlyMap<string, FontInput>> {
  const fontMap = new Map<string, FontInput>();
  const seen = new Set<string>();

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const family = el.style.fontFamily;

    if (!family) continue;

    const normalized = normalizeFontFamily(family);

    if (seen.has(normalized)) continue;
    seen.add(normalized);

    // Check standard fonts first
    const standard = STANDARD_FONT_MAP.get(normalized);

    if (standard) {
      fontMap.set(normalized, standard);
      continue;
    }

    // Try Google Fonts fetch+embed
    if (fetchFn) {
      try {
        const cssUrl = resolveGoogleFontUrl(family);
        const cssResponse = await fetchFn(cssUrl);
        const cssText = await cssResponse.text();

        // Extract first .ttf or .woff2 URL from the CSS
        const urlMatch = cssText.match(/url\(([^)]+\.(?:ttf|woff2?))\)/);

        if (urlMatch) {
          const fontUrl = urlMatch[1];

          if (fontUrl) {
            const fontResponse = await fetchFn(fontUrl);
            const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());
            const embedded = pdf.embedFont(fontBytes);

            fontMap.set(normalized, embedded);
            continue;
          }
        }
      } catch {
        // Fall through to default
      }
    }

    // Fall back to Helvetica
    fontMap.set(normalized, StandardFonts.Helvetica);
  }

  return fontMap;
}

/**
 * Look up the resolved font for an element, falling back to Helvetica.
 */
function lookupFont(el: BroadsetElement, fontMap: ReadonlyMap<string, FontInput>): FontInput {
  if (el.style.fontFamily) {
    const normalized = normalizeFontFamily(el.style.fontFamily);
    const resolved = fontMap.get(normalized);

    if (resolved) return resolved;
  }

  return StandardFonts.Helvetica;
}

/* ------------------------------------------------------------------ */
/*  Element Rendering                                                  */
/* ------------------------------------------------------------------ */

function renderText(
  page: PDFPage,
  el: BroadsetElement,
  canvas: Canvas,
  heightPt: number,
  fontMap: ReadonlyMap<string, FontInput>,
): void {
  if (!el.content) {
    return;
  }

  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height);
  const color = resolveColor(el.style, 'fontColor') ?? rgb(0, 0, 0);
  const size = el.style.fontSize ? elementToPoints(canvas, el.style.fontSize) : 12;
  const opacity = resolveOpacity(el.style);
  const font = lookupFont(el, fontMap);
  const maxWidthPt = elementToPoints(canvas, el.width);
  const lineHeightPt = size * LINE_HEIGHT_MULTIPLIER;

  // Wrap text using our own wrapping (handles explicit newlines + per-char fallback)
  const measure = (text: string): number => {
    // Standard fonts have widthOfTextAtSize; for standard font names, approximate
    if (typeof font === 'string') {
      // Approximate: standard 14 fonts average ~0.5 × fontSize per character
      return text.length * size * STANDARD_FONT_WIDTH_RATIO;
    }

    return font.widthOfTextAtSize(text, size);
  };

  const lines = wrapText(el.content, maxWidthPt, measure);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) continue;

    page.drawText(line, {
      x: xPt,
      y: yPt + (lines.length - 1 - i) * lineHeightPt,
      size,
      color,
      opacity,
      font,
    });
  }
}

function renderRectangle(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number): void {
  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height);
  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);
  const bg = resolveColor(el.style, 'backgroundColor');
  const border = resolveColor(el.style, 'borderColor');

  page.drawRectangle({
    x: xPt,
    y: yPt,
    width: wPt,
    height: hPt,
    ...(bg ? { color: bg } : undefined),
    ...(border ? { borderColor: border } : undefined),
    ...(el.style.borderWidth ? { borderWidth: elementToPoints(canvas, el.style.borderWidth) } : undefined),
    opacity: resolveOpacity(el.style),
  });
}

function renderEllipse(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number): void {
  const cx = elementToPoints(canvas, el.position.x + el.width / 2);
  const cy = heightPt - elementToPoints(canvas, el.position.y + el.height / 2);
  const bg = resolveColor(el.style, 'backgroundColor') ?? resolveColor(el.style, 'fill');

  page.drawEllipse({
    x: cx,
    y: cy,
    xRadius: elementToPoints(canvas, el.width / 2),
    yRadius: elementToPoints(canvas, el.height / 2),
    ...(bg ? { color: bg } : undefined),
    opacity: resolveOpacity(el.style),
  });
}

function renderPath(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number): void {
  if (!el.content) {
    return;
  }

  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y);
  const fillColor = resolveColor(el.style, 'fill') ?? rgb(0, 0, 0);
  const strokeColor = resolveColor(el.style, 'stroke');

  page.drawSvgPath(el.content, {
    x: xPt,
    y: yPt,
    color: fillColor,
    ...(strokeColor ? { borderColor: strokeColor } : undefined),
    ...(el.style.strokeWidth ? { borderWidth: elementToPoints(canvas, el.style.strokeWidth) } : undefined),
    opacity: resolveOpacity(el.style),
  });
}

function renderImage(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number, pdf: PDF): void {
  if (!el.content) {
    return;
  }

  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height);
  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);
  const opacity = resolveOpacity(el.style);

  // Handle data URIs
  const decoded = el.content.startsWith('data:') ? decodeDataUri(el.content) : undefined;

  if (decoded) {
    if (decoded.mime.startsWith('image/svg')) {
      // SVG cannot be embedded natively in PDF; draw a placeholder.
      // buildMaskedSvgSource is available for pipelines that support SVG (e.g. HTML export).
      page.drawRectangle({
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        borderColor: SVG_PLACEHOLDER_BORDER,
        borderWidth: SVG_PLACEHOLDER_BORDER_WIDTH,
        opacity,
      });
    } else {
      // Try to embed as JPEG/PNG
      try {
        const image = pdf.embedImage(decoded.bytes);

        page.drawImage(image, {
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
          opacity,
        });
      } catch {
        // If embedding fails, draw a placeholder rectangle
        page.drawRectangle({
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
          borderColor: SVG_PLACEHOLDER_BORDER,
          borderWidth: SVG_PLACEHOLDER_BORDER_WIDTH,
          opacity,
        });
      }
    }
  } else {
    // Non-data-URI content: draw placeholder
    page.drawRectangle({
      x: xPt,
      y: yPt,
      width: wPt,
      height: hPt,
      borderColor: SVG_PLACEHOLDER_BORDER,
      borderWidth: SVG_PLACEHOLDER_BORDER_WIDTH,
      opacity,
    });
  }
}

function renderQrCode(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number): void {
  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height);
  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);

  drawQrOnPage(page, el.content, xPt, yPt, wPt, hPt);
}

function renderElement(
  page: PDFPage,
  el: BroadsetElement,
  canvas: Canvas,
  heightPt: number,
  pdf: PDF,
  fontMap: ReadonlyMap<string, FontInput>,
): void {
  switch (el.type) {
    case 'text':
      renderText(page, el, canvas, heightPt, fontMap);
      break;
    case 'rectangle':
      renderRectangle(page, el, canvas, heightPt);
      break;
    case 'ellipse':
      renderEllipse(page, el, canvas, heightPt);
      break;
    case 'path':
      renderPath(page, el, canvas, heightPt);
      break;
    case 'image':
    case 'svg':
      renderImage(page, el, canvas, heightPt, pdf);
      break;
    case 'qrcode':
      renderQrCode(page, el, canvas, heightPt);
      break;
    case 'group':
      // Groups are rendered by iterating child elements
      break;
    case 'video':
    case 'clock':
    case 'ticker':
      // Render as placeholder rectangle for non-static types
      renderRectangle(page, el, canvas, heightPt);
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */

/**
 * Export a BroadsetDocument to PDF bytes.
 * Animated elements are exported at their default/rest state (t=0).
 * Animation data (timelines, keyframes, states) is discarded.
 *
 * @param doc - The document to export.
 * @param fetchFn - Optional fetch implementation for Google Fonts resolution.
 *                  Defaults to `globalThis.fetch` if available.
 */
export async function exportPdfBytes(doc: BroadsetDocument, fetchFn?: typeof globalThis.fetch): Promise<Uint8Array> {
  const { canvas } = doc;
  const { widthPt, heightPt } = canvasToPoints(canvas);

  const pdf = PDF.create();
  const page = pdf.addPage({ width: widthPt, height: heightPt });

  // Resolve and deduplicate fonts before rendering
  const effectiveFetch = fetchFn ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined);
  const fontMap = await resolveFonts(doc, pdf, effectiveFetch);

  // Draw background
  if (canvas.backgroundMode === 'solid' && canvas.backgroundColor) {
    const bg = parseCssColor(canvas.backgroundColor);

    if (bg) {
      page.drawRectangle({
        x: 0,
        y: 0,
        width: widthPt,
        height: heightPt,
        color: rgb(bg.r, bg.g, bg.b),
        opacity: bg.a,
      });
    }
  }

  // Render elements at rest state (t=0) — ignore all animation data
  for (const el of doc.elements) {
    renderElement(page, el, canvas, heightPt, pdf, fontMap);
  }

  return pdf.save();
}
