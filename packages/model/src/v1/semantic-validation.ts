import type { ComponentDefinition } from './component';
import { typedValueMatchesSchema, valueSchemaValueType } from './data';
import type { Diagnostic } from './diagnostics';
import type { Element } from './element';
import type { Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import { createComponentAddressScope } from './resolved-address';
import type { VariableDefinition } from './resources';
import { createSemanticIndexes, type DocumentSemanticIndex, type SemanticIndexes } from './semantic-index';
import { validateElementReferences } from './semantic-validation-element';
import {
  validateAdditionalResources,
  validateInterop,
  validateOutputProfiles,
  validateTemplateGroups,
} from './semantic-validation-final';
import {
  compareCodeUnits,
  createSemanticError,
  findDuplicateIdDiagnostics,
  semanticValueKey,
  typedValueMatchesResolvedAssetConstraints,
  typedValueSatisfiesConstraints,
  validateHierarchy,
  valueSchemaMatchesTargetContract,
} from './semantic-validation-helpers';
import { validateGlobalIdentities } from './semantic-validation-identities';
import { validatePagesAndBindings } from './semantic-validation-pages';
import { validateSequences } from './semantic-validation-sequences';
import { validateProjectTypedValueReferences } from './semantic-validation-typed-values';
import { resolvePropertyTargetContractInScope } from './target-resolution';
import type { TypedValue } from './typed-value';

type DiagnosticList = Diagnostic[];

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

function validateAssetReference(
  indexes: SemanticIndexes,
  assetId: Id,
  kinds: readonly BroadsetProjectV1['resources']['assets'][number]['kind'][],
  pointer: string,
  diagnostics: DiagnosticList,
): void {
  const asset = indexes.assets.get(assetId);

  if (asset === undefined) {
    diagnostics.push(createSemanticError('resource.missing-reference', 'Asset does not resolve', pointer));
  } else if (!kinds.includes(asset.kind)) {
    diagnostics.push(createSemanticError('resource.wrong-kind', `Expected ${kinds.join(' or ')} asset`, pointer));
  }
}

function validateElementResources(
  indexes: SemanticIndexes,
  element: Element,
  pointer: string,
  diagnostics: DiagnosticList,
): void {
  if (element.kind === 'image')
    validateAssetReference(indexes, element.image.assetId, ['image'], `${pointer}/image/assetId`, diagnostics);
  if (element.kind === 'video')
    validateAssetReference(indexes, element.video.assetId, ['video'], `${pointer}/video/assetId`, diagnostics);
  if (element.kind === 'audio')
    validateAssetReference(indexes, element.audio.assetId, ['audio'], `${pointer}/audio/assetId`, diagnostics);
  if (element.kind === 'foreign')
    validateAssetReference(
      indexes,
      element.foreign.previewAssetId,
      ['image', 'vector'],
      `${pointer}/foreign/previewAssetId`,
      diagnostics,
    );
  if (element.kind === 'plugin' && element.plugin.previewAssetId !== undefined)
    validateAssetReference(
      indexes,
      element.plugin.previewAssetId,
      ['image', 'vector'],
      `${pointer}/plugin/previewAssetId`,
      diagnostics,
    );

  element.sharedStyleIds.forEach((styleId, index) => {
    if (!indexes.styles.has(styleId))
      diagnostics.push(
        createSemanticError(
          'resource.missing-reference',
          'Shared style does not resolve',
          `${pointer}/sharedStyleIds/${String(index)}`,
        ),
      );
  });

  element.appearance.fills.forEach((layer, index) => {
    if (layer.paint.kind === 'picture' || layer.paint.kind === 'pattern')
      validateAssetReference(
        indexes,
        layer.paint.assetId,
        ['image', 'vector'],
        `${pointer}/appearance/fills/${String(index)}/paint/assetId`,
        diagnostics,
      );
  });
  element.appearance.strokes.forEach((layer, index) => {
    if (layer.paint.kind === 'picture' || layer.paint.kind === 'pattern')
      validateAssetReference(
        indexes,
        layer.paint.assetId,
        ['image', 'vector'],
        `${pointer}/appearance/strokes/${String(index)}/paint/assetId`,
        diagnostics,
      );
  });
  element.appearance.effects.forEach((effect, index) => {
    if (effect.kind === 'displacement')
      validateAssetReference(
        indexes,
        effect.assetId,
        ['image'],
        `${pointer}/appearance/effects/${String(index)}/assetId`,
        diagnostics,
      );
  });
  if (element.appearance.mask?.kind === 'asset')
    validateAssetReference(
      indexes,
      element.appearance.mask.assetId,
      ['image'],
      `${pointer}/appearance/mask/assetId`,
      diagnostics,
    );
}

function validateResources(indexes: SemanticIndexes, diagnostics: DiagnosticList): void {
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.resources.assets, '/resources/assets'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.resources.fonts, '/resources/fonts'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.resources.swatches, '/resources/swatches'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.resources.variables, '/resources/variables'));
  diagnostics.push(...findDuplicateIdDiagnostics(indexes.project.resources.styles, '/resources/styles'));
  diagnostics.push(
    ...findDuplicateIdDiagnostics(indexes.project.resources.outputProfiles, '/resources/outputProfiles'),
  );

  indexes.project.resources.assets.forEach((asset, index) => {
    if (asset.kind === 'image' && asset.metadata.iccProfileAssetId !== undefined)
      validateAssetReference(
        indexes,
        asset.metadata.iccProfileAssetId,
        ['icc-profile'],
        `/resources/assets/${String(index)}/metadata/iccProfileAssetId`,
        diagnostics,
      );
    if ((asset.kind === 'vector' || asset.kind === 'foreign') && asset.metadata.safePreviewAssetId !== undefined)
      validateAssetReference(
        indexes,
        asset.metadata.safePreviewAssetId,
        ['image', 'vector'],
        `/resources/assets/${String(index)}/metadata/safePreviewAssetId`,
        diagnostics,
      );
  });
  indexes.documentList.forEach(({ document }, documentIndex) => {
    document.elements.forEach((element, index) => {
      const pointer = `/documents/${String(documentIndex)}/elements/${String(index)}`;

      validateElementResources(
        indexes,
        element,
        pointer,
        diagnostics,
      );
      validateElementReferences(indexes, document.elements, element, pointer, diagnostics);
    });
    document.components.forEach((component, componentIndex) => {
      component.elements.forEach((element, elementIndex) => {
        const pointer = `/documents/${String(documentIndex)}/components/${String(componentIndex)}/elements/${String(elementIndex)}`;

        validateElementResources(
          indexes,
          element,
          pointer,
          diagnostics,
        );
        validateElementReferences(indexes, component.elements, element, pointer, diagnostics);
      });
    });
    if (document.color.workingSpace.kind === 'icc')
      validateAssetReference(
        indexes,
        document.color.workingSpace.iccProfileAssetId,
        ['icc-profile'],
        `/documents/${String(documentIndex)}/color/workingSpace/iccProfileAssetId`,
        diagnostics,
      );
    if (document.color.outputIntent !== undefined)
      validateAssetReference(
        indexes,
        document.color.outputIntent.iccProfileAssetId,
        ['icc-profile'],
        `/documents/${String(documentIndex)}/color/outputIntent/iccProfileAssetId`,
        diagnostics,
      );
  });
  validateAdditionalResources(indexes, diagnostics);
}

