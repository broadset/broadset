import type { BroadsetElement, Canvas } from '@broadset/model';
import type { PDFPage } from 'pdf-lib';

import { elementToPoints } from '../geometry';
import type { CanvasAbsolutePosition, OperatorBrackets } from './geometry';

/**
 * Resolve an element's top-left position + size in PDF points,
 * accounting for canvas bleed offsets (the trim box sits inside the
 * bleed-extended media box) and the canvas → PDF Y-flip.
 *
 * Element positions in the Broadset model are canvas-local with
 * Y growing downward. PDF Y grows upward. The trim box's bottom-left
 * lives at `(bleedLeftPt, bleedBottomPt)` inside the media box; the
 * element's top-left therefore lives at `bleedBottomPt + trimHeightPt
 * - absolute.y - elementHeight` in PDF coords.
 */
export function elementTopLeftPt(
  absolute: CanvasAbsolutePosition,
  el: BroadsetElement,
  canvas: Canvas,
  trimHeightPt: number,
): { readonly xPt: number; readonly yPt: number; readonly wPt: number; readonly hPt: number } {
  const bleed = canvas.bleed ?? [0, 0, 0, 0];
  const bleedLeftPt = elementToPoints(canvas, bleed[3]);
  const bleedBottomPt = elementToPoints(canvas, bleed[2]);

  const wPt = elementToPoints(canvas, el.width);
  const hPt = elementToPoints(canvas, el.height);

  const xPt = bleedLeftPt + elementToPoints(canvas, absolute.x);
  const yPt = bleedBottomPt + trimHeightPt - elementToPoints(canvas, absolute.y) - hPt;

  return { xPt, yPt, wPt, hPt };
}

/**
 * Apply a bracket sequence's `start` or `end` operators to a page via
 * `pushOperators`. No-ops when the brackets are empty so callers don't
 * bloat the content stream with trivial graphics-state pushes.
 */
export function applyBrackets(page: PDFPage, brackets: OperatorBrackets, phase: 'start' | 'end'): void {
  const ops = phase === 'start' ? brackets.start : brackets.end;

  if (ops.length === 0) return;

  page.pushOperators(...ops);
}
