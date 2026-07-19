import { z } from 'zod';

export type Sha256Digest = `sha256:${string}`;

const SHA256_HEXADECIMAL_PATTERN = /^[0-9a-f]{64}$/u;
const CONTROL_CHARACTER_RANGES = ['\\x00-', '\\x1f', '\\x7f-', '\\x9f'].join('');
const ID_PATTERN = new RegExp(`^[^${CONTROL_CHARACTER_RANGES}]+$`, 'u');

export const idSchema = z
  .string()
  .min(1)
  .regex(ID_PATTERN, 'IDs must not contain control characters')
  .brand<'Id'>();

export type Id = z.infer<typeof idSchema>;

export const utcTimestampSchema = z.iso
  .datetime({ offset: true })
  .regex(/T[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-][0-2]\d:[0-5]\d)$/u)
  .brand<'UtcTimestamp'>();

export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;

export const sha256DigestSchema: z.ZodType<Sha256Digest> = z.templateLiteral([
  'sha256:',
  z.string().regex(SHA256_HEXADECIMAL_PATTERN, 'Expected a lowercase sha256 digest'),
]);

export interface EntityAddress {
  readonly projectId: Id;
  readonly documentId?: Id | undefined;
  readonly pageId?: Id | undefined;
  readonly entityKind: string;
  readonly entityId: Id;
  readonly instancePath?: readonly Id[] | undefined;
}

export const entityAddressSchema: z.ZodType<EntityAddress> = z.strictObject({
  projectId: idSchema,
  documentId: idSchema.optional(),
  pageId: idSchema.optional(),
  entityKind: idSchema,
  entityId: idSchema,
  instancePath: z.array(idSchema).optional(),
});

export const jsonPointerSchema = z.string().regex(/^(?:\/(?:[^~/]|~[01])*)*$/u, 'Expected an RFC 6901 JSON Pointer');

export interface PropertyTarget {
  readonly entity: EntityAddress;
  readonly pointer: string;
}

export const propertyTargetSchema: z.ZodType<PropertyTarget> = z.strictObject({
  entity: entityAddressSchema,
  pointer: jsonPointerSchema,
});
