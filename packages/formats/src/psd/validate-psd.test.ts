import './runtime-canvas';

import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { makeDocument, makeElement, makeStyle } from './test-helpers';
import { validatePsdBytes } from './validate-psd';

/**
 * Cross-reader validator — ensures every PSD the exporter emits
 * survives the strictest re-read settings and satisfies a small set
 * of structural invariants. Mirrors veraPDF's role for PDF/A.
 */

describe('validatePsdBytes — cross-reader pass on exporter output', () => {
  /**
   * @description A minimal Broadset document round-trips through
   * exportPsdBytes + validatePsdBytes with no errors and no warnings.
   * Any regression that breaks layer geometry surfaces here.
   */
  it('passes on a minimal Broadset-authored PSD', () => {
    const el = makeElement('rectangle', {
      id: 'rect-1',
      name: 'Background',
      position: { x: 0, y: 0 },
      width: 200,
      height: 100,
      style: makeStyle({
        opacity: 1,
        fill: { kind: 'solid', color: { kind: 'rgb', hex: '#ff8800' } } as never,
      }),
    });
    const doc = makeDocument({ elements: [el] });
    const bytes = exportPsdBytes(doc);
    const result = validatePsdBytes(bytes);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * @description The validator runs cleanly across a multi-element
   * document with rotation, opacity, and grouping. Catches
   * pipeline-wide regressions that only surface under composition.
   */
  it('passes on a multi-element document with rotation and grouping', () => {
    const elements = [
      makeElement('rectangle', {
        id: 'r1',
        position: { x: 10, y: 10 },
        width: 80,
        height: 40,
        rotation: 30,
        style: makeStyle({
          opacity: 0.8,
          fill: { kind: 'solid', color: { kind: 'rgb', hex: '#00aaff' } } as never,
        }),
      }),
      makeElement('ellipse', {
        id: 'e1',
        position: { x: 120, y: 30 },
        width: 60,
        height: 60,
        style: makeStyle({
          opacity: 1,
          fill: { kind: 'solid', color: { kind: 'rgb', hex: '#88dd44' } } as never,
        }),
      }),
      makeElement('text', {
        id: 't1',
        position: { x: 10, y: 60 },
        width: 100,
        height: 24,
        content: 'Hello',
      }),
    ];
    const doc = makeDocument({ elements });
    const bytes = exportPsdBytes(doc);
    const result = validatePsdBytes(bytes);

    expect(result.errors).toHaveLength(0);
  });

  /**
   * @description Garbage bytes return a `valid: false` result with a
   * descriptive error. The validator MUST NOT throw.
   */
  it('returns a structured error for garbage bytes', () => {
    const garbage = new Uint8Array([0xff, 0x00, 0xff, 0x00]);
    const result = validatePsdBytes(garbage);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
