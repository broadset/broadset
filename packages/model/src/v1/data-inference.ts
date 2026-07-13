import type {
  Binding,
  ExpressionAst,
  ExpressionInferenceContext,
  FormatterPipeline,
  SafeFunctionId,
  ValueSchema,
} from './data';
import type { Diagnostic } from './diagnostics';
import {
  commonExpressionValueType as commonValueType,
  createExpressionError as createError,
  isNumericValueType as isNumeric,
  validateSafeFunctionArity as validateFunctionArity,
} from './expression-inference-helpers';
import type { EntityAddress, PropertyTarget } from './identity';
import type { TypedValue, ValueType } from './typed-value';

interface ExpressionInferenceOptions {
  readonly expression: ExpressionAst;
  readonly context: ExpressionInferenceContext;
}

interface FormatterInferenceOptions {
  readonly inputType: ValueType;
  readonly pipeline: FormatterPipeline;
}

interface BindingInferenceOptions {
  readonly binding: Binding;
  readonly context: ExpressionInferenceContext;
}

interface ValueTypeInferenceResult {
  readonly valueType?: ValueType | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

interface StructuralType {
  readonly valueType: ValueType;
  readonly schema?: ValueSchema | undefined;
}

interface StructuralInferenceResult {
  readonly structuralType?: StructuralType | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

function localizeStructuralResult(result: StructuralInferenceResult, pointer = ''): StructuralInferenceResult {
  return {
    ...result,
    diagnostics: result.diagnostics.map((diagnostic) =>
      diagnostic.pointer === undefined ? { ...diagnostic, pointer } : diagnostic,
    ),
  };
}

function prefixStructuralResult(result: StructuralInferenceResult, prefix: string): StructuralInferenceResult {
  return {
    ...result,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      pointer: `${prefix}${diagnostic.pointer ?? ''}`,
    })),
  };
}

function prefixDiagnostics(diagnostics: readonly Diagnostic[], prefix: string): readonly Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    pointer: `${prefix}${diagnostic.pointer ?? ''}`,
  }));
}

export function valueSchemaValueType(schema: ValueSchema): ValueType {
  switch (schema.kind) {
    case 'enum':
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'integer':
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'date-time':
      return 'date-time';
    case 'color':
      return 'color';
    case 'asset':
      return 'asset';
    case 'object':
      return 'object';
    case 'array':
      return 'list';
  }
}

function typedValueType(value: TypedValue): StructuralType {
  return { valueType: value.type };
}

function sameIdPath(left: readonly string[] | undefined, right: readonly string[] | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sameEntityAddress(left: EntityAddress, right: EntityAddress): boolean {
  return (
    left.projectId === right.projectId &&
    left.documentId === right.documentId &&
    left.pageId === right.pageId &&
    left.entityKind === right.entityKind &&
    left.entityId === right.entityId &&
    sameIdPath(left.instancePath, right.instancePath)
  );
}

function samePropertyTarget(left: PropertyTarget, right: PropertyTarget): boolean {
  return left.pointer === right.pointer && sameEntityAddress(left.entity, right.entity);
}

function findDuplicateContextDiagnostics(context: ExpressionInferenceContext): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const fieldKeys = new Set<string>();

  for (const field of context.fields) {
    const key = `${field.viewModelId}\u0000${field.fieldId}`;

    if (fieldKeys.has(key)) {
      diagnostics.push(createError('expression.duplicate-context-address', 'Duplicate field context address'));
    }

    fieldKeys.add(key);
  }

  const variableKeys = new Set<string>();

  for (const variable of context.variables) {
    const key = `${variable.collectionId}\u0000${variable.variableId}`;

    if (variableKeys.has(key)) {
      diagnostics.push(createError('expression.duplicate-context-address', 'Duplicate variable context address'));
    }

    variableKeys.add(key);
  }

  context.targets.forEach((target, index) => {
    if (context.targets.slice(0, index).some((candidate) => samePropertyTarget(candidate.target, target.target))) {
      diagnostics.push(createError('expression.duplicate-context-address', 'Duplicate target context address'));
    }
  });

  return diagnostics;
}

