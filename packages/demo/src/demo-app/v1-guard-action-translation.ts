import { projectFormatV1 } from '@broadset/model';
import type {
  GuardClauseDraft,
  GuardDraft,
  GuardLiteralDraft,
  GuardOperandOption,
  GuardOperator,
  GuardValueType,
  SequenceActionDraft,
} from '@broadset/ui';

/**
 * Resolves a presentational {@link GuardOperandOption.id} back to the model field or variable it
 * stands for. Built once per document/project by {@link buildGuardOperands} and threaded through
 * every guard translation call so the demo host never has to re-derive it.
 */
export type GuardOperandRef =
  | { readonly kind: 'field'; readonly viewModelId: projectFormatV1.Id; readonly fieldId: projectFormatV1.Id }
  | { readonly kind: 'variable'; readonly collectionId: projectFormatV1.Id; readonly variableId: projectFormatV1.Id };

const FIELD_OPERAND_KIND = 'field';
const VARIABLE_OPERAND_KIND = 'variable';
const OPERAND_ID_SEPARATOR = ':';
const GUARD_VALUE_TYPES: readonly GuardValueType[] = ['boolean', 'integer', 'number', 'string', 'date-time'];
const COMPARISON_OPERATORS: readonly GuardOperator[] = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'];
const CLAUSE_ID_PREFIX = 'clause-';
const DEFAULT_NUMERIC_LITERAL_VALUE = 0;

/**
 * Deterministic, opaque operand id shared by both translation directions: {@link buildGuardOperands}
 * mints it when listing available operands, and {@link expressionToGuard} recomputes it from a model
 * field/variable node to check membership. Keeping a single formula is what lets forward and reverse
 * translation always agree without a second lookup table.
 */
export function guardOperandId(ref: GuardOperandRef): string {
  return ref.kind === 'field' ?
      [FIELD_OPERAND_KIND, ref.viewModelId, ref.fieldId].join(OPERAND_ID_SEPARATOR)
    : [VARIABLE_OPERAND_KIND, ref.collectionId, ref.variableId].join(OPERAND_ID_SEPARATOR);
}

function isGuardValueType(valueType: projectFormatV1.ValueType): valueType is GuardValueType {
  return GUARD_VALUE_TYPES.some((candidate) => candidate === valueType);
}

function isComparisonOperator(operator: string): operator is GuardOperator {
  return COMPARISON_OPERATORS.some((candidate) => candidate === operator);
}

/**
 * Maps a view-model field schema to the guard builder's value-type vocabulary. Object/array/color/
 * asset fields have no literal editor in the guard builder, so they are intentionally omitted
 * (`undefined`) rather than forced into a lossy representation.
 */
function guardValueTypeForFieldSchema(schema: projectFormatV1.ValueSchema): GuardValueType | undefined {
  switch (schema.kind) {
    case 'string':
    case 'enum':
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
    case 'asset':
    case 'object':
    case 'array':
      return undefined;
  }
}

export interface BuildGuardOperandsInput {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly project: projectFormatV1.BroadsetProjectV1;
}

export interface BuildGuardOperandsResult {
  readonly options: readonly GuardOperandOption[];
  readonly refById: ReadonlyMap<string, GuardOperandRef>;
}

function pushFieldOperand(
  viewModel: projectFormatV1.ViewModel,
  field: projectFormatV1.ViewModelField,
  options: GuardOperandOption[],
  refById: Map<string, GuardOperandRef>,
): void {
  const valueType = guardValueTypeForFieldSchema(field.schema);

  if (valueType === undefined) return;

  const ref: GuardOperandRef = { kind: 'field', viewModelId: viewModel.id, fieldId: field.id };
  const id = guardOperandId(ref);

  options.push({
    id,
    label: `${viewModel.name} / ${field.label ?? field.name}`,
    valueType,
    ...(field.schema.kind === 'enum' ? { enumValues: field.schema.values } : {}),
  });
  refById.set(id, ref);
}

