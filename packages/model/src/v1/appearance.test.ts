import { describe, expect, it } from 'vitest';

import { appearanceSchema, effectSchema, paintSchema } from './appearance';

const red = { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 } as const;
const identity = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] } as const;

describe('paintSchema', () => {
  it.each([
    { kind: 'none' },
    { kind: 'solid', color: red },
    {
      kind: 'gradient',
      gradient: {
        kind: 'linear',
        stops: [
          { id: 'stop-a', color: red, opacity: 1, offset: 0, midpoint: 0.5 },
          { id: 'stop-b', color: red, opacity: 0.5, offset: 1 },
        ],
        coordinateSpace: 'object-bounds',
        transform: identity,
        spread: 'pad',
        interpolation: 'oklab',
        start: [0, 0],
        end: [1, 1],
      },
    },
    { kind: 'pattern', assetId: 'asset-a', transform: identity, repeat: 'repeat-x' },
    { kind: 'picture', assetId: 'asset-a', fit: 'cover', crop: { x: 0, y: 0, width: 1, height: 1 } },
  ])('accepts paint $kind', (paint) => {
    expect(paintSchema.parse(paint)).toEqual(paint);
  });

  it.each([
    ['linear', { start: [0, 0], end: [1, 1] }],
    ['radial', { center: [0.5, 0.5], radius: [0.5, 0.25], focalPoint: [0.4, 0.4] }],
    ['conic', { center: [0.5, 0.5], startAngle: 30 }],
    ['diamond', { center: [0.5, 0.5], radius: [0.5, 0.5] }],
    ['producer-preserved', { producer: 'Acme', typeName: 'mesh-gradient' }],
  ])('accepts %s gradient geometry', (kind, geometry) => {
    const gradient = {
      kind: 'gradient',
      gradient: {
        kind,
        stops: [{ id: 'stop-a', color: red, opacity: 1, offset: 0 }],
        coordinateSpace: 'user-space',
        transform: identity,
        spread: 'reflect',
        interpolation: 'srgb',
        ...geometry,
      },
    };

    expect(paintSchema.safeParse(gradient).success).toBe(true);
  });

  it('rejects duplicate gradient stop ids and raw CSS paints', () => {
    const duplicateStops = {
      kind: 'gradient',
      gradient: {
        kind: 'linear',
        stops: [
          { id: 'same', color: red, opacity: 1, offset: 0 },
          { id: 'same', color: red, opacity: 1, offset: 1 },
        ],
        coordinateSpace: 'object-bounds',
        transform: identity,
        spread: 'pad',
        interpolation: 'srgb',
        start: [0, 0],
        end: [1, 0],
      },
    };

    expect(paintSchema.safeParse(duplicateStops).success).toBe(false);
    expect(paintSchema.safeParse('linear-gradient(red, blue)').success).toBe(false);
  });
});

describe('effectSchema', () => {
  const base = { id: 'effect-a', enabled: true, opacity: 1, blendMode: 'normal' } as const;

  it.each([
    { ...base, kind: 'blur', radius: 4 },
    { ...base, kind: 'drop-shadow', offset: [2, 3], radius: 4, spread: 1, color: red },
    { ...base, kind: 'inner-shadow', offset: [2, 3], radius: 4, spread: 1, color: red },
    { ...base, kind: 'glow', radius: 4, spread: 1, color: red, inner: false },
    { ...base, kind: 'color-matrix', matrix: Array.from({ length: 20 }, (_, index) => index) },
    { ...base, kind: 'bevel', depth: 2, angle: 45, altitude: 30, soften: 1, highlightColor: red, shadowColor: red },
    { ...base, kind: 'displacement', assetId: 'asset-a', scale: [2, 3], channelX: 'red', channelY: 'green' },
    { ...base, kind: 'opacity', amount: 0.5 },
    { ...base, kind: 'backdrop-blur', radius: 4 },
  ])('accepts effect $kind', (effect) => {
    expect(effectSchema.parse(effect)).toEqual(effect);
  });
});

describe('appearanceSchema', () => {
  it('preserves ordered stable fills and strokes', () => {
    const appearance = {
      opacity: 1,
      blendMode: 'normal',
      isolation: false,
      fills: [
        { id: 'fill-a', enabled: true, opacity: 1, blendMode: 'normal', paint: { kind: 'solid', color: red } },
        { id: 'fill-b', enabled: false, opacity: 0.5, blendMode: 'multiply', paint: { kind: 'none' } },
      ],
      strokes: [
        {
          id: 'stroke-a',
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          paint: { kind: 'solid', color: red },
          width: 2,
          alignment: 'center',
          cap: 'round',
          join: 'miter',
          miterLimit: 4,
          dash: [2, 3],
          dashOffset: 1,
          startArrow: { kind: 'triangle', length: 4, width: 3 },
          endArrow: { kind: 'none' },
        },
        {
          id: 'stroke-b',
          enabled: true,
          opacity: 1,
          blendMode: 'normal',
          paint: { kind: 'none' },
          width: 0,
          alignment: 'inside',
          cap: 'butt',
          join: 'bevel',
          miterLimit: 1,
          dash: [],
          dashOffset: 0,
        },
      ],
      effects: [],
      clip: { kind: 'vector', vectorElementId: 'vector-a', fillRule: 'evenodd' },
      mask: { kind: 'asset', assetId: 'asset-a', mode: 'alpha' },
    } as const;

    expect(appearanceSchema.parse(appearance)).toEqual(appearance);
  });

  it('rejects duplicate layer ids, malformed strokes, and unknown fields', () => {
    const base = { opacity: 1, blendMode: 'normal', isolation: false, strokes: [], effects: [] };
    const fill = { id: 'same', enabled: true, opacity: 1, blendMode: 'normal', paint: { kind: 'none' } };

    expect(appearanceSchema.safeParse({ ...base, fills: [fill, fill] }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...base, fills: [], strokes: [{ ...fill, width: -1 }] }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...base, fills: [], customClipPath: 'polygon(0 0)' }).success).toBe(false);
  });
});
