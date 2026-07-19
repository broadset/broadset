import { z } from 'zod';

import { type ElementTransform, elementTransformSchema, type ExposedPropertyValue } from './element';
import { type Id, idSchema, type PropertyTarget, propertyTargetSchema } from './identity';
import { type ExtensionEnvelope, extensionEnvelopeSchema } from './json-value';
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
  readonly selectedSampleDataSets: Readonly<Record<Id, Id>>;
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

const descendantOverrideSchema: z.ZodType<DescendantOverride> = z.strictObject({
  address: instanceAddressSchema,
  overrides: z.array(typedOverrideSchema),
});

const exposedPropertyValueSchema: z.ZodType<ExposedPropertyValue> = z.strictObject({
  exposedPropertyId: idSchema,
  value: typedValueSchema,
});

export const pageRootInstanceSchema: z.ZodType<PageRootInstance> = z.strictObject({
  id: idSchema,
  elementId: idSchema,
  visible: z.boolean().optional(),
  transform: elementTransformSchema.optional(),
  overrides: z.array(typedOverrideSchema),
  componentPropertyValues: z.array(exposedPropertyValueSchema),
});

export const pageDefinitionSchema: z.ZodType<PageDefinition> = z.strictObject({
  id: idSchema,
  name: z.string().min(1),
  locale: z.string().min(1).optional(),
  notes: textBodySchema.optional(),
  rootInstances: z.array(pageRootInstanceSchema),
  descendantOverrides: z.array(descendantOverrideSchema),
  selectedVariableModes: z.record(idSchema, idSchema),
  selectedSampleDataSets: z.record(idSchema, idSchema),
  sequenceId: idSchema.optional(),
  extensions: z.array(extensionEnvelopeSchema),
});
