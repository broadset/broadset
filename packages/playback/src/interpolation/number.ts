const NUMERIC_STRING_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

export const EPSILON = 1e-6;

export interface CountingFormat {
  readonly decimalPlaces?: number | undefined;
  readonly thousandsSeparator?: string | undefined;
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
}

export function clampUnitInterval(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

export function interpolateNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

export function isNumericString(value: string): boolean {
  return NUMERIC_STRING_RE.test(value.trim());
}

export function formatSimpleNumber(value: number): string {
  const rounded = Math.abs(value) < EPSILON ? 0 : value;
  const fixed = rounded.toFixed(6);

  return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatCountingNumber(value: number, format?: CountingFormat): string {
  const decimalPlaces = Math.max(0, format?.decimalPlaces ?? 0);
  const thousandsSeparator = format?.thousandsSeparator ?? '';
  const prefix = format?.prefix ?? '';
  const suffix = format?.suffix ?? '';
  const fixed = value.toFixed(decimalPlaces);
  const parts = fixed.split('.');
  const integerPart = parts[0] ?? '0';
  const decimalPart = parts[1];
  const sign = integerPart.startsWith('-') ? '-' : '';
  const unsignedInteger = sign === '' ? integerPart : integerPart.slice(1);
  const groupedInteger =
    thousandsSeparator === '' ? unsignedInteger : unsignedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
  const fraction = decimalPart === undefined ? '' : `.${decimalPart}`;

  return `${prefix}${sign}${groupedInteger}${fraction}${suffix}`;
}