function inferUnary(expression: Extract<ExpressionAst, { readonly kind: 'unary' }>, context: ExpressionInferenceContext): StructuralInferenceResult {
  const operand = prefixStructuralResult(inferStructuralType(expression.operand, context), '/operand');

  if (operand.structuralType === undefined) {
    return operand;
  }

  const inputType = operand.structuralType.valueType;
  const valid = expression.operator === 'not' ? inputType === 'boolean' : isNumeric(inputType);

  if (!valid) {
    return {
      diagnostics: [...operand.diagnostics, createError('expression.invalid-operand', `Invalid ${expression.operator} operand`)],
    };
  }

  return {
    structuralType: { valueType: expression.operator === 'not' ? 'boolean' : inputType },
    diagnostics: operand.diagnostics,
  };
}

function inferBinary(expression: Extract<ExpressionAst, { readonly kind: 'binary' }>, context: ExpressionInferenceContext): StructuralInferenceResult {
  const left = prefixStructuralResult(inferStructuralType(expression.left, context), '/left');
  const right = prefixStructuralResult(inferStructuralType(expression.right, context), '/right');
  const diagnostics = [...left.diagnostics, ...right.diagnostics];

  if (left.structuralType === undefined || right.structuralType === undefined) {
    return { diagnostics };
  }

  const leftType = left.structuralType.valueType;
  const rightType = right.structuralType.valueType;

  const booleanResult = inferBinaryBooleanResult(expression.operator, leftType, rightType, diagnostics);

  if (booleanResult !== undefined) {
    return booleanResult;
  }

  if (expression.operator === 'add' && leftType === 'string' && rightType === 'string') {
    return { structuralType: { valueType: 'string' }, diagnostics };
  }

  if (!isNumeric(leftType) || !isNumeric(rightType)) {
    return { diagnostics: [...diagnostics, createError('expression.invalid-operand', 'Arithmetic operands must be numeric')] };
  }

  const valueType = expression.operator === 'div' || leftType === 'number' || rightType === 'number' ? 'number' : 'integer';

  return { structuralType: { valueType }, diagnostics };
}

function inferBinaryBooleanResult(
  operator: Extract<ExpressionAst, { readonly kind: 'binary' }>['operator'],
  leftType: ValueType,
  rightType: ValueType,
  diagnostics: readonly Diagnostic[],
): StructuralInferenceResult | undefined {
  if (operator === 'and' || operator === 'or') {
    return leftType === 'boolean' && rightType === 'boolean'
      ? { structuralType: { valueType: 'boolean' }, diagnostics }
      : { diagnostics: [...diagnostics, createError('expression.invalid-operand', 'Logical operands must be boolean')] };
  }

  if (operator === 'eq' || operator === 'neq') {
    return commonValueType(leftType, rightType) !== undefined
      ? { structuralType: { valueType: 'boolean' }, diagnostics }
      : { diagnostics: [...diagnostics, createError('expression.invalid-operand', 'Equality operands must be compatible')] };
  }

  if (!['lt', 'lte', 'gt', 'gte'].includes(operator)) {
    return undefined;
  }

  const comparable =
    (isNumeric(leftType) && isNumeric(rightType)) ||
    (leftType === rightType && (leftType === 'string' || leftType === 'date-time'));

  return comparable
    ? { structuralType: { valueType: 'boolean' }, diagnostics }
    : { diagnostics: [...diagnostics, createError('expression.invalid-operand', 'Comparison operands are incompatible')] };
}

function inferConditional(
  expression: Extract<ExpressionAst, { readonly kind: 'conditional' }>,
  context: ExpressionInferenceContext,
): StructuralInferenceResult {
  const condition = prefixStructuralResult(inferStructuralType(expression.condition, context), '/condition');
  const whenTrue = prefixStructuralResult(inferStructuralType(expression.whenTrue, context), '/whenTrue');
  const whenFalse = prefixStructuralResult(inferStructuralType(expression.whenFalse, context), '/whenFalse');
  const diagnostics = [...condition.diagnostics, ...whenTrue.diagnostics, ...whenFalse.diagnostics];

  if (condition.structuralType !== undefined && condition.structuralType.valueType !== 'boolean') {
    diagnostics.push(createError('expression.invalid-condition', 'Conditional condition must be boolean'));
  }

  if (whenTrue.structuralType === undefined || whenFalse.structuralType === undefined) {
    return { diagnostics };
  }

  const valueType = commonValueType(whenTrue.structuralType.valueType, whenFalse.structuralType.valueType);

  if (valueType === undefined) {
    diagnostics.push(createError('expression.branch-type-mismatch', 'Conditional branches must agree'));

    return { diagnostics };
  }

  if (condition.structuralType?.valueType !== 'boolean') {
    return { diagnostics };
  }

  return { structuralType: { valueType }, diagnostics };
}