function validateHierarchies(indexes: SemanticIndexes, diagnostics: DiagnosticList): void {
  indexes.documentList.forEach(({ document }, documentIndex) => {
    diagnostics.push(...validateHierarchy(document.elements, `/documents/${String(documentIndex)}/elements`));
    document.components.forEach((component, componentIndex) =>
      diagnostics.push(
        ...validateHierarchy(
          component.elements,
          `/documents/${String(documentIndex)}/components/${String(componentIndex)}/elements`,
        ),
      ),
    );
  });
}

function componentDependsOn(
  document: DocumentSemanticIndex,
  startId: Id,
  targetId: Id,
  seen: ReadonlySet<Id>,
): boolean {
  if (seen.has(startId)) return false;

  const component = document.components.get(startId)?.component;

  if (component === undefined) return false;

  const nextSeen = new Set([...seen, startId]);

  return component.elements.some(
    (element) =>
      element.kind === 'component-instance' &&
      (element.componentId === targetId || componentDependsOn(document, element.componentId, targetId, nextSeen)),
  );
}

function validateComponentPropertyValues(
  indexes: SemanticIndexes,
  definition: ComponentDefinition,
  values: readonly { readonly exposedPropertyId: Id; readonly value: TypedValue }[],
  pointer: string,
  diagnostics: DiagnosticList,
): void {
  values.forEach((value, index) => {
    const property = definition.exposedProperties.find((candidate) => candidate.id === value.exposedPropertyId);
    const valuePointer = `${pointer}/${String(index)}`;

    if (property === undefined) {
      diagnostics.push(
        createSemanticError(
          'component.unknown-exposed-property',
          'Exposed property does not resolve',
          `${valuePointer}/exposedPropertyId`,
        ),
      );
    } else if (
      !typedValueMatchesSchema(value.value, property.valueSchema) ||
      !typedValueMatchesResolvedAssetConstraints(indexes, value.value, property.valueSchema) ||
      !typedValueSatisfiesConstraints(value.value, property.constraints)
    ) {
      diagnostics.push(
        createSemanticError(
          'component.incompatible-property-value',
          'Component property value is incompatible',
          `${valuePointer}/value`,
        ),
      );
    }
  });
}

