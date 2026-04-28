import type { Canvas } from '@broadset/model';
import { mmToPx, pxToMm } from '@broadset/model';

/**
 * OOXML English Metric Units — 914400 EMU per inch, 360000 per centimetre,
 * 36000 per millimetre. All OOXML shape coordinates and dimensions use
 * EMU; conversions are lossless at millimetre boundaries.
 */
export const EMU_PER_INCH = 914400;
export const EMU_PER_CM = 360000;
export const EMU_PER_MM = 36000;

/** OOXML rotation unit: 1/60000 of a degree. */
const ROTATION_UNITS_PER_DEGREE = 60000;

/** Convert a millimetre length to EMU (integer). */
export function mmToEmu(mm: number): number {
  return Math.round(mm * EMU_PER_MM);
}

/** Convert an EMU length to millimetres (double). */
export function emuToMm(emu: number): number {
  return emu / EMU_PER_MM;
}

/**
 * Convert a length expressed in the canvas's declared unit (`px`/`mm`/`in`)
 * to EMU. Canvas declares its unit; all spatial values in Broadset are in
 * that unit, so conversion to EMU goes via mm as the lossless middle.
 */
export function canvasLengthToEmu(canvas: Canvas, value: number): number {
  if (canvas.unit === 'mm') return mmToEmu(value);
  if (canvas.unit === 'in') return mmToEmu(value * 25.4);

  // px → mm via the canvas DPI.
  const mm = pxToMm(value, canvas.dpi);

  return mmToEmu(mm);
}

/**
 * Convert an EMU length to the canvas's declared unit. Inverse of
 * {@link canvasLengthToEmu}; preserves the canvas's `unit` invariant.
 */
export function emuToCanvasLength(canvas: Canvas, emu: number): number {
  const mm = emuToMm(emu);

  if (canvas.unit === 'mm') return mm;
  if (canvas.unit === 'in') return mm / 25.4;

  return mmToPx(mm, canvas.dpi);
}

/** Convert a degree-rotation to OOXML 1/60000-degree integer units. */
export function degreesToRotationUnits(degrees: number): number {
  return Math.round(degrees * ROTATION_UNITS_PER_DEGREE);
}

/** Convert OOXML 1/60000-degree rotation back to degrees. */
export function rotationUnitsToDegrees(units: number): number {
  return units / ROTATION_UNITS_PER_DEGREE;
}

/** OOXML colour channels are emitted as lowercase hex without leading `#`. */
export function hexToOoxmlColor(hex: string): string {
  const stripped = hex.startsWith('#') ? hex.slice(1) : hex;

  // Expand 3-char (#abc) to 6-char (#aabbcc).
  const expanded =
    stripped.length === 3
      ? (stripped[0] ?? '').repeat(2) + (stripped[1] ?? '').repeat(2) + (stripped[2] ?? '').repeat(2)
      : stripped;

  // Keep the first 6 hex chars (drop any alpha channel — OOXML uses <a:alpha> separately).
  return expanded.slice(0, 6).toUpperCase();
}

/** Clamp a 0-1 alpha to the OOXML `<a:alpha val="…"/>` integer scale (0-100000). */
export function alphaToOoxml(alpha: number): number {
  const clamped = Math.max(0, Math.min(1, alpha));

  return Math.round(clamped * 100000);
}
