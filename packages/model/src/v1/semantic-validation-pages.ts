import type { ComponentDefinition } from './component';
import { type ExpressionAst, inferBindingValueType, typedValueMatchesSchema } from './data';
import type { Diagnostic } from './diagnostics';
import type { Id } from './identity';
import type { DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import {
  createSemanticError,
  typedValueMatchesType,
  typedValueSatisfiesConstraints,
  valueTypesCompatible,
} from './semantic-validation-helpers';
import { resolvePropertyTargetValueTypeFromIndexes } from './target-resolution';
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

function expressionHasMissingField(expression: ExpressionAst, document: DocumentSemanticIndex): boolean {
  if (expression.kind === 'field') return !document.document.viewModels.some((viewModel) => viewModel.id === expression.viewModelId && viewModel.fields.some((field) => field.id === expression.fieldId));
  if (expression.kind === 'unary') return expressionHasMissingField(expression.operand, document);
  if (expression.kind === 'binary') return expressionHasMissingField(expression.left, document) || expressionHasMissingField(expression.right, document);
  if (expression.kind === 'conditional') return expressionHasMissingField(expression.condition, document) || expressionHasMissingField(expression.whenTrue, document) || expressionHasMissingField(expression.whenFalse, document);
  if (expression.kind === 'get') return expressionHasMissingField(expression.source, document);
  if (expression.kind === 'index') return expressionHasMissingField(expression.source, document) || expressionHasMissingField(expression.index, document);
  if (expression.kind === 'safe-function') return expression.arguments.some((argument) => expressionHasMissingField(argument, document));

  return false;
}

function validatePageOverrides(indexes: SemanticIndexes, documentIndex: DocumentSemanticIndex, documentPosition: number, diagnostics: Diagnostic[]): void {
  const { document } = documentIndex;

  document.pages.forEach((page, pagePosition) => {
    const base = `/documents/${String(documentPosition)}/pages/${String(pagePosition)}`;

    page.rootInstances.forEach((root, rootPosition) => {
      const element = documentIndex.elements.get(root.elementId);
      const rootPointer = `${base}/rootInstances/${String(rootPosition)}`;

      if (element?.parentId !== null) diagnostics.push(createSemanticError('page.missing-root', 'Page root must resolve to a document root element', `${rootPointer}/elementId`));
      if (element?.kind === 'component-instance') {
        const definition = documentIndex.components.get(element.componentId)?.component;

        if (definition !== undefined) validateComponentPropertyValues(definition, root.componentPropertyValues, `${rootPointer}/componentPropertyValues`, diagnostics);
      } else if (root.componentPropertyValues.length > 0) diagnostics.push(createSemanticError('component.invalid-property-owner', 'Only component roots accept component property values', `${rootPointer}/componentPropertyValues`));
      root.overrides.forEach((override, overridePosition) => {
        const overridePointer = `${rootPointer}/overrides/${String(overridePosition)}`;
        const expected = resolvePropertyTargetValueTypeFromIndexes(indexes, override.target);

        if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Override target is invalid', `${overridePointer}/target/pointer`));
        else if (!typedValueMatchesType(override.value, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Override value is incompatible', `${overridePointer}/value`));
      });
    });
    page.descendantOverrides.forEach((override, overridePosition) => {
      const overridePointer = `${base}/descendantOverrides/${String(overridePosition)}`;
      const root = page.rootInstances.find((candidate) => candidate.id === override.address.rootInstanceId);

      if (root === undefined || !documentIndex.elements.has(override.address.elementId)) diagnostics.push(createSemanticError('page.orphan-override', 'Descendant override address does not resolve', `${overridePointer}/address`));
      override.overrides.forEach((typedOverride, typedOverridePosition) => {
        const typedPointer = `${overridePointer}/overrides/${String(typedOverridePosition)}`;
        const expected = resolvePropertyTargetValueTypeFromIndexes(indexes, typedOverride.target);

        if (expected === undefined) diagnostics.push(createSemanticError('target.invalid-pointer', 'Descendant override target is invalid', `${typedPointer}/target/pointer`));
        else if (!typedValueMatchesType(typedOverride.value, expected)) diagnostics.push(createSemanticError('target.incompatible-value', 'Descendant override value is incompatible', `${typedPointer}/value`));
      });
    });
    if (page.sampleDataSetId !== undefined && !document.viewModels.some((viewModel) => viewModel.sampleDataSets.some((sample) => sample.id === page.sampleDataSetId))) diagnostics.push(createSemanticError('page.missing-sample-data', 'Sample data set does not resolve', `${base}/sampleDataSetId`));
    if (page.sequenceId !== undefined && !documentIndex.sequences.has(page.sequenceId)) diagnostics.push(createSemanticError('sequence.missing-reference', 'Page sequence does not resolve', `${base}/sequenceId`));
  });
}

function validateBindings(indexes: SemanticIndexes, documentIndex: DocumentSemanticIndex, documentPosition: number, diagnostics: Diagnostic[]): void {
  const { document } = documentIndex;

  document.bindings.forEach((binding, bindingPosition) => {
    const base = `/documents/${String(documentPosition)}/bindings/${String(bindingPosition)}`;

    if (expressionHasMissingField(binding.expression, documentIndex)) diagnostics.push(createSemanticError('binding.missing-field', 'Binding field does not resolve', `${base}/expression/fieldId`));

    const targetType = resolvePropertyTargetValueTypeFromIndexes(indexes, binding.target);

    if (targetType === undefined) { diagnostics.push(createSemanticError('target.invalid-pointer', 'Binding target is invalid', `${base}/target`));

 return; }

    const context = {
      fields: document.viewModels.flatMap((viewModel) => viewModel.fields.map((field) => ({ viewModelId: viewModel.id, fieldId: field.id, schema: field.schema }))),
      variables: indexes.project.resources.variables.flatMap((collection) => collection.variables.map((variable) => ({ collectionId: collection.id, variableId: variable.id, valueType: variable.valueType }))),
      targets: [{ target: binding.target, valueType: targetType }],
    };
    const result = inferBindingValueType({ binding, context });

    if (result.diagnostics.some((item) => item.code === 'binding.incompatible-target') || (result.valueType !== undefined && !valueTypesCompatible(result.valueType, targetType))) diagnostics.push(createSemanticError('binding.incompatible-result', 'Binding result is incompatible with target', `${base}/target`));
    if (binding.fallback !== undefined && !typedValueMatchesType(binding.fallback, targetType)) diagnostics.push(createSemanticError('binding.incompatible-fallback', 'Binding fallback is incompatible', `${base}/fallback`));
  });
}

export function validatePagesAndBindings(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.documentList.forEach((documentIndex, documentPosition) => {
    validatePageOverrides(indexes, documentIndex, documentPosition, diagnostics);
    validateBindings(indexes, documentIndex, documentPosition, diagnostics);
  });
}
