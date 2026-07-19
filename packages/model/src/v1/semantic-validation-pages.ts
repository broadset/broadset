import { expressionMatchesAssetTargetContract } from './asset-kind-inference';
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
  createPageAddressScopes,
  type PageAddressScope,
  type ResolvedTargetEntity,
  resolvePageInstanceElementInScope,
  resolveTargetEntityAddress,
} from './resolved-address';
import type { ComponentSemanticIndex, DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import {
  createSemanticError,
  typedValueMatchesResolvedAssetConstraints,
  typedValueMatchesTargetContract,
  typedValueSatisfiesConstraints,
  valueTypesCompatible,
} from './semantic-validation-helpers';
import {
  resolvePropertyTargetContractInScope,
  resolvePropertyTargetValueTypeInScope,
} from './target-resolution';
import type { TypedValue } from './typed-value';

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function validateComponentPropertyValues(
  { indexes, definition, values, pointer, diagnostics }: {
    readonly indexes: SemanticIndexes;
    readonly definition: ComponentSemanticIndex;
    readonly values: readonly { readonly exposedPropertyId: Id; readonly value: TypedValue }[];
    readonly pointer: string;
    readonly diagnostics: Diagnostic[];
  },
): void {
  values.forEach((value, index) => {
    const property = definition.exposedProperties.get(value.exposedPropertyId);
    const valuePointer = `${pointer}/${String(index)}`;

    if (property === undefined) {
      diagnostics.push(createSemanticError('component.unknown-exposed-property', 'Exposed property does not resolve', `${valuePointer}/exposedPropertyId`));
    } else if (
      !typedValueMatchesSchema(value.value, property.valueSchema) ||
      !typedValueMatchesResolvedAssetConstraints(indexes, value.value, property.valueSchema) ||
      !typedValueSatisfiesConstraints(value.value, property.constraints)
    ) {
      diagnostics.push(createSemanticError('component.incompatible-property-value', 'Component property value is incompatible', `${valuePointer}/value`));
    }
  });
}

function getOwnerElementId(entity: ResolvedTargetEntity | undefined): Id | undefined {
  return entity !== undefined && 'ownerElementId' in entity ? entity.ownerElementId : undefined;
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
  _binding: Binding,
  result: ReturnType<typeof inferBindingValueType>,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<string>();

  result.diagnostics.forEach((diagnostic) => {
    let code = diagnostic.code;
    const location = `${pointer}${diagnostic.pointer ?? '/expression'}`;

    if (code === 'expression.field-not-found') code = 'binding.missing-field';
    if (code === 'binding.incompatible-target') code = 'binding.incompatible-result';

    const key = `${code}\u0000${location}`;

    if (!seen.has(key)) diagnostics.push(createSemanticError(code, diagnostic.message, location));
    seen.add(key);
  });
}

function targetBelongsToRoot(
  document: DocumentSemanticIndex,
  pageScope: PageAddressScope,
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
  pageScopes: ReadonlyMap<Id, PageAddressScope>,
  pageBase: string,
  diagnostics: Diagnostic[],
): void {
  page.rootInstances.forEach((root, rootPosition) => {
    const base = `${pageBase}/rootInstances/${String(rootPosition)}`;
    const element = document.elements.get(root.elementId);

    if (element?.parentId !== null) diagnostics.push(createSemanticError('page.missing-root', 'Page root must resolve to a document root element', `${base}/elementId`));
    if (element?.kind === 'component-instance') {
      const definition = document.components.get(element.componentId);

      if (definition !== undefined) validateComponentPropertyValues({ indexes, definition, values: root.componentPropertyValues, pointer: `${base}/componentPropertyValues`, diagnostics });
    } else if (root.componentPropertyValues.length > 0) diagnostics.push(createSemanticError('component.invalid-property-owner', 'Only component roots accept component property values', `${base}/componentPropertyValues`));

    const scope = pageScopes.get(root.id);

    if (scope === undefined) return;

    root.overrides.forEach((override, overridePosition) => {
      const overridePointer = `${base}/overrides/${String(overridePosition)}`;
      const owner = targetBelongsToRoot(document, scope, root.elementId, override.target);

      if (owner === undefined) { diagnostics.push(createSemanticError('page.override-address-mismatch', 'Root override target is outside its root instance', `${overridePointer}/target`));

 return; }

      const expected = resolvePropertyTargetContractInScope(scope, override.target) ?? resolvePropertyTargetContractInScope(createDocumentAddressScope(document), override.target);

      if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Override target is invalid', `${overridePointer}/target/pointer`));
      else if (!typedValueMatchesTargetContract(indexes, override.value, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Override value is incompatible', `${overridePointer}/value`));
    });
  });
}

function validateDescendantOverrides(
  indexes: SemanticIndexes,
  page: DocumentSemanticIndex['document']['pages'][number],
  pageScopes: ReadonlyMap<Id, PageAddressScope>,
  documentPosition: number,
  pagePosition: number,
  diagnostics: Diagnostic[],
): void {
  page.descendantOverrides.forEach((override, overridePosition) => {
    const base = `/documents/${String(documentPosition)}/pages/${String(pagePosition)}/descendantOverrides/${String(overridePosition)}`;
    const scope = pageScopes.get(override.address.rootInstanceId);
    const resolved = scope === undefined ? undefined : resolvePageInstanceElementInScope(scope, override.address);

    if (resolved === undefined) {
      diagnostics.push(createSemanticError('page.orphan-override', 'Descendant override address does not resolve', `${base}/address`));

      return;
    }

    if (scope === undefined) return;

    override.overrides.forEach((typedOverride, typedPosition) => {
      const pointer = `${base}/overrides/${String(typedPosition)}`;
      const targetEntity = resolveTargetEntityAddress(scope, typedOverride.target.entity);

      if (getOwnerElementId(targetEntity) !== getOwnerElementId(resolved)) {
        diagnostics.push(createSemanticError('page.override-address-mismatch', 'Override target does not identify its addressed descendant', `${pointer}/target`));

        return;
      }

      const expected = resolvePropertyTargetContractInScope(scope, typedOverride.target);

      if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Descendant override target is invalid', `${pointer}/target/pointer`));
      else if (!typedValueMatchesTargetContract(indexes, typedOverride.value, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Descendant override value is incompatible', `${pointer}/value`));
    });
  });
}

function validatePages(indexes: SemanticIndexes, document: DocumentSemanticIndex, documentPosition: number, diagnostics: Diagnostic[]): void {
  const addressScopes = createPageAddressScopes(document);

  document.document.pages.forEach((page, pagePosition) => {
    const base = `/documents/${String(documentPosition)}/pages/${String(pagePosition)}`;
    const pageScopes = addressScopes.get(page.id) ?? new Map<Id, PageAddressScope>();

    validateRootOverrides(indexes, document, page, pageScopes, base, diagnostics);
    validateDescendantOverrides(indexes, page, pageScopes, documentPosition, pagePosition, diagnostics);
    Object.entries(page.selectedSampleDataSets).forEach(([viewModelId, sampleDataSetId]) => {
      const viewModel = document.viewModels.get(viewModelId);

      if (viewModel === undefined) {
        diagnostics.push(
          createSemanticError(
            'page.missing-view-model',
            'Selected sample-data view model does not resolve',
            `${base}/selectedSampleDataSets/${escapePointerSegment(viewModelId)}`,
          ),
        );
      } else if (!viewModel.sampleDataSets.has(sampleDataSetId)) {
        diagnostics.push(
          createSemanticError(
            'page.missing-sample-data',
            'Sample data set does not resolve in its selected view model',
            `${base}/selectedSampleDataSets/${escapePointerSegment(viewModelId)}`,
          ),
        );
      }
    });
    if (page.sequenceId !== undefined && !document.sequences.has(page.sequenceId)) diagnostics.push(createSemanticError('sequence.missing-reference', 'Page sequence does not resolve', `${base}/sequenceId`));
  });
}

function validateBindings(indexes: SemanticIndexes, document: DocumentSemanticIndex, documentPosition: number, diagnostics: Diagnostic[]): void {
  const scope = createDocumentAddressScope(document);

  document.document.bindings.forEach((binding, bindingPosition) => {
    const base = `/documents/${String(documentPosition)}/bindings/${String(bindingPosition)}`;
    const targetContract = resolvePropertyTargetContractInScope(scope, binding.target);
    const targetType = targetContract?.valueType;

    if (targetType === undefined) {
      diagnostics.push(createSemanticError('target.invalid-pointer', 'Binding target is invalid', `${base}/target`));
    }

    const context = createInferenceContext(indexes, document, binding);
    const result = inferBindingValueType({ binding, context });

    projectInferenceDiagnostics(binding, result, base, diagnostics);
    if (targetType !== undefined && result.valueType !== undefined && !valueTypesCompatible(result.valueType, targetType)) diagnostics.push(createSemanticError('binding.incompatible-result', 'Binding result is incompatible with target', `${base}/target`));

    if (
      targetContract !== undefined &&
      result.valueType === 'asset' &&
      !expressionMatchesAssetTargetContract(indexes, document, binding.expression, targetContract)
    ) {
      const expressionPointer = binding.expression.kind === 'literal' ? `${base}/expression/value` : `${base}/expression`;

      diagnostics.push(createSemanticError('binding.incompatible-result', 'Binding result violates the target contract', expressionPointer));
    }

    if (targetContract !== undefined && binding.fallback !== undefined && !typedValueMatchesTargetContract(indexes, binding.fallback, targetContract)) diagnostics.push(createSemanticError('binding.incompatible-fallback', 'Binding fallback is incompatible', `${base}/fallback`));
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
