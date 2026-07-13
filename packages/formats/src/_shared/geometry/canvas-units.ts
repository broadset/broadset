import type { Canvas } from '@broadset/model';

/** Inches → mm conversion factor. Exact (1 in == 25.4 mm by definition). */
const MM_PER_INCH = 25.4;

/**
 * Convert a length expressed in the canvas's declared unit
 * (`px` / `mm` / `in`) to millimetres. Millimetres are the lossless
 * cross-format pivot — every exporter (PDF, PSD, PPTX, SVG) ultimately
 * lands a coordinate in its own unit (points, pixels, EMU), and most
 * conversions go through mm to keep the math simple and exact at
 * inch / mm boundaries.
 *
 * For `px`, the canvas's declared `dpi` is the source of truth — do
 * not assume 96. Broadset documents intended for print typically
 * declare a DPI > 96 (the canvas spec at `project/spec/model/spec.md`
 * mandates that `canvas.dpi` is always present).
 */
export function canvasUnitToMm(canvas: Canvas, value: number): number {
  switch (canvas.unit) {
    case 'mm':
      return value;
    case 'in':
      return value * MM_PER_INCH;
    case 'px':
      return (value / canvas.dpi) * MM_PER_INCH;
  }
}

/**
 * Convert a millimetre length back to the canvas's declared unit. The
 * inverse of {@link canvasUnitToMm} — round-trips losslessly modulo
 * floating-point precision.
 */
export function mmToCanvasUnit(canvas: Canvas, mm: number): number {
  switch (canvas.unit) {
    case 'mm':
      return mm;
    case 'in':
      return mm / MM_PER_INCH;
    case 'px':
      return (mm / MM_PER_INCH) * canvas.dpi;
  }
}
