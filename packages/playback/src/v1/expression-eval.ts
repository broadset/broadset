import type { projectFormatV1 } from '@broadset/model';

import { formatDateTimePatternV1 } from './date-time-pattern';
import {
  clampNumericValues,
  evaluateNumericArithmetic,
  evaluateNumericComparison,
  findNumericExtreme,
  isFiniteNumericValue,
  negateNumericValue,
  typedValuesEqual,
} from './typed-value-ops';

type ExpressionAst = projectFormatV1.ExpressionAst;
type TypedValue = projectFormatV1.TypedValue;
type Id = projectFormatV1.Id;
type BinaryExpression = Extract<ExpressionAst, { readonly kind: 'binary' }>;
type SafeFunctionExpression = Extract<ExpressionAst, { readonly kind: 'safe-function' }>;

export interface ExpressionContextV1 {
  readonly resolveField: (viewModelId: Id, fieldId: Id) => TypedValue | undefined;
  readonly resolveVariable: (collectionId: Id, variableId: Id) => TypedValue | undefined;
}

function evaluateBooleanBinary(
  operator: 'and' | 'or',
  left: TypedValue | undefined,
  right: TypedValue | undefined,
): TypedValue | undefined {
  if (left?.type !== 'boolean' || right?.type !== 'boolean') return undefined;

  return { type: 'boolean', value: operator === 'and' ? left.value && right.value : left.value || right.value };
}

function evaluateEqualityBinary(
  operator: 'eq' | 'neq',
  left: TypedValue | undefined,
  right: TypedValue | undefined,
): TypedValue | undefined {
  if (left === undefined || right === undefined) return undefined;

  const equal = typedValuesEqual(left, right);

  return { type: 'boolean', value: operator === 'eq' ? equal : !equal };
}

function evaluateComparisonBinary(
  operator: 'lt' | 'lte' | 'gt' | 'gte',
  left: TypedValue | undefined,
  right: TypedValue | undefined,
): TypedValue | undefined {
  if (left?.type === 'string' && right?.type === 'string') {
    let comparison = 0;

    if (left.value < right.value) comparison = -1;
    else if (left.value > right.value) comparison = 1;

    const matches = compareOrdered(operator, comparison);

    return { type: 'boolean', value: matches };
  }

  if (left?.type === 'date-time' && right?.type === 'date-time') {
    const comparison = Date.parse(left.value) - Date.parse(right.value);
    const matches = compareOrdered(operator, comparison);

    return { type: 'boolean', value: matches };
  }

  const comparison = evaluateNumericComparison(operator, left, right);

  return comparison === undefined ? undefined : { type: 'boolean', value: comparison };
}

function compareOrdered(operator: 'lt' | 'lte' | 'gt' | 'gte', comparison: number): boolean {
  if (operator === 'lt') return comparison < 0;
  if (operator === 'lte') return comparison <= 0;
  if (operator === 'gt') return comparison > 0;

  return comparison >= 0;
}

function evaluateBinary(
  expression: BinaryExpression,
  context: ExpressionContextV1,
): TypedValue | undefined {
  const left = evaluateExpressionInternal(expression.left, context);
  const right = evaluateExpressionInternal(expression.right, context);

  switch (expression.operator) {
    case 'and':
    case 'or':
      return evaluateBooleanBinary(expression.operator, left, right);
    case 'eq':
    case 'neq':
      return evaluateEqualityBinary(expression.operator, left, right);
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
      return evaluateComparisonBinary(expression.operator, left, right);
    case 'add':
      if (left?.type === 'string' && right?.type === 'string') return { type: 'string', value: left.value + right.value };

      return evaluateNumericArithmetic(expression.operator, left, right);
    case 'sub':
    case 'mul':
    case 'div':
      return evaluateNumericArithmetic(expression.operator, left, right);
  }
}

function evaluateUnary(
  expression: Extract<ExpressionAst, { readonly kind: 'unary' }>,
  context: ExpressionContextV1,
): TypedValue | undefined {
  const operand = evaluateExpressionInternal(expression.operand, context);

  if (expression.operator === 'negate') return negateNumericValue(operand);
  if (operand?.type !== 'boolean') return undefined;

  return { type: 'boolean', value: !operand.value };
}

function evaluateConditional(
  expression: Extract<ExpressionAst, { readonly kind: 'conditional' }>,
  context: ExpressionContextV1,
): TypedValue | undefined {
  const condition = evaluateExpressionInternal(expression.condition, context);

  if (condition?.type !== 'boolean') return undefined;

  return evaluateExpressionInternal(condition.value ? expression.whenTrue : expression.whenFalse, context);
}

function evaluateGet(
  expression: Extract<ExpressionAst, { readonly kind: 'get' }>,
  context: ExpressionContextV1,
): TypedValue | undefined {
  const source = evaluateExpressionInternal(expression.source, context);

  return source?.type === 'object' ? source.fields[expression.fieldId] : undefined;
}

