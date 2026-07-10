import { describe, expect, it } from 'vitest';

import { extensionEnvelopeSchema, jsonValueSchema } from './index';

describe('JSON values and extension envelopes', () => {
  it('accepts recursive finite JSON values', () => {
    const value = { object: { array: ['text', 42, false, null] } };

    expect(jsonValueSchema.parse(value)).toEqual(value);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite JSON number %s',
    (value) => {
      expect(jsonValueSchema.safeParse({ nested: [value] }).success).toBe(false);
    },
  );

  it('keeps extension payloads open while rejecting unknown envelope fields', () => {
    const envelope = {
      namespace: 'dev.broadset.example',
      schema: 'https://example.com/extension.json',
      version: 2,
      payload: { producerField: { nested: true } },
    };

    expect(extensionEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(extensionEnvelopeSchema.safeParse({ ...envelope, unknown: true }).success).toBe(false);
  });
});
