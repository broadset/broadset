import { describe, expect, it } from 'vitest';

import { appearanceSchema, effectSchema, paintSchema } from './appearance';

const red = { kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 } as const;
const identity = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] } as const;
const emptyAppearance = {
  opacity: 1,
  blendMode: 'normal',
  isolation: false,
  fills: [],
  strokes: [],
  effects: [],
} as const;

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

  it('defers duplicate gradient stop ids but rejects raw CSS paints', () => {
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

    expect(paintSchema.safeParse(duplicateStops).success).toBe(true);
    expect(paintSchema.safeParse('linear-gradient(red, blue)').success).toBe(false);
  });

  it.each([
    { kind: 'mesh', points: [] },
    { kind: 'none', color: red },
    { kind: 'solid', assetId: 'asset-a' },
    { kind: 'gradient', color: red },
    { kind: 'pattern', assetId: 'asset-a', fit: 'cover' },
    { kind: 'picture', assetId: 'asset-a', transform: identity, repeat: 'repeat' },
  ])('rejects unknown or mismatched paint variant $kind', (paint) => {
    expect(paintSchema.safeParse(paint).success).toBe(false);
  });

  it.each([
    ['stop opacity below zero', { opacity: -0.01 }],
    ['stop opacity above one', { opacity: 1.01 }],
    ['stop offset below zero', { offset: -0.01 }],
    ['stop offset above one', { offset: 1.01 }],
    ['stop midpoint below zero', { midpoint: -0.01 }],
    ['stop midpoint above one', { midpoint: 1.01 }],
  ])('rejects invalid gradient %s', (_case, invalidStopPart) => {
    const paint = {
      kind: 'gradient',
      gradient: {
        kind: 'linear',
        stops: [{ id: 'stop-a', color: red, opacity: 1, offset: 0, ...invalidStopPart }],
        coordinateSpace: 'object-bounds',
        transform: identity,
        spread: 'pad',
        interpolation: 'srgb',
        start: [0, 0],
        end: [1, 1],
      },
    };

    expect(paintSchema.safeParse(paint).success).toBe(false);
  });

  it.each([
    { x: -0.01, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 1.01, height: 1 },
  ])('structurally rejects out-of-range picture crop $x/$y/$width/$height', (crop) => {
    expect(paintSchema.safeParse({ kind: 'picture', assetId: 'asset-a', fit: 'cover', crop }).success).toBe(false);
  });

  it.each([
    { x: 0.2, y: 0, width: 0.9, height: 1 },
    { x: 0, y: 0.2, width: 1, height: 0.9 },
  ])('defers crop extent arithmetic $x/$y/$width/$height', (crop) => {
    expect(paintSchema.safeParse({ kind: 'picture', assetId: 'asset-a', fit: 'cover', crop }).success).toBe(true);
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

  it.each([
    { ...base, kind: 'noise', amount: 0.5 },
    { ...base, kind: 'blur', amount: 0.5 },
    { ...base, kind: 'opacity', radius: 4 },
    { ...base, kind: 'drop-shadow', radius: 4, color: red },
  ])('rejects unknown or mismatched effect variant $kind', (effect) => {
    expect(effectSchema.safeParse(effect).success).toBe(false);
  });

  it.each([
    { ...base, kind: 'blur', radius: 4, producerPayload: 'blur(4px)' },
    { ...base, kind: 'opacity', amount: 0.5, radius: 4 },
  ])('rejects extra fields on effect $kind', (effect) => {
    expect(effectSchema.safeParse(effect).success).toBe(false);
  });

  it.each([
    { ...base, kind: 'drop-shadow', offset: [2], radius: 4, spread: 1, color: red },
    { ...base, kind: 'inner-shadow', offset: [2, 3, 4], radius: 4, spread: 1, color: red },
    { ...base, kind: 'color-matrix', matrix: Array.from({ length: 19 }, () => 0) },
    { ...base, kind: 'color-matrix', matrix: Array.from({ length: 21 }, () => 0) },
    { ...base, kind: 'displacement', assetId: 'asset-a', scale: [2], channelX: 'red', channelY: 'green' },
    { ...base, kind: 'displacement', assetId: 'asset-a', scale: [2, 3, 4], channelX: 'red', channelY: 'green' },
  ])('rejects wrong tuple lengths for effect $kind', (effect) => {
    expect(effectSchema.safeParse(effect).success).toBe(false);
  });

  it.each([
    ['base opacity below zero', { ...base, opacity: -0.01, kind: 'blur', radius: 1 }],
    ['base opacity above one', { ...base, opacity: 1.01, kind: 'blur', radius: 1 }],
    ['blur radius', { ...base, kind: 'blur', radius: -0.01 }],
    ['drop shadow radius', { ...base, kind: 'drop-shadow', offset: [0, 0], radius: -0.01, spread: 0, color: red }],
    ['inner shadow radius', { ...base, kind: 'inner-shadow', offset: [0, 0], radius: -0.01, spread: 0, color: red }],
    ['glow radius', { ...base, kind: 'glow', radius: -0.01, spread: 0, color: red, inner: false }],
    [
      'bevel depth',
      { ...base, kind: 'bevel', depth: -0.01, angle: 0, altitude: 0, soften: 0, highlightColor: red, shadowColor: red },
    ],
    [
      'bevel soften',
      { ...base, kind: 'bevel', depth: 0, angle: 0, altitude: 0, soften: -0.01, highlightColor: red, shadowColor: red },
    ],
    ['opacity amount below zero', { ...base, kind: 'opacity', amount: -0.01 }],
    ['opacity amount above one', { ...base, kind: 'opacity', amount: 1.01 }],
    ['backdrop blur radius', { ...base, kind: 'backdrop-blur', radius: -0.01 }],
  ])('rejects invalid numeric range for %s', (_case, effect) => {
    expect(effectSchema.safeParse(effect).success).toBe(false);
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

  it('defers duplicate layer ids while rejecting malformed strokes and unknown fields', () => {
    const base = { opacity: 1, blendMode: 'normal', isolation: false, strokes: [], effects: [] };
    const fill = { id: 'same', enabled: true, opacity: 1, blendMode: 'normal', paint: { kind: 'none' } };

    expect(appearanceSchema.safeParse({ ...base, fills: [fill, fill] }).success).toBe(true);
    expect(appearanceSchema.safeParse({ ...base, fills: [], strokes: [{ ...fill, width: -1 }] }).success).toBe(false);
    expect(appearanceSchema.safeParse({ ...base, fills: [], customClipPath: 'polygon(0 0)' }).success).toBe(false);
  });

  it.each([
    { kind: 'vector', vectorElementId: 'vector-a', fillRule: 'nonzero' },
    { kind: 'component-path', componentInstanceId: 'instance-a', vectorElementId: 'vector-a', fillRule: 'evenodd' },
  ])('accepts and preserves clip variant $kind', (clip) => {
    const value = { ...emptyAppearance, clip };

    expect(appearanceSchema.parse(value)).toEqual(value);
  });

  it.each([
    { kind: 'vector', vectorElementId: 'vector-a', mode: 'alpha' },
    { kind: 'component-path', componentInstanceId: 'instance-a', vectorElementId: 'vector-a', mode: 'luminance' },
    { kind: 'asset', assetId: 'asset-a', mode: 'alpha' },
  ])('accepts and preserves mask variant $kind', (mask) => {
    const value = { ...emptyAppearance, mask };

    expect(appearanceSchema.parse(value)).toEqual(value);
  });

  it.each([
    ['unknown clip kind', { clip: { kind: 'css', value: 'circle(50%)' } }],
    ['malformed vector clip', { clip: { kind: 'vector', vectorElementId: 'vector-a' } }],
    [
      'mismatched component clip',
      { clip: { kind: 'component-path', vectorElementId: 'vector-a', fillRule: 'nonzero' } },
    ],
    ['unknown mask kind', { mask: { kind: 'bitmap', assetId: 'asset-a', mode: 'alpha' } }],
    ['malformed asset mask', { mask: { kind: 'asset', mode: 'alpha' } }],
    ['mismatched vector mask', { mask: { kind: 'vector', assetId: 'asset-a', mode: 'alpha' } }],
  ])('rejects %s', (_case, invalidPart) => {
    expect(appearanceSchema.safeParse({ ...emptyAppearance, ...invalidPart }).success).toBe(false);
  });
});
