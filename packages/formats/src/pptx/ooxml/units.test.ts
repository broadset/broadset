import { describe, expect, it } from 'vitest';

import type { PptxSourceCanvas } from '../project-model';
import {
  alphaToOoxml,
  canvasLengthToEmu,
  degreesToRotationUnits,
  EMU_PER_CM,
  EMU_PER_INCH,
  EMU_PER_MM,
  emuToMm,
  emuToPptxSourceCanvasLength,
  hexToOoxmlColor,
  mmToEmu,
  rotationUnitsToDegrees,
} from './units';

function mmPptxSourceCanvas(overrides: Partial<PptxSourceCanvas> = {}): PptxSourceCanvas {
  return {
    width: 100,
    height: 100,
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
    ...overrides,
  };
}

/**
 * @description EMU constants must match ECMA-376 exactly — PowerPoint
 * rejects packages whose slide dimensions don't resolve to integer
 * inches / centimetres within a tolerance of 1 EMU.
 */
describe('EMU constants', () => {
  it('declares the canonical EMU-per-unit constants', () => {
    expect(EMU_PER_INCH).toBe(914400);
    expect(EMU_PER_CM).toBe(360000);
    expect(EMU_PER_MM).toBe(36000);
  });
});

/**
 * @description mmToEmu and emuToMm must be round-trip clean at integer
 * millimetre boundaries — every spatial value in Broadset documents is
 * expressed in the canvas's declared unit, so lossy conversions would
 * accumulate drift across export → import cycles.
 */
describe('mmToEmu / emuToMm', () => {
  it('converts 10 mm to 360000 EMU', () => {
    expect(mmToEmu(10)).toBe(360000);
  });

  it('round-trips integer millimetres lossless', () => {
    for (const mm of [0, 1, 10, 100, 210, 297]) {
      expect(emuToMm(mmToEmu(mm))).toBe(mm);
    }
  });

  it('returns integer EMU (rounds fractional input)', () => {
    expect(mmToEmu(1.00001)).toBe(36000);
  });
});

/**
 * @description canvasLengthToEmu respects the canvas's declared unit
 * (`mm` / `in` / `px`). Broadset documents store spatial values in the
 * unit the user authored with; the exporter must convert through a
 * common EMU basis.
 */
describe('canvasLengthToEmu / emuToPptxSourceCanvasLength', () => {
  it('converts from a mm canvas directly', () => {
    const canvas = mmPptxSourceCanvas({ unit: 'mm' });

    expect(canvasLengthToEmu(canvas, 10)).toBe(360000);
    expect(emuToPptxSourceCanvasLength(canvas, 360000)).toBe(10);
  });

  it('converts from an in canvas via millimetres', () => {
    const canvas = mmPptxSourceCanvas({ unit: 'in' });

    expect(canvasLengthToEmu(canvas, 1)).toBe(EMU_PER_INCH);
    expect(emuToPptxSourceCanvasLength(canvas, EMU_PER_INCH)).toBeCloseTo(1, 6);
  });

  it('converts from a px canvas via the canvas DPI', () => {
    const canvas = mmPptxSourceCanvas({ unit: 'px', dpi: 96 });
    const emu = canvasLengthToEmu(canvas, 96);

    // 96 px @ 96 dpi = 1 inch → EMU_PER_INCH.
    expect(emu).toBeCloseTo(EMU_PER_INCH, -2);
    expect(emuToPptxSourceCanvasLength(canvas, emu)).toBeCloseTo(96, 4);
  });
});

/**
 * @description Rotation-unit conversions must be round-trip clean at
 * integer-degree boundaries. OOXML emits rotations in 1/60000-degree
 * units, and PowerPoint's rotate UI snaps to integer degrees.
 */
describe('rotation conversions', () => {
  it('converts integer degrees to 1/60000-degree units', () => {
    expect(degreesToRotationUnits(0)).toBe(0);
    expect(degreesToRotationUnits(90)).toBe(5400000);
    expect(degreesToRotationUnits(180)).toBe(10800000);
    expect(degreesToRotationUnits(360)).toBe(21600000);
  });

  it('round-trips integer degrees', () => {
    for (const d of [0, 1, 45, 90, 180, 270, 359]) {
      expect(rotationUnitsToDegrees(degreesToRotationUnits(d))).toBe(d);
    }
  });
});

/**
 * @description OOXML colour attributes carry lowercase-or-uppercase hex
 * without the `#` prefix, and alpha travels in `<a:alpha val="…"/>` on a
 * 0–100000 integer scale. The exporter normalizes to uppercase and strips
 * alpha from the RGB portion.
 */
describe('colour helpers', () => {
  it('strips `#` and expands 3-digit hex to uppercase 6-digit', () => {
    expect(hexToOoxmlColor('#abc')).toBe('AABBCC');
    expect(hexToOoxmlColor('abc')).toBe('AABBCC');
    expect(hexToOoxmlColor('#aabbcc')).toBe('AABBCC');
  });

  it('uppercases and truncates hex with alpha', () => {
    expect(hexToOoxmlColor('#aabbcc80')).toBe('AABBCC');
  });

  it('clamps alpha 0–1 to the OOXML 0–100000 integer scale', () => {
    expect(alphaToOoxml(0)).toBe(0);
    expect(alphaToOoxml(0.5)).toBe(50000);
    expect(alphaToOoxml(1)).toBe(100000);
    expect(alphaToOoxml(-0.2)).toBe(0);
    expect(alphaToOoxml(1.2)).toBe(100000);
  });
});