function inferSafeFunction(
  expression: Extract<ExpressionAst, { readonly kind: 'safe-function' }>,
  context: ExpressionInferenceContext,
): StructuralInferenceResult {
  if (!validateFunctionArity(expression.functionId, expression.arguments.length)) {
    return { diagnostics: [createError('expression.invalid-function-arity', 'Safe function argument count is invalid')] };
  }

  const argumentsResults = expression.arguments.map((argument, index) =>
    prefixStructuralResult(inferStructuralType(argument, context), `/arguments/${String(index)}`),
  );
  const diagnostics = argumentsResults.flatMap((result) => result.diagnostics);
  const argumentTypes = argumentsResults.map((result) => result.structuralType?.valueType);

  if (argumentTypes.some((valueType) => valueType === undefined)) {
    return { diagnostics };
  }

  const types = argumentTypes.filter((valueType) => valueType !== undefined);

  return localizeStructuralResult(inferRegisteredFunction(expression.functionId, types, diagnostics));
}

function inferRegisteredFunction(
  functionId: SafeFunctionId,
  types: readonly ValueType[],
  diagnostics: readonly Diagnostic[],
): StructuralInferenceResult {
  switch (functionId) {
    case 'coalesce':
      return inferCoalesce(types, diagnostics);
    case 'length':
      return types[0] === 'string' || types[0] === 'list'
        ? { structuralType: { valueType: 'integer' }, diagnostics }
        : { diagnostics: [...diagnostics, createError('expression.invalid-function-argument', 'Length requires string or list')] };
    case 'lowercase':
    case 'uppercase':
      return types[0] === 'string'
        ? { structuralType: { valueType: 'string' }, diagnostics }
        : { diagnostics: [...diagnostics, createError('expression.invalid-function-argument', 'Case conversion requires string')] };
    case 'format-date':
      return types[0] === 'date-time' && types.slice(1).every((valueType) => valueType === 'string')
        ? { structuralType: { valueType: 'string' }, diagnostics }
        : { diagnostics: [...diagnostics, createError('expression.invalid-function-argument', 'Date formatting arguments are invalid')] };
    case 'round':
      return inferRound(types, diagnostics);
    case 'min':
    case 'max':
    case 'clamp':
      return inferNumericFunction(types, diagnostics);
  }
}

function inferCoalesce(types: readonly ValueType[], diagnostics: readonly Diagnostic[]): StructuralInferenceResult {
  const nonNullTypes = types.filter((valueType) => valueType !== 'null');
  const first = nonNullTypes[0];

  if (first === undefined) {
    return { structuralType: { valueType: 'null' }, diagnostics };
  }

  return nonNullTypes.every((valueType) => valueType === first)
    ? { structuralType: { valueType: first }, diagnostics }
    : { diagnostics: [...diagnostics, createError('expression.invalid-function-argument', 'Coalesce types must agree')] };
}

function inferRound(types: readonly ValueType[], diagnostics: readonly Diagnostic[]): StructuralInferenceResult {
  const valid = isNumeric(types[0] ?? 'null') && (types[1] === undefined || types[1] === 'integer');

  return valid
    ? { structuralType: { valueType: 'number' }, diagnostics }
    : { diagnostics: [...diagnostics, createError('expression.invalid-function-argument', 'Round arguments are invalid')] };
}

function inferNumericFunction(types: readonly ValueType[], diagnostics: readonly Diagnostic[]): StructuralInferenceResult {
  return types.every(isNumeric)
    ? { structuralType: { valueType: types.every((valueType) => valueType === 'integer') ? 'integer' : 'number' }, diagnostics }
    : { diagnostics: [...diagnostics, createError('expression.invalid-function-argument', 'Numeric function arguments are invalid')] };
}

