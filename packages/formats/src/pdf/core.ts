import type {
  BroadsetColor,
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyle,
  BroadsetGradient,
  Canvas,
} from '@broadset/model';
import { colorToCss, getGradientFillGradient, getSolidFillColor, resolveContentAsPlainString } from '@broadset/model';
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, StandardFonts } from 'pdf-lib';

import { parseCssColor } from './color';
import { decodeDataUri } from './data-uri';
import {
  buildRoundedRectPath,
  type CanvasAbsolutePosition,
  clipPathBrackets,
  composeCanvasAbsolutePosition,
  type CornerRadii,
  elementRotationBrackets,
  hasAnyRoundedCorner,
  indexElementsById,
  type OperatorBrackets,
} from './export';
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

/** Weight threshold above which a font is considered bold. */
const BOLD_WEIGHT_THRESHOLD = 700;

/** Label size for non-static placeholder elements (video/clock/ticker). */
const PLACEHOLDER_LABEL_SIZE = 10;

/** Inset applied to the non-static placeholder label relative to the element's box. */
const PLACEHOLDER_LABEL_INSET = 4;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Approximate a gradient as the first stop color (PDF has no native gradient
 * support on this pipeline yet — shading patterns land in P6.3). Preserves
 * the prior `@libpdf/core` behaviour through the pdf-lib swap.
 */
function resolveGradientFallbackColor(gradient: string | BroadsetGradient): ReturnType<typeof rgb> | undefined {
  if (typeof gradient === 'string') {
    const colorMatch = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/.exec(gradient);

    if (colorMatch) {
      const parsed = parseCssColor(colorMatch[0]);

      if (parsed) {
        return rgb(parsed.r, parsed.g, parsed.b);
      }
    }

    return undefined;
  }

  const firstStop = gradient.stops[0];

  if (firstStop === undefined) {
    return undefined;
  }

  const parsed = parseCssColor(colorToCss(firstStop.color));

  if (parsed) {
    return rgb(parsed.r, parsed.g, parsed.b);
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Colour resolution                                                  */
/* ------------------------------------------------------------------ */

function colorToPdfRgb(color: BroadsetColor | undefined): ReturnType<typeof rgb> | undefined {
  if (color === undefined) return undefined;

  const parsed = parseCssColor(colorToCss(color));

  if (!parsed) return undefined;

  return rgb(parsed.r, parsed.g, parsed.b);
}

function resolveStyleColor(
  style: Partial<BroadsetElementStyle>,
  prop: 'fontColor' | 'borderColor' | 'stroke',
): ReturnType<typeof rgb> | undefined {
  return colorToPdfRgb(style[prop]);
}

function resolveFillAsPdfRgb(style: Partial<BroadsetElementStyle>): ReturnType<typeof rgb> | undefined {
  const fill = style.fill;

  if (fill === undefined) return undefined;

  return colorToPdfRgb(getSolidFillColor(fill));
}

function resolveFillGradient(style: Partial<BroadsetElementStyle>): BroadsetGradient | undefined {
  const fill = style.fill;

  if (fill === undefined) return undefined;

  return getGradientFillGradient(fill);
}

function resolveOpacity(style: Partial<BroadsetElementStyle>): number {
  return typeof style.opacity === 'number' ? clamp01(style.opacity) : 1;
}

/* ------------------------------------------------------------------ */
/*  Image loading                                                      */
/* ------------------------------------------------------------------ */

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

async function embedImageFromBytes(pdf: PDFDocument, mime: string, bytes: Uint8Array): Promise<PDFImage> {
  const normalized = mime.toLowerCase();

  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return pdf.embedJpg(bytes);
  }

  return pdf.embedPng(bytes);
}

/* ------------------------------------------------------------------ */
/*  Font resolution                                                    */
/* ------------------------------------------------------------------ */

/** Map of normalized family name → pdf-lib Standard14 font name. */
const STANDARD_FONT_MAP: ReadonlyMap<string, StandardFonts> = new Map([
  ['helvetica', StandardFonts.Helvetica],
  ['arial', StandardFonts.Helvetica],
  ['timesroman', StandardFonts.TimesRoman],
  ['times', StandardFonts.TimesRoman],
  ['times new roman', StandardFonts.TimesRoman],
  ['courier', StandardFonts.Courier],
  ['courier new', StandardFonts.Courier],
]);

const STANDARD_BOLD_MAP: ReadonlyMap<StandardFonts, StandardFonts> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaBold],
  [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold],
  [StandardFonts.Courier, StandardFonts.CourierBold],
]);

