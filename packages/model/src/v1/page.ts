import { z } from 'zod';

import { type ElementTransform, elementTransformSchema, type ExposedPropertyValue } from './element';
import { type EntityAddress, type Id, idSchema, type PropertyTarget, propertyTargetSchema } from './identity';
import { type ExtensionEnvelope, extensionEnvelopeSchema } from './json-value';
import { validateUniqueIds } from './schema-helpers';
import { type TextBody, textBodySchema } from './text';
import { type TypedValue, typedValueSchema } from './typed-value';

export interface TypedOverride {
  readonly target: PropertyTarget;
  readonly value: TypedValue;
}

export interface InstanceAddress {
  readonly rootInstanceId: Id;
  readonly componentInstancePath: readonly Id[];
  readonly elementId: Id;
}

export interface DescendantOverride {
  readonly address: InstanceAddress;
  readonly overrides: readonly TypedOverride[];
}

export interface PageRootInstance {
  readonly id: Id;
  readonly elementId: Id;
  readonly visible?: boolean | undefined;
  readonly transform?: ElementTransform | undefined;
  readonly overrides: readonly TypedOverride[];
  readonly componentPropertyValues: readonly ExposedPropertyValue[];
}

export interface PageDefinition {
  readonly id: Id;
  readonly name: string;
  readonly locale?: string | undefined;
  readonly notes?: TextBody | undefined;
  readonly rootInstances: readonly PageRootInstance[];
  readonly descendantOverrides: readonly DescendantOverride[];
  readonly selectedVariableModes: Readonly<Record<Id, Id>>;
  readonly sampleDataSetId?: Id | undefined;
  readonly sequenceId?: Id | undefined;
  readonly extensions: readonly ExtensionEnvelope[];
}

export const typedOverrideSchema: z.ZodType<TypedOverride> = z.strictObject({
  target: propertyTargetSchema,
  value: typedValueSchema,
});

export const instanceAddressSchema: z.ZodType<InstanceAddress> = z.strictObject({
  rootInstanceId: idSchema,
  componentInstancePath: z.array(idSchema),
  elementId: idSchema,
});

function sameIdPath(left: readonly Id[] | undefined, right: readonly Id[] | undefined): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }

  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sameEntityAddress(left: EntityAddress, right: EntityAddress): boolean {
  return (
    left.projectId === right.projectId &&
    left.documentId === right.documentId &&
    left.entityKind === right.entityKind &&
    left.entityId === right.entityId &&
    sameIdPath(left.instancePath, right.instancePath)
  );
}

function validateUniqueOverrideTargets(overrides: readonly TypedOverride[], context: z.RefinementCtx): void {
  overrides.forEach((override, index) => {
    const duplicate = overrides
      .slice(0, index)
      .some(
        (candidate) =>
          candidate.target.pointer === override.target.pointer && sameEntityAddress(candidate.target.entity, override.target.entity),
      );

    if (duplicate) {
      context.addIssue({ code: 'custom', message: 'Duplicate sparse override target', path: [index, 'target'] });
    }
  });
}

const descendantOverrideSchema: z.ZodType<DescendantOverride> = z.strictObject({
  address: instanceAddressSchema,
  overrides: z.array(typedOverrideSchema).superRefine(validateUniqueOverrideTargets),
});

const exposedPropertyValueSchema: z.ZodType<ExposedPropertyValue> = z.strictObject({
  exposedPropertyId: idSchema,
  value: typedValueSchema,
});

export const pageRootInstanceSchema: z.ZodType<PageRootInstance> = z
  .strictObject({
    id: idSchema,
    elementId: idSchema,
    visible: z.boolean().optional(),
    transform: elementTransformSchema.optional(),
    overrides: z.array(typedOverrideSchema).superRefine(validateUniqueOverrideTargets),
    componentPropertyValues: z.array(exposedPropertyValueSchema),
  })
  .superRefine((root, context) => {
    validateUniqueIds({
      items: root.componentPropertyValues.map(({ exposedPropertyId }) => ({ id: exposedPropertyId })),
      context,
      path: ['componentPropertyValues'],
    });
  });

function createInstanceAddressKey(address: InstanceAddress): string {
  return [address.rootInstanceId, ...address.componentInstancePath, address.elementId].join('\u0000');
}

export const pageDefinitionSchema: z.ZodType<PageDefinition> = z
  .strictObject({
    id: idSchema,
    name: z.string().min(1),
    locale: z.string().min(1).optional(),
    notes: textBodySchema.optional(),
    rootInstances: z.array(pageRootInstanceSchema),
    descendantOverrides: z.array(descendantOverrideSchema),
    selectedVariableModes: z.record(idSchema, idSchema),
    sampleDataSetId: idSchema.optional(),
    sequenceId: idSchema.optional(),
    extensions: z.array(extensionEnvelopeSchema),
  })
  .superRefine((page, context) => {
    validateUniqueIds({ items: page.rootInstances, context, path: ['rootInstances'] });

    const seenAddresses = new Set<string>();

    page.descendantOverrides.forEach((override, index) => {
      const key = createInstanceAddressKey(override.address);

      if (seenAddresses.has(key)) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate descendant instance address',
          path: ['descendantOverrides', index, 'address'],
        });
      }

      seenAddresses.add(key);
    });
  });
