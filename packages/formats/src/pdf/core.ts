import type { BroadsetDocument, BroadsetElement, BroadsetGradient, Canvas } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import {
  PDFDocument,
  type PDFFont,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  StandardFonts,
} from 'pdf-lib';

import { prepareBidiAnalysis } from './bidi-reorder';
import { parseCssColor } from './color';
import { decodeDataUri } from './data-uri';
import {
  applyBrackets,
  applyPageBoxes,
  attachBroadsetXmp,
  attachOcgResourceBindings,
  attachOutputIntent,
  attachPdfaStructureTree,
  buildBroadsetXmpPacket,
  buildMarkedContentTag,
  buildRoundedRectPath,
  type CanvasAbsolutePosition,
  clipPathBrackets,
  collectPreflightWarnings,
  colorToPdfRgb,
  composeCanvasAbsolutePosition,
  type CornerRadii,
  drawImagePlaceholder,
  elementRotationBrackets,
  elementTopLeftPt,
  embedImageFromBytes,
  emitLinkAnnotation,
  ensureTrailerId,
  fetchImageBytes,
  hasAnyRoundedCorner,
  indexElementsById,
  markedContentBrackets,
  type OcgRegistration,
  pdfaConformanceLetter,
  rasterizeSvgToPngBytes,
  readElementLink,
  registerLinearOrRadialShading,
  registerPageOcgs,
  renderPath,
  renderText,
  resolveAnimatedElementInState,
  resolveFillAsPdfRgb,
  resolveFillGradient,
  resolveFonts,
  resolveGradientFallbackColor,
  resolveOpacity,
  resolveOutputIntent,
  resolveStyleColor,
  type ShadingGeometry,
  srgbToDeviceCmyk,
} from './export';
import { canvasToPoints, elementToPoints } from './geometry';
import { drawQrOnPage } from './qr';
import type { PdfExportOptions, PdfExportResult } from './types';
import { prepareLineBreaker } from './uax14-linebreak';

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

/**
 * Document-level output colour space, derived from
 * `document.outputIntent.colorSpace` (or `'rgb'` when no output
 * intent is declared). Passed into every render function that emits
 * solid colours so CMYK / Lab / Gray documents route through the
 * matching pdf-lib colour-emission path (`drawRectangle({ color:
 * cmyk(...) })` writes `k` operators instead of `rg` operators).
 */
type DocumentColorSpace = 'rgb' | 'cmyk' | 'gray' | 'lab';

function resolveDocumentColorSpace(doc: BroadsetDocument): DocumentColorSpace {
  return doc.outputIntent?.colorSpace ?? 'rgb';
}

/**
 * Convert a pdf-lib RGB colour into the document's output colour
 * space. RGB documents pass through unchanged; CMYK documents go
 * through the subtractive-inverse fallback per
 * `srgbToDeviceCmyk` (real ICC conversion via `_shared/color/lcms-wasm`
 * is a Spec Gap). Gray and Lab fall back to RGB until their dedicated
 * colour-conversion paths land.
 */
function toDeviceColor(
  color: ReturnType<typeof rgb> | undefined,
  colorSpace: DocumentColorSpace,
): ReturnType<typeof rgb> | ReturnType<typeof srgbToDeviceCmyk> | undefined {
  if (color === undefined) return undefined;
  if (colorSpace === 'cmyk') return srgbToDeviceCmyk(color);

  return color;
}

interface RectangleStyleResolved {
  readonly fillRgb: ReturnType<typeof resolveFillAsPdfRgb>;
  readonly fillGradient: ReturnType<typeof resolveFillGradient>;
  readonly border: ReturnType<typeof resolveStyleColor>;
  readonly borderWidthPt: number | undefined;
  readonly opacity: number;
  readonly radii: BroadsetElement['style']['borderRadius'];
}

function resolveRectangleStyle(el: BroadsetElement, canvas: Canvas): RectangleStyleResolved {
  return {
    fillRgb: resolveFillAsPdfRgb(el.style),
    fillGradient: resolveFillGradient(el.style),
    border: resolveStyleColor(el.style, 'borderColor'),
    borderWidthPt:
      el.style.borderWidth !== undefined ? elementToPoints(canvas, el.style.borderWidth) : undefined,
    opacity: resolveOpacity(el.style),
    radii: el.style.borderRadius,
  };
}

