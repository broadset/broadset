import type { ExposedPropertyConstraint } from './component';
import type { ValueSchema } from './data';
import { isExactDecimalStepAligned } from './decimal-step';
import type { Diagnostic } from './diagnostics';
import type { Element } from './element';
import type { Id } from './identity';
import type { SemanticIndexes } from './semantic-index';
import type { PropertyTargetContract } from './target-resolution';
import type { TypedValue, ValueType } from './typed-value';

export function createSemanticError(code: string, message: string, pointer: string): Diagnostic {
  return { code, severity: 'error', message, pointer };
}

export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

export function findDuplicateIdDiagnostics(
  items: readonly { readonly id: Id }[],
  pointer: string,
): readonly Diagnostic[] {
  const seen = new Set<Id>();
  const diagnostics: Diagnostic[] = [];

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      diagnostics.push(
        createSemanticError('identity.duplicate', `Duplicate ID: ${item.id}`, `${pointer}/${String(index)}/id`),
      );
    }

    seen.add(item.id);
  });

  return diagnostics;
}

function hasParentCycle(element: Element, elements: ReadonlyMap<Id, Element>): boolean {
  const seen = new Set<Id>([element.id]);
  let parentId = element.parentId;

  while (parentId !== null) {
    if (seen.has(parentId)) return true;
    seen.add(parentId);
    parentId = elements.get(parentId)?.parentId ?? null;
  }

  return false;
}

export function validateHierarchy(elements: readonly Element[], pointer: string): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const byId = new Map(elements.map((element) => [element.id, element]));
  const activeAncestors: Id[] = [];

  elements.forEach((element, index) => {
    const parentPointer = `${pointer}/${String(index)}/parentId`;

    if (element.parentId === null) {
      activeAncestors.length = 0;
    } else if (!byId.has(element.parentId)) {
      diagnostics.push(createSemanticError('hierarchy.orphan-parent', 'Parent does not resolve', parentPointer));
    } else {
      const parentIndex = elements.findIndex((candidate) => candidate.id === element.parentId);
      const activeIndex = activeAncestors.lastIndexOf(element.parentId);

      if (parentIndex >= index || activeIndex < 0) {
        diagnostics.push(
          createSemanticError('hierarchy.non-preorder', 'Hierarchy is not contiguous preorder', parentPointer),
        );
      } else {
        activeAncestors.length = activeIndex + 1;
      }
    }

    if (hasParentCycle(element, byId)) {
      diagnostics.push(createSemanticError('hierarchy.cycle', 'Element parent cycle', parentPointer));
    }

    activeAncestors.push(element.id);
  });

  return diagnostics;
}

export function valueTypesCompatible(actual: ValueType, expected: ValueType): boolean {
  return actual === expected || (actual === 'integer' && expected === 'number');
}

export function typedValueMatchesType(value: TypedValue, expected: ValueType): boolean {
  return valueTypesCompatible(value.type, expected);
}

export function typedValueMatchesTargetContract(
  indexes: SemanticIndexes,
  value: TypedValue,
  contract: PropertyTargetContract,
): boolean {
  if (!typedValueMatchesType(value, contract.valueType)) return false;
  if (value.type !== 'asset' || contract.assetKinds === undefined) return true;

  const asset = indexes.assets.get(value.assetId);

  return asset === undefined || contract.assetKinds.includes(asset.kind);
}

function asciiLower(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function valueSchemaType(schema: ValueSchema): ValueType {
  if (schema.kind === 'array') return 'list';
  if (schema.kind === 'enum') return 'string';

  return schema.kind;
}

export function valueSchemaMatchesTargetContract(schema: ValueSchema, contract: PropertyTargetContract): boolean {
  const schemaType = valueSchemaType(schema);

  if (!valueTypesCompatible(schemaType, contract.valueType)) {
    return false;
  }

  if (schema.kind !== 'asset' || contract.assetKinds === undefined) return true;

  const targetKinds = contract.assetKinds;

  return schema.acceptedAssetKinds !== undefined && schema.acceptedAssetKinds.length > 0
    && schema.acceptedAssetKinds.every((kind) => targetKinds.includes(kind));
}

export function typedValueMatchesResolvedAssetConstraints(
  indexes: SemanticIndexes,
  value: TypedValue,
  schema: ValueSchema,
): boolean {
  if (schema.kind === 'asset' && value.type === 'asset') {
    const accepted = schema.acceptedMediaTypes;
    const asset = indexes.assets.get(value.assetId);

    return asset === undefined || (
      (schema.acceptedAssetKinds === undefined || schema.acceptedAssetKinds.includes(asset.kind))
      && (accepted === undefined || accepted.some((mediaType) => asciiLower(mediaType) === asciiLower(asset.blob.mediaType)))
    );
  }

  if (schema.kind === 'array' && value.type === 'list') {
    return value.items.every((item) => typedValueMatchesResolvedAssetConstraints(indexes, item, schema.items));
  }

  if (schema.kind === 'object' && value.type === 'object') {
    return schema.fields.every((field) => {
      const fieldValue = value.fields[field.id];

      return fieldValue === undefined || typedValueMatchesResolvedAssetConstraints(indexes, fieldValue, field.schema);
    });
  }

  return true;
}

export function semanticValueKey(value: TypedValue): string {
  if (value.type === 'asset') return JSON.stringify(['asset', value.assetId]);
  if (value.type === 'list') return JSON.stringify(['list', value.items.map(semanticValueKey)]);

  if (value.type === 'object') {
    const entries = Object.entries(value.fields)
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([key, item]) => [key, semanticValueKey(item)]);

    return JSON.stringify(['object', entries]);
  }

  return JSON.stringify([value.type, value.value]);
}

export function typedValueSatisfiesConstraints(
  value: TypedValue,
  constraints: readonly ExposedPropertyConstraint[],
): boolean {
  return constraints.every((constraint) => {
    if (constraint.kind === 'allowed-values') {
      const key = semanticValueKey(value);

      return constraint.values.some((allowed) => semanticValueKey(allowed) === key);
    }

    if (constraint.kind === 'string-length') {
      if (value.type !== 'string') return false;

      return (
        (constraint.minimum === undefined || value.value.length >= constraint.minimum) &&
        (constraint.maximum === undefined || value.value.length <= constraint.maximum)
      );
    }

    if (value.type !== 'number' && value.type !== 'integer') return false;
    if (constraint.minimum !== undefined && value.value < constraint.minimum) return false;
    if (constraint.maximum !== undefined && value.value > constraint.maximum) return false;
    if (constraint.step === undefined) return true;

    return isExactDecimalStepAligned(value.value, constraint.minimum ?? 0, constraint.step);
  });
}
