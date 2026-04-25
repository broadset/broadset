import type { BroadsetDocument, BroadsetElement, Canvas } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib';

import { parseCssColor } from './color';
import { decodeDataUri } from './data-uri';
import {
  applyBrackets,
  applyPageBoxes,
  attachBroadsetXmp,
  buildBroadsetXmpPacket,
  buildMarkedContentTag,
  buildRoundedRectPath,
  type CanvasAbsolutePosition,
  clipPathBrackets,
  colorToPdfRgb,
  composeCanvasAbsolutePosition,
  type CornerRadii,
  drawImagePlaceholder,
  elementRotationBrackets,
  elementTopLeftPt,
  embedImageFromBytes,
  fetchImageBytes,
  hasAnyRoundedCorner,
  indexElementsById,
  markedContentBrackets,
  rasterizeSvgToPngBytes,
  registerPageOcgs,
  renderPath,
  renderText,
  resolveAnimatedElementInState,
  resolveFillAsPdfRgb,
  resolveFillGradient,
  resolveFonts,
  resolveGradientFallbackColor,
  resolveOpacity,
  resolveStyleColor,
} from './export';
import { canvasToPoints, elementToPoints } from './geometry';
import { drawQrOnPage } from './qr';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Label size for non-static placeholder elements (video/clock/ticker). */
const PLACEHOLDER_LABEL_SIZE = 10;

/** Inset applied to the non-static placeholder label relative to the element's box. */
const PLACEHOLDER_LABEL_INSET = 4;

/* ------------------------------------------------------------------ */
/*  Element rendering — wrappers over the focused export modules       */
/* ------------------------------------------------------------------ */

function renderRectangle(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);
  const fillGradient = resolveFillGradient(el.style);
  const bg =
    resolveFillAsPdfRgb(el.style) ??
    (fillGradient !== undefined ? resolveGradientFallbackColor(fillGradient) : undefined);
  const border = resolveStyleColor(el.style, 'borderColor');
  const opacity = resolveOpacity(el.style);
  const borderWidthPt =
    el.style.borderWidth !== undefined ? elementToPoints(canvas, el.style.borderWidth) : undefined;

  const radii = el.style.borderRadius;

  if (hasAnyRoundedCorner(radii) && radii !== undefined) {
    const cornerRadiiPt: CornerRadii = [
      elementToPoints(canvas, radii[0]),
      elementToPoints(canvas, radii[1]),
      elementToPoints(canvas, radii[2]),
      elementToPoints(canvas, radii[3]),
    ];
    const pathD = buildRoundedRectPath(wPt, hPt, cornerRadiiPt);

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
  trimHeightPt: number,
): void {
  const bleed = canvas.bleed ?? [0, 0, 0, 0];
  const bleedLeftPt = elementToPoints(canvas, bleed[3]);
  const bleedBottomPt = elementToPoints(canvas, bleed[2]);

  const cx = bleedLeftPt + elementToPoints(canvas, absolute.x + el.width / 2);
  const cy = bleedBottomPt + trimHeightPt - elementToPoints(canvas, absolute.y + el.height / 2);
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

async function renderImage(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
  pdf: PDFDocument,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  if (!el.content) {
    return;
  }

  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);
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
  trimHeightPt: number,
  fallbackFont: PDFFont,
): void {
  renderRectangle(page, el, absolute, canvas, trimHeightPt);

  const { xPt: topLeftXPt, yPt: topLeftYPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);
  const xPt = topLeftXPt + PLACEHOLDER_LABEL_INSET;
  const yPt = topLeftYPt + PLACEHOLDER_LABEL_INSET;
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
  trimHeightPt: number,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);

  drawQrOnPage(page, resolveContentAsPlainString(el.content), xPt, yPt, wPt, hPt);
}