function pushVariableOperand(
  collection: projectFormatV1.VariableCollection,
  variable: projectFormatV1.VariableDefinition,
  options: GuardOperandOption[],
  refById: Map<string, GuardOperandRef>,
): void {
  if (!isGuardValueType(variable.valueType)) return;

  const ref: GuardOperandRef = { kind: 'variable', collectionId: collection.id, variableId: variable.id };
  const id = guardOperandId(ref);

  options.push({ id, label: `${collection.name} / ${variable.name}`, valueType: variable.valueType });
  refById.set(id, ref);
}

/**
 * Lists every guard-eligible operand on a document: its view-model fields plus the project's
 * variables, keyed by the deterministic id computed from {@link guardOperandId}. Fields/variables
 * whose value type has no guard-builder representation (object, array, color, asset, ...) are
 * omitted rather than approximated.
 */
export function buildGuardOperands({ document, project }: BuildGuardOperandsInput): BuildGuardOperandsResult {
  const options: GuardOperandOption[] = [];
  const refById = new Map<string, GuardOperandRef>();

  document.viewModels.forEach((viewModel) => {
    viewModel.fields.forEach((field) => {
      pushFieldOperand(viewModel, field, options, refById);
    });
  });
  project.resources.variables.forEach((collection) => {
    collection.variables.forEach((variable) => {
      pushVariableOperand(collection, variable, options, refById);
    });
  });

  return { options, refById };
}

type GuardLiteralPrimitive = string | number | boolean;

function toBooleanLiteralValue(value: GuardLiteralPrimitive): boolean {
  return typeof value === 'boolean' ? value : Boolean(value);
}

function toNumericLiteralValue(value: GuardLiteralPrimitive): number {
  if (typeof value === 'number') return value;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : DEFAULT_NUMERIC_LITERAL_VALUE;
}

function toStringLiteralValue(value: GuardLiteralPrimitive): string {
  return typeof value === 'string' ? value : String(value);
}

/**
 * Converts a presentational guard literal into the model's {@link projectFormatV1.TypedValue}
 * discriminated union. `GuardLiteralDraft.value` is intentionally untyped (`string | number |
 * boolean`) at the TS level — the UI always supplies a value matching `valueType` (Switch for
 * boolean, NumField for integer/number, Input for string/date-time) — so each branch narrows
 * defensively instead of trusting that contract with an unsafe cast.
 */
export function literalToTypedValue(literal: GuardLiteralDraft): projectFormatV1.TypedValue {
  switch (literal.valueType) {
    case 'boolean':
      return { type: 'boolean', value: toBooleanLiteralValue(literal.value) };
    case 'integer':
      return { type: 'integer', value: Math.trunc(toNumericLiteralValue(literal.value)) };
    case 'number':
      return { type: 'number', value: toNumericLiteralValue(literal.value) };
    case 'string':
      return { type: 'string', value: toStringLiteralValue(literal.value) };
    case 'date-time':
      return { type: 'date-time', value: toStringLiteralValue(literal.value) };
  }
}

function operandRefToExpression(ref: GuardOperandRef): projectFormatV1.ExpressionAst {
  return ref.kind === 'field' ?
      { kind: 'field', viewModelId: ref.viewModelId, fieldId: ref.fieldId }
    : { kind: 'variable', collectionId: ref.collectionId, variableId: ref.variableId };
}

function clauseToComparison(
  clause: GuardClauseDraft,
  refById: ReadonlyMap<string, GuardOperandRef>,
): projectFormatV1.ExpressionAst | undefined {
  const ref = refById.get(clause.operandId);

  if (ref === undefined) return undefined;

  return {
    kind: 'binary',
    operator: clause.operator,
    left: operandRefToExpression(ref),
    right: { kind: 'literal', value: literalToTypedValue(clause.literal) },
  };
}

export interface GuardDraftToExpressionInput {
  readonly draft: GuardDraft;
  readonly refById: ReadonlyMap<string, GuardOperandRef>;
}

