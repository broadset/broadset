import type { ExpressionAst } from './data';
import type { Diagnostic } from './diagnostics';
import {
  commonExpressionValueType as commonValueType,
  createExpressionError as createError,
  isNumericValueType as isNumeric,
  validateSafeFunctionArity as validFunctionArity,
} from './expression-inference-helpers';
import type { TypedValue, ValueType } from './typed-value';

interface StructuralExpressionInferenceResult {
  readonly valueType?: ValueType | undefined;
  readonly literalValue?: TypedValue | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

function literalResult(literalValue: TypedValue): StructuralExpressionInferenceResult {
  return { valueType: literalValue.type, literalValue, diagnostics: [] };
}

function invalidOperand(message: string, diagnostics: readonly Diagnostic[]): StructuralExpressionInferenceResult {
  return { diagnostics: [...diagnostics, createError('expression.invalid-operand', message)] };
}

function inferUnary(
  expression: Extract<ExpressionAst, { readonly kind: 'unary' }>,
): StructuralExpressionInferenceResult {
  const operand = inferExpressionStructuralValueType(expression.operand);

  if (operand.valueType === undefined) {
    if (
      expression.operator === 'not' &&
      operand.diagnostics.length === 0 &&
      !hasDefinitelyNonBooleanResult(expression.operand)
    ) {
      return { valueType: 'boolean', diagnostics: [] };
    }

    return expression.operator === 'not' && operand.diagnostics.length === 0 ?
        invalidOperand('Invalid not operand', operand.diagnostics)
      : operand;
  }

  if (expression.operator === 'not') {
    return operand.valueType === 'boolean' ?
        { valueType: 'boolean', diagnostics: operand.diagnostics }
      : invalidOperand('Invalid not operand', operand.diagnostics);
  }

  return isNumeric(operand.valueType) ? operand : invalidOperand('Invalid negate operand', operand.diagnostics);
}

type BinaryExpression = Extract<ExpressionAst, { readonly kind: 'binary' }>;

function inferLogical(
  left: StructuralExpressionInferenceResult,
  right: StructuralExpressionInferenceResult,
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  const valid = [left.valueType, right.valueType].every(
    (valueType) => valueType === undefined || valueType === 'boolean',
  );

  return valid ?
      { valueType: 'boolean', diagnostics }
    : invalidOperand('Logical operands must be boolean', diagnostics);
}

function inferEquality(
  left: StructuralExpressionInferenceResult,
  right: StructuralExpressionInferenceResult,
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  const compatible =
    left.valueType === undefined ||
    right.valueType === undefined ||
    commonValueType(left.valueType, right.valueType) !== undefined;

  return compatible ?
      { valueType: 'boolean', diagnostics }
    : invalidOperand('Equality operands must be compatible', diagnostics);
}

function inferOrdering(
  left: StructuralExpressionInferenceResult,
  right: StructuralExpressionInferenceResult,
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  const knownTypes = [left.valueType, right.valueType].filter(
    (valueType): valueType is ValueType => valueType !== undefined,
  );
  const knownComparable = knownTypes.every(
    (valueType) => isNumeric(valueType) || valueType === 'string' || valueType === 'date-time',
  );
  const pairCompatible =
    left.valueType === undefined ||
    right.valueType === undefined ||
    (isNumeric(left.valueType) && isNumeric(right.valueType)) ||
    (left.valueType === right.valueType && (left.valueType === 'string' || left.valueType === 'date-time'));

  return knownComparable && pairCompatible ?
      { valueType: 'boolean', diagnostics }
    : invalidOperand('Comparison operands are incompatible', diagnostics);
}

function inferArithmetic(
  operator: BinaryExpression['operator'],
  left: StructuralExpressionInferenceResult,
  right: StructuralExpressionInferenceResult,
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  if (operator === 'add' && left.valueType === 'string' && right.valueType === 'string') {
    return { valueType: 'string', diagnostics };
  }

  const knownTypes = [left.valueType, right.valueType].filter(
    (valueType): valueType is ValueType => valueType !== undefined,
  );
  const knownValid = knownTypes.every(
    (valueType) => isNumeric(valueType) || (operator === 'add' && valueType === 'string'),
  );
  const resolvedPairValid =
    left.valueType === undefined || right.valueType === undefined || knownTypes.every(isNumeric);

  if (!knownValid || !resolvedPairValid) return invalidOperand('Arithmetic operands must be numeric', diagnostics);
  if (left.valueType === undefined || right.valueType === undefined) return { diagnostics };

  return {
    valueType: operator === 'div' || left.valueType === 'number' || right.valueType === 'number' ? 'number' : 'integer',
    diagnostics,
  };
}

function inferBinary(expression: BinaryExpression): StructuralExpressionInferenceResult {
  const left = inferExpressionStructuralValueType(expression.left);
  const right = inferExpressionStructuralValueType(expression.right);
  const diagnostics = [...left.diagnostics, ...right.diagnostics];

  if (expression.operator === 'and' || expression.operator === 'or') {
    if (hasDefinitelyNonBooleanResult(expression.left) || hasDefinitelyNonBooleanResult(expression.right)) {
      return invalidOperand('Logical operands must be boolean', diagnostics);
    }

    return inferLogical(left, right, diagnostics);
  }

  if (expression.operator === 'eq' || expression.operator === 'neq') return inferEquality(left, right, diagnostics);
  if (['lt', 'lte', 'gt', 'gte'].includes(expression.operator)) return inferOrdering(left, right, diagnostics);

  return inferArithmetic(expression.operator, left, right, diagnostics);
}

function inferConditional(
  expression: Extract<ExpressionAst, { readonly kind: 'conditional' }>,
): StructuralExpressionInferenceResult {
  const condition = inferExpressionStructuralValueType(expression.condition);
  const whenTrue = inferExpressionStructuralValueType(expression.whenTrue);
  const whenFalse = inferExpressionStructuralValueType(expression.whenFalse);
  const diagnostics = [...condition.diagnostics, ...whenTrue.diagnostics, ...whenFalse.diagnostics];

  if (condition.valueType !== undefined && condition.valueType !== 'boolean') {
    diagnostics.push(createError('expression.invalid-condition', 'Conditional condition must be boolean'));
  }

  if (condition.valueType === undefined && hasDefinitelyNonBooleanResult(expression.condition)) {
    diagnostics.push(createError('expression.invalid-condition', 'Conditional condition must be boolean'));
  }

  if (whenTrue.valueType === undefined || whenFalse.valueType === undefined) return { diagnostics };

  const valueType = commonValueType(whenTrue.valueType, whenFalse.valueType);

  if (valueType === undefined) {
    diagnostics.push(createError('expression.branch-type-mismatch', 'Conditional branches must agree'));

    return { diagnostics };
  }

  return condition.valueType === undefined || condition.valueType === 'boolean' ?
      { valueType, diagnostics }
    : { diagnostics };
}

function invalidFunctionArgument(diagnostics: readonly Diagnostic[]): StructuralExpressionInferenceResult {
  return {
    diagnostics: [
      ...diagnostics,
      createError('expression.invalid-function-argument', 'Safe function arguments are invalid'),
    ],
  };
}

function inferCoalesce(
  types: readonly (ValueType | undefined)[],
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  const nonNullTypes = types.filter(
    (valueType): valueType is ValueType => valueType !== undefined && valueType !== 'null',
  );
  const first = nonNullTypes[0];

  if (first !== undefined && nonNullTypes.some((valueType) => commonValueType(first, valueType) === undefined)) {
    return invalidFunctionArgument(diagnostics);
  }

  return types.some((valueType) => valueType === undefined) ?
      { diagnostics }
    : { valueType: first ?? 'null', diagnostics };
}

function inferLength(
  knownTypes: readonly ValueType[],
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  return knownTypes.every((valueType) => valueType === 'string' || valueType === 'list') ?
      { valueType: 'integer', diagnostics }
    : invalidFunctionArgument(diagnostics);
}

function inferCaseConversion(
  knownTypes: readonly ValueType[],
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  return knownTypes.every((valueType) => valueType === 'string') ?
      { valueType: 'string', diagnostics }
    : invalidFunctionArgument(diagnostics);
}

function inferRound(
  types: readonly (ValueType | undefined)[],
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  const valid = (types[0] === undefined || isNumeric(types[0])) && (types[1] === undefined || types[1] === 'integer');

  return valid ? { valueType: 'number', diagnostics } : invalidFunctionArgument(diagnostics);
}

function inferNumericFunction(
  types: readonly (ValueType | undefined)[],
  knownTypes: readonly ValueType[],
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  if (!knownTypes.every(isNumeric)) return invalidFunctionArgument(diagnostics);

  return types.some((valueType) => valueType === undefined) ?
      { diagnostics }
    : { valueType: knownTypes.every((valueType) => valueType === 'integer') ? 'integer' : 'number', diagnostics };
}

function inferFormatDate(
  types: readonly (ValueType | undefined)[],
  diagnostics: readonly Diagnostic[],
): StructuralExpressionInferenceResult {
  const valid =
    (types[0] === undefined || types[0] === 'date-time') &&
    types.slice(1).every((valueType) => valueType === undefined || valueType === 'string');

  return valid ? { valueType: 'string', diagnostics } : invalidFunctionArgument(diagnostics);
}

function inferSafeFunction(
  expression: Extract<ExpressionAst, { readonly kind: 'safe-function' }>,
): StructuralExpressionInferenceResult {
  if (!validFunctionArity(expression.functionId, expression.arguments.length)) {
    return {
      diagnostics: [createError('expression.invalid-function-arity', 'Safe function argument count is invalid')],
    };
  }

  const results = expression.arguments.map(inferExpressionStructuralValueType);
  const diagnostics = results.flatMap((result) => result.diagnostics);
  const types = results.map((result) => result.valueType);
  const knownTypes = types.filter((valueType): valueType is ValueType => valueType !== undefined);

  switch (expression.functionId) {
    case 'coalesce':
      return inferCoalesce(types, diagnostics);
    case 'length':
      return inferLength(knownTypes, diagnostics);
    case 'lowercase':
    case 'uppercase':
      return inferCaseConversion(knownTypes, diagnostics);
    case 'round':
      return inferRound(types, diagnostics);
    case 'min':
    case 'max':
    case 'clamp':
      return inferNumericFunction(types, knownTypes, diagnostics);
    case 'format-date':
      return inferFormatDate(types, diagnostics);
  }
}

function inferGet(expression: Extract<ExpressionAst, { readonly kind: 'get' }>): StructuralExpressionInferenceResult {
  const source = inferExpressionStructuralValueType(expression.source);

  if (source.literalValue?.type === 'object') {
    const fieldValue = source.literalValue.fields[expression.fieldId];

    return fieldValue === undefined ?
        {
          diagnostics: [
            ...source.diagnostics,
            createError('expression.object-field-not-found', 'Object field was not found'),
          ],
        }
      : literalResult(fieldValue);
  }

  return source.valueType === undefined || source.valueType === 'object' ?
      { diagnostics: source.diagnostics }
    : {
        diagnostics: [
          ...source.diagnostics,
          createError('expression.invalid-get-source', 'Get source must be an object'),
        ],
      };
}

function inferIndex(
  expression: Extract<ExpressionAst, { readonly kind: 'index' }>,
): StructuralExpressionInferenceResult {
  const source = inferExpressionStructuralValueType(expression.source);
  const index = inferExpressionStructuralValueType(expression.index);
  const diagnostics = [...source.diagnostics, ...index.diagnostics];

  if (source.valueType !== undefined && source.valueType !== 'list') {
    diagnostics.push(createError('expression.invalid-index-source', 'Index source must be a list'));
  }

  if (index.valueType !== undefined && index.valueType !== 'integer') {
    diagnostics.push(createError('expression.invalid-index', 'Array index must be integer'));
  }

  if (diagnostics.length > 0 || source.literalValue?.type !== 'list') return { diagnostics };

  if (index.literalValue?.type === 'integer') {
    const item = source.literalValue.items[index.literalValue.value];

    return item === undefined ?
        { diagnostics: [createError('expression.invalid-index', 'Array index is out of range')] }
      : literalResult(item);
  }

  const firstItem = source.literalValue.items[0];

  if (firstItem === undefined) return { diagnostics };

  let commonType: ValueType | undefined = firstItem.type;

  for (const item of source.literalValue.items.slice(1)) {
    commonType = commonType === undefined ? undefined : commonValueType(commonType, item.type);
  }

  return commonType === undefined ? { diagnostics } : { valueType: commonType, diagnostics };
}

export function inferExpressionStructuralValueType(expression: ExpressionAst): StructuralExpressionInferenceResult {
  switch (expression.kind) {
    case 'literal':
      return literalResult(expression.value);
    case 'field':
    case 'variable':
      return { diagnostics: [] };
    case 'unary':
      return inferUnary(expression);
    case 'binary':
      return inferBinary(expression);
    case 'conditional':
      return inferConditional(expression);
    case 'get':
      return inferGet(expression);
    case 'index':
      return inferIndex(expression);
    case 'safe-function':
      return inferSafeFunction(expression);
  }
}

function hasDefinitelyNonBooleanResult(expression: ExpressionAst): boolean {
  if (expression.kind === 'literal') return expression.value.type !== 'boolean';
  if (expression.kind === 'unary') return expression.operator === 'negate';
  if (expression.kind === 'binary') return ['add', 'sub', 'mul', 'div'].includes(expression.operator);

  if (expression.kind === 'conditional') {
    return [expression.whenTrue, expression.whenFalse].some((branch) => {
      const result = inferExpressionStructuralValueType(branch);

      return (
        (result.valueType !== undefined && result.valueType !== 'boolean') ||
        (result.valueType === undefined && hasDefinitelyNonBooleanResult(branch))
      );
    });
  }

  if (expression.kind === 'safe-function') {
    if (expression.functionId !== 'coalesce') return true;

    return expression.arguments.some((argument) => {
      const result = inferExpressionStructuralValueType(argument);

      return (
        (result.valueType !== undefined && result.valueType !== 'boolean' && result.valueType !== 'null') ||
        (result.valueType === undefined && hasDefinitelyNonBooleanResult(argument))
      );
    });
  }

  return false;
}

export function validateBooleanExpressionStructure(expression: ExpressionAst): StructuralExpressionInferenceResult {
  const result = inferExpressionStructuralValueType(expression);

  if (
    result.diagnostics.length === 0 &&
    ((result.valueType !== undefined && result.valueType !== 'boolean') ||
      (result.valueType === undefined && hasDefinitelyNonBooleanResult(expression)))
  ) {
    return {
      diagnostics: [createError('expression.non-boolean-result', 'Expression cannot produce a boolean result')],
    };
  }

  return result;
}
