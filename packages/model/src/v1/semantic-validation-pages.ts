import type { ComponentDefinition } from './component';
import {
  type Binding,
  type ExpressionAst,
  type ExpressionTargetContext,
  inferBindingValueType,
  inferExpressionValueType,
  typedValueMatchesSchema,
} from './data';
import type { Diagnostic } from './diagnostics';
import type { Id } from './identity';
import {
  createDocumentAddressScope,
  createPageAddressScope,
  type ResolvedTargetEntity,
  resolvePageInstanceElement,
  resolveTargetEntityAddress,
} from './resolved-address';
import type { DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import {
  createSemanticError,
  typedValueMatchesType,
  typedValueSatisfiesConstraints,
  valueTypesCompatible,
} from './semantic-validation-helpers';
import { resolvePropertyTargetValueTypeInScope } from './target-resolution';
import type { TypedValue } from './typed-value';

function validateComponentPropertyValues(
  definition: ComponentDefinition,
  values: readonly { readonly exposedPropertyId: Id; readonly value: TypedValue }[],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  values.forEach((value, index) => {
    const property = definition.exposedProperties.find((candidate) => candidate.id === value.exposedPropertyId);
    const valuePointer = `${pointer}/${String(index)}`;

    if (property === undefined) {
      diagnostics.push(createSemanticError('component.unknown-exposed-property', 'Exposed property does not resolve', `${valuePointer}/exposedPropertyId`));
    } else if (
      !typedValueMatchesSchema(value.value, property.valueSchema) ||
      !typedValueSatisfiesConstraints(value.value, property.constraints)
    ) {
      diagnostics.push(createSemanticError('component.incompatible-property-value', 'Component property value is incompatible', `${valuePointer}/value`));
    }
  });
}

function findIdentifierExpressionPointer(expression: ExpressionAst, code: string, pointer: string): string | undefined {
  if (code === 'expression.field-not-found' && expression.kind === 'field') return `${pointer}/fieldId`;
  if (code === 'expression.variable-not-found' && expression.kind === 'variable') return `${pointer}/variableId`;
  if (code === 'expression.object-field-not-found' && expression.kind === 'get') return `${pointer}/fieldId`;

  return undefined;
}

function findInvalidExpressionPointer(expression: ExpressionAst, code: string, pointer: string): string | undefined {
  const codesByKind: Partial<Record<ExpressionAst['kind'], readonly string[]>> = {
    get: ['expression.invalid-get-source'],
    index: ['expression.invalid-index', 'expression.invalid-index-source'],
    unary: ['expression.invalid-operand'],
    binary: ['expression.invalid-operand'],
    conditional: ['expression.invalid-condition', 'expression.branch-type-mismatch'],
    'safe-function': ['expression.invalid-function-argument', 'expression.invalid-function-arity'],
  };

  return codesByKind[expression.kind]?.includes(code) === true ? pointer : undefined;
}

function findDirectExpressionPointer(expression: ExpressionAst, code: string, pointer: string): string | undefined {
  return findIdentifierExpressionPointer(expression, code, pointer) ?? findInvalidExpressionPointer(expression, code, pointer);
}

function getOwnerElementId(entity: ResolvedTargetEntity | undefined): Id | undefined {
  return entity !== undefined && 'ownerElementId' in entity ? entity.ownerElementId : undefined;
}

function getExpressionChildren(
  expression: ExpressionAst,
  pointer: string,
): readonly { readonly expression: ExpressionAst; readonly pointer: string }[] {
  switch (expression.kind) {
    case 'unary':
      return [{ expression: expression.operand, pointer: `${pointer}/operand` }];
    case 'binary':
      return [
        { expression: expression.left, pointer: `${pointer}/left` },
        { expression: expression.right, pointer: `${pointer}/right` },
      ];
    case 'conditional':
      return [
        { expression: expression.condition, pointer: `${pointer}/condition` },
        { expression: expression.whenTrue, pointer: `${pointer}/whenTrue` },
        { expression: expression.whenFalse, pointer: `${pointer}/whenFalse` },
      ];
    case 'get':
      return [{ expression: expression.source, pointer: `${pointer}/source` }];
    case 'index':
      return [
        { expression: expression.source, pointer: `${pointer}/source` },
        { expression: expression.index, pointer: `${pointer}/index` },
      ];
    case 'safe-function':
      return expression.arguments.map((argument, index) => ({
        expression: argument,
        pointer: `${pointer}/arguments/${String(index)}`,
      }));
    default:
      return [];
  }
}

function findExpressionNodePointer(expression: ExpressionAst, code: string, pointer: string): string | undefined {
  const direct = findDirectExpressionPointer(expression, code, pointer);

  if (direct !== undefined) return direct;

  for (const child of getExpressionChildren(expression, pointer)) {
    const result = findExpressionNodePointer(child.expression, code, child.pointer);

    if (result !== undefined) return result;
  }

  return undefined;
}

function createInferenceContext(indexes: SemanticIndexes, document: DocumentSemanticIndex, binding?: Binding): Parameters<typeof inferExpressionValueType>[0]['context'] {
  const fields = document.document.viewModels.flatMap((viewModel) =>
    viewModel.fields.map((field) => ({ viewModelId: viewModel.id, fieldId: field.id, schema: field.schema })),
  );
  const variables = indexes.project.resources.variables.flatMap((collection) =>
    collection.variables.map((variable) => ({ collectionId: collection.id, variableId: variable.id, valueType: variable.valueType })),
  );
  const targets: ExpressionTargetContext[] = [];

  if (binding !== undefined) {
    const targetType = resolvePropertyTargetValueTypeInScope(createDocumentAddressScope(document), binding.target);

    if (targetType !== undefined) targets.push({ target: binding.target, valueType: targetType });
  }

  return { fields, variables, targets };
}

function projectInferenceDiagnostics(
  binding: Binding,
  result: ReturnType<typeof inferBindingValueType>,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>();

  result.diagnostics.forEach((diagnostic) => {
    let code = diagnostic.code;
    let location = findExpressionNodePointer(binding.expression, diagnostic.code, `${pointer}/expression`);

    if (code === 'expression.field-not-found') code = 'binding.missing-field';
    if (code === 'binding.incompatible-target') code = 'binding.incompatible-result';

    if (diagnostic.code.startsWith('formatter.')) location = `${pointer}/formatter/steps/0`;

    if (diagnostic.code === 'binding.incompatible-target' || diagnostic.code === 'binding.target-not-found') {
      location = `${pointer}/target`;
    }

    if (diagnostic.code === 'binding.incompatible-fallback') location = `${pointer}/fallback`;
    location ??= `${pointer}/expression`;

    const key = `${code}\u0000${location}`;

    if (!seen.has(key)) diagnostics.push(createSemanticError(code, diagnostic.message, location));
    seen.add(key);
  });
}

function targetBelongsToRoot(
  document: DocumentSemanticIndex,
  pageScope: ReturnType<typeof createPageAddressScope>,
  rootElementId: Id,
  target: Binding['target'],
): ResolvedTargetEntity | undefined {
  const pageEntity = resolveTargetEntityAddress(pageScope, target.entity);

  if (pageEntity !== undefined) {
    return 'ownerElementId' in pageEntity && pageEntity.ownerElementId === rootElementId ? pageEntity : undefined;
  }

  const documentEntity = resolveTargetEntityAddress(createDocumentAddressScope(document), target.entity);

  return documentEntity !== undefined && 'ownerElementId' in documentEntity && documentEntity.ownerElementId === rootElementId
    ? documentEntity
    : undefined;
}

function validateRootOverrides(
  indexes: SemanticIndexes,
  document: DocumentSemanticIndex,
  page: DocumentSemanticIndex['document']['pages'][number],
  pagePosition: number,
  diagnostics: Diagnostic[],
): void {
  page.rootInstances.forEach((root, rootPosition) => {
    const base = `/documents/${String(indexes.documentList.indexOf(document))}/pages/${String(pagePosition)}/rootInstances/${String(rootPosition)}`;
    const element = document.elements.get(root.elementId);

    if (element?.parentId !== null) diagnostics.push(createSemanticError('page.missing-root', 'Page root must resolve to a document root element', `${base}/elementId`));
    if (element?.kind === 'component-instance') {
      const definition = document.components.get(element.componentId)?.component;

      if (definition !== undefined) validateComponentPropertyValues(definition, root.componentPropertyValues, `${base}/componentPropertyValues`, diagnostics);
    } else if (root.componentPropertyValues.length > 0) diagnostics.push(createSemanticError('component.invalid-property-owner', 'Only component roots accept component property values', `${base}/componentPropertyValues`));

    const scope = createPageAddressScope(document, page, root);

    root.overrides.forEach((override, overridePosition) => {
      const overridePointer = `${base}/overrides/${String(overridePosition)}`;
      const owner = targetBelongsToRoot(document, scope, root.elementId, override.target);

      if (owner === undefined) { diagnostics.push(createSemanticError('page.override-address-mismatch', 'Root override target is outside its root instance', `${overridePointer}/target`));

 return; }

      const expected = resolvePropertyTargetValueTypeInScope(scope, override.target) ?? resolvePropertyTargetValueTypeInScope(createDocumentAddressScope(document), override.target);

      if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Override target is invalid', `${overridePointer}/target/pointer`));
      else if (!typedValueMatchesType(override.value, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Override value is incompatible', `${overridePointer}/value`));
    });
  });
}

function validateDescendantOverrides(
  document: DocumentSemanticIndex,
  page: DocumentSemanticIndex['document']['pages'][number],
  documentPosition: number,
  pagePosition: number,
  diagnostics: Diagnostic[],
): void {
  page.descendantOverrides.forEach((override, overridePosition) => {
    const base = `/documents/${String(documentPosition)}/pages/${String(pagePosition)}/descendantOverrides/${String(overridePosition)}`;
    const resolved = resolvePageInstanceElement(document, page, override.address);

    if (resolved === undefined) {
      diagnostics.push(createSemanticError('page.orphan-override', 'Descendant override address does not resolve', `${base}/address`));

      return;
    }

    const root = page.rootInstances.find((candidate) => candidate.id === override.address.rootInstanceId);

    if (root === undefined) return;

    const scope = createPageAddressScope(document, page, root);

    override.overrides.forEach((typedOverride, typedPosition) => {
      const pointer = `${base}/overrides/${String(typedPosition)}`;
      const targetEntity = resolveTargetEntityAddress(scope, typedOverride.target.entity);

      if (getOwnerElementId(targetEntity) !== getOwnerElementId(resolved)) {
        diagnostics.push(createSemanticError('page.override-address-mismatch', 'Override target does not identify its addressed descendant', `${pointer}/target`));

        return;
      }

      const expected = resolvePropertyTargetValueTypeInScope(scope, typedOverride.target);

      if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Descendant override target is invalid', `${pointer}/target/pointer`));
      else if (!typedValueMatchesType(typedOverride.value, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Descendant override value is incompatible', `${pointer}/value`));
    });
  });
}

function validatePages(indexes: SemanticIndexes, document: DocumentSemanticIndex, documentPosition: number, diagnostics: Diagnostic[]): void {
  document.document.pages.forEach((page, pagePosition) => {
    const base = `/documents/${String(documentPosition)}/pages/${String(pagePosition)}`;

    validateRootOverrides(indexes, document, page, pagePosition, diagnostics);
    validateDescendantOverrides(document, page, documentPosition, pagePosition, diagnostics);
    if (page.sampleDataSetId !== undefined && !document.document.viewModels.some((viewModel) => viewModel.sampleDataSets.some((sample) => sample.id === page.sampleDataSetId))) diagnostics.push(createSemanticError('page.missing-sample-data', 'Sample data set does not resolve', `${base}/sampleDataSetId`));
    if (page.sequenceId !== undefined && !document.sequences.has(page.sequenceId)) diagnostics.push(createSemanticError('sequence.missing-reference', 'Page sequence does not resolve', `${base}/sequenceId`));
  });
}

function validateBindings(indexes: SemanticIndexes, document: DocumentSemanticIndex, documentPosition: number, diagnostics: Diagnostic[]): void {
  const scope = createDocumentAddressScope(document);

  document.document.bindings.forEach((binding, bindingPosition) => {
    const base = `/documents/${String(documentPosition)}/bindings/${String(bindingPosition)}`;
    const targetType = resolvePropertyTargetValueTypeInScope(scope, binding.target);

    if (targetType === undefined) { diagnostics.push(createSemanticError('target.invalid-pointer', 'Binding target is invalid', `${base}/target`));

 return; }

    const context = createInferenceContext(indexes, document, binding);
    const result = inferBindingValueType({ binding, context });

    projectInferenceDiagnostics(binding, result, base, diagnostics);
    if (result.valueType !== undefined && !valueTypesCompatible(result.valueType, targetType)) diagnostics.push(createSemanticError('binding.incompatible-result', 'Binding result is incompatible with target', `${base}/target`));
    if (binding.fallback !== undefined && !typedValueMatchesType(binding.fallback, targetType)) diagnostics.push(createSemanticError('binding.incompatible-fallback', 'Binding fallback is incompatible', `${base}/fallback`));
  });
}

export function validateGuardExpression(
  indexes: SemanticIndexes,
  document: DocumentSemanticIndex,
  expression: ExpressionAst,
): boolean {
  const result = inferExpressionValueType({ expression, context: createInferenceContext(indexes, document) });

  return result.diagnostics.length === 0 && result.valueType === 'boolean';
}

export function validatePagesAndBindings(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach((document, documentPosition) => {
    validatePages(indexes, document, documentPosition, diagnostics);
    validateBindings(indexes, document, documentPosition, diagnostics);
  });
}