function inferStructuralType(expression: ExpressionAst, context: ExpressionInferenceContext): StructuralInferenceResult {
  switch (expression.kind) {
    case 'literal':
      return { structuralType: typedValueType(expression.value), diagnostics: [] };

    case 'field': {
      const field = context.fields.find(
        (candidate) => candidate.viewModelId === expression.viewModelId && candidate.fieldId === expression.fieldId,
      );

      return field === undefined
        ? { diagnostics: [createError('expression.field-not-found', 'Expression field was not found', '/fieldId')] }
        : { structuralType: { valueType: valueSchemaValueType(field.schema), schema: field.schema }, diagnostics: [] };
    }

    case 'variable': {
      const variable = context.variables.find(
        (candidate) => candidate.collectionId === expression.collectionId && candidate.variableId === expression.variableId,
      );

      return variable === undefined
        ? { diagnostics: [createError('expression.variable-not-found', 'Expression variable was not found', '/variableId')] }
        : { structuralType: { valueType: variable.valueType }, diagnostics: [] };
    }

    case 'unary':
      return localizeStructuralResult(inferUnary(expression, context));
    case 'binary':
      return localizeStructuralResult(inferBinary(expression, context));
    case 'conditional':
      return localizeStructuralResult(inferConditional(expression, context));

    case 'get':
      return localizeStructuralResult(inferGet(expression, context));

    case 'index':
      return localizeStructuralResult(inferIndex(expression, context));

    case 'safe-function':
      return localizeStructuralResult(inferSafeFunction(expression, context));
  }
}

function inferGet(expression: Extract<ExpressionAst, { readonly kind: 'get' }>, context: ExpressionInferenceContext): StructuralInferenceResult {
  const source = prefixStructuralResult(inferStructuralType(expression.source, context), '/source');

  if (expression.source.kind === 'literal' && expression.source.value.type === 'object') {
    const value = expression.source.value.fields[expression.fieldId];

    return value === undefined
      ? { diagnostics: [...source.diagnostics, createError('expression.object-field-not-found', 'Object field was not found', '/fieldId')] }
      : { structuralType: typedValueType(value), diagnostics: source.diagnostics };
  }

  if (source.structuralType?.schema?.kind !== 'object') {
    return { diagnostics: [...source.diagnostics, createError('expression.invalid-get-source', 'Get source must have an object schema')] };
  }

  const field = source.structuralType.schema.fields.find((candidate) => candidate.id === expression.fieldId);

  return field === undefined
    ? { diagnostics: [...source.diagnostics, createError('expression.object-field-not-found', 'Object field was not found', '/fieldId')] }
    : { structuralType: { valueType: valueSchemaValueType(field.schema), schema: field.schema }, diagnostics: source.diagnostics };
}

function inferLiteralListIndex(
  expression: Extract<ExpressionAst, { readonly kind: 'index' }>,
  index: StructuralInferenceResult,
  diagnostics: readonly Diagnostic[],
): StructuralInferenceResult | undefined {
  if (
    expression.source.kind !== 'literal' ||
    expression.source.value.type !== 'list' ||
    index.structuralType?.valueType !== 'integer'
  ) {
    return undefined;
  }

  const items = expression.source.value.items;

  if (expression.index.kind === 'literal' && expression.index.value.type === 'integer') {
    const exactValue = items[expression.index.value.value];

    return exactValue === undefined
      ? { diagnostics: [...diagnostics, createError('expression.invalid-index', 'Array literal index is out of bounds')] }
      : { structuralType: typedValueType(exactValue), diagnostics };
  }

  const firstType = items[0]?.type;
  const valueType = firstType !== undefined && items.every((item) => item.type === firstType) ? firstType : undefined;

  return valueType === undefined
    ? { diagnostics: [...diagnostics, createError('expression.invalid-index-source', 'Array literal items must have a common type')] }
    : { structuralType: { valueType }, diagnostics };
}

