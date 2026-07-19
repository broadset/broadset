import type { ExpressionAst } from './data';
import type { Diagnostic } from './diagnostics';
import type { Element } from './element';
import type { SemanticIndexes } from './semantic-index';
import { createSemanticError, typedValueMatchesResolvedAssetConstraints } from './semantic-validation-helpers';
import type { Sequence } from './sequence';
import type { TypedValue } from './typed-value';

interface ValueValidationOptions {
  readonly indexes: SemanticIndexes;
  readonly value: TypedValue;
  readonly pointer: string;
  readonly diagnostics: Diagnostic[];
}

interface ExpressionValidationOptions {
  readonly indexes: SemanticIndexes;
  readonly expression: ExpressionAst;
  readonly pointer: string;
  readonly diagnostics: Diagnostic[];
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function validateTypedValueReferences({
  indexes,
  value,
  pointer,
  diagnostics,
}: ValueValidationOptions): void {
  if (value.type === 'asset' && !indexes.assets.has(value.assetId)) {
    diagnostics.push(
      createSemanticError('resource.missing-reference', 'Asset does not resolve', `${pointer}/assetId`),
    );
  }

  if (value.type === 'color' && value.value.kind === 'swatch' && !indexes.swatches.has(value.value.swatchId)) {
    diagnostics.push(
      createSemanticError(
        'resource.missing-reference',
        'Swatch does not resolve',
        `${pointer}/value/swatchId`,
      ),
    );
  }

  if (value.type === 'list') {
    value.items.forEach((item, index) => {
      validateTypedValueReferences({ indexes, value: item, pointer: `${pointer}/items/${String(index)}`, diagnostics });
    });
  }

  if (value.type === 'object') {
    Object.entries(value.fields).forEach(([fieldId, item]) => {
      validateTypedValueReferences({
        indexes,
        value: item,
        pointer: `${pointer}/fields/${escapePointerSegment(fieldId)}`,
        diagnostics,
      });
    });
  }
}

function validateExpressionReferences({
  indexes,
  expression,
  pointer,
  diagnostics,
}: ExpressionValidationOptions): void {
  if (expression.kind === 'literal') {
    validateTypedValueReferences({ indexes, value: expression.value, pointer: `${pointer}/value`, diagnostics });

    return;
  }

  if (expression.kind === 'unary') {
    validateExpressionReferences({ indexes, expression: expression.operand, pointer: `${pointer}/operand`, diagnostics });

    return;
  }

  if (expression.kind === 'binary') {
    validateExpressionReferences({ indexes, expression: expression.left, pointer: `${pointer}/left`, diagnostics });
    validateExpressionReferences({ indexes, expression: expression.right, pointer: `${pointer}/right`, diagnostics });

    return;
  }

  if (expression.kind === 'conditional') {
    validateExpressionReferences({ indexes, expression: expression.condition, pointer: `${pointer}/condition`, diagnostics });
    validateExpressionReferences({ indexes, expression: expression.whenTrue, pointer: `${pointer}/whenTrue`, diagnostics });
    validateExpressionReferences({ indexes, expression: expression.whenFalse, pointer: `${pointer}/whenFalse`, diagnostics });

    return;
  }

  if (expression.kind === 'get') {
    validateExpressionReferences({ indexes, expression: expression.source, pointer: `${pointer}/source`, diagnostics });

    return;
  }

  if (expression.kind === 'index') {
    validateExpressionReferences({ indexes, expression: expression.source, pointer: `${pointer}/source`, diagnostics });
    validateExpressionReferences({ indexes, expression: expression.index, pointer: `${pointer}/index`, diagnostics });

    return;
  }

  if (expression.kind === 'safe-function') {
    expression.arguments.forEach((argument, index) => {
      validateExpressionReferences({
        indexes,
        expression: argument,
        pointer: `${pointer}/arguments/${String(index)}`,
        diagnostics,
      });
    });
  }
}

function validateElementValues(
  indexes: SemanticIndexes,
  element: Element,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (element.kind !== 'component-instance') return;

  element.propertyValues.forEach((propertyValue, index) => {
    validateTypedValueReferences({
      indexes,
      value: propertyValue.value,
      pointer: `${pointer}/propertyValues/${String(index)}/value`,
      diagnostics,
    });
  });
}

function validateSequenceValues(
  indexes: SemanticIndexes,
  sequence: Sequence,
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  sequence.tracks.forEach((track, trackIndex) => {
    track.keyframes.forEach((keyframe, keyframeIndex) => {
      validateTypedValueReferences({
        indexes,
        value: keyframe.value,
        pointer: `${pointer}/tracks/${String(trackIndex)}/keyframes/${String(keyframeIndex)}/value`,
        diagnostics,
      });
    });
  });
  sequence.cues.forEach((cue, cueIndex) => {
    if (cue.kind === 'event' && cue.payload !== undefined) {
      validateTypedValueReferences({
        indexes,
        value: cue.payload,
        pointer: `${pointer}/cues/${String(cueIndex)}/payload`,
        diagnostics,
      });
    }
  });
}

function validateComponentValues(
  indexes: SemanticIndexes,
  component: SemanticIndexes['project']['documents'][number]['components'][number],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  component.exposedProperties.forEach((property, propertyIndex) => {
    const propertyPointer = `${pointer}/exposedProperties/${String(propertyIndex)}`;

    validateTypedValueReferences({
      indexes,
      value: property.defaultValue,
      pointer: `${propertyPointer}/defaultValue`,
      diagnostics,
    });
    property.constraints.forEach((constraint, constraintIndex) => {
      if (constraint.kind !== 'allowed-values') return;
      constraint.values.forEach((value, valueIndex) => {
        validateTypedValueReferences({
          indexes,
          value,
          pointer: `${propertyPointer}/constraints/${String(constraintIndex)}/values/${String(valueIndex)}`,
          diagnostics,
        });
      });
    });
  });
  component.elements.forEach((element, index) => {
    validateElementValues(indexes, element, `${pointer}/elements/${String(index)}`, diagnostics);
  });
  component.sequences.forEach((sequence, index) => {
    validateSequenceValues(indexes, sequence, `${pointer}/sequences/${String(index)}`, diagnostics);
  });
}

function validateBindingValues(
  indexes: SemanticIndexes,
  binding: SemanticIndexes['project']['documents'][number]['bindings'][number],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  validateExpressionReferences({ indexes, expression: binding.expression, pointer: `${pointer}/expression`, diagnostics });
  binding.formatter?.steps.forEach((step, stepIndex) => {
    step.arguments.forEach((argument, argumentIndex) => {
      validateTypedValueReferences({
        indexes,
        value: argument,
        pointer: `${pointer}/formatter/steps/${String(stepIndex)}/arguments/${String(argumentIndex)}`,
        diagnostics,
      });
    });
  });

  if (binding.fallback !== undefined) {
    validateTypedValueReferences({ indexes, value: binding.fallback, pointer: `${pointer}/fallback`, diagnostics });
  }
}

function validateDocumentValues(
  indexes: SemanticIndexes,
  document: SemanticIndexes['project']['documents'][number],
  documentIndex: number,
  diagnostics: Diagnostic[],
): void {
  const pointer = `/documents/${String(documentIndex)}`;

  document.viewModels.forEach((viewModel, viewModelIndex) => {
    const viewModelPointer = `${pointer}/viewModels/${String(viewModelIndex)}`;
    const fields = new Map<string, (typeof viewModel.fields)[number]>(viewModel.fields.map((field) => [field.id, field]));

    viewModel.fields.forEach((field, fieldIndex) => {
      if (field.defaultValue !== undefined) {
        const valuePointer = `${viewModelPointer}/fields/${String(fieldIndex)}/defaultValue`;

        validateTypedValueReferences({
          indexes,
          value: field.defaultValue,
          pointer: valuePointer,
          diagnostics,
        });
        if (!typedValueMatchesResolvedAssetConstraints(indexes, field.defaultValue, field.schema)) diagnostics.push(createSemanticError('data.incompatible-media-type', 'Asset kind or media type is not accepted by the field schema', valuePointer));
      }
    });
    viewModel.sampleDataSets.forEach((sample, sampleIndex) => {
      Object.entries(sample.values).forEach(([fieldId, value]) => {
        const valuePointer = `${viewModelPointer}/sampleDataSets/${String(sampleIndex)}/values/${escapePointerSegment(fieldId)}`;
        const field = fields.get(fieldId);

        validateTypedValueReferences({
          indexes,
          value,
          pointer: valuePointer,
          diagnostics,
        });
        if (field !== undefined && !typedValueMatchesResolvedAssetConstraints(indexes, value, field.schema)) diagnostics.push(createSemanticError('data.incompatible-media-type', 'Asset kind or media type is not accepted by the field schema', valuePointer));
      });
    });
  });
  document.elements.forEach((element, index) => {
    validateElementValues(indexes, element, `${pointer}/elements/${String(index)}`, diagnostics);
  });
  document.components.forEach((component, index) => {
    validateComponentValues(indexes, component, `${pointer}/components/${String(index)}`, diagnostics);
  });
  document.pages.forEach((page, pageIndex) => {
    const pagePointer = `${pointer}/pages/${String(pageIndex)}`;

    page.rootInstances.forEach((root, rootIndex) => {
      const rootPointer = `${pagePointer}/rootInstances/${String(rootIndex)}`;

      root.componentPropertyValues.forEach((propertyValue, propertyIndex) => {
        validateTypedValueReferences({
          indexes,
          value: propertyValue.value,
          pointer: `${rootPointer}/componentPropertyValues/${String(propertyIndex)}/value`,
          diagnostics,
        });
      });
      root.overrides.forEach((override, overrideIndex) => {
        validateTypedValueReferences({
          indexes,
          value: override.value,
          pointer: `${rootPointer}/overrides/${String(overrideIndex)}/value`,
          diagnostics,
        });
      });
    });
    page.descendantOverrides.forEach((descendant, descendantIndex) => {
      descendant.overrides.forEach((override, overrideIndex) => {
        validateTypedValueReferences({
          indexes,
          value: override.value,
          pointer: `${pagePointer}/descendantOverrides/${String(descendantIndex)}/overrides/${String(overrideIndex)}/value`,
          diagnostics,
        });
      });
    });
  });
  document.bindings.forEach((binding, index) => {
    validateBindingValues(indexes, binding, `${pointer}/bindings/${String(index)}`, diagnostics);
  });
  document.sequences.forEach((sequence, index) => {
    validateSequenceValues(indexes, sequence, `${pointer}/sequences/${String(index)}`, diagnostics);
  });
  document.stateMachines.forEach((machine, machineIndex) => {
    const machinePointer = `${pointer}/stateMachines/${String(machineIndex)}`;

    machine.states.forEach((state, stateIndex) => {
      state.values.forEach((stateValue, valueIndex) => {
        validateTypedValueReferences({
          indexes,
          value: stateValue.value,
          pointer: `${machinePointer}/states/${String(stateIndex)}/values/${String(valueIndex)}/value`,
          diagnostics,
        });
      });
    });
    machine.transitions.forEach((transition, transitionIndex) => {
      if (transition.guard !== undefined) {
        validateExpressionReferences({
          indexes,
          expression: transition.guard,
          pointer: `${machinePointer}/transitions/${String(transitionIndex)}/guard`,
          diagnostics,
        });
      }
    });
  });
}

export function validateProjectTypedValueReferences(indexes: SemanticIndexes, diagnostics: Diagnostic[]): void {
  indexes.project.resources.variables.forEach((collection, collectionIndex) => {
    collection.variables.forEach((variable, variableIndex) => {
      Object.entries(variable.valuesByMode).forEach(([modeId, value]) => {
        validateTypedValueReferences({
          indexes,
          value,
          pointer: `/resources/variables/${String(collectionIndex)}/variables/${String(variableIndex)}/valuesByMode/${escapePointerSegment(modeId)}`,
          diagnostics,
        });
      });
    });
  });
  indexes.project.resources.styles.forEach((style, styleIndex) => {
    if (style.source.kind !== 'properties') return;
    style.source.entries.forEach((entry, entryIndex) => {
      validateTypedValueReferences({
        indexes,
        value: entry.value,
        pointer: `/resources/styles/${String(styleIndex)}/source/entries/${String(entryIndex)}/value`,
        diagnostics,
      });
    });
  });
  indexes.project.documents.forEach((document, index) => {
    validateDocumentValues(indexes, document, index, diagnostics);
  });
}
