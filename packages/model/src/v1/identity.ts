import { z } from 'zod';

export type Sha256Digest = `sha256:${string}`;

const C0_CONTROL_END = 0x1f;
const DELETE_CONTROL = 0x7f;
const C1_CONTROL_END = 0x9f;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (
      codePoint !== undefined &&
      (codePoint <= C0_CONTROL_END || (codePoint >= DELETE_CONTROL && codePoint <= C1_CONTROL_END))
    ) {
      return true;
    }
  }

  return false;
}

export const idSchema = z
  .string()
  .min(1)
  .refine((value) => !hasControlCharacters(value), 'IDs must not contain control characters')
  .brand<'Id'>();

export type Id = z.infer<typeof idSchema>;

export const utcTimestampSchema = z.iso.datetime({ offset: true }).brand<'UtcTimestamp'>();

export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;

export const sha256DigestSchema: z.ZodType<Sha256Digest> = z.custom<Sha256Digest>(
  (value) => typeof value === 'string' && SHA256_DIGEST_PATTERN.test(value),
  'Expected a lowercase sha256 digest',
);

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

export const jsonPointerSchema = z.string().superRefine((pointer, context) => {
  if (pointer === '') {
    return;
  }

  if (!pointer.startsWith('/')) {
    context.addIssue({ code: 'custom', message: 'Expected an RFC 6901 JSON Pointer' });

    return;
  }

  for (let index = 0; index < pointer.length; index += 1) {
    if (pointer[index] !== '~') {
      continue;
    }

    const escaped = pointer[index + 1];

    if (escaped !== '0' && escaped !== '1') {
      context.addIssue({ code: 'custom', message: 'Invalid RFC 6901 escape' });

      return;
    }

    index += 1;
  }
});

export interface PropertyTarget {
  readonly entity: EntityAddress;
  readonly pointer: string;
}

export const propertyTargetSchema: z.ZodType<PropertyTarget> = z.strictObject({
  entity: entityAddressSchema,
  pointer: jsonPointerSchema,
});
