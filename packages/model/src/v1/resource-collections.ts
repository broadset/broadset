import { z } from 'zod';

import { concreteColorValueSchema, type Swatch, type SwatchProducerAlias } from './color';
import { type Id, idSchema, jsonPointerSchema } from './identity';
import type {
  FontFaceResource,
  FontFamilyResource,
  SharedStyle,
  VariableCollection,
  VariableDefinition,
} from './resources';
import { typedValueSchema, valueTypeSchema } from './typed-value';

const nonEmptyStringSchema = z.string().min(1);
const finiteNumberSchema = z.number();
const axisTagSchema = z.string().regex(/^[ -~]{4}$/u);

function validateUniqueIds(items: readonly { readonly id: Id }[], context: z.RefinementCtx): void {
  const seen = new Set<Id>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({ code: 'custom', message: `Duplicate local ID: ${item.id}`, path: [index, 'id'] });
    }

    seen.add(item.id);
  });
}

const fontSourceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('asset'), assetId: idSchema }),
  z.strictObject({ kind: z.literal('system'), postScriptName: nonEmptyStringSchema }),
]);
const fontFaceResourceSchema: z.ZodType<FontFaceResource> = z.strictObject({
  id: idSchema,
  source: fontSourceSchema,
  weight: z.number().int().min(1).max(1000),
  style: z.enum(['normal', 'italic', 'oblique']),
  stretch: z.number().positive(),
  axes: z.record(axisTagSchema, finiteNumberSchema).optional(),
});

export const fontFamilyResourceSchema: z.ZodType<FontFamilyResource> = z
  .strictObject({
    id: idSchema,
    familyName: nonEmptyStringSchema,
    fallbackFontIds: z.array(idSchema),
    faces: z.array(fontFaceResourceSchema),
  })
  .superRefine((font, context) => {
    validateUniqueIds(font.faces, context);
    validateUniqueIds(
      font.fallbackFontIds.map((id) => ({ id })),
      context,
    );
  });

const swatchProducerAliasSchema: z.ZodType<SwatchProducerAlias> = z.strictObject({
  id: idSchema,
  producer: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
});

export const swatchSchema: z.ZodType<Swatch> = z
  .discriminatedUnion('kind', [
    z.strictObject({
      id: idSchema,
      kind: z.literal('process'),
      name: nonEmptyStringSchema,
      color: concreteColorValueSchema,
      producerAliases: z.array(swatchProducerAliasSchema),
    }),
    z.strictObject({
      id: idSchema,
      kind: z.literal('spot'),
      name: nonEmptyStringSchema,
      inkName: nonEmptyStringSchema,
      alternateColor: concreteColorValueSchema,
      tintBehavior: z.literal('linear'),
      producerAliases: z.array(swatchProducerAliasSchema),
    }),
  ])
  .superRefine((swatch, context) => {
    validateUniqueIds(swatch.producerAliases, context);
  });

const variableModeSchema = z.strictObject({ id: idSchema, name: nonEmptyStringSchema });
const variableDefinitionSchema: z.ZodType<VariableDefinition> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  valueType: valueTypeSchema,
  valuesByMode: z.record(idSchema, typedValueSchema),
  aliasOf: z.strictObject({ collectionId: idSchema, variableId: idSchema }).optional(),
});

export const variableCollectionSchema: z.ZodType<VariableCollection> = z
  .strictObject({
    id: idSchema,
    name: nonEmptyStringSchema,
    modes: z.array(variableModeSchema).min(1),
    defaultModeId: idSchema,
    variables: z.array(variableDefinitionSchema),
  })
  .superRefine((collection, context) => {
    validateUniqueIds(collection.modes, context);
    validateUniqueIds(collection.variables, context);

    const modeIds = new Set<string>(collection.modes.map((mode) => mode.id));

    if (!modeIds.has(collection.defaultModeId)) {
      context.addIssue({ code: 'custom', message: 'Default mode must resolve', path: ['defaultModeId'] });
    }

    collection.variables.forEach((variable, variableIndex) => {
      const valueModeIds = Object.keys(variable.valuesByMode);

      if (valueModeIds.length !== modeIds.size || valueModeIds.some((modeId) => !modeIds.has(modeId))) {
        context.addIssue({
          code: 'custom',
          message: 'Variable values must cover every mode',
          path: ['variables', variableIndex, 'valuesByMode'],
        });
      }

      Object.entries(variable.valuesByMode).forEach(([modeId, value]) => {
        if (value.type !== variable.valueType) {
          context.addIssue({
            code: 'custom',
            message: 'Variable value must match its declared type',
            path: ['variables', variableIndex, 'valuesByMode', modeId],
          });
        }
      });
    });
  });

const sharedStyleEntrySchema = z.strictObject({ id: idSchema, pointer: jsonPointerSchema, value: typedValueSchema });
const sharedStyleSourceSchema = z.discriminatedUnion('kind', [
  z
    .strictObject({
      kind: z.literal('properties'),
      inheritedStyleId: idSchema.optional(),
      entries: z.array(sharedStyleEntrySchema),
    })
    .superRefine((source, context) => {
      validateUniqueIds(source.entries, context);
    }),
  z.strictObject({ kind: z.literal('alias'), styleId: idSchema }),
]);

export const sharedStyleSchema: z.ZodType<SharedStyle> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  kind: z.enum(['appearance', 'text']),
  source: sharedStyleSourceSchema,
});
