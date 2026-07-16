import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { appearanceToStyle } from './appearance-css';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const noSwatches: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();

function srgb(r: number, g: number, b: number, alpha = 1): projectFormatV1.ConcreteColorValue {
  return { kind: 'color', space: 'srgb', channels: [r, g, b], alpha };
}

function fill(fillId: string, paint: projectFormatV1.Paint, enabled = true): projectFormatV1.FillLayer {
  return { id: id(fillId), enabled, opacity: 1, blendMode: 'normal', paint };
}

function appearance(overrides: Partial<projectFormatV1.Appearance> = {}): projectFormatV1.Appearance {
  return {
    opacity: 1,
    blendMode: 'normal',
    isolation: false,
    fills: [],
    strokes: [],
    effects: [],
    ...overrides,
  };
}

function style(
  overrides: Partial<projectFormatV1.Appearance> = {},
  swatches = noSwatches,
): ReturnType<typeof appearanceToStyle> {
  return appearanceToStyle(appearance(overrides), swatches);
}

describe('appearanceToStyle', () => {
  it('omits default opacity / blend / isolation and sets non-defaults', () => {
    expect(style()).toEqual({});
    expect(style({ opacity: 0.5 })).toEqual({ opacity: '0.5' });
    expect(style({ blendMode: 'multiply' })).toEqual({ mixBlendMode: 'multiply' });
    expect(style({ isolation: true })).toEqual({ isolation: 'isolate' });
  });

  it('renders a solid fill as a same-color background-image layer', () => {
    expect(style({ fills: [fill('f1', { kind: 'solid', color: srgb(1, 0, 0) })] })).toEqual({
      backgroundImage: 'linear-gradient(color(srgb 1 0 0), color(srgb 1 0 0))',
    });
  });

  it('layers fills top-first (v1 fills paint bottom-to-top)', () => {
    const gradient: projectFormatV1.Gradient = {
      kind: 'linear',
      start: [0, 0],
      end: [1, 0],
      stops: [
        { id: id('s0'), color: srgb(0, 0, 0), opacity: 1, offset: 0 },
        { id: id('s1'), color: srgb(1, 1, 1), opacity: 1, offset: 1 },
      ],
      coordinateSpace: 'object-bounds',
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      spread: 'pad',
      interpolation: 'srgb',
    };
    const result = style({
      fills: [fill('bottom', { kind: 'solid', color: srgb(1, 0, 0) }), fill('top', { kind: 'gradient', gradient })],
    });

    // top fill first in the CSS layer list.
    expect(result.backgroundImage).toBe(
      'linear-gradient(90deg, color(srgb 0 0 0) 0%, color(srgb 1 1 1) 100%), linear-gradient(color(srgb 1 0 0), color(srgb 1 0 0))',
    );
  });

  it('preserves per-fill opacity and blend mode in reversed CSS layer order', () => {
    const bottom: projectFormatV1.FillLayer = {
      ...fill('bottom', { kind: 'solid', color: srgb(1, 0, 0) }),
      opacity: 0.5,
      blendMode: 'multiply',
    };
    const top: projectFormatV1.FillLayer = {
      ...fill('top', { kind: 'solid', color: srgb(0, 0, 1) }),
      opacity: 0.25,
      blendMode: 'screen',
    };

    expect(style({ fills: [bottom, top] })).toEqual({
      backgroundImage:
        'linear-gradient(color-mix(in srgb, color(srgb 0 0 1) 25%, transparent), color-mix(in srgb, color(srgb 0 0 1) 25%, transparent)), linear-gradient(color-mix(in srgb, color(srgb 1 0 0) 50%, transparent), color-mix(in srgb, color(srgb 1 0 0) 50%, transparent))',
      backgroundBlendMode: 'screen, multiply',
    });
  });

  it('skips disabled fills, none paint, and pattern/picture paint', () => {
    expect(style({ fills: [fill('disabled', { kind: 'solid', color: srgb(1, 0, 0) }, false)] })).toEqual({});
    expect(style({ fills: [fill('none', { kind: 'none' })] })).toEqual({});
    expect(style({ fills: [fill('pic', { kind: 'picture', assetId: id('a'), fit: 'cover' })] })).toEqual({});
  });

  it('maps CSS-expressible effects to filter and backdrop-blur to backdrop-filter', () => {
    const blur: projectFormatV1.Effect = {
      id: id('b'),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      kind: 'blur',
      radius: 4,
    };
    const shadow: projectFormatV1.Effect = {
      id: id('s'),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      kind: 'drop-shadow',
      offset: [2, 3],
      radius: 5,
      spread: 0,
      color: srgb(0, 0, 0),
    };
    const backdrop: projectFormatV1.Effect = {
      id: id('bd'),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      kind: 'backdrop-blur',
      radius: 8,
    };

    expect(style({ effects: [blur, shadow] })).toEqual({
      filter: 'blur(4px) drop-shadow(2px 3px 5px color(srgb 0 0 0))',
    });
    expect(style({ effects: [backdrop] })).toEqual({ backdropFilter: 'blur(8px)' });
  });

  it('converts effect radii and offsets from physical units', () => {
    const shadow: projectFormatV1.Effect = {
      id: id('s'),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      kind: 'drop-shadow',
      offset: [2.54, 5.08],
      radius: 1.27,
      spread: 0,
      color: srgb(0, 0, 0),
    };
    const glow: projectFormatV1.Effect = {
      id: id('g'),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      kind: 'glow',
      radius: 0.254,
      spread: 0,
      color: srgb(1, 0, 0),
      inner: false,
    };

    expect(appearanceToStyle(appearance({ effects: [shadow, glow] }), noSwatches, { unit: 'mm', dpi: 254 })).toEqual({
      filter: 'drop-shadow(25.4px 50.8px 12.7px color(srgb 0 0 0)) drop-shadow(0 0 2.54px color(srgb 1 0 0))',
    });
  });

  it('skips disabled effects and SVG-only effects (color-matrix, bevel, displacement, inner-shadow)', () => {
    const disabledBlur: projectFormatV1.Effect = {
      id: id('b'),
      enabled: false,
      opacity: 1,
      blendMode: 'normal',
      kind: 'blur',
      radius: 4,
    };
    const bevel: projectFormatV1.Effect = {
      id: id('bv'),
      enabled: true,
      opacity: 1,
      blendMode: 'normal',
      kind: 'bevel',
      depth: 1,
      angle: 45,
      altitude: 30,
      soften: 0,
      highlightColor: srgb(1, 1, 1),
      shadowColor: srgb(0, 0, 0),
    };

    expect(style({ effects: [disabledBlur, bevel] })).toEqual({
      deferredEffects: JSON.stringify([
        {
          effect: bevel,
          spatialPixels: { depth: 1, soften: 0 },
        },
      ]),
    });
  });

  it('defers every non-CSS effect with complete typed metadata and converted spatial values', () => {
    const effects: readonly projectFormatV1.Effect[] = [
      {
        id: id('inner'),
        enabled: true,
        opacity: 0.4,
        blendMode: 'multiply',
        kind: 'inner-shadow',
        offset: [1, 2],
        radius: 3,
        spread: 4,
        color: srgb(0, 0, 0),
      },
      {
        id: id('inner-glow'),
        enabled: true,
        opacity: 0.5,
        blendMode: 'screen',
        kind: 'glow',
        radius: 5,
        spread: 6,
        color: srgb(1, 0, 0),
        inner: true,
      },
      {
        id: id('matrix'),
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        kind: 'color-matrix',
        matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0],
      },
      {
        id: id('displace'),
        enabled: true,
        opacity: 1,
        blendMode: 'normal',
        kind: 'displacement',
        assetId: id('map'),
        scale: [7, 8],
        channelX: 'red',
        channelY: 'green',
      },
    ];
    const result = appearanceToStyle(appearance({ effects }), noSwatches, { unit: 'mm', dpi: 254 });

    expect(result.filter).toBeUndefined();
    expect(result.deferredEffects).toBe(
      JSON.stringify([
        { effect: effects[0], spatialPixels: { offset: [10, 20], radius: 30, spread: 40 } },
        { effect: effects[1], spatialPixels: { radius: 50, spread: 60 } },
        { effect: effects[2], spatialPixels: {} },
        { effect: effects[3], spatialPixels: { scale: [70, 80] } },
      ]),
    );
  });

  it('defers CSS effects whose spread, inner mode, opacity, or blend cannot be represented faithfully', () => {
    const shadow: projectFormatV1.Effect = {
      id: id('shadow'),
      enabled: true,
      opacity: 0.5,
      blendMode: 'multiply',
      kind: 'drop-shadow',
      offset: [1, 2],
      radius: 3,
      spread: 4,
      color: srgb(0, 0, 0),
    };
    const result = style({ effects: [shadow] });

    expect(result.filter).toBeUndefined();
    expect(result.deferredEffects).toBe(
      JSON.stringify([{ effect: shadow, spatialPixels: { offset: [1, 2], radius: 3, spread: 4 } }]),
    );
  });
});
