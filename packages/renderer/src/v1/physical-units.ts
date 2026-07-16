const MILLIMETRES_PER_INCH = 25.4;

export interface PhysicalUnitContextV1 {
  readonly unit: 'px' | 'mm' | 'in';
  readonly dpi: number;
}

/** Convert a finite document-space distance to CSS pixels, failing soft for unusable input. */
export function spatialValueToCssPixelsV1(value: number, context: PhysicalUnitContextV1): number {
  if (!Number.isFinite(value) || !Number.isFinite(context.dpi) || context.dpi <= 0) return 0;

  switch (context.unit) {
    case 'px':
      return value;
    case 'mm':
      return (value * context.dpi) / MILLIMETRES_PER_INCH;
    case 'in':
      return value * context.dpi;
  }
}
