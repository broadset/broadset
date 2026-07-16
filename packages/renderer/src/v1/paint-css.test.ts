import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { colorValueToCss } from './paint-css';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const noSwatches: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();

function srgb(r: number, g: number, b: number, alpha = 1): projectFormatV1.ConcreteColorValue {
  return { kind: 'color', space: 'srgb', channels: [r, g, b], alpha };
}

function css(color: projectFormatV1.ColorValue, swatches: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = noSwatches): string {
  return colorValueToCss(color, swatches);
}

describe('colorValueToCss', () => {
  it('maps each wide-gamut / lightness space to its own CSS color function', () => {
    expect(css({ kind: 'color', space: 'srgb', channels: [1, 0, 0], alpha: 1 })).toBe('color(srgb 1 0 0)');
    expect(css({ kind: 'color', space: 'display-p3', channels: [1, 0, 0], alpha: 1 })).toBe('color(display-p3 1 0 0)');
    expect(css({ kind: 'color', space: 'rec2020', channels: [0, 1, 0], alpha: 1 })).toBe('color(rec2020 0 1 0)');
    expect(css({ kind: 'color', space: 'gray', channels: [0.5], alpha: 1 })).toBe('color(srgb 0.5 0.5 0.5)');
    expect(css({ kind: 'color', space: 'lab', channels: [50, 20, -30], alpha: 1 })).toBe('lab(50 20 -30)');
    expect(css({ kind: 'color', space: 'oklab', channels: [0.7, 0.1, -0.05], alpha: 1 })).toBe('oklab(0.7 0.1 -0.05)');
    expect(css({ kind: 'color', space: 'oklch', channels: [0.7, 0.2, 120], alpha: 1 })).toBe('oklch(0.7 0.2 120)');
  });

  it('converts CMYK to sRGB (naive, browser-renderable)', () => {
    expect(css({ kind: 'color', space: 'cmyk', channels: [0, 0, 0, 1], alpha: 1 })).toBe('color(srgb 0 0 0)');
    expect(css({ kind: 'color', space: 'cmyk', channels: [1, 0, 0, 0], alpha: 1 })).toBe('color(srgb 0 1 1)');
    expect(css({ kind: 'color', space: 'cmyk', channels: [0, 0, 0, 0], alpha: 1 })).toBe('color(srgb 1 1 1)');
  });

  it('emits the alpha suffix only when alpha < 1', () => {
    expect(css(srgb(1, 0, 0, 1))).toBe('color(srgb 1 0 0)');
    expect(css(srgb(1, 0, 0, 0.5))).toBe('color(srgb 1 0 0 / 0.5)');
    expect(css({ kind: 'color', space: 'lab', channels: [50, 0, 0], alpha: 0.25 })).toBe('lab(50 0 0 / 0.25)');
  });

  it('formats numbers compactly (no trailing zeros, finite only)', () => {
    expect(css(srgb(1 / 3, 0, 0))).toBe('color(srgb 0.33333 0 0)');
    expect(css(srgb(0.5, 0.25, 0.125))).toBe('color(srgb 0.5 0.25 0.125)');
  });

  it('resolves a swatch reference to its concrete color', () => {
    const swatch: projectFormatV1.Swatch = { id: id('red'), kind: 'process', name: 'Red', color: srgb(1, 0, 0), producerAliases: [] };
    const swatches = new Map([[id('red'), swatch]]);

    expect(css({ kind: 'swatch', swatchId: id('red') }, swatches)).toBe('color(srgb 1 0 0)');
  });

  it('resolves a spot swatch through its alternate color', () => {
    const swatch: projectFormatV1.Swatch = {
      id: id('spot'),
      kind: 'spot',
      name: 'Pantone-ish',
      inkName: 'PMS 000',
      alternateColor: srgb(0, 0, 1),
      tintBehavior: 'linear',
      producerAliases: [],
    };
    const swatches = new Map([[id('spot'), swatch]]);

    expect(css({ kind: 'swatch', swatchId: id('spot') }, swatches)).toBe('color(srgb 0 0 1)');
  });

  it('fails closed to transparent for an unresolved swatch', () => {
    expect(css({ kind: 'swatch', swatchId: id('missing') })).toBe('transparent');
  });

  it('applies tint adjustments as an in-space mix toward white', () => {
    const swatch: projectFormatV1.Swatch = { id: id('black'), kind: 'process', name: 'Black', color: srgb(0, 0, 0), producerAliases: [] };
    const swatches = new Map([[id('black'), swatch]]);

    // amount 0 is identity; amount 1 reaches white; amount 0.5 is the midpoint.
    expect(css({ kind: 'swatch', swatchId: id('black'), adjustments: [{ kind: 'tint', amount: 0 }] }, swatches)).toBe('color(srgb 0 0 0)');
    expect(css({ kind: 'swatch', swatchId: id('black'), adjustments: [{ kind: 'tint', amount: 1 }] }, swatches)).toBe('color(srgb 1 1 1)');
    expect(css({ kind: 'swatch', swatchId: id('black'), adjustments: [{ kind: 'tint', amount: 0.5 }] }, swatches)).toBe('color(srgb 0.5 0.5 0.5)');
  });

  it('tints CMYK toward zero ink (mix target is no-ink white)', () => {
    const swatch: projectFormatV1.Swatch = {
      id: id('cyan'),
      kind: 'process',
      name: 'Cyan',
      color: { kind: 'color', space: 'cmyk', channels: [1, 0, 0, 0], alpha: 1 },
      producerAliases: [],
    };
    const swatches = new Map([[id('cyan'), swatch]]);

    // Full tint drops all ink -> white paper.
    expect(css({ kind: 'swatch', swatchId: id('cyan'), adjustments: [{ kind: 'tint', amount: 1 }] }, swatches)).toBe('color(srgb 1 1 1)');
  });

  function processSwatch(swatchId: string, color: projectFormatV1.ConcreteColorValue): [projectFormatV1.Id, projectFormatV1.Swatch] {
    return [id(swatchId), { id: id(swatchId), kind: 'process', name: swatchId, color, producerAliases: [] }];
  }

  it('tints lab / oklch in-space, preserving oklch hue', () => {
    const swatches = new Map([
      processSwatch('lab', { kind: 'color', space: 'lab', channels: [50, 80, -60], alpha: 1 }),
      processSwatch('oklch', { kind: 'color', space: 'oklch', channels: [0.5, 0.2, 275], alpha: 1 }),
    ]);

    // lab white = [100,0,0]: L 50->75, a 80->40, b -60->-30.
    expect(css({ kind: 'swatch', swatchId: id('lab'), adjustments: [{ kind: 'tint', amount: 0.5 }] }, swatches)).toBe('lab(75 40 -30)');
    // oklch white = [1,0,H]: L 0.5->0.75, C 0.2->0.1, H 275 preserved.
    expect(css({ kind: 'swatch', swatchId: id('oklch'), adjustments: [{ kind: 'tint', amount: 0.5 }] }, swatches)).toBe('oklch(0.75 0.1 275)');
  });

  it('preserves alpha through tinting and emits wide-gamut alpha', () => {
    expect(css({ kind: 'color', space: 'display-p3', channels: [1, 0, 0], alpha: 0.5 })).toBe('color(display-p3 1 0 0 / 0.5)');

    const swatches = new Map([processSwatch('t', srgb(0, 0, 0, 0.5))]);

    expect(css({ kind: 'swatch', swatchId: id('t'), adjustments: [{ kind: 'tint', amount: 1 }] }, swatches)).toBe('color(srgb 1 1 1 / 0.5)');
  });

  it('compounds multiple tint adjustments and treats an empty list as identity', () => {
    const swatches = new Map([processSwatch('k', srgb(0, 0, 0))]);

    expect(css({ kind: 'swatch', swatchId: id('k'), adjustments: [{ kind: 'tint', amount: 0.5 }, { kind: 'tint', amount: 0.5 }] }, swatches)).toBe('color(srgb 0.75 0.75 0.75)');
    expect(css({ kind: 'swatch', swatchId: id('k'), adjustments: [] }, swatches)).toBe('color(srgb 0 0 0)');
  });

  it('quantizes tiny magnitudes to a clean grid (no scientific notation, no negative zero)', () => {
    expect(css(srgb(0.0000049, 0, 0))).toBe('color(srgb 0 0 0)');
    expect(css({ kind: 'color', space: 'lab', channels: [50, -0.0000051, 0], alpha: 1 })).toBe('lab(50 -0.00001 0)');
  });

  it('converts a CMYK value with a non-zero key', () => {
    expect(css({ kind: 'color', space: 'cmyk', channels: [0.5, 0, 0, 0.5], alpha: 1 })).toBe('color(srgb 0.25 0.5 0.5)');
  });

  it('defends against a wrong channel count in the color() branch (no invalid CSS)', () => {
    expect(css({ kind: 'color', space: 'srgb', channels: [1, 0], alpha: 1 })).toBe('color(srgb 1 0 0)');
    expect(css({ kind: 'color', space: 'srgb', channels: [1, 0, 0, 0], alpha: 1 })).toBe('color(srgb 1 0 0)');
  });
});
