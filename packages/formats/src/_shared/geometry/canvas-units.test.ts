import type { Canvas } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { canvasUnitToMm, mmToCanvasUnit } from './canvas-units';

const baseCanvas = {
  width: 100,
  height: 100,
  dpi: 96,
  padding: [0, 0, 0, 0] as const,
  backgroundMode: 'transparent' as const,
} satisfies Omit<Canvas, 'unit'>;

const mmCanvas: Canvas = { ...baseCanvas, unit: 'mm' };
const inCanvas: Canvas = { ...baseCanvas, unit: 'in', width: 8.5, height: 11 };
const pxCanvas96: Canvas = { ...baseCanvas, unit: 'px', width: 1920, height: 1080, dpi: 96 };
const pxCanvas300: Canvas = { ...baseCanvas, unit: 'px', width: 1920, height: 1080, dpi: 300 };

describe('canvasUnitToMm', () => {
  it('returns mm unchanged', () => {
    expect(canvasUnitToMm(mmCanvas, 25.4)).toBeCloseTo(25.4, 6);
  });

  it('converts in → mm at 25.4', () => {
    expect(canvasUnitToMm(inCanvas, 1)).toBeCloseTo(25.4, 6);
    expect(canvasUnitToMm(inCanvas, 8.5)).toBeCloseTo(215.9, 6);
  });

  it('converts px → mm via dpi (96 dpi)', () => {
    expect(canvasUnitToMm(pxCanvas96, 96)).toBeCloseTo(25.4, 6);
  });

  it('converts px → mm via dpi (300 dpi)', () => {
    expect(canvasUnitToMm(pxCanvas300, 300)).toBeCloseTo(25.4, 6);
  });
});

describe('mmToCanvasUnit', () => {
  it('round-trips mm', () => {
    expect(mmToCanvasUnit(mmCanvas, canvasUnitToMm(mmCanvas, 50))).toBeCloseTo(50, 6);
  });

  it('round-trips in', () => {
    expect(mmToCanvasUnit(inCanvas, canvasUnitToMm(inCanvas, 8.5))).toBeCloseTo(8.5, 6);
  });

  it('round-trips px at 96 dpi', () => {
    expect(mmToCanvasUnit(pxCanvas96, canvasUnitToMm(pxCanvas96, 1920))).toBeCloseTo(1920, 6);
  });

  it('round-trips px at 300 dpi', () => {
    expect(mmToCanvasUnit(pxCanvas300, canvasUnitToMm(pxCanvas300, 1920))).toBeCloseTo(1920, 6);
  });
});
