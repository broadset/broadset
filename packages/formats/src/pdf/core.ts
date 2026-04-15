import type {
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyle,
  BroadsetGradient,
  Canvas,
} from '@broadset/model';
import { type EmbeddedFont, PDF, type PDFPage, rgb, type Standard14FontName, StandardFonts } from '@libpdf/core';

import { parseCssColor } from './color';
import { decodeDataUri } from './data-uri';
import { normalizeFontFamily, resolveGoogleFontUrl } from './fonts';
import { canvasToPoints, elementToPoints } from './geometry';
import { drawQrOnPage } from './qr';
import { wrapText } from './text';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Placeholder border for elements that cannot be rendered natively in PDF (e.g. SVG). */
const SVG_PLACEHOLDER_BORDER = rgb(0.8, 0.8, 0.8);

/** Placeholder border width for non-renderable elements. */
const SVG_PLACEHOLDER_BORDER_WIDTH = 0.5;

/** Default line-height multiplier (typical PDF/CSS default). */
const LINE_HEIGHT_MULTIPLIER = 1.2;

/** Approximate width ratio for standard 14 PDF fonts (avg char width / fontSize). */
const STANDARD_FONT_WIDTH_RATIO = 0.5;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Approximate a gradient as the first stop color (PDF has no native gradient support
 * without shading patterns, so we provide a best-effort solid fallback).
 */
function resolveGradientFallbackColor(gradient: string | BroadsetGradient): ReturnType<typeof rgb> | undefined {
  if (typeof gradient === 'string') {
    // CSS gradient string — try to extract first color token
    const colorMatch = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/.exec(gradient);

    if (colorMatch) {
      const parsed = parseCssColor(colorMatch[0]);

      if (parsed) {
        return rgb(parsed.r, parsed.g, parsed.b);
      }
    }

    return undefined;
  }

  // Structured gradient — use first stop color
  const firstStop = gradient.stops[0];

  if (firstStop === undefined) {
    return undefined;
  }

  const parsed = parseCssColor(firstStop.color);

  if (parsed) {
    return rgb(parsed.r, parsed.g, parsed.b);
  }

  return undefined;
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

async function fetchImageBytes(
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

async function rasterizeSvgToPngBytes(svgBytes: Uint8Array): Promise<Uint8Array | undefined> {
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

  return await new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(svgBlob);

    image.onload = () => {
      const width = Math.max(1, image.naturalWidth || image.width || 1);
      const height = Math.max(1, image.naturalHeight || image.height || 1);

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);

        if (!blob) {
          resolve(undefined);

          return;
        }

        void blob.arrayBuffer().then((buffer) => {
          resolve(new Uint8Array(buffer));
        });
      }, 'image/png');
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(undefined);
    };

    image.src = objectUrl;
  });
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

/** Standard 14 bold variants. */
const STANDARD_BOLD_MAP: ReadonlyMap<Standard14FontName, Standard14FontName> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  [StandardFonts.TimesRoman, StandardFonts.TimesBold],
  [StandardFonts.Courier, StandardFonts.CourierBold],
]);

/** Standard 14 italic/oblique variants. */
const STANDARD_ITALIC_MAP: ReadonlyMap<Standard14FontName, Standard14FontName> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaOblique],
  [StandardFonts.TimesRoman, StandardFonts.TimesItalic],
  [StandardFonts.Courier, StandardFonts.CourierOblique],
]);

/** Standard 14 bold-italic variants. */
const STANDARD_BOLD_ITALIC_MAP: ReadonlyMap<Standard14FontName, Standard14FontName> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaBoldOblique],
  [StandardFonts.TimesRoman, StandardFonts.TimesBoldItalic],
  [StandardFonts.Courier, StandardFonts.CourierBoldOblique],
]);

/**
 * Select the standard font variant based on weight and style.
 */
function selectStandardFontVariant(
  base: Standard14FontName,
  weight: number | undefined,
  style: string | undefined,
): Standard14FontName {
  const isBold = weight !== undefined && weight >= 700;
  const isItalic = style === 'italic' || style === 'oblique';

  if (isBold && isItalic) {
    return STANDARD_BOLD_ITALIC_MAP.get(base) ?? base;
  }

  if (isBold) {
    return STANDARD_BOLD_MAP.get(base) ?? base;
  }

  if (isItalic) {
    return STANDARD_ITALIC_MAP.get(base) ?? base;
  }

  return base;
}

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
 * Applies bold/italic standard font variants when available.
 */