/**
 * Builds a valid-by-construction guard `ExpressionAst` from a {@link GuardDraft}: every clause
 * becomes a `binary` comparison and multiple clauses are left-folded under the connective's model
 * operator (`all` -> `and`, `any` -> `or`). Clauses whose operand id is not in `refById` are dropped
 * defensively rather than throwing — the UI never produces one, but this stays a hard boundary check.
 */
export function guardDraftToExpression({
  draft,
  refById,
}: GuardDraftToExpressionInput): projectFormatV1.ExpressionAst | undefined {
  const comparisons = draft.clauses
    .map((clause) => clauseToComparison(clause, refById))
    .filter((comparison): comparison is projectFormatV1.ExpressionAst => comparison !== undefined);
  const [first, ...rest] = comparisons;

  if (first === undefined) return undefined;

  const connectiveOperator = draft.connective === 'all' ? 'and' : 'or';

  return rest.reduce<projectFormatV1.ExpressionAst>(
    (left, right) => ({ kind: 'binary', operator: connectiveOperator, left, right }),
    first,
  );
}

type LogicalConnective = 'and' | 'or';

interface FlattenedGuardTree {
  readonly leaves: readonly projectFormatV1.ExpressionAst[];
  readonly connective: LogicalConnective | undefined;
}

/**
 * Recursively unfolds a left-folded `and`/`or` tree into an ordered leaf list, failing (`undefined`)
 * the moment a second, different connective appears anywhere in the tree. A single leaf with no
 * `and`/`or` ancestor keeps `connective` as whatever was passed in (`undefined` at the root).
 */
function flattenGuardTree(
  expression: projectFormatV1.ExpressionAst,
  connective: LogicalConnective | undefined,
): FlattenedGuardTree | undefined {
  if (expression.kind !== 'binary' || (expression.operator !== 'and' && expression.operator !== 'or')) {
    return { leaves: [expression], connective };
  }

  if (connective !== undefined && connective !== expression.operator) return undefined;

  const resolvedConnective = expression.operator;
  const left = flattenGuardTree(expression.left, resolvedConnective);

  if (left === undefined) return undefined;

  const right = flattenGuardTree(expression.right, resolvedConnective);

  if (right === undefined) return undefined;

  return { leaves: [...left.leaves, ...right.leaves], connective: resolvedConnective };
}

function operandExpressionToRef(expression: projectFormatV1.ExpressionAst): GuardOperandRef | undefined {
  if (expression.kind === 'field')
    return { kind: 'field', viewModelId: expression.viewModelId, fieldId: expression.fieldId };
  if (expression.kind === 'variable')
    return { kind: 'variable', collectionId: expression.collectionId, variableId: expression.variableId };

  return undefined;
}

function typedValueToLiteral(value: projectFormatV1.TypedValue): GuardLiteralDraft | undefined {
  if (
    value.type === 'boolean' ||
    value.type === 'integer' ||
    value.type === 'number' ||
    value.type === 'string' ||
    value.type === 'date-time'
  ) {
    return { valueType: value.type, value: value.value };
  }

  return undefined;
}

function leafToClauseDraft(
  leaf: projectFormatV1.ExpressionAst,
  index: number,
  refById: ReadonlyMap<string, GuardOperandRef>,
): GuardClauseDraft | undefined {
  if (leaf.kind !== 'binary') return undefined;

  const { operator, left, right } = leaf;

  if (!isComparisonOperator(operator) || right.kind !== 'literal') return undefined;

  const ref = operandExpressionToRef(left);

  if (ref === undefined) return undefined;

  const operandId = guardOperandId(ref);

  if (!refById.has(operandId)) return undefined;

  const literal = typedValueToLiteral(right.value);

  if (literal === undefined) return undefined;

  return { id: `${CLAUSE_ID_PREFIX}${String(index)}`, operandId, operator, literal };
}

export interface ExpressionToGuardInput {
  readonly expression: projectFormatV1.ExpressionAst | undefined;
  readonly refById: ReadonlyMap<string, GuardOperandRef>;
}

export interface ExpressionToGuardResult {
  readonly guard: GuardDraft | undefined;
  readonly guardIsAdvanced: boolean;
}

