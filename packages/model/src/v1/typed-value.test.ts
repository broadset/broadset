import { describe, expect, it } from 'vitest';

import { typedValueSchema, valueTypeSchema } from './index';

const typedValues = [
  { type: 'null', value: null },
  { type: 'boolean', value: true },
  { type: 'integer', value: 42 },
  { type: 'number', value: 3.5 },
  { type: 'string', value: 'Broadset' },
  { type: 'date-time', value: '2026-07-10T12:34:56Z' },
  { type: 'length', value: 12.5 },
  { type: 'angle', value: -45 },
  { type: 'color', value: { kind: 'color', space: 'srgb', channels: [1, 0.5, 0], alpha: 1 } },
  { type: 'asset', assetId: 'asset-1' },
  { type: 'point2d', value: [10, 20] },
  { type: 'point3d', value: [10, 20, 30] },
  { type: 'list', items: [{ type: 'string', value: 'item' }] },
  { type: 'object', fields: { title: { type: 'string', value: 'Headline' } } },
] as const;

describe('v1 typed values', () => {
  it.each(typedValues)('accepts $type values', (value) => {
    expect(typedValueSchema.parse(value)).toEqual(value);
  });

  it('exposes only the closed value-type vocabulary', () => {
    expect(valueTypeSchema.safeParse('point3d').success).toBe(true);
    expect(valueTypeSchema.safeParse('json').success).toBe(false);
  });

  it.each([
    { type: 'integer', value: Number.MAX_SAFE_INTEGER + 1 },
    { type: 'number', value: Number.NaN },
    { type: 'length', value: Number.POSITIVE_INFINITY },
    { type: 'date-time', value: '2026-07-10' },
    { type: 'point2d', value: [0, 1, 2] },
    { type: 'asset', assetId: '' },
    { type: 'string', value: 'x', unknown: true },
  ])('rejects invalid typed value %#', (value) => {
    expect(typedValueSchema.safeParse(value).success).toBe(false);
  });
});
