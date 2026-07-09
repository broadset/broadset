import type { BroadsetElement, Canvas } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import { type PDFPage, rgb } from 'pdf-lib';

import { elementToPoints } from '../geometry';
import { resolveFillAsPdfRgb, resolveOpacity, resolveStyleColor } from './color';
import type { CanvasAbsolutePosition } from './geometry';

/**
 * Render a Broadset `path` element onto a PDF page via pdf-lib's
 * `drawSvgPath`. The element's `content` is the SVG `d` attribute
 * verbatim; pdf-lib parses it and emits native PDF path operators
 * (`m`, `l`, `c`, `h`, `B`, `f`, `re`) so vector paths stay editable
 * in Illustrator and Acrobat.
 */
export function renderPath(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
): void {
  if (!el.content) {
    return;
  }

  const bleed = canvas.bleed ?? [0, 0, 0, 0];
  const bleedLeftPt = elementToPoints(canvas, bleed[3]);
  const bleedBottomPt = elementToPoints(canvas, bleed[2]);

  const xPt = bleedLeftPt + elementToPoints(canvas, absolute.x);
  const yPt = bleedBottomPt + trimHeightPt - elementToPoints(canvas, absolute.y);
  const fillColor = resolveFillAsPdfRgb(el.style) ?? rgb(0, 0, 0);
  const strokeColor = resolveStyleColor(el.style, 'stroke');

  page.drawSvgPath(resolveContentAsPlainString(el.content), {
    x: xPt,
    y: yPt,
    color: fillColor,
    ...(strokeColor !== undefined ? { borderColor: strokeColor } : undefined),
    ...(el.style.strokeWidth !== undefined
      ? { borderWidth: elementToPoints(canvas, el.style.strokeWidth) }
      : undefined),
    opacity: resolveOpacity(el.style),
  });
}