function evaluateIndex(
  expression: Extract<ExpressionAst, { readonly kind: 'index' }>,
  context: ExpressionContextV1,
): TypedValue | undefined {
  const source = evaluateExpressionInternal(expression.source, context);
  const index = evaluateExpressionInternal(expression.index, context);

  if (source?.type !== 'list' || index?.type !== 'integer' || !Number.isInteger(index.value)) return undefined;
  if (index.value < 0 || index.value >= source.items.length) return undefined;

  return source.items[index.value];
}

function hasSingleArgument(values: readonly (TypedValue | undefined)[]): boolean {
  return values.length === 1;
}

function evaluateLength(values: readonly (TypedValue | undefined)[]): TypedValue | undefined {
  const value = values[0];

  if (!hasSingleArgument(values)) return undefined;
  if (value?.type === 'string') return { type: 'integer', value: value.value.length };
  if (value?.type === 'list') return { type: 'integer', value: value.items.length };

  return undefined;
}

function evaluateStringCase(
  values: readonly (TypedValue | undefined)[],
  mode: 'lowercase' | 'uppercase',
): TypedValue | undefined {
  const value = values[0];

  if (!hasSingleArgument(values) || value?.type !== 'string') return undefined;

  return { type: 'string', value: mode === 'lowercase' ? value.value.toLowerCase() : value.value.toUpperCase() };
}

function evaluateRound(values: readonly (TypedValue | undefined)[]): TypedValue | undefined {
  const value = values[0];
  const precision = values[1];

  if ((values.length !== 1 && values.length !== 2) || !isFiniteNumericValue(value)) return undefined;
  if (precision !== undefined && (precision.type !== 'integer' || !Number.isSafeInteger(precision.value))) return undefined;

  const digits = precision?.value ?? 0;

  if (digits < -100 || digits > 100) return undefined;

  const factor = 10 ** digits;
  const rounded = Math.round((value.value + Number.EPSILON) * factor) / factor;

  return Number.isFinite(rounded) ? { type: 'number', value: rounded } : undefined;
}

function evaluateFormatDate(values: readonly (TypedValue | undefined)[]): TypedValue | undefined {
  const value = values[0];
  const pattern = values[1];
  const locale = values[2];
  const timeZone = values[3];

  if (values.length !== 4 || value?.type !== 'date-time' || pattern?.type !== 'string' || locale?.type !== 'string' || timeZone?.type !== 'string') return undefined;

  const timestamp = Date.parse(value.value);

  if (Number.isNaN(timestamp)) return undefined;

  const formatted = formatDateTimePatternV1(new Date(timestamp), pattern.value, { locale: locale.value, timeZone: timeZone.value });

  return formatted === undefined ? undefined : { type: 'string', value: formatted };
}

function evaluateCoalesce(values: readonly (TypedValue | undefined)[]): TypedValue | undefined {
  const resolved = values.find((value) => value !== undefined && value.type !== 'null');

  if (resolved !== undefined) return resolved;

  return values.some((value) => value?.type === 'null') ? { type: 'null', value: null } : undefined;
}

function evaluateSafeFunction(
  expression: SafeFunctionExpression,
  context: ExpressionContextV1,
): TypedValue | undefined {
  const validArity = hasValidSafeFunctionArity(expression);

  if (!validArity) return undefined;

  const values = expression.arguments.map((argument) => evaluateExpressionInternal(argument, context));

  switch (expression.functionId) {
    case 'coalesce':
      return evaluateCoalesce(values);
    case 'length':
      return evaluateLength(values);
    case 'lowercase':
    case 'uppercase':
      return evaluateStringCase(values, expression.functionId);
    case 'round':
      return evaluateRound(values);
    case 'min':
    case 'max':
      return findNumericExtreme(values, expression.functionId);
    case 'clamp':
      return clampNumericValues(values);
    case 'format-date':
      return evaluateFormatDate(values);
  }
}

function hasValidSafeFunctionArity(expression: SafeFunctionExpression): boolean {
  const count = expression.arguments.length;

  switch (expression.functionId) {
    case 'coalesce':
    case 'min':
    case 'max':
      return count >= 2;
    case 'round':
      return count === 1 || count === 2;
    case 'clamp':
      return count === 3;
    case 'format-date':
      return count === 4;
    default:
      return count === 1;
  }
}

function evaluateExpressionInternal(
  expression: ExpressionAst,
  context: ExpressionContextV1,
): TypedValue | undefined {
  switch (expression.kind) {
    case 'literal':
      return expression.value;
    case 'field':
      return context.resolveField(expression.viewModelId, expression.fieldId);
    case 'variable':
      return context.resolveVariable(expression.collectionId, expression.variableId);
    case 'unary':
      return evaluateUnary(expression, context);
    case 'binary':
      return evaluateBinary(expression, context);
    case 'conditional':
      return evaluateConditional(expression, context);
    case 'get':
      return evaluateGet(expression, context);
    case 'index':
      return evaluateIndex(expression, context);
    case 'safe-function':
      return evaluateSafeFunction(expression, context);
  }
}

export function evaluateExpressionV1(
  expression: ExpressionAst,
  context: ExpressionContextV1,
): TypedValue | undefined {
  try {
    return evaluateExpressionInternal(expression, context);
  } catch {
    return undefined;
  }
}
