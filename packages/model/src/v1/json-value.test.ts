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

  it.each([
    ['uppercase namespace', { namespace: 'Com.Example.test' }],
    ['undotted namespace', { namespace: 'example' }],
    ['empty namespace label', { namespace: 'com..example' }],
    ['edge-hyphen namespace', { namespace: 'com.-example' }],
    ['relative schema URL', { schema: '/extension.schema.json' }],
    ['non-HTTPS schema URL', { schema: 'http://example.com/extension.schema.json' }],
    ['zero version', { version: 0 }],
    ['fractional version', { version: 1.5 }],
    ['unsafe version', { version: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects %s', (_name, defect) => {
    expect(
      extensionEnvelopeSchema.safeParse({
        namespace: 'com.example.test',
        schema: 'https://example.com/extension.schema.json',
        version: 1,
        payload: null,
        ...defect,
      }).success,
    ).toBe(false);
  });
});