const NO_GUARD_RESULT: ExpressionToGuardResult = { guard: undefined, guardIsAdvanced: false };
const ADVANCED_GUARD_RESULT: ExpressionToGuardResult = { guard: undefined, guardIsAdvanced: true };

/**
 * Inverse of {@link guardDraftToExpression}. Tries to parse the model guard into a flat, single-
 * connective `GuardDraft`; anything that doesn't fit the flat shape (mixed connectives, arithmetic,
 * `not`, safe-function calls, nested conditionals, an unresolvable operand, a non-literal
 * comparison side, or a literal type outside {@link GuardValueType}) is reported as
 * `guardIsAdvanced: true` so the caller can preserve and show the model guard read-only.
 */
export function expressionToGuard({ expression, refById }: ExpressionToGuardInput): ExpressionToGuardResult {
  if (expression === undefined) return NO_GUARD_RESULT;

  const flattened = flattenGuardTree(expression, undefined);

  if (flattened === undefined) return ADVANCED_GUARD_RESULT;

  const clauses = flattened.leaves.map((leaf, index) => leafToClauseDraft(leaf, index, refById));
  const resolvedClauses = clauses.filter((clause): clause is GuardClauseDraft => clause !== undefined);

  if (resolvedClauses.length !== clauses.length) return ADVANCED_GUARD_RESULT;

  return {
    guard: { connective: flattened.connective === 'or' ? 'any' : 'all', clauses: resolvedClauses },
    guardIsAdvanced: false,
  };
}

/** Renders a model `SequenceAction` as its presentational draft, 1:1 per kind. */
export function actionToDraft(action: projectFormatV1.SequenceAction): SequenceActionDraft {
  switch (action.kind) {
    case 'play-sequence':
      return { kind: 'play-sequence', sequenceId: action.sequenceId, behavior: action.behavior };
    case 'stop-sequence':
      return { kind: 'stop-sequence', sequenceId: action.sequenceId };
    case 'seek-sequence':
      return { kind: 'seek-sequence', sequenceId: action.sequenceId, tick: action.tick };
    case 'send-event':
      return { kind: 'send-event', stateMachineId: action.stateMachineId, eventId: action.eventId };
  }
}

/**
 * Brands a presentational action draft's string ids back into the model's `SequenceAction`. Returns
 * `null` (never throws) the moment any id fails to parse — a hard boundary check for a UI event
 * handler that must fail soft on user input rather than crash the app.
 */
export function actionDraftToModel(draft: SequenceActionDraft): projectFormatV1.SequenceAction | null {
  switch (draft.kind) {
    case 'play-sequence': {
      const sequenceId = projectFormatV1.idSchema.safeParse(draft.sequenceId);

      return sequenceId.success ?
          { kind: 'play-sequence', sequenceId: sequenceId.data, behavior: draft.behavior }
        : null;
    }

    case 'stop-sequence': {
      const sequenceId = projectFormatV1.idSchema.safeParse(draft.sequenceId);

      return sequenceId.success ? { kind: 'stop-sequence', sequenceId: sequenceId.data } : null;
    }

    case 'seek-sequence': {
      const sequenceId = projectFormatV1.idSchema.safeParse(draft.sequenceId);

      return sequenceId.success ? { kind: 'seek-sequence', sequenceId: sequenceId.data, tick: draft.tick } : null;
    }

    case 'send-event': {
      const stateMachineId = projectFormatV1.idSchema.safeParse(draft.stateMachineId);
      const eventId = projectFormatV1.idSchema.safeParse(draft.eventId);

      return stateMachineId.success && eventId.success ?
          { kind: 'send-event', stateMachineId: stateMachineId.data, eventId: eventId.data }
        : null;
    }
  }
}

/** Maps a full action draft list to model actions, defensively dropping any that fail to parse. */
export function actionsDraftToModel(drafts: readonly SequenceActionDraft[]): readonly projectFormatV1.SequenceAction[] {
  return drafts
    .map((draft) => actionDraftToModel(draft))
    .filter((action): action is projectFormatV1.SequenceAction => action !== null);
}
