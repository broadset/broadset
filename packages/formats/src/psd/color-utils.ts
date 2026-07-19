interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export function isRgbaColor(value: unknown): value is RgbaColor {
  return typeof value === 'object' && value !== null && 'r' in value && 'g' in value && 'b' in value;
}