const STANDARD_ITALIC_MAP: ReadonlyMap<StandardFonts, StandardFonts> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaOblique],
  [StandardFonts.TimesRoman, StandardFonts.TimesRomanItalic],
  [StandardFonts.Courier, StandardFonts.CourierOblique],
]);

const STANDARD_BOLD_ITALIC_MAP: ReadonlyMap<StandardFonts, StandardFonts> = new Map([
  [StandardFonts.Helvetica, StandardFonts.HelveticaBoldOblique],
  [StandardFonts.TimesRoman, StandardFonts.TimesRomanBoldItalic],
  [StandardFonts.Courier, StandardFonts.CourierBoldOblique],
]);

function selectStandardFontVariant(base: StandardFonts, isBold: boolean, isItalic: boolean): StandardFonts {
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

interface FontIdentity {
  readonly familyKey: string;
  readonly isBold: boolean;
  readonly isItalic: boolean;
}

function identityKey(id: FontIdentity): string {
  return `${id.familyKey}|${id.isBold ? 'b' : 'r'}|${id.isItalic ? 'i' : 'u'}`;
}

function elementFontIdentity(el: BroadsetElement): FontIdentity {
  const family = el.style.fontFamily ?? '';
  const weight = el.style.fontWeight;
  const style = el.style.fontStyle;

  return {
    familyKey: normalizeFontFamily(family),
    isBold: weight !== undefined && weight >= BOLD_WEIGHT_THRESHOLD,
    isItalic: style === 'italic' || style === 'oblique',
  };
}

async function tryEmbedGoogleFont(
  family: string,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch,
): Promise<PDFFont | null> {
  try {
    const cssUrl = resolveGoogleFontUrl(family);
    const cssResponse = await fetchFn(cssUrl);
    const cssText = await cssResponse.text();
    const urlMatch = cssText.match(/url\(([^)]+\.(?:ttf|woff2?))\)/);
    const fontUrl = urlMatch?.[1];

    if (!fontUrl) return null;

    const fontResponse = await fetchFn(fontUrl);
    const fontBytes = new Uint8Array(await fontResponse.arrayBuffer());

    return await pdf.embedFont(fontBytes);
  } catch {
    return null;
  }
}

async function resolveIdentity(
  family: string,
  isBold: boolean,
  isItalic: boolean,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch | undefined,
): Promise<PDFFont> {
  const normalized = normalizeFontFamily(family);
  const standard = STANDARD_FONT_MAP.get(normalized);

  if (standard !== undefined) {
    return await pdf.embedFont(selectStandardFontVariant(standard, isBold, isItalic));
  }

  if (fetchFn) {
    const embedded = await tryEmbedGoogleFont(family, pdf, fetchFn);

    if (embedded !== null) return embedded;
  }

  // Fallback: Helvetica with variant applied
  return await pdf.embedFont(selectStandardFontVariant(StandardFonts.Helvetica, isBold, isItalic));
}

async function resolveFonts(
  doc: BroadsetDocument,
  pdf: PDFDocument,
  fetchFn: typeof globalThis.fetch | undefined,
): Promise<ReadonlyMap<string, PDFFont>> {
  const fontMap = new Map<string, PDFFont>();
  const seen = new Set<string>();

  for (const el of doc.elements) {
    if (el.type !== 'text') continue;

    const id = elementFontIdentity(el);
    const key = identityKey(id);

    if (seen.has(key)) continue;
    seen.add(key);

    // Empty family falls through resolveIdentity to the Helvetica variant
    // fallback, matching the prior `@libpdf/core` behaviour where bold /
    // italic text without a declared family still rendered in the matching
    // Helvetica variant.
    const family = el.style.fontFamily ?? '';

    fontMap.set(key, await resolveIdentity(family, id.isBold, id.isItalic, pdf, fetchFn));
  }

  return fontMap;
}

function lookupFont(el: BroadsetElement, fontMap: ReadonlyMap<string, PDFFont>, fallback: PDFFont): PDFFont {
  const key = identityKey(elementFontIdentity(el));

  return fontMap.get(key) ?? fallback;
}

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                   */
/* ------------------------------------------------------------------ */

function elementTopLeftPt(
  absolute: CanvasAbsolutePosition,
  el: BroadsetElement,
  canvas: Canvas,
  heightPt: number,
): { readonly xPt: number; readonly yPt: number; readonly wPt: number; readonly hPt: number } {
  const xPt = elementToPoints(canvas, absolute.x);
  const yPt = heightPt - elementToPoints(canvas, absolute.y) - elementToPoints(canvas, el.height);
  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);

  return { xPt, yPt, wPt, hPt };
}

