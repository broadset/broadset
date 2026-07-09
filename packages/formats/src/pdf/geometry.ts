import type { Canvas } from '@broadset/model';

import { canvasUnitToMm } from '../_shared/geometry';

/** 1 mm = 72/25.4 PDF points (PDF user-space points are 72 per inch by spec). */
const MM_TO_PT = 72 / 25.4;

export function canvasToPoints(canvas: Canvas): { readonly widthPt: number; readonly heightPt: number } {
  return {
    widthPt: canvasUnitToMm(canvas, canvas.width) * MM_TO_PT,
    heightPt: canvasUnitToMm(canvas, canvas.height) * MM_TO_PT,
  };
}

export function elementToPoints(canvas: Canvas, value: number): number {
  return canvasUnitToMm(canvas, value) * MM_TO_PT;
}
