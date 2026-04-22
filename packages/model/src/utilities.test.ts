import { describe, expect, it } from 'vitest';

import {
  computeEdgeAnchors,
  createEmptyBroadsetDocument,
  deepClone,
  emToPx,
  generateDefaultClipPath,
  inToMm,
  mmToIn,
  mmToPx,
  parseClipPathData,
  parseLength,
  ptToPx,
  pxToMm,
  pxToPt,
  scalePathData,
  serializeClipPath,
} from './index';

/** @description Deep cloning must preserve data while returning fresh object and array references. */
describe('Document clone fidelity', () => {
  /** @description The cloned value must remain deeply equal to the original document. */
  it('clone preserves all document data', () => {
    const original = createEmptyBroadsetDocument();
    const cloned = deepClone(original);

    expect(cloned).toEqual(original);
  });

  /** @description The clone must not share references with the original nested structures. */
  it('clone is structurally independent', () => {
    const original = createEmptyBroadsetDocument();
    const cloned = deepClone(original);

    expect(cloned).not.toBe(original);
    expect(cloned.pages).not.toBe(original.pages);
    expect(cloned.canvas).not.toBe(original.canvas);
    expect(cloned.animations).not.toBe(original.animations);
  });
});

/** @description Clip-path parsing supports quoted, unquoted, and non-path values. */
describe('Clip-path path value normalization', () => {
  /** @description `path(...)` values must return the raw SVG path data across quoting styles. */
  it('parses path values with double quotes, single quotes, and no quotes', () => {
    expect(parseClipPathData('path("M 0 0 L 100 0 L 100 100 Z")')).toBe('M 0 0 L 100 0 L 100 100 Z');
    expect(parseClipPathData("path('M 0 0 L 50 50')")).toBe('M 0 0 L 50 50');
    expect(parseClipPathData('path(M 0 0 L 100 0)')).toBe('M 0 0 L 100 0');
  });

  /** @description Non-path values and the empty string must return `null`. */
  it('returns null for non-path values and empty input', () => {
    expect(parseClipPathData('circle(50%)')).toBeNull();
    expect(parseClipPathData('')).toBeNull();
  });
});

/** @description Serializing a raw path string must wrap it in a valid CSS `path("...")` value. */
describe('Clip-path serialization', () => {
  /** @description Serialization must preserve the original path content verbatim. */
  it('serializes raw path data', () => {
    const result = serializeClipPath('M 0 0 L 100 0 L 100 100 Z');

    expect(result).toBe('path("M 0 0 L 100 0 L 100 100 Z")');
  });
});

/** @description Scaling path data multiplies coordinates while preserving arc flags and rounding precision. */
describe('Path zoom scaling', () => {
  /** @description Regular line coordinates scale linearly with the provided zoom factor. */
  it('scales path coordinates by zoom factor', () => {
    expect(scalePathData('M 0 0 L 100 50', 2)).toBe('M0 0L200 100');
    expect(scalePathData('M 10 20 L 30 40', 1)).toBe('M10 20L30 40');
  });

  /** @description Fractional scaling results must be rounded to two decimals for stability. */
  it('rounds fractional coordinates to 2 decimals', () => {
    const result = scalePathData('M 10 10', 0.333);

    expect(result).toBe('M3.33 3.33');
  });

  /** @description Arc radii and endpoints scale; rotation and flags stay unchanged. */
  it('preserves arc command flags when scaling', () => {
    expect(scalePathData('M 0 0 A 10 20 30 0 1 50 60', 2)).toBe('M0 0A20 40 30 0 1 100 120');
    expect(scalePathData('M 0 0 A 10 20 30 0 1 50 60 10 20 30 0 1 70 80', 2)).toBe(
      'M0 0A20 40 30 0 1 100 120 20 40 30 0 1 140 160',
    );
  });
});

/** @description The default clip path must always produce a non-degenerate rectangle path. */
describe('Default clip path generation', () => {
  /** @description Positive and zero dimensions must both yield a closed rectangular path. */
  it('generates a non-degenerate rectangle path', () => {
    const positive = generateDefaultClipPath(100, 50);
    const zeroSafe = generateDefaultClipPath(0, 0);

    expect(positive).toContain('M');
    expect(positive).toContain('Z');
    expect(zeroSafe).toContain('M');
    expect(zeroSafe).toContain('Z');
    expect(zeroSafe).not.toMatch(/M 0 0 L 0 0/);
  });
});

/** @description Edge anchor inference uses the element center relative to the canvas center. */
describe('Edge anchor inference', () => {
  /** @description Anchor inference must return left/top, right/bottom, or the documented centered tie-breaker. */
  it('computes anchors from element geometry', () => {
    expect(computeEdgeAnchors({ x: 0, y: 0, width: 50, height: 50 }, { canvasWidth: 200, canvasHeight: 200 })).toEqual({
      anchorX: 'left',
      anchorY: 'top',
    });
    expect(
      computeEdgeAnchors({ x: 150, y: 150, width: 50, height: 50 }, { canvasWidth: 200, canvasHeight: 200 }),
    ).toEqual({
      anchorX: 'right',
      anchorY: 'bottom',
    });
    expect(
      computeEdgeAnchors({ x: 75, y: 75, width: 50, height: 50 }, { canvasWidth: 200, canvasHeight: 200 }),
    ).toEqual({
      anchorX: 'right',
      anchorY: 'bottom',
    });
  });
});