function applyBrackets(page: PDFPage, brackets: OperatorBrackets, phase: 'start' | 'end'): void {
  const ops = phase === 'start' ? brackets.start : brackets.end;

  if (ops.length === 0) return;

  page.pushOperators(...ops);
}

/* ------------------------------------------------------------------ */
/*  Element Rendering                                                  */
/* ------------------------------------------------------------------ */

function renderText(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
  fontMap: ReadonlyMap<string, PDFFont>,
  fallbackFont: PDFFont,
): void {
  if (!el.content) {
    return;
  }

  const { xPt, yPt, wPt: maxWidthPt } = elementTopLeftPt(absolute, el, canvas, heightPt);
  const color = resolveStyleColor(el.style, 'fontColor') ?? rgb(0, 0, 0);
  const size = el.style.fontSize ? elementToPoints(canvas, el.style.fontSize) : 12;
  const opacity = resolveOpacity(el.style);
  const font = lookupFont(el, fontMap, fallbackFont);
  const lineHeightPt = size * LINE_HEIGHT_MULTIPLIER;

  const measure = (text: string): number => font.widthOfTextAtSize(text, size);

  const lines = wrapText(resolveContentAsPlainString(el.content), maxWidthPt, measure);
  const alignment = el.style.textAlignment ?? 'left';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) continue;

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

function renderRectangle(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, heightPt);
  const fillGradient = resolveFillGradient(el.style);
  const bg =
    resolveFillAsPdfRgb(el.style) ??
    (fillGradient !== undefined ? resolveGradientFallbackColor(fillGradient) : undefined);
  const border = resolveStyleColor(el.style, 'borderColor');
  const opacity = resolveOpacity(el.style);
  const borderWidthPt = el.style.borderWidth !== undefined ? elementToPoints(canvas, el.style.borderWidth) : undefined;

  const radii = el.style.borderRadius;

  if (hasAnyRoundedCorner(radii) && radii !== undefined) {
    const cornerRadiiPt: CornerRadii = [
      elementToPoints(canvas, radii[0]),
      elementToPoints(canvas, radii[1]),
      elementToPoints(canvas, radii[2]),
      elementToPoints(canvas, radii[3]),
    ];
    const pathD = buildRoundedRectPath(wPt, hPt, cornerRadiiPt);

    // `drawSvgPath` anchors at `(x, y)` treating it as the SVG origin — top
    // of the SVG coordinate frame — and internally handles the PDF Y-flip.
    // We anchor at the rectangle's top-left in PDF points (yPt + hPt).
    page.drawSvgPath(pathD, {
      x: xPt,
      y: yPt + hPt,
      ...(bg ? { color: bg } : undefined),
      ...(border ? { borderColor: border } : undefined),
      ...(borderWidthPt !== undefined ? { borderWidth: borderWidthPt } : undefined),
      opacity,
    });

    return;
  }

  page.drawRectangle({
    x: xPt,
    y: yPt,
    width: wPt,
    height: hPt,
    ...(bg ? { color: bg } : undefined),
    ...(border ? { borderColor: border } : undefined),
    ...(borderWidthPt !== undefined ? { borderWidth: borderWidthPt } : undefined),
    opacity,
  });
}

function renderEllipse(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
): void {
  const cx = elementToPoints(canvas, absolute.x + el.width / 2);
  const cy = heightPt - elementToPoints(canvas, absolute.y + el.height / 2);
  const ellipseGradient = resolveFillGradient(el.style);
  const bg =
    resolveFillAsPdfRgb(el.style) ??
    (ellipseGradient !== undefined ? resolveGradientFallbackColor(ellipseGradient) : undefined);

  page.drawEllipse({
    x: cx,
    y: cy,
    xScale: elementToPoints(canvas, el.width / 2),
    yScale: elementToPoints(canvas, el.height / 2),
    ...(bg ? { color: bg } : undefined),
    opacity: resolveOpacity(el.style),
  });
}