function renderRectangle(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
  pdf: PDFDocument,
  colorSpace: DocumentColorSpace,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);
  const styled = resolveRectangleStyle(el, canvas);

  if (paintRectangleAsShading(pdf, page, styled, { xPt, yPt, wPt, hPt }, canvas, colorSpace)) {
    return;
  }

  const bg =
    styled.fillRgb ??
    (styled.fillGradient !== undefined ? resolveGradientFallbackColor(styled.fillGradient) : undefined);

  paintRectangleSolid(page, bg, styled, { xPt, yPt, wPt, hPt }, canvas, colorSpace);
}

/**
 * Try to paint the rectangle as a PDF shading pattern when the fill is
 * a linear / radial gradient. Returns `true` when the shading was
 * applied; `false` when the caller should fall back to the solid /
 * first-stop colour path.
 */
function paintRectangleAsShading(
  pdf: PDFDocument,
  page: PDFPage,
  styled: RectangleStyleResolved,
  geometry: ShadingGeometry,
  canvas: Canvas,
  colorSpace: DocumentColorSpace,
): boolean {
  if (styled.fillRgb !== undefined) return false;
  if (styled.fillGradient === undefined) return false;

  const shaded = paintGradientFill(pdf, page, styled.fillGradient, geometry, () => {
    emitRectanglePath(page, geometry.xPt, geometry.yPt, geometry.wPt, geometry.hPt, styled.radii, canvas);
  });

  if (!shaded) return false;

  const borderDeviceColor = toDeviceColor(styled.border, colorSpace);

  if (borderDeviceColor !== undefined && styled.borderWidthPt !== undefined) {
    page.drawRectangle({
      x: geometry.xPt,
      y: geometry.yPt,
      width: geometry.wPt,
      height: geometry.hPt,
      borderColor: borderDeviceColor,
      borderWidth: styled.borderWidthPt,
      opacity: styled.opacity,
    });
  }

  return true;
}

function paintRectangleSolid(
  page: PDFPage,
  bg: ReturnType<typeof resolveFillAsPdfRgb>,
  styled: RectangleStyleResolved,
  geometry: ShadingGeometry,
  canvas: Canvas,
  colorSpace: DocumentColorSpace,
): void {
  const deviceBg = toDeviceColor(bg, colorSpace);
  const deviceBorder = toDeviceColor(styled.border, colorSpace);

  if (hasAnyRoundedCorner(styled.radii) && styled.radii !== undefined) {
    const cornerRadiiPt: CornerRadii = [
      elementToPoints(canvas, styled.radii[0]),
      elementToPoints(canvas, styled.radii[1]),
      elementToPoints(canvas, styled.radii[2]),
      elementToPoints(canvas, styled.radii[3]),
    ];
    const pathD = buildRoundedRectPath(geometry.wPt, geometry.hPt, cornerRadiiPt);

    page.drawSvgPath(pathD, {
      x: geometry.xPt,
      y: geometry.yPt + geometry.hPt,
      ...(deviceBg ? { color: deviceBg } : undefined),
      ...(deviceBorder ? { borderColor: deviceBorder } : undefined),
      ...(styled.borderWidthPt !== undefined ? { borderWidth: styled.borderWidthPt } : undefined),
      opacity: styled.opacity,
    });

    return;
  }

  page.drawRectangle({
    x: geometry.xPt,
    y: geometry.yPt,
    width: geometry.wPt,
    height: geometry.hPt,
    ...(deviceBg ? { color: deviceBg } : undefined),
    ...(deviceBorder ? { borderColor: deviceBorder } : undefined),
    ...(styled.borderWidthPt !== undefined ? { borderWidth: styled.borderWidthPt } : undefined),
    opacity: styled.opacity,
  });
}

