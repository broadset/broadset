const PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;

export const CSS_LENGTH_UNITS = ['px', 'mm', 'in', '%', 'em', 'rem'] as const;

export type CssUnit = (typeof CSS_LENGTH_UNITS)[number];

export function isCssUnit(unit: string): unit is CssUnit {
  return (CSS_LENGTH_UNITS as readonly string[]).includes(unit);
}

export function toCssUnit(unit: string): CssUnit {
  return isCssUnit(unit) ? unit : 'px';
}

export function convertLength(value: number, fromUnit: CssUnit, toUnit: CssUnit): number {
  if (fromUnit === toUnit) {
    return value;
  }

  let px = value;

  switch (fromUnit) {
    case 'mm':
      px = value * (PX_PER_INCH / MM_PER_INCH);
      break;
    case 'in':
      px = value * PX_PER_INCH;
      break;
    case 'px':
      break;
    default:
      return value;
  }

  switch (toUnit) {
    case 'mm':
      return px * (MM_PER_INCH / PX_PER_INCH);
    case 'in':
      return px / PX_PER_INCH;
    case 'px':
      return px;
    default:
      return value;
  }
}