function renderPath(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
): void {
  if (!el.content) {
    return;
  }

  const xPt = elementToPoints(canvas, absolute.x);
  const yPt = heightPt - elementToPoints(canvas, absolute.y);
  const fillColor = resolveFillAsPdfRgb(el.style) ?? rgb(0, 0, 0);
  const strokeColor = resolveStyleColor(el.style, 'stroke');

  page.drawSvgPath(resolveContentAsPlainString(el.content), {
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
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
  pdf: PDFDocument,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  if (!el.content) {
    return;
  }

  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, heightPt);
  const opacity = resolveOpacity(el.style);

  const contentText = resolveContentAsPlainString(el.content);
  const decoded = contentText.startsWith('data:') ? decodeDataUri(contentText) : undefined;
  const fetched = decoded === undefined ? await fetchImageBytes(contentText, fetchFn) : undefined;

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
    const image = await embedImageFromBytes(pdf, imageBytes.mime, imageBytes.bytes);

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

function labelForNonStaticElement(el: BroadsetElement): string {
  const contentText = resolveContentAsPlainString(el.content);

  if (el.type === 'clock') return contentText || '00:00';
  if (el.type === 'ticker') return contentText || 'Ticker';

  return 'Video';
}

function renderNonStaticElement(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
  fallbackFont: PDFFont,
): void {
  renderRectangle(page, el, absolute, canvas, heightPt);

  const xPt = elementToPoints(canvas, absolute.x) + PLACEHOLDER_LABEL_INSET;
  const yPt =
    heightPt -
    elementToPoints(canvas, absolute.y) -
    elementToPoints(canvas, el.height) +
    PLACEHOLDER_LABEL_INSET;
  const label = labelForNonStaticElement(el);

  page.drawText(label, {
    x: xPt,
    y: yPt,
    size: PLACEHOLDER_LABEL_SIZE,
    color: rgb(0.2, 0.2, 0.2),
    font: fallbackFont,
    opacity: resolveOpacity(el.style),
  });
}

function renderQrCode(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  heightPt: number,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, heightPt);

  drawQrOnPage(page, resolveContentAsPlainString(el.content), xPt, yPt, wPt, hPt);
}

async function renderElement(
  page: PDFPage,
  el: BroadsetElement,
  canvas: Canvas,
  heightPt: number,
  pdf: PDFDocument,
  fontMap: ReadonlyMap<string, PDFFont>,
  fallbackFont: PDFFont,
  elementsById: ReadonlyMap<string, BroadsetElement>,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  const absolute = composeCanvasAbsolutePosition(el, elementsById);
  const rotate = elementRotationBrackets(el, absolute, canvas, heightPt);
  const clipBrackets = clipPathBrackets(el, absolute, canvas, heightPt);

  applyBrackets(page, rotate, 'start');
  applyBrackets(page, clipBrackets, 'start');

  switch (el.type) {
    case 'text':
      renderText(page, el, absolute, canvas, heightPt, fontMap, fallbackFont);
      break;
    case 'rectangle':
      renderRectangle(page, el, absolute, canvas, heightPt);
      break;
    case 'ellipse':
      renderEllipse(page, el, absolute, canvas, heightPt);
      break;
    case 'path':
      renderPath(page, el, absolute, canvas, heightPt);
      break;
    case 'image':
    case 'svg':
      await renderImage(page, el, absolute, canvas, heightPt, pdf, fetchFn);
      break;
    case 'qrcode':
      renderQrCode(page, el, absolute, canvas, heightPt);
      break;
    case 'group':
      // Groups are pure containers — children render independently via the
      // flat `doc.elements` sweep; parent-child translation is composed
      // via `composeCanvasAbsolutePosition`.
      break;
    case 'video':
    case 'clock':
    case 'ticker':
      renderNonStaticElement(page, el, absolute, canvas, heightPt, fallbackFont);
      break;
  }

  applyBrackets(page, clipBrackets, 'end');
  applyBrackets(page, rotate, 'end');
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */

/**
 * Export a BroadsetDocument to PDF bytes via `pdf-lib`.
 * Animated elements are exported at their default/rest state (t=0).
 * Animation data (timelines, keyframes, states) is discarded per IO-D-16.
 *
 * @param doc - The document to export.
 * @param fetchFn - Optional fetch implementation for Google Fonts / URL image resolution.
 *                  Defaults to `globalThis.fetch` when available.
 */
export async function exportPdfBytes(doc: BroadsetDocument, fetchFn?: typeof globalThis.fetch): Promise<Uint8Array> {
  const { canvas } = doc;
  const { widthPt, heightPt } = canvasToPoints(canvas);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([widthPt, heightPt]);

  const effectiveFetch = fetchFn ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined);

  // Always embed a Helvetica fallback up-front so placeholder labels and
  // text elements without a declared family have a working PDFFont.
  const fallbackFont = await pdf.embedFont(StandardFonts.Helvetica);
  const fontMap = await resolveFonts(doc, pdf, effectiveFetch);
  const elementsById = indexElementsById(doc.elements);

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

  // Render elements at rest state (t=0) — animation data discarded per IO-D-16.
  for (const el of doc.elements) {
    await renderElement(page, el, canvas, heightPt, pdf, fontMap, fallbackFont, elementsById, effectiveFetch);
  }

  return await pdf.save();
}