/**
 * Paint a Broadset gradient as a real PDF shading pattern. Returns
 * `true` when the pattern was successfully registered + applied;
 * `false` when the gradient kind isn't expressible as a PDF shading
 * pattern (conic, malformed colour stops) and the caller should fall
 * back to the first-stop solid fill.
 *
 * The `drawShape` callback emits the shape's path operators inside
 * the graphics-state-saved + pattern-bound region so the pattern
 * fills exactly that geometry.
 */
function paintGradientFill(
  pdf: PDFDocument,
  page: PDFPage,
  gradient: BroadsetGradient,
  geometry: ShadingGeometry,
  drawShape: () => void,
): boolean {
  const pattern = registerLinearOrRadialShading(pdf, page, gradient, geometry);

  if (pattern === null) return false;

  page.pushOperators(pushGraphicsState(), ...pattern.setPatternFillOperators);

  drawShape();

  page.pushOperators(PDFOperator.of(PDFOperatorNames.FillNonZero), popGraphicsState());

  return true;
}

/**
 * Emit raw PDF rectangle / rounded-rect path operators (no fill / no
 * stroke). Caller handles fill / stroke separately so the same path
 * can be reused under a clipping or pattern-fill bracket.
 */
function emitRectanglePath(
  page: PDFPage,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
  radii: BroadsetElement['style']['borderRadius'],
  canvas: Canvas,
): void {
  if (hasAnyRoundedCorner(radii) && radii !== undefined) {
    const cornerRadiiPt: CornerRadii = [
      elementToPoints(canvas, radii[0]),
      elementToPoints(canvas, radii[1]),
      elementToPoints(canvas, radii[2]),
      elementToPoints(canvas, radii[3]),
    ];
    const pathD = buildRoundedRectPath(wPt, hPt, cornerRadiiPt);

    page.drawSvgPath(pathD, { x: xPt, y: yPt + hPt });

    return;
  }

  page.pushOperators(
    PDFOperator.of(PDFOperatorNames.AppendRectangle, [
      PDFNumber.of(xPt),
      PDFNumber.of(yPt),
      PDFNumber.of(wPt),
      PDFNumber.of(hPt),
    ]),
  );
}

function renderEllipse(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
  pdf: PDFDocument,
  colorSpace: DocumentColorSpace,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);
  const cx = xPt + wPt / 2;
  const cy = yPt + hPt / 2;
  const ellipseGradient = resolveFillGradient(el.style);
  const fillRgb = resolveFillAsPdfRgb(el.style);

  if (fillRgb === undefined && ellipseGradient !== undefined) {
    const geometry: ShadingGeometry = { xPt, yPt, wPt, hPt };
    const shaded = paintGradientFill(pdf, page, ellipseGradient, geometry, () => {
      page.drawEllipse({
        x: cx,
        y: cy,
        xScale: wPt / 2,
        yScale: hPt / 2,
      });
    });

    if (shaded) return;
  }

  const bg = fillRgb ?? (ellipseGradient !== undefined ? resolveGradientFallbackColor(ellipseGradient) : undefined);
  const deviceBg = toDeviceColor(bg, colorSpace);

  page.drawEllipse({
    x: cx,
    y: cy,
    xScale: wPt / 2,
    yScale: hPt / 2,
    ...(deviceBg ? { color: deviceBg } : undefined),
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
  pdf: PDFDocument,
  colorSpace: DocumentColorSpace,
): void {
  renderRectangle(page, el, absolute, canvas, trimHeightPt, pdf, colorSpace);

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
  ocgRegistration: OcgRegistration,
  colorSpace: DocumentColorSpace,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  const el = resolveAnimatedElementInState(rawElement);
  const markedContent = markedContentBrackets(pdf, page, buildMarkedContentTag(el));
  const ocgBinding = ocgRegistration.bindingByElementId.get(el.id);

  // /OC <ocg-name> BDC wraps the entire element so PDF readers can
  // toggle per-page visibility from their layers panel. /BSET BDC
  // nests inside it so reconciliation can still recover identity even
  // when an OCG is hidden.
  if (ocgBinding !== undefined) {
    page.pushOperators(
      PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [
        PDFName.of('OC'),
        ocgBinding.resourceName,
      ]),
    );
  }

  // /BSET BDC opens the element's painting sequence; rotation and clip
  // CTM operators nest inside so the marked-content pair survives across
  // any graphics-state resets Illustrator / Acrobat apply on save.
  page.pushOperators(markedContent.start);

  // Byte-stable re-emission: when the importer captured the element's
  // operator slice into `extensions.pdf.preservationBlob` AND the
  // element has not been edited since (`dirty: false`), re-emit the
  // captured bytes verbatim instead of running the synthesizer. This
  // preserves the source PDF's exact `cm` matrices, number formatting,
  // and graphics-state push order — what reproducible-build / diff
  // tools rely on.
  const reEmittedFromBlob = tryEmitPreservationBlob(page, el);

  if (!reEmittedFromBlob) {
    await synthesizeElement(page, el, canvas, trimHeightPt, pdf, fontMap, fallbackFont, elementsById, colorSpace, fetchFn);
  }

  page.pushOperators(markedContent.end);

  if (ocgBinding !== undefined) {
    page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent));
  }

  // Hyperlink overlay: opt-in via `extensions.pdf.link` on any
  // element. Emits a `/Annot /Subtype /Link` covering the element's
  // bounding box that opens the URL via the URI action when clicked.
  // Annotation registration MUST happen after the marked-content
  // brackets close — the annotation lives in the page's /Annots
  // array, not inside the content stream.
  const linkUrl = readElementLink(el);

  if (linkUrl !== undefined) {
    const linkAbsolute = composeCanvasAbsolutePosition(el, elementsById);

    emitLinkAnnotation(pdf, page, el, linkAbsolute, canvas, trimHeightPt, linkUrl);
  }
}

