import { z } from 'zod';

import { type Swatch } from './color';
import { type BroadsetDocumentV1, broadsetDocumentV1Schema } from './document';
import { type Id, idSchema, type UtcTimestamp, utcTimestampSchema } from './identity';
import { type InteropRegistry, interopRegistrySchema } from './interop';
import { compareExactIsoInstants } from './iso-instant';
import { type ExtensionEnvelope, extensionEnvelopeSchema } from './json-value';
import { type OutputProfile, outputProfileSchema } from './output-profile';
import {
  fontFamilyResourceSchema,
  sharedStyleSchema,
  swatchSchema,
  variableCollectionSchema,
} from './resource-collections';
import {
  type Asset,
  assetSchema,
  type FontFamilyResource,
  type SharedStyle,
  type VariableCollection,
} from './resources';
import { greatestCommonDivisor, nonEmptyStringSchema, positiveSafeIntegerSchema } from './schema-helpers';

export interface ProjectMetadata {
  readonly name: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly description?: string | undefined;
  readonly authors?: readonly string[] | undefined;
  readonly keywords?: readonly string[] | undefined;
  readonly rights?: string | undefined;
  readonly generator?:
    | { readonly name: string; readonly version: string; readonly build?: string | undefined }
    | undefined;
}

export interface ProjectResources {
  readonly assets: readonly Asset[];
  readonly fonts: readonly FontFamilyResource[];
  readonly swatches: readonly Swatch[];
  readonly variables: readonly VariableCollection[];
  readonly styles: readonly SharedStyle[];
  readonly outputProfiles: readonly OutputProfile[];
}

export interface TemplateGroupMember {
  readonly id: Id;
  readonly documentId: Id;
  readonly role:
    | { readonly kind: 'aspect-ratio'; readonly ratio: readonly [number, number] }
    | { readonly kind: 'named'; readonly name: string };
  readonly label?: string | undefined;
  readonly outputProfileIds: readonly Id[];
}

export interface TemplateGroup {
  readonly id: Id;
  readonly name: string;
  readonly members: readonly TemplateGroupMember[];
}

export interface BroadsetProjectV1 {
  readonly $schema: 'https://schema.broadset.dev/v1/project.schema.json';
  readonly format: 'broadset-project';
  readonly schemaVersion: 1;
  readonly id: Id;
  readonly metadata: ProjectMetadata;
  readonly resources: ProjectResources;
  readonly documents: readonly BroadsetDocumentV1[];
  readonly templateGroups: readonly TemplateGroup[];
  readonly interop: InteropRegistry;
  readonly extensions: readonly ExtensionEnvelope[];
}

const projectMetadataSchema: z.ZodType<ProjectMetadata> = z
  .strictObject({
    name: nonEmptyStringSchema,
    createdAt: utcTimestampSchema,
    updatedAt: utcTimestampSchema,
    description: z.string().optional(),
    authors: z.array(nonEmptyStringSchema).optional(),
    keywords: z.array(nonEmptyStringSchema).optional(),
    rights: z.string().optional(),
    generator: z
      .strictObject({
        name: nonEmptyStringSchema,
        version: nonEmptyStringSchema,
        build: nonEmptyStringSchema.optional(),
      })
      .optional(),
  })
  .refine(
    ({ createdAt, updatedAt }) => {
      const comparison = compareExactIsoInstants(createdAt, updatedAt);

      return comparison !== undefined && comparison <= 0;
    },
    { message: 'updatedAt must not precede createdAt', path: ['updatedAt'] },
  );

export const projectResourcesSchema: z.ZodType<ProjectResources> = z.strictObject({
  assets: z.array(assetSchema),
  fonts: z.array(fontFamilyResourceSchema),
  swatches: z.array(swatchSchema),
  variables: z.array(variableCollectionSchema),
  styles: z.array(sharedStyleSchema),
  outputProfiles: z.array(outputProfileSchema),
});

const aspectRatioSchema = z
  .tuple([positiveSafeIntegerSchema, positiveSafeIntegerSchema])
  .refine(([width, height]) => greatestCommonDivisor(width, height) === 1, 'Aspect ratio must be reduced');

const templateGroupMemberSchema: z.ZodType<TemplateGroupMember> = z.strictObject({
  id: idSchema,
  documentId: idSchema,
  role: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('aspect-ratio'), ratio: aspectRatioSchema }),
    z.strictObject({ kind: z.literal('named'), name: nonEmptyStringSchema }),
  ]),
  label: nonEmptyStringSchema.optional(),
  outputProfileIds: z.array(idSchema),
});

export const templateGroupSchema: z.ZodType<TemplateGroup> = z.strictObject({
  id: idSchema,
  name: nonEmptyStringSchema,
  members: z.array(templateGroupMemberSchema),
});

export const broadsetProjectV1Schema: z.ZodType<BroadsetProjectV1> = z.strictObject({
  $schema: z.literal('https://schema.broadset.dev/v1/project.schema.json'),
  format: z.literal('broadset-project'),
  schemaVersion: z.literal(1),
  id: idSchema,
  metadata: projectMetadataSchema,
  resources: projectResourcesSchema,
  documents: z.array(broadsetDocumentV1Schema).min(1),
  templateGroups: z.array(templateGroupSchema),
  interop: interopRegistrySchema,
  extensions: z.array(extensionEnvelopeSchema),
});
