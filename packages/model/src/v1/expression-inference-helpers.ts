import type { SafeFunctionId } from './data';
import type { Diagnostic } from './diagnostics';
import type { ValueType } from './typed-value';

export function createExpressionError(code: string, message: string, pointer?: string): Diagnostic {
  return pointer === undefined
    ? { code, severity: 'error', message }
    : { code, severity: 'error', message, pointer };
}

export function isNumericValueType(valueType: ValueType): boolean {
  return valueType === 'integer' || valueType === 'number';
}

export function commonExpressionValueType(left: ValueType, right: ValueType): ValueType | undefined {
  if (left === right) return left;
  if (isNumericValueType(left) && isNumericValueType(right)) return 'number';

  return undefined;
}

export function validateSafeFunctionArity(functionId: SafeFunctionId, count: number): boolean {
  switch (functionId) {
    case 'coalesce':
    case 'min':
    case 'max':
      return count >= 2;
    case 'length':
    case 'lowercase':
    case 'uppercase':
      return count === 1;
    case 'round':
      return count === 1 || count === 2;
    case 'clamp':
      return count === 3;
    case 'format-date':
      return count === 4;
  }
}
