import { describe, expect, it } from 'vitest';

import {
  colorValueSchema,
  extensionEnvelopeSchema,
  idSchema,
  jsonValueSchema,
  sha256DigestSchema,
  utcTimestampSchema,
} from './index';

describe('v1 foundational schemas', () => {
  it('accepts nested JSON and versioned extension payloads', () => {
    expect(jsonValueSchema.parse({ values: [1, true, null, 'x'] })).toEqual({ values: [1, true, null, 'x'] });
    expect(
      extensionEnvelopeSchema.parse({
        namespace: 'com.example.test',
        schema: 'https://example.com/test.schema.json',
        version: 1,
        payload: { enabled: true },
      }),
    ).toBeDefined();
  });

  it('rejects invalid identity primitives', () => {
    expect(idSchema.safeParse('').success).toBe(false);
    expect(idSchema.safeParse('bad\u0000id').success).toBe(false);
    expect(utcTimestampSchema.safeParse('2026-07-10').success).toBe(false);
    expect(sha256DigestSchema.safeParse('sha256:not-hex').success).toBe(false);
  });

  it('stores authoritative wide-gamut channels without an sRGB surrogate', () => {
    expect(colorValueSchema.parse({ kind: 'color', space: 'display-p3', channels: [0.9, 0.2, 0.1], alpha: 1 })).toEqual(
      { kind: 'color', space: 'display-p3', channels: [0.9, 0.2, 0.1], alpha: 1 },
    );
  });
});
