import { describe, expect, it } from 'vitest';

import { entityAddressSchema, jsonPointerSchema, propertyTargetSchema, utcTimestampSchema } from './index';

const entity = {
  projectId: 'project',
  documentId: 'document',
  pageId: 'page',
  entityKind: 'element',
  entityId: 'element',
  instancePath: ['root', 'nested'],
};

describe('v1 identities and stable targets', () => {
  it('accepts timezone-qualified timestamps and stable entity addresses', () => {
    expect(utcTimestampSchema.safeParse('2026-07-10T12:34:56Z').success).toBe(true);
    expect(utcTimestampSchema.safeParse('2026-07-10T15:34:56+03:00').success).toBe(true);
    expect(entityAddressSchema.parse(entity)).toEqual(entity);
  });

  it('preserves page identity as part of a stable entity address', () => {
    expect(entityAddressSchema.parse(entity).pageId).toBe('page');
  });

  it.each(['', '/appearance/opacity', '/a~1b/~0key'])('accepts RFC 6901 pointer %j', (pointer) => {
    expect(jsonPointerSchema.safeParse(pointer).success).toBe(true);
  });

  it.each(['appearance/opacity', '/bad~escape', '/trailing~'])('rejects invalid RFC 6901 pointer %j', (pointer) => {
    expect(jsonPointerSchema.safeParse(pointer).success).toBe(false);
  });

  it('keeps property targets limited to entity and pointer', () => {
    expect(propertyTargetSchema.parse({ entity, pointer: '/appearance/opacity' })).toEqual({
      entity,
      pointer: '/appearance/opacity',
    });
    expect(
      propertyTargetSchema.safeParse({ entity, pointer: '/appearance/opacity', valueType: 'number' }).success,
    ).toBe(false);
  });
});