async function synthesizeElement(
  page: PDFPage,
  el: BroadsetElement,
  canvas: Canvas,
  trimHeightPt: number,
  pdf: PDFDocument,
  fontMap: ReadonlyMap<string, PDFFont>,
  fallbackFont: PDFFont,
  elementsById: ReadonlyMap<string, BroadsetElement>,
  colorSpace: DocumentColorSpace,
  fetchFn?: typeof globalThis.fetch,
): Promise<void> {
  const absolute = composeCanvasAbsolutePosition(el, elementsById);
  const rotate = elementRotationBrackets(el, absolute, canvas, trimHeightPt);
  const clipBrackets = clipPathBrackets(el, absolute, canvas, trimHeightPt);

  applyBrackets(page, rotate, 'start');
  applyBrackets(page, clipBrackets, 'start');

  switch (el.type) {
    case 'text':
      renderText(page, el, absolute, canvas, trimHeightPt, fontMap, fallbackFont);
      break;
    case 'rectangle':
      renderRectangle(page, el, absolute, canvas, trimHeightPt, pdf, colorSpace);
      break;
    case 'ellipse':
      renderEllipse(page, el, absolute, canvas, trimHeightPt, pdf, colorSpace);
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
      renderNonStaticElement(page, el, absolute, canvas, trimHeightPt, fallbackFont, pdf, colorSpace);
      break;
  }

  applyBrackets(page, clipBrackets, 'end');
  applyBrackets(page, rotate, 'end');
}

/**
 * Re-emit the element's captured operator slice from
 * `extensions.pdf.preservationBlob` verbatim, bypassing the
 * synthesizer. Returns `true` when the blob was emitted (caller MUST
 * skip synthesis), `false` when there is no blob or the element is
 * dirty / corrupted (caller falls back to synthesis).
 */
function tryEmitPreservationBlob(page: PDFPage, el: BroadsetElement): boolean {
  const preserved = readPreservationState(el);

  if (preserved === null) return false;

  const decoded = decodeBase64(preserved);

  if (decoded === null || decoded.length === 0) return false;

  // pdf-lib's `PDFOperator` writes its `name` field verbatim into the
  // page's content stream. By constructing an operator whose `name`
  // is the decoded slice and whose args are empty, the bytes appear
  // in the content stream exactly between `/BSET ... BDC` and `EMC`.
  // The cast to `PDFOperatorNames` is necessary because the public
  // type narrows to the operator-name enum, but the runtime accepts
  // any string and serializes it byte-for-byte.
  const rawOperator = PDFOperator.of(decoded as unknown as PDFOperatorNames, []);

  page.pushOperators(rawOperator);

  return true;
}

