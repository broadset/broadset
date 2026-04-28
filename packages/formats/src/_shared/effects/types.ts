/**
 * Shared types for parsed CSS shadow / glow descriptors. Each format
 * exporter consumes these via `_shared/effects` and maps them onto
 * its own primitive (PSD layer effect, PDF `/ExtGState`, SVG
 * `<feDropShadow>`).
 */

export interface ParsedRgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface ParsedShadow {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly blur: number;
  readonly spread: number;
  readonly color: ParsedRgbaColor;
  readonly inset: boolean;
}

export interface ParsedGlow {
  readonly blur: number;
  readonly color: ParsedRgbaColor;
}