function validateComponents(indexes: SemanticIndexes, diagnostics: DiagnosticList): void {
  indexes.documentList.forEach((documentIndex, documentPosition) => {
    documentIndex.document.elements.forEach((element, elementPosition) => {
      if (element.kind !== 'component-instance') return;

      const definition = documentIndex.components.get(element.componentId)?.component;
      const pointer = `/documents/${String(documentPosition)}/elements/${String(elementPosition)}`;

      if (definition === undefined) {
        diagnostics.push(
          createSemanticError('component.missing-reference', 'Component does not resolve', `${pointer}/componentId`),
        );
      } else {
        validateComponentPropertyValues(indexes, definition, element.propertyValues, `${pointer}/propertyValues`, diagnostics);
      }
    });
    documentIndex.document.components.forEach((component, componentPosition) => {
      const base = `/documents/${String(documentPosition)}/components/${String(componentPosition)}`;

      diagnostics.push(...findDuplicateIdDiagnostics(component.elements, `${base}/elements`));
      diagnostics.push(...findDuplicateIdDiagnostics(component.sequences, `${base}/sequences`));

      const seenRootIds = new Set<Id>();

      component.rootElementIds.forEach((id, index) => {
        const root = documentIndex.components.get(component.id)?.elements.get(id);

        if (seenRootIds.has(id)) {
          diagnostics.push(
            createSemanticError('identity.duplicate', 'Duplicate component root ID', `${base}/rootElementIds/${String(index)}`),
          );
        }

        seenRootIds.add(id);

        if (root?.parentId !== null)
          diagnostics.push(
            createSemanticError(
              'component.invalid-root',
              'Component root must resolve to a root element',
              `${base}/rootElementIds/${String(index)}`,
            ),
          );
      });
      component.elements.forEach((element, elementPosition) => {
        if (element.parentId === null && !seenRootIds.has(element.id)) {
          diagnostics.push(
            createSemanticError(
              'component.missing-root',
              'Every component-local root must appear exactly once',
              `${base}/elements/${String(elementPosition)}/id`,
            ),
          );
        }
      });
      component.elements.forEach((element, elementPosition) => {
        if (element.kind !== 'component-instance') return;

        const pointer = `${base}/elements/${String(elementPosition)}/componentId`;
        const definition = documentIndex.components.get(element.componentId)?.component;

        if (definition === undefined) {
          diagnostics.push(createSemanticError('component.missing-reference', 'Component does not resolve', pointer));
        } else {
          validateComponentPropertyValues(
            indexes,
            definition,
            element.propertyValues,
            `${base}/elements/${String(elementPosition)}/propertyValues`,
            diagnostics,
          );
        }

        if (
          definition !== undefined &&
          (
          element.componentId === component.id ||
          componentDependsOn(documentIndex, element.componentId, component.id, new Set())
          )
        ) {
          diagnostics.push(createSemanticError('component.cycle', 'Component dependency cycle', pointer));
        }
      });
      component.exposedProperties.forEach((property, propertyPosition) => {
        const propertyBase = `${base}/exposedProperties/${String(propertyPosition)}`;

        if (
          !typedValueMatchesSchema(property.defaultValue, property.valueSchema) ||
          !typedValueMatchesResolvedAssetConstraints(indexes, property.defaultValue, property.valueSchema) ||
          !typedValueSatisfiesConstraints(property.defaultValue, property.constraints)
        )
          diagnostics.push(
            createSemanticError(
              'component.incompatible-default',
              'Default does not match value schema',
              `${propertyBase}/defaultValue`,
            ),
          );
        property.constraints.forEach((constraint, constraintPosition) => {
          const schemaType = valueSchemaValueType(property.valueSchema);
          const constraintPointer = `${propertyBase}/constraints/${String(constraintPosition)}`;

          if (
            (constraint.kind === 'numeric-range' && schemaType !== 'number' && schemaType !== 'integer') ||
            (constraint.kind === 'string-length' && schemaType !== 'string')
          ) {
            diagnostics.push(
              createSemanticError(
                'component.incompatible-constraint',
                'Constraint kind is incompatible with value schema',
                constraintPointer,
              ),
            );
          }

          if (constraint.kind === 'allowed-values') {
            const seen = new Set<string>();

            constraint.values.forEach((value, valuePosition) => {
              const key = semanticValueKey(value);

              if (!typedValueMatchesSchema(value, property.valueSchema) || !typedValueMatchesResolvedAssetConstraints(indexes, value, property.valueSchema))
                diagnostics.push(
                  createSemanticError(
                    'component.incompatible-constraint',
                    'Allowed value does not match schema',
                    `${propertyBase}/constraints/${String(constraintPosition)}/values/${String(valuePosition)}`,
                  ),
                );
              if (seen.has(key))
                diagnostics.push(
                  createSemanticError(
                    'component.duplicate-allowed-value',
                    'Duplicate allowed value',
                    `${propertyBase}/constraints/${String(constraintPosition)}/values/${String(valuePosition)}`,
                  ),
                );
              seen.add(key);
            });
          }
        });
        property.bindings.forEach((binding, bindingPosition) => {
          const componentIndex = documentIndex.components.get(component.id);
          const expected =
            componentIndex === undefined
              ? undefined
              : resolvePropertyTargetContractInScope(
                  createComponentAddressScope(documentIndex, componentIndex),
                  binding.target,
                );
          const pointer = `${propertyBase}/bindings/${String(bindingPosition)}/target`;

          if (expected === undefined) {
            diagnostics.push(
              createSemanticError(
                'component.target-outside-scope',
                'Exposed-property target is outside its component scope or invalid',
                pointer,
              ),
            );
          } else if (!valueSchemaMatchesTargetContract(property.valueSchema, expected)) {
            diagnostics.push(
              createSemanticError(
                'component.incompatible-binding',
                'Exposed-property binding is incompatible',
                pointer,
              ),
            );
          }
        });
      });
    });
  });
}

