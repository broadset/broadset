import { z } from 'zod';

import {
  type EntityAddress,
  entityAddressSchema,
  type Id,
  idSchema,
  jsonPointerSchema,
  type Sha256Digest,
  sha256DigestSchema,
  type UtcTimestamp,
  utcTimestampSchema,
} from './identity';
import { type JsonValue, jsonValueSchema } from './json-value';
import { type BlobReference, blobReferenceSchema } from './resources';
import { nonEmptyStringSchema } from './schema-helpers';

export interface InteropSource {
  readonly id: Id;
  readonly format: string;
  readonly sourceAssetId: Id;
  readonly importerVersion: string;
  readonly importedAt: UtcTimestamp;
}

export interface InteropDiagnostic {
  readonly code: string;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly dimension: 'appearance' | 'editability' | 'semantics' | 'output';
  readonly pointer?: string | undefined;
  readonly entity?: EntityAddress | undefined;
  readonly remediation?: string | undefined;
}

export interface InteropRecord {
  readonly id: Id;
  readonly sourceId: Id;
  readonly target: EntityAddress;
  readonly baselineSemanticHash: Sha256Digest;
  readonly mappingConfidence: number;
  readonly editability: 'native' | 'partial' | 'appearance-only';
  readonly warnings: readonly InteropDiagnostic[];
  readonly sourceIdentity?: JsonValue | undefined;
  readonly preservedBlob?: BlobReference | undefined;
  readonly previewAssetId?: Id | undefined;
}

export interface InteropRegistry {
  readonly sources: readonly InteropSource[];
  readonly records: readonly InteropRecord[];
}

export const interopSourceSchema: z.ZodType<InteropSource> = z.strictObject({
  id: idSchema,
  format: nonEmptyStringSchema,
  sourceAssetId: idSchema,
  importerVersion: nonEmptyStringSchema,
  importedAt: utcTimestampSchema,
});

export const interopDiagnosticSchema: z.ZodType<InteropDiagnostic> = z
  .strictObject({
    code: nonEmptyStringSchema,
    severity: z.enum(['info', 'warning', 'error']),
    message: nonEmptyStringSchema,
    dimension: z.enum(['appearance', 'editability', 'semantics', 'output']),
    pointer: jsonPointerSchema.optional(),
    entity: entityAddressSchema.optional(),
    remediation: nonEmptyStringSchema.optional(),
  })
  .refine(({ pointer, entity }) => pointer !== undefined || entity !== undefined, {
    message: 'Interop diagnostics require a pointer or entity',
  })
  .meta({
    anyOf: [
      { type: 'object', properties: { pointer: {} }, required: ['pointer'], 'x-broadset-partial': true },
      { type: 'object', properties: { entity: {} }, required: ['entity'], 'x-broadset-partial': true },
    ],
  });

export const interopRecordSchema: z.ZodType<InteropRecord> = z.strictObject({
  id: idSchema,
  sourceId: idSchema,
  target: entityAddressSchema,
  baselineSemanticHash: sha256DigestSchema,
  mappingConfidence: z.number().min(0).max(1),
  editability: z.enum(['native', 'partial', 'appearance-only']),
  warnings: z.array(interopDiagnosticSchema),
  sourceIdentity: jsonValueSchema.optional(),
  preservedBlob: blobReferenceSchema.optional(),
  previewAssetId: idSchema.optional(),
});

export const interopRegistrySchema: z.ZodType<InteropRegistry> = z.strictObject({
  sources: z.array(interopSourceSchema),
  records: z.array(interopRecordSchema),
});
