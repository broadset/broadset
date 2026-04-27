import { describe, expect, it } from 'vitest';

import { classifyPath } from './classify-path';

/**
 * Phase 2 `_shared/shape-classifier/` — `classifyPath` identifies
 * rectangle and ellipse SVG paths from their `d` attribute so SVG,
 * PDF, PPTX, and PSD importers can map them back to native Broadset
 * `rectangle` / `ellipse` elements instead of generic `path` payloads.
 *
 * Every importer calls `classifyPath` at the same decision site —
 * one heuristic, many formats — so classification stays consistent
 * regardless of which external tool authored the path.
 */
describe('classifyPath — rectangle detection', () => {
  /**
   * @description The canonical SVG-export rectangle form: `M x y L x+w y
   * L x+w y+h L x y+h Z`. Four right-angled line segments. Importers
   * authored by Illustrator, Figma, and Inkscape all emit this shape.
   */
  it('classifies a canonical absolute-coord rectangle', () => {
    const result = classifyPath('M 10 20 L 110 20 L 110 80 L 10 80 Z');

    expect(result.kind).toBe('rectangle');

    if (result.kind !== 'rectangle') throw new Error('expected rectangle');

    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(100);
    expect(result.height).toBe(60);
  });

  /**
   * @description Relative-coord rectangle: `M x y l w 0 l 0 h l -w 0 Z`.
   * Many PDF and PSD vector exports use relative motion commands.
   */
  it('classifies a relative-coord rectangle', () => {
    const result = classifyPath('M 5 5 l 40 0 l 0 30 l -40 0 Z');

    expect(result.kind).toBe('rectangle');

    if (result.kind !== 'rectangle') throw new Error('expected rectangle');

    expect(result.x).toBe(5);
    expect(result.y).toBe(5);
    expect(result.width).toBe(40);
    expect(result.height).toBe(30);
  });

  /**
   * @description Horizontal / vertical-line shorthand: `M x y H x+w V y+h
   * H x Z`. SVGO and some tooling collapse straight lines to `H`/`V`.
   */
  it('classifies a rectangle expressed with H and V commands', () => {
    const result = classifyPath('M 0 0 H 50 V 25 H 0 Z');

    expect(result.kind).toBe('rectangle');

    if (result.kind !== 'rectangle') throw new Error('expected rectangle');

    expect(result.width).toBe(50);
    expect(result.height).toBe(25);
  });

  /**
   * @description A non-axis-aligned quadrilateral (e.g. a rotated
   * rectangle or a trapezoid) has no right-angle guarantee in the raw
   * path data — classification falls through to `path` so the importer
   * preserves the original geometry instead of squaring it off.
   */
  it('falls through to path for a non-axis-aligned quadrilateral', () => {
    const result = classifyPath('M 0 0 L 50 10 L 60 40 L 10 30 Z');

    expect(result.kind).toBe('path');
  });

  /**
   * @description A triangle (three lines + close) is not a rectangle.
   */
  it('falls through to path for a triangle', () => {
    const result = classifyPath('M 0 0 L 50 0 L 25 50 Z');

    expect(result.kind).toBe('path');
  });
});

