import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { gradientToCss } from './gradient-css';

const id = (value: string): projectFormatV1.Id => projectFormatV1.idSchema.parse(value);
const noSwatches: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = new Map();
const IDENTITY: projectFormatV1.Affine2D = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] };

function srgb(r: number, g: number, b: number, alpha = 1): projectFormatV1.ConcreteColorValue {
  return { kind: 'color', space: 'srgb', channels: [r, g, b], alpha };
}

function stop(offset: number, color: projectFormatV1.ColorValue, opacity = 1): projectFormatV1.GradientStop {
  return { id: id(`stop-${String(offset)}-${String(opacity)}`), color, opacity, offset };
}

const RED_TO_BLUE: readonly projectFormatV1.GradientStop[] = [stop(0, srgb(1, 0, 0)), stop(1, srgb(0, 0, 1))];

function base(overrides: Partial<{ spread: projectFormatV1.Gradient['spread']; interpolation: projectFormatV1.Gradient['interpolation']; stops: readonly projectFormatV1.GradientStop[] }> = {}) {
  return {
    stops: overrides.stops ?? RED_TO_BLUE,
    coordinateSpace: 'object-bounds' as const,
    transform: IDENTITY,
    spread: overrides.spread ?? ('pad' as const),
    interpolation: overrides.interpolation ?? ('srgb' as const),
  };
}

function css(gradient: projectFormatV1.Gradient, swatches: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Swatch> = noSwatches): string {
  return gradientToCss(gradient, swatches);
}

const STOPS = 'color(srgb 1 0 0) 0%, color(srgb 0 0 1) 100%';

describe('gradientToCss', () => {
  it('maps a linear gradient to a CSS angle (0deg = up, clockwise, y-down space)', () => {
    expect(css({ ...base(), kind: 'linear', start: [0, 0], end: [1, 0] })).toBe(`linear-gradient(90deg, ${STOPS})`);
    expect(css({ ...base(), kind: 'linear', start: [0, 0], end: [0, 1] })).toBe(`linear-gradient(180deg, ${STOPS})`);
    expect(css({ ...base(), kind: 'linear', start: [0, 0], end: [-1, 0] })).toBe(`linear-gradient(270deg, ${STOPS})`);
    // Diagonals: down-right -> 135deg, up-right -> 45deg.
    expect(css({ ...base(), kind: 'linear', start: [0, 0], end: [1, 1] })).toBe(`linear-gradient(135deg, ${STOPS})`);
    expect(css({ ...base(), kind: 'linear', start: [0, 0], end: [1, -1] })).toBe(`linear-gradient(45deg, ${STOPS})`);
  });

  it('orders stops by offset so out-of-order input is not clamped by CSS', () => {
    const gradient: projectFormatV1.Gradient = {
      ...base({ stops: [stop(1, srgb(0, 0, 1)), stop(0, srgb(1, 0, 0))] }),
      kind: 'linear',
      start: [0, 0],
      end: [1, 0],
    };

    expect(css(gradient)).toBe(`linear-gradient(90deg, ${STOPS})`);
  });

  it('folds per-stop opacity into the stop color alpha', () => {
    const gradient: projectFormatV1.Gradient = { ...base({ stops: [stop(0, srgb(1, 0, 0), 0.5)] }), kind: 'linear', start: [0, 0], end: [1, 0] };

    expect(css(gradient)).toBe('linear-gradient(90deg, color(srgb 1 0 0 / 0.5) 0%)');
  });

  it('maps radial and diamond to a positioned CSS radial gradient', () => {
    const radial: projectFormatV1.Gradient = { ...base(), kind: 'radial', center: [0.5, 0.5], radius: [0.5, 0.25] };
    const diamond: projectFormatV1.Gradient = { ...base(), kind: 'diamond', center: [0.25, 0.75], radius: [0.5, 0.5] };

    expect(css(radial)).toBe(`radial-gradient(50% 25% at 50% 50%, ${STOPS})`);
    expect(css(diamond)).toBe(`radial-gradient(50% 50% at 25% 75%, ${STOPS})`);
  });

  it('maps a conic gradient with its start angle and center', () => {
    expect(css({ ...base(), kind: 'conic', center: [0.5, 0.5], startAngle: 45 })).toBe(`conic-gradient(from 45deg at 50% 50%, ${STOPS})`);
  });

  it('falls back to a horizontal gradient for producer-preserved kinds', () => {
    expect(css({ ...base(), kind: 'producer-preserved', producer: 'pptx', typeName: 'gradFill' })).toBe(`linear-gradient(to right, ${STOPS})`);
  });

  it('maps spread to repeating and interpolation to a color space clause', () => {
    expect(css({ ...base({ spread: 'repeat' }), kind: 'linear', start: [0, 0], end: [1, 0] })).toBe(`repeating-linear-gradient(90deg, ${STOPS})`);
    expect(css({ ...base({ spread: 'reflect' }), kind: 'linear', start: [0, 0], end: [1, 0] })).toBe(`repeating-linear-gradient(90deg, ${STOPS})`);
    expect(css({ ...base({ interpolation: 'oklab' }), kind: 'linear', start: [0, 0], end: [1, 0] })).toBe(`linear-gradient(90deg in oklab, ${STOPS})`);
    expect(css({ ...base({ interpolation: 'linear-srgb' }), kind: 'linear', start: [0, 0], end: [1, 0] })).toBe(`linear-gradient(90deg in srgb-linear, ${STOPS})`);
  });

  it('resolves swatch stop colors and fails closed to transparent for unresolved stops', () => {
    const swatch: projectFormatV1.Swatch = { id: id('brand'), kind: 'process', name: 'Brand', color: srgb(0, 1, 0), producerAliases: [] };
    const swatches = new Map([[id('brand'), swatch]]);
    const gradient: projectFormatV1.Gradient = {
      ...base({ stops: [stop(0, { kind: 'swatch', swatchId: id('brand') }), stop(1, { kind: 'swatch', swatchId: id('missing') })] }),
      kind: 'linear',
      start: [0, 0],
      end: [1, 0],
    };

    expect(css(gradient, swatches)).toBe('linear-gradient(90deg, color(srgb 0 1 0) 0%, transparent 100%)');
  });

  it('fails closed to transparent for a gradient with no stops', () => {
    expect(css({ ...base({ stops: [] }), kind: 'linear', start: [0, 0], end: [1, 0] })).toBe('transparent');
  });
});