function inferIndex(expression: Extract<ExpressionAst, { readonly kind: 'index' }>, context: ExpressionInferenceContext): StructuralInferenceResult {
  const source = prefixStructuralResult(inferStructuralType(expression.source, context), '/source');
  const index = prefixStructuralResult(inferStructuralType(expression.index, context), '/index');
  const diagnostics = [...source.diagnostics, ...index.diagnostics];
  const literalResult = inferLiteralListIndex(expression, index, diagnostics);

  if (literalResult !== undefined) return literalResult;

  if (source.structuralType?.schema?.kind !== 'array') {
    diagnostics.push(createError('expression.invalid-index-source', 'Index source must have an array schema'));
  }

  if (index.structuralType !== undefined && index.structuralType.valueType !== 'integer') {
    diagnostics.push(createError('expression.invalid-index', 'Array index must be integer'));
  }

  if (source.structuralType?.schema?.kind !== 'array' || index.structuralType?.valueType !== 'integer') {
    return { diagnostics };
  }

  return {
    structuralType: {
      valueType: valueSchemaValueType(source.structuralType.schema.items),
      schema: source.structuralType.schema.items,
    },
    diagnostics,
  };
}

export function inferExpressionValueType({ expression, context }: ExpressionInferenceOptions): ValueTypeInferenceResult {
  const contextDiagnostics = findDuplicateContextDiagnostics(context);

  if (contextDiagnostics.length > 0) {
    return { diagnostics: contextDiagnostics };
  }

  const result = inferStructuralType(expression, context);

  return {
    valueType: result.structuralType?.valueType,
    diagnostics: result.diagnostics,
  };
}

export function inferFormatterPipelineValueType({ inputType, pipeline }: FormatterInferenceOptions): ValueTypeInferenceResult {
  let valueType: ValueType = inputType;
  const indexedSteps: Iterable<readonly [number, FormatterPipeline['steps'][number]]> = pipeline.steps.entries();

  for (const entry of indexedSteps) {
    const index: number = entry[0];
    const step: FormatterPipeline['steps'][number] = entry[1];

    if (!formatterAcceptsInput(step.formatterId, valueType)) {
      return {
        diagnostics: [
          createError(
            'formatter.invalid-input',
            `Formatter ${step.formatterId} cannot consume ${valueType}`,
            `/steps/${String(index)}`,
          ),
        ],
      };
    }

    valueType = 'string';
  }

  return { valueType, diagnostics: [] };
}

function formatterAcceptsInput(formatterId: FormatterPipeline['steps'][number]['formatterId'], valueType: ValueType): boolean {
  if (formatterId === 'number' || formatterId === 'duration') {
    return isNumeric(valueType);
  }

  return formatterId === 'date-time' ? valueType === 'date-time' : valueType === 'string';
}

function isTypeCompatible(actual: ValueType, expected: ValueType): boolean {
  return actual === expected || (actual === 'integer' && expected === 'number');
}

export function inferBindingValueType({ binding, context }: BindingInferenceOptions): ValueTypeInferenceResult {
  const expressionResult = inferExpressionValueType({ expression: binding.expression, context });
  const diagnostics = [...prefixDiagnostics(expressionResult.diagnostics, '/expression')];
  let valueType = expressionResult.valueType;

  if (valueType !== undefined && binding.formatter !== undefined) {
    const formatterResult = inferFormatterPipelineValueType({ inputType: valueType, pipeline: binding.formatter });

    diagnostics.push(...prefixDiagnostics(formatterResult.diagnostics, '/formatter'));
    valueType = formatterResult.valueType;
  }

  const target = context.targets.find((candidate) => samePropertyTarget(candidate.target, binding.target));

  if (target === undefined) {
    diagnostics.push(createError('binding.target-not-found', 'Binding target was not found', '/target'));
  } else {
    if (valueType !== undefined && !isTypeCompatible(valueType, target.valueType)) {
      diagnostics.push(
        createError('binding.incompatible-target', 'Binding result is incompatible with its target', '/target'),
      );
      valueType = undefined;
    }

    if (binding.fallback !== undefined && !isTypeCompatible(binding.fallback.type, target.valueType)) {
      diagnostics.push(
        createError('binding.incompatible-fallback', 'Binding fallback is incompatible with its target', '/fallback'),
      );
    }
  }

  return { valueType, diagnostics };
}