describe('classifyPath — ellipse detection', () => {
  /**
   * @description Canonical 4-cubic-Bézier ellipse form used by
   * Illustrator / Figma / Inkscape when exporting an ellipse as a
   * generic path. Kappa ≈ 0.5522847498 is the magic ratio between the
   * axis radius and the Bézier control distance.
   */
  it('classifies a canonical 4-cubic-Bézier ellipse centered at origin', () => {
    const cx = 0;
    const cy = 0;
    const rx = 100;
    const ry = 50;
    const K = 0.5522847498;
    const d = [
      `M ${String(cx - rx)} ${String(cy)}`,
      `C ${String(cx - rx)} ${String(cy - K * ry)} ${String(cx - K * rx)} ${String(cy - ry)} ${String(cx)} ${String(cy - ry)}`,
      `C ${String(cx + K * rx)} ${String(cy - ry)} ${String(cx + rx)} ${String(cy - K * ry)} ${String(cx + rx)} ${String(cy)}`,
      `C ${String(cx + rx)} ${String(cy + K * ry)} ${String(cx + K * rx)} ${String(cy + ry)} ${String(cx)} ${String(cy + ry)}`,
      `C ${String(cx - K * rx)} ${String(cy + ry)} ${String(cx - rx)} ${String(cy + K * ry)} ${String(cx - rx)} ${String(cy)}`,
      'Z',
    ].join(' ');

    const result = classifyPath(d);

    expect(result.kind).toBe('ellipse');

    if (result.kind !== 'ellipse') throw new Error('expected ellipse');

    expect(result.cx).toBeCloseTo(cx, 3);
    expect(result.cy).toBeCloseTo(cy, 3);
    expect(result.rx).toBeCloseTo(rx, 3);
    expect(result.ry).toBeCloseTo(ry, 3);
  });

  /**
   * @description A circle is the degenerate-ellipse case (rx === ry).
   */
  it('classifies a canonical circle as ellipse with equal radii', () => {
    const cx = 50;
    const cy = 50;
    const r = 25;
    const K = 0.5522847498;
    const d = [
      `M ${String(cx - r)} ${String(cy)}`,
      `C ${String(cx - r)} ${String(cy - K * r)} ${String(cx - K * r)} ${String(cy - r)} ${String(cx)} ${String(cy - r)}`,
      `C ${String(cx + K * r)} ${String(cy - r)} ${String(cx + r)} ${String(cy - K * r)} ${String(cx + r)} ${String(cy)}`,
      `C ${String(cx + r)} ${String(cy + K * r)} ${String(cx + K * r)} ${String(cy + r)} ${String(cx)} ${String(cy + r)}`,
      `C ${String(cx - K * r)} ${String(cy + r)} ${String(cx - r)} ${String(cy + K * r)} ${String(cx - r)} ${String(cy)}`,
      'Z',
    ].join(' ');

    const result = classifyPath(d);

    expect(result.kind).toBe('ellipse');

    if (result.kind !== 'ellipse') throw new Error('expected ellipse');

    expect(result.rx).toBeCloseTo(r, 3);
    expect(result.ry).toBeCloseTo(r, 3);
  });

  /**
   * @description Arbitrary quartic-spline path is not an ellipse.
   */
  it('falls through to path for an arbitrary 4-cubic-Bézier path', () => {
    const result = classifyPath(
      'M 0 0 C 10 -10 30 -10 40 0 C 50 10 30 30 40 40 C 30 50 10 50 0 40 C -10 30 -10 10 0 0 Z',
    );

    expect(result.kind).toBe('path');
  });
});

describe('classifyPath — path fallback', () => {
  /**
   * @description Empty `d` input must not crash — returns `path` so the
   * caller preserves the absent geometry as an empty-path element.
   */
  it('returns path for an empty string', () => {
    expect(classifyPath('').kind).toBe('path');
  });

  /**
   * @description Whitespace-only input is equivalent to empty.
   */
  it('returns path for a whitespace-only string', () => {
    expect(classifyPath('   \n\t  ').kind).toBe('path');
  });

  /**
   * @description Malformed input (unknown command letter, truncated
   * arguments) falls through to `path` rather than throwing — the
   * importer must keep processing the document per IO-D-18.
   */
  it('returns path for malformed input', () => {
    expect(classifyPath('Z Z Z').kind).toBe('path');
    expect(classifyPath('M 10 10 X 20 20').kind).toBe('path');
  });

  /**
   * @description A rounded rectangle (line + quadratic / cubic corners)
   * is not a plain rectangle and falls through to `path` so the
   * importer preserves the rounded geometry.
   */
  it('returns path for a rounded rectangle', () => {
    const result = classifyPath('M 5 0 L 45 0 Q 50 0 50 5 L 50 45 Q 50 50 45 50 L 5 50 Q 0 50 0 45 L 0 5 Q 0 0 5 0 Z');

    expect(result.kind).toBe('path');
  });

  /**
   * @description A multi-subpath path (several M commands) is always
   * classified as `path` even if each subpath looks like a shape —
   * compound geometry can't round-trip to a single native element.
   */
  it('returns path for a multi-subpath path', () => {
    const result = classifyPath('M 0 0 L 10 0 L 10 10 L 0 10 Z M 20 20 L 30 20 L 30 30 L 20 30 Z');

    expect(result.kind).toBe('path');
  });

  /**
   * @description The optional `hints` parameter is forward-compat
   * today — passing it must not alter the classifier output for any
   * of the canonical shapes. This pins the signature so importers
   * can pre-wire the call before the hint fields gain behavior.
   */
  it('ignores hints without changing output for canonical shapes', () => {
    const rectWithoutHints = classifyPath('M 0 0 H 50 V 25 H 0 Z');
    const rectWithHints = classifyPath('M 0 0 H 50 V 25 H 0 Z', { strokeWidth: 2 });

    expect(rectWithHints).toEqual(rectWithoutHints);

    const pathWithoutHints = classifyPath('M 0 0 L 50 10 L 60 40 L 10 30 Z');
    const pathWithHints = classifyPath('M 0 0 L 50 10 L 60 40 L 10 30 Z', { strokeWidth: 10 });

    expect(pathWithHints).toEqual(pathWithoutHints);
  });
});