async function renderElement(
  page: PDFPage,
  rawElement: BroadsetElement,
  canvas: Canvas,
  trimHeightPt: number,
  pdf: PDFDocument,
  fontMap: ReadonlyMap<string, PDFFont>,
  fallbackFont: PDFFont,
  elementsById: ReadonlyMap<string, BroadsetElement>,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  const el = resolveAnimatedElementInState(rawElement);
  const absolute = composeCanvasAbsolutePosition(el, elementsById);
  const rotate = elementRotationBrackets(el, absolute, canvas, trimHeightPt);
  const clipBrackets = clipPathBrackets(el, absolute, canvas, trimHeightPt);
  const markedContent = markedContentBrackets(pdf, page, buildMarkedContentTag(el));

  // /BSET BDC opens the element's painting sequence; rotation and clip
  // CTM operators nest inside so the marked-content pair survives across
  // any graphics-state resets Illustrator / Acrobat apply on save.
  page.pushOperators(markedContent.start);

  applyBrackets(page, rotate, 'start');
  applyBrackets(page, clipBrackets, 'start');

  switch (el.type) {
    case 'text':
      renderText(page, el, absolute, canvas, trimHeightPt, fontMap, fallbackFont);
      break;
    case 'rectangle':
      renderRectangle(page, el, absolute, canvas, trimHeightPt);
      break;
    case 'ellipse':
      renderEllipse(page, el, absolute, canvas, trimHeightPt);
      break;
    case 'path':
      renderPath(page, el, absolute, canvas, trimHeightPt);
      break;
    case 'image':
    case 'svg':
      await renderImage(page, el, absolute, canvas, trimHeightPt, pdf, fetchFn);
      break;
    case 'qrcode':
      renderQrCode(page, el, absolute, canvas, trimHeightPt);
      break;
    case 'group':
      // Groups are pure containers — children render independently via the
      // flat `doc.elements` sweep; parent-child translation is composed
      // via `composeCanvasAbsolutePosition`.
      break;
    case 'video':
    case 'clock':
    case 'ticker':
      renderNonStaticElement(page, el, absolute, canvas, trimHeightPt, fallbackFont);
      break;
  }

  applyBrackets(page, clipBrackets, 'end');
  applyBrackets(page, rotate, 'end');

  page.pushOperators(markedContent.end);
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

  const pdf = await PDFDocument.create();
  const { widthPt: trimWidthPt, heightPt: trimHeightPt } = canvasToPoints(canvas);

  const page = pdf.addPage([trimWidthPt, trimHeightPt]);

  // MediaBox/BleedBox/TrimBox/ArtBox follow canvas.bleed/safeArea declarations.
  applyPageBoxes(pdf, page, canvas);

  const effectiveFetch = fetchFn ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined);

  // Always embed a Helvetica fallback up-front so placeholder labels and
  // text elements without a declared family have a working PDFFont.
  const fallbackFont = await pdf.embedFont(StandardFonts.Helvetica);
  const fontMap = await resolveFonts(doc, pdf, effectiveFetch);
  const elementsById = indexElementsById(doc.elements);

  // Register one OCG per Broadset page so PDF readers surface per-page
  // visibility toggles in the layers panel.
  registerPageOcgs(pdf, doc);

  // Draw background inside the trim box (PDF origin is bottom-left;
  // applyPageBoxes already anchored the trim there via bleed offsets).
  drawCanvasBackground(page, canvas, trimWidthPt, trimHeightPt);

  for (const el of doc.elements) {
    await renderElement(page, el, canvas, trimHeightPt, pdf, fontMap, fallbackFont, elementsById, effectiveFetch);
  }

  // Attach the shared `broadset:` XMP packet to the document catalog so
  // the round-trip importer (P6.4a) has a trusted metadata fast-path.
  attachBroadsetXmp(pdf, await buildBroadsetXmpPacket(doc));

  // `useObjectStreams: false` keeps object dicts (catalog, page nodes,
  // OCProperties, Metadata, MediaBox) visible as plain text in the PDF
  // trailer rather than packed into compressed object streams. Content-
  // stream compression is unchanged. The file opens identically in every
  // PDF reader; the only difference is readability of metadata by tools
  // (and test assertions that grep the bytes for `/BSET`, `/OCProperties`,
  // etc.). Round-trip import tools don't care either way.
  return await pdf.save({ useObjectStreams: false });
}

function drawCanvasBackground(page: PDFPage, canvas: Canvas, trimWidthPt: number, trimHeightPt: number): void {
  if (canvas.backgroundMode !== 'solid') return;
  if (canvas.backgroundColor === undefined) return;

  const bg = parseCssColor(canvas.backgroundColor);

  if (bg === undefined) return;

  const bleed = canvas.bleed ?? [0, 0, 0, 0];
  const bleedLeftPt = elementToPoints(canvas, bleed[3]);
  const bleedBottomPt = elementToPoints(canvas, bleed[2]);
  const color = colorToPdfRgb(undefined) ?? rgb(bg.r, bg.g, bg.b);

  page.drawRectangle({
    x: bleedLeftPt,
    y: bleedBottomPt,
    width: trimWidthPt,
    height: trimHeightPt,
    color,
    opacity: bg.a,
  });
}
