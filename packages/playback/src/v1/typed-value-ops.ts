import type { projectFormatV1 } from '@broadset/model';

type TypedValue = projectFormatV1.TypedValue;
type NumericTypedValue = Extract<TypedValue, { readonly type: 'number' | 'integer' | 'length' | 'angle' }>;
type NumericOperator = 'add' | 'sub' | 'mul' | 'div';
type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte';

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function colorValuesEqual(
  left: Extract<TypedValue, { readonly type: 'color' }>['value'],
  right: Extract<TypedValue, { readonly type: 'color' }>['value'],
): boolean {
  if (left.kind !== right.kind) return false;

  if (left.kind === 'color') {
    return (
      right.kind === 'color' &&
      left.space === right.space &&
      left.alpha === right.alpha &&
      arraysEqual(left.channels, right.channels)
    );
  }

  if (right.kind !== 'swatch' || left.swatchId !== right.swatchId) return false;

  const leftAdjustments = left.adjustments ?? [];
  const rightAdjustments = right.adjustments ?? [];

  return (
    leftAdjustments.length === rightAdjustments.length &&
    leftAdjustments.every((adjustment, index) => {
      const rightAdjustment = rightAdjustments[index];

      return (
        adjustment.kind === rightAdjustment?.kind &&
        adjustment.amount === rightAdjustment.amount
      );
    })
  );
}

function objectValuesEqual(
  left: Extract<TypedValue, { readonly type: 'object' }>['fields'],
  right: Extract<TypedValue, { readonly type: 'object' }>['fields'],
): boolean {
  const leftEntries = Object.entries(left).sort(([leftId], [rightId]) => leftId.localeCompare(rightId));
  const rightEntries = Object.entries(right).sort(([leftId], [rightId]) => leftId.localeCompare(rightId));

  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([fieldId, value], index) => {
      const rightEntry = rightEntries[index];

      return fieldId === rightEntry?.[0] && typedValuesEqual(value, rightEntry[1]);
    })
  );
}

export function typedValuesEqual(left: TypedValue, right: TypedValue): boolean {
  if (left.type !== right.type) return false;

  switch (left.type) {
    case 'null':
      return right.type === 'null';
    case 'boolean':
    case 'integer':
    case 'number':
    case 'string':
    case 'date-time':
    case 'length':
    case 'angle':
      return right.type === left.type && left.value === right.value;
    case 'asset':
      return right.type === 'asset' && left.assetId === right.assetId;
    case 'point2d':
    case 'point3d':
      return right.type === left.type && arraysEqual(left.value, right.value);
    case 'color':
      return right.type === 'color' && colorValuesEqual(left.value, right.value);
    case 'list':
      return (
        right.type === 'list' &&
        left.items.length === right.items.length &&
        left.items.every((item, index) => {
          const rightItem = right.items[index];

          return rightItem !== undefined && typedValuesEqual(item, rightItem);
        })
      );
    case 'object':
      return right.type === 'object' && objectValuesEqual(left.fields, right.fields);
  }
}

export function isFiniteNumericValue(value: TypedValue | undefined): value is NumericTypedValue {
  return (
    value !== undefined &&
    (value.type === 'number' || value.type === 'integer' || value.type === 'length' || value.type === 'angle') &&
    Number.isFinite(value.value) &&
    (value.type !== 'integer' || Number.isInteger(value.value))
  );
}

function createNumericResult(source: NumericTypedValue, value: number): TypedValue | undefined {
  if (!Number.isFinite(value)) return undefined;

  return { type: source.type, value };
}

function calculateArithmetic(operator: NumericOperator, left: number, right: number): number | undefined {
  switch (operator) {
    case 'add':
      return left + right;
    case 'sub':
      return left - right;
    case 'mul':
      return left * right;
    case 'div':
      return right === 0 ? undefined : left / right;
  }
}

export function evaluateNumericArithmetic(
  operator: NumericOperator,
  left: TypedValue | undefined,
  right: TypedValue | undefined,
): TypedValue | undefined {
  if (!isFiniteNumericValue(left) || !isFiniteNumericValue(right) || left.type !== right.type) return undefined;

  const calculated = calculateArithmetic(operator, left.value, right.value);

  if (calculated === undefined) return undefined;

  return createNumericResult(left, left.type === 'integer' && operator === 'div' ? Math.trunc(calculated) : calculated);
}

export function negateNumericValue(value: TypedValue | undefined): TypedValue | undefined {
  return isFiniteNumericValue(value) ? createNumericResult(value, -value.value) : undefined;
}

export function evaluateNumericComparison(
  operator: ComparisonOperator,
  left: TypedValue | undefined,
  right: TypedValue | undefined,
): boolean | undefined {
  if (!isFiniteNumericValue(left) || !isFiniteNumericValue(right) || left.type !== right.type) return undefined;

  switch (operator) {
    case 'lt':
      return left.value < right.value;
    case 'lte':
      return left.value <= right.value;
    case 'gt':
      return left.value > right.value;
    case 'gte':
      return left.value >= right.value;
  }
}

export function findNumericExtreme(
  values: readonly (TypedValue | undefined)[],
  mode: 'min' | 'max',
): TypedValue | undefined {
  const first = values[0];

  if (!isFiniteNumericValue(first)) return undefined;

  const numericValues: number[] = [];

  for (const value of values) {
    if (!isFiniteNumericValue(value) || value.type !== first.type) return undefined;

    numericValues.push(value.value);
  }

  const result = mode === 'min' ? Math.min(...numericValues) : Math.max(...numericValues);

  return createNumericResult(first, result);
}

export function clampNumericValues(values: readonly (TypedValue | undefined)[]): TypedValue | undefined {
  const value = values[0];
  const lowerBound = values[1];
  const upperBound = values[2];

  if (
    values.length !== 3 ||
    !isFiniteNumericValue(value) ||
    !isFiniteNumericValue(lowerBound) ||
    !isFiniteNumericValue(upperBound) ||
    value.type !== lowerBound.type ||
    value.type !== upperBound.type
  ) {
    return undefined;
  }

  return createNumericResult(value, Math.min(Math.max(value.value, lowerBound.value), upperBound.value));
}