/**
 * Read `extensions.pdf.preservationBlob` from an element when its
 * `dirty` flag is false. Returns `null` when the element is dirty,
 * has no blob, or carries no `extensions.pdf` block at all.
 */
function readPreservationState(el: BroadsetElement): string | null {
  const extensions = el.extensions as Readonly<Record<string, unknown>> | undefined;

  if (extensions === undefined) return null;

  const pdfExt = extensions['pdf'];

  if (pdfExt === undefined || pdfExt === null || typeof pdfExt !== 'object') return null;

  const cast = pdfExt as Record<string, unknown>;

  if (cast['dirty'] === true) return null;

  const blob = cast['preservationBlob'];

  return typeof blob === 'string' && blob.length > 0 ? blob : null;
}

function decodeBase64(value: string): string | null {
  try {
    return globalThis.atob(value);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Export                                                        */
/* ------------------------------------------------------------------ */

/**
 * Export a BroadsetDocument to PDF bytes plus preflight warnings.
 *
 * Returns the byte stream and the warning list collected during the
 * pre-render preflight pass per `project/spec/formats/pdf.md` →
 * "Preflight and Warnings". Per IO-D-14 the export ALWAYS proceeds —
 * warnings are surface-level, never blocking. Callers that don't care
 * about warnings can use `exportPdfBytes` directly; this entry exists
 * so the demo's preflight panel can render the warning list to the
 * user before / after the export completes.
 *
 * @param doc - The document to export.
 * @param fetchFn - Optional fetch implementation for Google Fonts /
 *                  URL image resolution. Defaults to `globalThis.fetch`
 *                  when available.
 */
export async function exportPdfWithPreflight(
  doc: BroadsetDocument,
  fetchOrOptions?: typeof globalThis.fetch | PdfExportOptions,
): Promise<PdfExportResult> {
  const preflightWarnings = collectPreflightWarnings(doc);
  const { bytes, runtimeWarnings } = await runExport(doc, fetchOrOptions);

  return { bytes, warnings: [...preflightWarnings, ...runtimeWarnings] };
}

/**
 * Export a BroadsetDocument to PDF bytes via `pdf-lib`.
 * Animated elements are exported at their default/rest state (t=0).
 * Animation data (timelines, keyframes, states) is discarded per IO-D-16.
 *
 * @param doc - The document to export.
 * @param fetchFn - Optional fetch implementation for Google Fonts / URL image resolution.
 *                  Defaults to `globalThis.fetch` when available.
 */
export async function exportPdfBytes(
  doc: BroadsetDocument,
  fetchOrOptions?: typeof globalThis.fetch | PdfExportOptions,
): Promise<Uint8Array> {
  const result = await runExport(doc, fetchOrOptions);

  return result.bytes;
}

interface InternalExportResult {
  readonly bytes: Uint8Array;
  readonly runtimeWarnings: readonly string[];
}

/**
 * Internal export driver shared by `exportPdfBytes` and
 * `exportPdfWithPreflight`. Returns the produced bytes plus any
 * warnings collected during the render pass (font fallbacks,
 * unsupported features, etc.) so callers can choose whether to
 * surface them.
 */
async function runExport(
  doc: BroadsetDocument,
  fetchOrOptions?: typeof globalThis.fetch | PdfExportOptions,
): Promise<InternalExportResult> {
  const options = resolveOptions(fetchOrOptions);
  const fetchFn = options.fetch;
  const pdfaConformance = options.pdfaConformance;
  const { canvas } = doc;

  const pdf = await PDFDocument.create();
  const { widthPt: trimWidthPt, heightPt: trimHeightPt } = canvasToPoints(canvas);

  const page = pdf.addPage([trimWidthPt, trimHeightPt]);

  // MediaBox/BleedBox/TrimBox/ArtBox follow canvas.bleed/safeArea declarations.
  applyPageBoxes(pdf, page, canvas);

  // Warm the bidi analyser + UAX #14 line-breaker caches so
  // subsequent sync `reorderForBidi` and `wrapText` calls during
  // text rendering work without turning the entire render path
  // async. Both modules use dynamic-import + cache so the static
  // type chain doesn't leak `linebreak`/`bidi-js` ambient types
  // across package boundaries.
  await Promise.all([prepareBidiAnalysis(), prepareLineBreaker()]);

  // Always embed a Helvetica fallback up-front so placeholder labels and
  // text elements without a declared family have a working PDFFont.
  const fallbackFont = await pdf.embedFont(StandardFonts.Helvetica);
  const { fontMap, failures: fontFailures } = await resolveFonts(doc, pdf, fetchFn, {
    subsetFonts: options.subsetFonts,
  });
  const elementsById = indexElementsById(doc.elements);

  // Register one OCG per Broadset page so PDF readers surface per-page
  // visibility toggles in the layers panel. The registration also
  // builds a per-element binding map so each element's painting can be
  // wrapped in `/OC <name> BDC ... EMC` for per-page visibility.
  const ocgRegistration = registerPageOcgs(pdf, doc);

  attachOcgResourceBindings(pdf, page, ocgRegistration);

  const documentColorSpace = resolveDocumentColorSpace(doc);

  // Draw background inside the trim box (PDF origin is bottom-left;
  // applyPageBoxes already anchored the trim there via bleed offsets).
  drawCanvasBackground(page, canvas, trimWidthPt, trimHeightPt);

  for (const el of doc.elements) {
    await renderElement(
      page,
      el,
      canvas,
      trimHeightPt,
      pdf,
      fontMap,
      fallbackFont,
      elementsById,
      ocgRegistration,
      documentColorSpace,
      fetchFn,
    );
  }

  // Attach the shared `broadset:` XMP packet to the document catalog so
  // the round-trip importer (P6.4a) has a trusted metadata fast-path.
  // PDF/A mode also injects the `pdfaid:` identifier alongside the
  // `broadset:` namespace block.
  const xmpPdfa =
    pdfaConformance !== undefined
      ? { part: '2', conformance: pdfaConformanceLetter(pdfaConformance) }
      : undefined;

  attachBroadsetXmp(pdf, await buildBroadsetXmpPacket(doc, xmpPdfa !== undefined ? { pdfa: xmpPdfa } : {}));

  if (pdfaConformance !== undefined) {
    const intent = resolveOutputIntent(doc, options.assets ?? []);

    attachOutputIntent(pdf, intent);
    ensureTrailerId(pdf, doc.id);
  }

  // PDF/A-2a (ISO 19005-2 §6.7) requires a tagged structure tree
  // mapping each painted element to a logical structure type. We
  // emit a flat tree (one StructElem per Broadset element under a
  // single Document parent) which satisfies the structural floor.
  if (pdfaConformance === '2a') {
    attachPdfaStructureTree(pdf, page, doc);
  }

  // `useObjectStreams: false` keeps object dicts (catalog, page nodes,
  // OCProperties, Metadata, MediaBox) visible as plain text in the PDF
  // trailer rather than packed into compressed object streams. Content-
  // stream compression is unchanged. The file opens identically in every
  // PDF reader; the only difference is readability of metadata by tools
  // (and test assertions that grep the bytes for `/BSET`, `/OCProperties`,
  // etc.). Round-trip import tools don't care either way.
  const bytes = await pdf.save({ useObjectStreams: false });

  return { bytes, runtimeWarnings: fontFailures };
}

function resolveOptions(fetchOrOptions: typeof globalThis.fetch | PdfExportOptions | undefined): PdfExportOptions {
  if (fetchOrOptions === undefined) {
    return { fetch: typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined };
  }

  if (typeof fetchOrOptions === 'function') {
    return { fetch: fetchOrOptions };
  }

  return {
    ...fetchOrOptions,
    fetch: fetchOrOptions.fetch ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch : undefined),
  };
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
