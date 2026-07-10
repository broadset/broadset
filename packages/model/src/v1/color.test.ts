import { describe, expect, it } from 'vitest';

import { colorValueSchema, concreteColorValueSchema } from './index';

const colors = [
  { kind: 'color', space: 'srgb', channels: [0, 0.5, 1], alpha: 1 },
  { kind: 'color', space: 'display-p3', channels: [0, 0.5, 1], alpha: 0.5 },
  { kind: 'color', space: 'rec2020', channels: [0, 0.5, 1], alpha: 0 },
  { kind: 'color', space: 'lab', channels: [50, -125, 125], alpha: 1 },
  { kind: 'color', space: 'oklab', channels: [0.5, -0.4, 0.4], alpha: 1 },
  { kind: 'color', space: 'oklch', channels: [0.5, 0.4, 360], alpha: 1 },
  { kind: 'color', space: 'cmyk', channels: [0, 0.25, 0.5, 1], alpha: 1 },
  { kind: 'color', space: 'gray', channels: [0.5], alpha: 1 },
] as const;

describe('v1 colors', () => {
  it.each(colors)('accepts authoritative $space channels', (color) => {
    expect(concreteColorValueSchema.parse(color)).toEqual(color);
  });

  it('accepts a swatch reference with normalized tint', () => {
    const color = { kind: 'swatch', swatchId: 'brand-blue', adjustments: [{ kind: 'tint', amount: 0.25 }] };

    expect(colorValueSchema.parse(color)).toEqual(color);
  });

  it.each([
    { kind: 'color', space: 'srgb', channels: [0, 1], alpha: 1 },
    { kind: 'color', space: 'gray', channels: [0, 1], alpha: 1 },
    { kind: 'color', space: 'cmyk', channels: [0, 0, 0], alpha: 1 },
    { kind: 'color', space: 'lab', channels: [101, 0, 0], alpha: 1 },
    { kind: 'color', space: 'oklab', channels: [0.5, 0.41, 0], alpha: 1 },
    { kind: 'color', space: 'oklch', channels: [0.5, 0.41, 0], alpha: 1 },
    { kind: 'color', space: 'srgb', channels: [Number.NaN, 0, 0], alpha: 1 },
    { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1.1 },
    { kind: 'swatch', swatchId: 'x', adjustments: [{ kind: 'tint', amount: -0.1 }] },
  ])('rejects invalid color %#', (color) => {
    expect(colorValueSchema.safeParse(color).success).toBe(false);
  });
});
