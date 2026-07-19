import { projectFormatV1 } from '@broadset/model';
import type {
  GuardComparisonDraft,
  GuardDraft,
  GuardGroupDraft,
  GuardLiteralDraft,
  GuardNodeDraft,
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
const DEFAULT_NUMERIC_LITERAL_VALUE = 0;
const GROUP_ID_PREFIX = 'grp';
const COMPARISON_ID_PREFIX = 'cmp';
const ROOT_ID_SUFFIX = 'root';
const ID_PATH_SEPARATOR = '-';

type GuardConnective = GuardGroupDraft['connective'];

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

interface BuildGuardOperandsInput {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly project: projectFormatV1.BroadsetProjectV1;
}

interface BuildGuardOperandsResult {
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

function comparisonToExpression(
  comparison: GuardComparisonDraft,
  refById: ReadonlyMap<string, GuardOperandRef>,
): projectFormatV1.ExpressionAst | undefined {
  const ref = refById.get(comparison.operandId);

  if (ref === undefined) return undefined;

  return {
    kind: 'binary',
    operator: comparison.operator,
    left: operandRefToExpression(ref),
    right: { kind: 'literal', value: literalToTypedValue(comparison.literal) },
  };
}

function nodeToExpression(
  node: GuardNodeDraft,
  refById: ReadonlyMap<string, GuardOperandRef>,
): projectFormatV1.ExpressionAst | undefined {
  return node.kind === 'comparison' ? comparisonToExpression(node, refById) : guardGroupToExpression(node, refById);
}

function foldConnective(
  expressions: readonly projectFormatV1.ExpressionAst[],
  operator: 'and' | 'or',
): projectFormatV1.ExpressionAst | undefined {
  const [first, ...rest] = expressions;

  if (first === undefined) return undefined;

  return rest.reduce<projectFormatV1.ExpressionAst>(
    (left, right) => ({ kind: 'binary', operator, left, right }),
    first,
  );
}

/**
 * Recursively folds one guard tree group into a valid-by-construction `ExpressionAst`: every
 * comparison leaf becomes a `binary` comparison, every nested group recurses through this same
 * function, and the results are left-folded under the group's connective (`all` -> `and`, `any` ->
 * `or`), then wrapped in a unary `not` when the group is negated. A nested group whose own children
 * are all empty/unresolvable contributes nothing (`undefined`) and is dropped from its parent's
 * fold — an empty group carries no information an `ExpressionAst` can represent, so it can only ever
 * mean "nothing here yet".
 */
function guardGroupToExpression(
  group: GuardGroupDraft,
  refById: ReadonlyMap<string, GuardOperandRef>,
): projectFormatV1.ExpressionAst | undefined {
  const childExpressions = group.children
    .map((child) => nodeToExpression(child, refById))
    .filter((expression): expression is projectFormatV1.ExpressionAst => expression !== undefined);
  const combined = foldConnective(childExpressions, group.connective === 'all' ? 'and' : 'or');

  if (combined === undefined) return undefined;

  return group.negated ? { kind: 'unary', operator: 'not', operand: combined } : combined;
}

interface GuardDraftToExpressionInput {
  readonly draft: GuardDraft;
  readonly refById: ReadonlyMap<string, GuardOperandRef>;
}

/**
 * Builds a valid-by-construction guard `ExpressionAst` from the root {@link GuardDraft} group — see
 * {@link guardGroupToExpression} for the recursive fold. Comparisons whose operand id is not in
 * `refById` are dropped defensively rather than throwing — the UI never produces one, but this stays
 * a hard boundary check.
 */
export function guardDraftToExpression({
  draft,
  refById,
}: GuardDraftToExpressionInput): projectFormatV1.ExpressionAst | undefined {
  return guardGroupToExpression(draft, refById);
}

/**
 * Deterministic UI-local id for a reverse-translated guard tree node, derived from its position
 * (`path`, the ordered list of child indices from the root) instead of minted randomly. Determinism
 * is what lets a host (and a Playwright CT) locate a freshly reverse-translated node in the DOM right
 * after a store round trip, without reading generated ids back out of the store first.
 */
function nodeId(prefix: typeof GROUP_ID_PREFIX | typeof COMPARISON_ID_PREFIX, path: readonly number[]): string {
  return path.length === 0 ?
      `${prefix}${ID_PATH_SEPARATOR}${ROOT_ID_SUFFIX}`
    : `${prefix}${ID_PATH_SEPARATOR}${path.join(ID_PATH_SEPARATOR)}`;
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

/**
 * Parses one candidate comparison leaf: a `binary` node whose operator is a {@link GuardOperator},
 * whose left side resolves to a known {@link GuardOperandRef}, and whose right side is a literal of a
 * supported {@link GuardValueType}. Anything else (wrong operator, non-literal right, an unresolvable
 * left operand, or an out-of-vocabulary literal type) is not a comparison this tree can represent.
 */
function parseComparisonLeaf(
  expression: projectFormatV1.ExpressionAst,
  path: readonly number[],
  refById: ReadonlyMap<string, GuardOperandRef>,
): GuardComparisonDraft | undefined {
  if (expression.kind !== 'binary' || !isComparisonOperator(expression.operator)) return undefined;

  const { operator, left, right } = expression;

  if (right.kind !== 'literal') return undefined;

  const ref = operandExpressionToRef(left);

  if (ref === undefined) return undefined;

  const operandId = guardOperandId(ref);

  if (!refById.has(operandId)) return undefined;

  const literal = typedValueToLiteral(right.value);

  if (literal === undefined) return undefined;

  return { kind: 'comparison', id: nodeId(COMPARISON_ID_PREFIX, path), operandId, operator, literal };
}

/**
 * Splits a left-folded same-connective `and`/`or` chain into its ordered operand expressions,
 * stopping the instant a subexpression uses a different operator (including the opposite
 * connective) — that subexpression is then parsed as its own node by {@link parseGuardExpression},
 * which is what lets a differently-connected subtree become a nested group instead of failing the
 * whole guard the way the pre-nesting flat translator did.
 */
function unflattenSameConnective(
  expression: projectFormatV1.ExpressionAst,
  connective: 'and' | 'or',
): readonly projectFormatV1.ExpressionAst[] {
  if (expression.kind !== 'binary' || expression.operator !== connective) return [expression];

  return [
    ...unflattenSameConnective(expression.left, connective),
    ...unflattenSameConnective(expression.right, connective),
  ];
}

const GUARD_ADVANCED = 'advanced';

type GuardParseResult = GuardNodeDraft | typeof GUARD_ADVANCED;

/**
 * Parses every child of an `and`/`or` chain (already split by {@link unflattenSameConnective}) via
 * {@link parseGuardExpression}, at the child's own path (`[...path, index]`). If ANY child fails to
 * parse, the whole group is unrepresentable and this returns `undefined` — a guard tree has no way
 * to show "3 of 4 clauses" read-only within an otherwise-editable group.
 */
function parseGroupChildren(
  operandExpressions: readonly projectFormatV1.ExpressionAst[],
  path: readonly number[],
  refById: ReadonlyMap<string, GuardOperandRef>,
): readonly GuardNodeDraft[] | undefined {
  const parsed = operandExpressions.map((operand, index) => parseGuardExpression(operand, [...path, index], refById));
  const resolved = parsed.filter((node): node is GuardNodeDraft => node !== GUARD_ADVANCED);

  return resolved.length === parsed.length ? resolved : undefined;
}

/**
 * Recursively parses one guard subexpression at `path` into a {@link GuardNodeDraft}, or
 * {@link GUARD_ADVANCED} when it doesn't fit the nested AND/OR/NOT-of-comparisons grammar:
 * - `not(E)` reuses `E`'s own connective/children with `negated` flipped when `E` parses to a group,
 *   or wraps a single parsed comparison in a fresh `all`, negated group.
 * - an `and`/`or` binary becomes a group whose children are the unflattened same-connective operands,
 *   each parsed recursively (so a differently-connected operand becomes a nested group).
 * - anything else is tried as a comparison leaf, falling back to {@link GUARD_ADVANCED}.
 */
function parseGuardExpression(
  expression: projectFormatV1.ExpressionAst,
  path: readonly number[],
  refById: ReadonlyMap<string, GuardOperandRef>,
): GuardParseResult {
  if (expression.kind === 'unary' && expression.operator === 'not') {
    const inner = parseGuardExpression(expression.operand, path, refById);

    if (inner === GUARD_ADVANCED) return GUARD_ADVANCED;

    return inner.kind === 'group' ?
        { ...inner, negated: !inner.negated }
      : { kind: 'group', id: nodeId(GROUP_ID_PREFIX, path), connective: 'all', negated: true, children: [inner] };
  }

  if (expression.kind === 'binary' && (expression.operator === 'and' || expression.operator === 'or')) {
    const connective: GuardConnective = expression.operator === 'and' ? 'all' : 'any';
    const children = parseGroupChildren(unflattenSameConnective(expression, expression.operator), path, refById);

    return children === undefined ? GUARD_ADVANCED : (
        { kind: 'group', id: nodeId(GROUP_ID_PREFIX, path), connective, negated: false, children }
      );
  }

  return parseComparisonLeaf(expression, path, refById) ?? GUARD_ADVANCED;
}

interface ExpressionToGuardInput {
  readonly expression: projectFormatV1.ExpressionAst | undefined;
  readonly refById: ReadonlyMap<string, GuardOperandRef>;
}

interface ExpressionToGuardResult {
  readonly guard: GuardDraft | undefined;
  readonly guardIsAdvanced: boolean;
}

const NO_GUARD_RESULT: ExpressionToGuardResult = { guard: undefined, guardIsAdvanced: false };
const ADVANCED_GUARD_RESULT: ExpressionToGuardResult = { guard: undefined, guardIsAdvanced: true };

/**
 * Inverse of {@link guardDraftToExpression}: recursively parses the model guard into a nested
 * AND/OR/NOT {@link GuardDraft} tree via {@link parseGuardExpression}, starting at the root path
 * (`[]`). A bare top-level comparison is wrapped in a root `all` group so the tree always has a
 * single root node. Anything that doesn't fit this grammar ANYWHERE in the tree (a function/`get`/
 * `index`/conditional/arithmetic node, an unresolvable operand, a non-literal comparison side, or a
 * literal type outside {@link GuardValueType}) marks the WHOLE guard `guardIsAdvanced: true` so the
 * caller can preserve and show the model guard read-only.
 */
export function expressionToGuard({ expression, refById }: ExpressionToGuardInput): ExpressionToGuardResult {
  if (expression === undefined) return NO_GUARD_RESULT;

  const parsed = parseGuardExpression(expression, [], refById);

  if (parsed === GUARD_ADVANCED) return ADVANCED_GUARD_RESULT;
  if (parsed.kind === 'group') return { guard: parsed, guardIsAdvanced: false };

  // A bare top-level comparison was parsed at the root path (`[]`, giving it a `-root` suffixed id)
  // since it isn't itself a group. Once wrapped as the synthetic root group's only child, re-id it
  // at path `[0]` so it matches the id an equivalent single-child `and`/`or` group would have given
  // it — keeping the id scheme positional (and thus predictable for a host/CT) regardless of whether
  // the model guard happened to need an explicit `and`/`or` wrapper.
  const rootChild: GuardComparisonDraft = { ...parsed, id: nodeId(COMPARISON_ID_PREFIX, [0]) };

  return {
    guard: { kind: 'group', id: nodeId(GROUP_ID_PREFIX, []), connective: 'all', negated: false, children: [rootChild] },
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
  }
}

/** Maps a full action draft list to model actions, defensively dropping any that fail to parse. */
export function actionsDraftToModel(drafts: readonly SequenceActionDraft[]): readonly projectFormatV1.SequenceAction[] {
  return drafts
    .map((draft) => actionDraftToModel(draft))
    .filter((action): action is projectFormatV1.SequenceAction => action !== null);
}
