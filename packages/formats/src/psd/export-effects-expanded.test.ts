import './runtime-canvas';

import { describe, expect, it } from 'vitest';

import { elementToLayer } from './export-layer';
import { makeElement, makeStyle } from './test-helpers';

/**
 * Phase 5 unit P5.3b — expanded layer-effect coverage. Prior
 * exporter only emitted drop shadow + outer glow; P5.3b adds inner
 * shadow (from CSS `inset` box-shadow) and the stroke layer effect
 * (from border color + width).
 */

describe('PSD export — inner shadow from inset box-shadow', () => {
  /**
   * @description A CSS `box-shadow` prefixed with `inset` MUST emit
   * as a PSD `innerShadow` layer effect rather than `dropShadow`.
   * This is the CSS→PSD inner-shadow mapping called out in the PSD
   * plan §Phase 2b.
   */
  it('emits innerShadow for inset box-shadow', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      style: makeStyle({
        opacity: 1,
        boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.5)',
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.effects?.innerShadow).toBeDefined();
    expect(layer.effects?.innerShadow?.[0]?.enabled).toBe(true);
    expect(layer.effects?.dropShadow).toBeUndefined();
  });

  /**
   * @description A non-inset box-shadow continues to emit as
   * `dropShadow` — the existing behaviour must not regress.
   */
  it('still emits dropShadow for non-inset box-shadow', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      style: makeStyle({
        opacity: 1,
        boxShadow: '4px 4px 8px rgba(0, 0, 0, 0.5)',
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.effects?.dropShadow).toBeDefined();
    expect(layer.effects?.innerShadow).toBeUndefined();
  });
});

describe('PSD export — stroke layer effect', () => {
  /**
   * @description An element with `borderColor` and `borderWidth` MUST
   * emit a PSD `stroke` layer effect so the outline appears in
   * Photoshop's Layer Style panel, not just as a `vectorStroke` on
   * the vector shape itself.
   */
  it('emits a stroke layer effect from borderColor + borderWidth', () => {
    const el = makeElement('rectangle', {
      id: 'rect',
      style: makeStyle({
        opacity: 1,
        borderColor: '#00ff00',
        borderWidth: 4,
      }),
    });
    const layer = elementToLayer(el);

    expect(layer.effects?.stroke).toBeDefined();
    expect(layer.effects?.stroke?.[0]?.enabled).toBe(true);
    expect(layer.effects?.stroke?.[0]?.size?.value).toBe(4);
  });

  /**
   * @description An element without border properties MUST NOT emit a
   * stroke layer effect.
   */
  it('skips stroke layer effect when no border is set', () => {
    const el = makeElement('rectangle', { id: 'rect', style: makeStyle({ opacity: 1 }) });
    const layer = elementToLayer(el);

    expect(layer.effects?.stroke).toBeUndefined();
  });
});
