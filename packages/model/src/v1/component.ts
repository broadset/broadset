import { z } from 'zod';

import { type ValueSchema, valueSchemaSchema } from './data';
import { type Element, elementSchema } from './element';
import { type Id, idSchema, type PropertyTarget, propertyTargetSchema } from './identity';
import { type ExtensionEnvelope, extensionEnvelopeSchema } from './json-value';
import { nonEmptyStringSchema, nonNegativeSafeIntegerSchema } from './schema-helpers';
import { type Sequence, sequenceSchema } from './sequence';
import { type TypedValue, typedValueSchema } from './typed-value';

export type ComponentElement = Element;

export type ExposedPropertyConstraint =
  | {
      readonly kind: 'numeric-range';
      readonly minimum?: number | undefined;
      readonly maximum?: number | undefined;
      readonly step?: number | undefined;
    }
  | {
      readonly kind: 'string-length';
      readonly minimum?: number | undefined;
      readonly maximum?: number | undefined;
    }
  | { readonly kind: 'allowed-values'; readonly values: readonly TypedValue[] };

export interface ExposedPropertyBinding {
  readonly id: Id;
  readonly target: PropertyTarget;
}

export interface ExposedProperty {
  readonly id: Id;
  readonly label: string;
  readonly group: string;
  readonly valueSchema: ValueSchema;
  readonly defaultValue: TypedValue;
  readonly constraints: readonly ExposedPropertyConstraint[];
  readonly bindings: readonly ExposedPropertyBinding[];
}

export interface ComponentDefinition {
  readonly id: Id;
  readonly name: string;
  readonly elements: readonly ComponentElement[];
  readonly rootElementIds: readonly Id[];
  readonly sequences: readonly Sequence[];
  readonly exposedProperties: readonly ExposedProperty[];
  readonly extensions: readonly ExtensionEnvelope[];
}

const numericRangeConstraintSchema = z.strictObject({
  kind: z.literal('numeric-range'),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  step: z.number().positive().optional(),
});

const stringLengthConstraintSchema = z.strictObject({
  kind: z.literal('string-length'),
  minimum: nonNegativeSafeIntegerSchema.optional(),
  maximum: nonNegativeSafeIntegerSchema.optional(),
});

export const exposedPropertyConstraintSchema: z.ZodType<ExposedPropertyConstraint> = z.discriminatedUnion('kind', [
  numericRangeConstraintSchema,
  stringLengthConstraintSchema,
  z.strictObject({ kind: z.literal('allowed-values'), values: z.array(typedValueSchema).min(1) }),
]);

export const exposedPropertyBindingSchema: z.ZodType<ExposedPropertyBinding> = z.strictObject({
  id: idSchema,
  target: propertyTargetSchema,
});

export const exposedPropertySchema: z.ZodType<ExposedProperty> = z.strictObject({
  id: idSchema,
  label: nonEmptyStringSchema,
  group: nonEmptyStringSchema,
  valueSchema: valueSchemaSchema,
  defaultValue: typedValueSchema,
  constraints: z.array(exposedPropertyConstraintSchema),
  bindings: z.array(exposedPropertyBindingSchema).min(1),
});

export const componentDefinitionSchema: z.ZodType<ComponentDefinition> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  elements: z.array(elementSchema),
  rootElementIds: z.array(idSchema),
  sequences: z.array(sequenceSchema),
  exposedProperties: z.array(exposedPropertySchema),
  extensions: z.array(extensionEnvelopeSchema),
});