function lookupFont(el: BroadsetElement, fontMap: ReadonlyMap<string, FontInput>): FontInput {
  let font: FontInput = StandardFonts.Helvetica;

  if (el.style.fontFamily) {
    const normalized = normalizeFontFamily(el.style.fontFamily);
    const resolved = fontMap.get(normalized);

    if (resolved) {
      font = resolved;
    }
  }

  // Apply bold/italic variants for standard fonts only
  if (typeof font === 'string') {
    return selectStandardFontVariant(font, el.style.fontWeight, el.style.fontStyle);
  }

  return font;
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
  const alignment = el.style.textAlignment ?? 'left';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) continue;

    // Calculate x offset for text alignment
    let lineX = xPt;

    if (alignment === 'center' || alignment === 'right') {
      const lineWidth = measure(line);

      if (alignment === 'center') {
        lineX = xPt + (maxWidthPt - lineWidth) / 2;
      } else {
        lineX = xPt + maxWidthPt - lineWidth;
      }
    }

    page.drawText(line, {
      x: lineX,
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
  const bg =
    resolveColor(el.style, 'backgroundColor') ??
    (el.style.backgroundGradient !== undefined ? resolveGradientFallbackColor(el.style.backgroundGradient) : undefined);
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
  const bg =
    resolveColor(el.style, 'backgroundColor') ??
    resolveColor(el.style, 'fill') ??
    (el.style.backgroundGradient !== undefined ? resolveGradientFallbackColor(el.style.backgroundGradient) : undefined);

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

function drawImagePlaceholder(
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
    borderColor: SVG_PLACEHOLDER_BORDER,
    borderWidth: SVG_PLACEHOLDER_BORDER_WIDTH,
    opacity,
  });
}

async function renderImage(
  page: PDFPage,
  el: BroadsetElement,
  canvas: Canvas,
  heightPt: number,
  pdf: PDF,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  if (!el.content) {
    return;
  }

  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height);
  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);
  const opacity = resolveOpacity(el.style);

  const decoded = el.content.startsWith('data:') ? decodeDataUri(el.content) : undefined;
  const fetched = decoded === undefined ? await fetchImageBytes(el.content, fetchFn) : undefined;

  if (decoded === undefined && fetched === undefined) {
    drawImagePlaceholder(page, xPt, yPt, wPt, hPt, opacity);

    return;
  }

  let imageBytes = decoded ?? fetched;

  if (imageBytes?.mime.startsWith('image/svg')) {
    const rasterized = await rasterizeSvgToPngBytes(imageBytes.bytes);

    if (rasterized) {
      imageBytes = { mime: 'image/png', bytes: rasterized };
    }
  }

  if (imageBytes === undefined) {
    drawImagePlaceholder(page, xPt, yPt, wPt, hPt, opacity);

    return;
  }

  try {
    const image = pdf.embedImage(imageBytes.bytes);

    page.drawImage(image, {
      x: xPt,
      y: yPt,
      width: wPt,
      height: hPt,
      opacity,
    });
  } catch {
    drawImagePlaceholder(page, xPt, yPt, wPt, hPt, opacity);
  }
}

function renderNonStaticElement(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number): void {
  renderRectangle(page, el, canvas, heightPt);

  const xPt = elementToPoints(canvas, el.position.x) + 4;
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height) + 4;
  const label =
    el.type === 'clock' ? el.content || '00:00'
    : el.type === 'ticker' ? el.content || 'Ticker'
    : 'Video';

  page.drawText(label, {
    x: xPt,
    y: yPt,
    size: 10,
    color: rgb(0.2, 0.2, 0.2),
    font: StandardFonts.Helvetica,
    opacity: resolveOpacity(el.style),
  });
}

function renderQrCode(page: PDFPage, el: BroadsetElement, canvas: Canvas, heightPt: number): void {
  const xPt = elementToPoints(canvas, el.position.x);
  const yPt = heightPt - elementToPoints(canvas, el.position.y) - elementToPoints(canvas, el.height);
  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);

  drawQrOnPage(page, el.content, xPt, yPt, wPt, hPt);
}

async function renderElement(
  page: PDFPage,
  el: BroadsetElement,
  canvas: Canvas,
  heightPt: number,
  pdf: PDF,
  fontMap: ReadonlyMap<string, FontInput>,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
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
      await renderImage(page, el, canvas, heightPt, pdf, fetchFn);
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
      renderNonStaticElement(page, el, canvas, heightPt);
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
    await renderElement(page, el, canvas, heightPt, pdf, fontMap, effectiveFetch);
  }

  return pdf.save();
}
