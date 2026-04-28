import type { Canvas } from '@broadset/model';
import { type PDFDocument, PDFName, type PDFPage } from 'pdf-lib';

import { elementToPoints } from '../geometry';

/**
 * Overall PDF page bounds in points — `widthPt` / `heightPt` are the
 * trim-plus-bleed box. When bleed is undeclared the trim and media box
 * are equal.
 */
interface PageBoxesResult {
  readonly mediaWidthPt: number;
  readonly mediaHeightPt: number;
}

/**
 * Set `/MediaBox`, `/BleedBox`, `/TrimBox`, and `/ArtBox` on a PDF page
 * from the Broadset canvas's `width` / `height` / `bleed` / `safeArea`
 * declarations.
 *
 * Mapping (per PDF 1.7 § 14.11.2 and the cross-format spec §PDF):
 * - `MediaBox` = trim + bleed on every side (full imageable area).
 * - `BleedBox` = `MediaBox` (production cutting tolerance).
 * - `TrimBox` = canvas width × height (the finished piece).
 * - `ArtBox`  = trim minus `safeArea` on every side, when declared.
 */
export function applyPageBoxes(pdf: PDFDocument, page: PDFPage, canvas: Canvas): PageBoxesResult {
  const trimWidthPt = elementToPoints(canvas, canvas.width);
  const trimHeightPt = elementToPoints(canvas, canvas.height);

  const bleed = canvas.bleed ?? [0, 0, 0, 0];
  const [bleedTop, bleedRight, bleedBottom, bleedLeft] = bleed;

  const bleedTopPt = elementToPoints(canvas, bleedTop);
  const bleedRightPt = elementToPoints(canvas, bleedRight);
  const bleedBottomPt = elementToPoints(canvas, bleedBottom);
  const bleedLeftPt = elementToPoints(canvas, bleedLeft);

  const mediaWidthPt = trimWidthPt + bleedLeftPt + bleedRightPt;
  const mediaHeightPt = trimHeightPt + bleedTopPt + bleedBottomPt;

  page.setSize(mediaWidthPt, mediaHeightPt);

  // MediaBox — full imageable area
  page.node.set(PDFName.of('MediaBox'), pdf.context.obj([0, 0, mediaWidthPt, mediaHeightPt]));
  // BleedBox — identical to MediaBox (Broadset's bleed inset lives on `canvas.bleed`)
  page.node.set(PDFName.of('BleedBox'), pdf.context.obj([0, 0, mediaWidthPt, mediaHeightPt]));

  // TrimBox — canvas width/height, shifted inward by bleed so (0,0) of the
  // trim is at the bottom-left of the finished piece in PDF coords.
  // PDF origin is bottom-left; Broadset bleed tuple is [top, right, bottom, left].
  const trimLeft = bleedLeftPt;
  const trimBottom = bleedBottomPt;
  const trimRight = trimLeft + trimWidthPt;
  const trimTop = trimBottom + trimHeightPt;

  page.node.set(PDFName.of('TrimBox'), pdf.context.obj([trimLeft, trimBottom, trimRight, trimTop]));

  // ArtBox — trim shrunk by safeArea on every side (when declared)
  if (canvas.safeArea !== undefined) {
    const [safeTop, safeRight, safeBottom, safeLeft] = canvas.safeArea;
    const safeTopPt = elementToPoints(canvas, safeTop);
    const safeRightPt = elementToPoints(canvas, safeRight);
    const safeBottomPt = elementToPoints(canvas, safeBottom);
    const safeLeftPt = elementToPoints(canvas, safeLeft);

    const artLeft = trimLeft + safeLeftPt;
    const artRight = trimRight - safeRightPt;
    const artBottom = trimBottom + safeBottomPt;
    const artTop = trimTop - safeTopPt;

    page.node.set(PDFName.of('ArtBox'), pdf.context.obj([artLeft, artBottom, artRight, artTop]));
  }

  return { mediaWidthPt, mediaHeightPt };
}