function validateVariables(indexes: SemanticIndexes, diagnostics: DiagnosticList): void {
  indexes.project.resources.variables.forEach((collection, collectionIndex) => {
    collection.variables.forEach((variable, variableIndex) => {
      if (variable.aliasOf === undefined) return;

      const pointer = `/resources/variables/${String(collectionIndex)}/variables/${String(variableIndex)}/aliasOf`;
      const seen = new Set<string>([`${collection.id}\u0000${variable.id}`]);
      let alias: { readonly collectionId: Id; readonly variableId: Id } | undefined = variable.aliasOf;

      while (alias !== undefined) {
        const currentAlias: { readonly collectionId: Id; readonly variableId: Id } = alias;
        const key = `${currentAlias.collectionId}\u0000${currentAlias.variableId}`;
        const targetCollection = indexes.variables.get(currentAlias.collectionId);
        const target: VariableDefinition | undefined = targetCollection?.variables.find(
          (candidate) => candidate.id === currentAlias.variableId,
        );

        if (target === undefined) {
          diagnostics.push(createSemanticError('variable.missing-alias', 'Variable alias does not resolve', pointer));
          break;
        }

        if (target.valueType !== variable.valueType)
          diagnostics.push(createSemanticError('variable.incompatible-alias', 'Variable alias type mismatch', pointer));

        if (seen.has(key)) {
          diagnostics.push(createSemanticError('variable.alias-cycle', 'Variable alias cycle', pointer));
          break;
        }

        seen.add(key);
        alias = target.aliasOf;
      }
    });
  });
  indexes.documentList.forEach(({ document }, documentIndex) => {
    const validateSelections = (selections: Readonly<Record<Id, Id>>, pointer: string): void => {
      Object.entries(selections).forEach(([collectionId, modeId]) => {
        const collection = indexes.project.resources.variables.find((candidate) => candidate.id === collectionId);

        if (!collection?.modes.some((mode) => mode.id === modeId)) {
          diagnostics.push(
            createSemanticError(
              'variable.invalid-mode-selection',
              'Variable collection or mode does not resolve',
              `${pointer}/${escapePointerSegment(collectionId)}`,
            ),
          );
        }
      });
    };

    validateSelections(document.selectedVariableModes, `/documents/${String(documentIndex)}/selectedVariableModes`);
    document.pages.forEach((page, pageIndex) => {
      validateSelections(
        page.selectedVariableModes,
        `/documents/${String(documentIndex)}/pages/${String(pageIndex)}/selectedVariableModes`,
      );
    });
  });
}

export function validateBroadsetProjectV1Semantics(project: BroadsetProjectV1): readonly Diagnostic[] {
  const indexes = createSemanticIndexes(project);
  const diagnostics: DiagnosticList = [];

  validateGlobalIdentities(indexes, diagnostics);
  validateResources(indexes, diagnostics);
  validateProjectTypedValueReferences(indexes, diagnostics);
  validateHierarchies(indexes, diagnostics);
  validateComponents(indexes, diagnostics);
  validateVariables(indexes, diagnostics);
  validatePagesAndBindings(indexes, diagnostics);
  validateSequences(indexes, diagnostics);
  validateOutputProfiles(indexes, diagnostics);
  validateTemplateGroups(indexes, diagnostics);
  validateInterop(indexes, diagnostics);

  return [...diagnostics].sort(
    (left, right) =>
      compareCodeUnits(left.pointer ?? '', right.pointer ?? '') || compareCodeUnits(left.code, right.code),
  );
}
