import type { Canvas } from '@broadset/model';

/** 1 mm = 72/25.4 PDF points */
const MM_TO_PT = 72 / 25.4;

/** 1 inch = 72 PDF points */
const IN_TO_PT = 72;

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

export function elementToPoints(canvas: Canvas, value: number): number {
  switch (canvas.unit) {
    case 'mm':
      return value * MM_TO_PT;
    case 'in':
      return value * IN_TO_PT;
    case 'px':
      return (value / canvas.dpi) * IN_TO_PT;
  }
}