/** @description Pixel/millimetre conversion must stay consistent at 96 DPI. */
describe('Unit conversion', () => {
  /** @description The helpers must round-trip the standard 96px ↔ 25.4mm conversion. */
  it('converts between px and mm at 96 DPI', () => {
    expect(pxToMm(96)).toBeCloseTo(25.4, 10);
    expect(mmToPx(25.4)).toBeCloseTo(96, 10);
    expect(pxToMm(0)).toBe(0);
    expect(mmToPx(0)).toBe(0);
  });
});

/**
 * @description Cross-unit conversions (px/pt/in/mm/em) underpin every importer and
 * exporter that crosses the print/screen boundary (PDF, PSD, SVG, PPTX). Each
 * conversion must be exact against the canonical constants — 1 in = 25.4 mm,
 * 1 in = 72 pt — and honour the document's `canvas.dpi` when pixels are involved.
 */
describe('Cross-unit conversion helpers', () => {
  /** @description Pixels ↔ points must be 1:1 with the canonical 72 pt/in ratio at 96 DPI. */
  it('converts between px and pt using the provided DPI', () => {
    expect(pxToPt(96)).toBeCloseTo(72, 10);
    expect(ptToPx(72)).toBeCloseTo(96, 10);
    expect(pxToPt(0)).toBe(0);
    expect(ptToPx(0)).toBe(0);
  });

  /** @description At a 300 DPI print profile, 300 px still equals 72 pt (1 in). */
  it('honours non-default DPI for px↔pt', () => {
    expect(pxToPt(300, 300)).toBeCloseTo(72, 10);
    expect(ptToPx(72, 300)).toBeCloseTo(300, 10);
  });

  /** @description Inches and millimetres use the canonical 25.4 constant with no DPI involvement. */
  it('converts between inches and millimetres using 25.4', () => {
    expect(inToMm(1)).toBeCloseTo(25.4, 10);
    expect(mmToIn(25.4)).toBeCloseTo(1, 10);
    expect(inToMm(0)).toBe(0);
    expect(mmToIn(0)).toBe(0);
    expect(inToMm(-2)).toBeCloseTo(-50.8, 10);
  });

  /** @description em values multiply the base font size in pixels. */
  it('converts em to px against a base font size', () => {
    expect(emToPx(1, 16)).toBe(16);
    expect(emToPx(1.5, 16)).toBe(24);
    expect(emToPx(0, 16)).toBe(0);
    expect(emToPx(2, 12)).toBe(24);
  });

  /** @description Negative em or font-size values must be preserved (caller-owned policy). */
  it('preserves sign for em conversions', () => {
    expect(emToPx(-1, 16)).toBe(-16);
    expect(emToPx(2, -8)).toBe(-16);
  });
});

/**
 * @description `parseLength` powers unit-aware dimension inputs in the editor — a
 * user types `2cm`, `24pt`, `0.5in`, `1.5em`, etc. into any dimension field and
 * the value is interpreted in its declared unit. The parser must accept the five
 * supported units (px/mm/in/pt/em), signed/unsigned decimals, and lead/trail
 * whitespace — and reject anything else rather than silently coercing.
 */
describe('parseLength', () => {
  /** @description All five supported unit suffixes must parse against an integer value. */
  it('parses integer values with each supported unit', () => {
    expect(parseLength('24px')).toEqual({ value: 24, unit: 'px' });
    expect(parseLength('2mm')).toEqual({ value: 2, unit: 'mm' });
    expect(parseLength('1in')).toEqual({ value: 1, unit: 'in' });
    expect(parseLength('12pt')).toEqual({ value: 12, unit: 'pt' });
    expect(parseLength('3em')).toEqual({ value: 3, unit: 'em' });
  });

  /** @description Decimal values must parse, including leading-dot and trailing-digit forms. */
  it('parses decimal values', () => {
    expect(parseLength('0.5in')).toEqual({ value: 0.5, unit: 'in' });
    expect(parseLength('1.5em')).toEqual({ value: 1.5, unit: 'em' });
    expect(parseLength('.25pt')).toEqual({ value: 0.25, unit: 'pt' });
  });

  /** @description Explicit sign tokens are supported for dimensions that may be negative. */
  it('parses signed values', () => {
    expect(parseLength('-12px')).toEqual({ value: -12, unit: 'px' });
    expect(parseLength('+0.5mm')).toEqual({ value: 0.5, unit: 'mm' });
  });

  /** @description Surrounding whitespace and casing differences are tolerated. */
  it('tolerates whitespace and uppercase units', () => {
    expect(parseLength('  24px  ')).toEqual({ value: 24, unit: 'px' });
    expect(parseLength('24 PX')).toEqual({ value: 24, unit: 'px' });
    expect(parseLength('12 Pt')).toEqual({ value: 12, unit: 'pt' });
  });

  /** @description Inputs missing a unit suffix, with unknown units, or malformed, must return null. */
  it('returns null for invalid or unit-less input', () => {
    expect(parseLength('24')).toBeNull();
    expect(parseLength('')).toBeNull();
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('24cm')).toBeNull();
    expect(parseLength('24 px 50')).toBeNull();
    expect(parseLength('px')).toBeNull();
    expect(parseLength('24..5px')).toBeNull();
  });

});
