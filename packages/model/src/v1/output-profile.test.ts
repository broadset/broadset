import { describe, expect, it } from 'vitest';

import { outputProfileSchema } from './output-profile';

function createMotionProfile() {
  return {
    id: 'broadcast-hd',
    name: 'Broadcast HD',
    kind: 'motion',
    dimensions: { width: 1_920, height: 1_080 },
    pixelAspectRatio: { numerator: 1, denominator: 1 },
    frameRate: { numerator: 30_000, denominator: 1_001 },
    scan: { kind: 'progressive' },
    colorSignal: {
      primaries: 'bt709',
      transfer: 'bt1886',
      matrix: 'bt709',
      range: 'limited',
      dynamicRange: { kind: 'sdr', referenceWhiteNits: 100, peakNits: 100 },
    },
    alpha: { kind: 'none' },
    audioRouting: { kind: 'pcm', layout: 'stereo', sampleRate: 48_000, bitDepth: 24 },
    safeArea: { kind: 'preset', preset: 'ebu-r95' },
    targetRuntime: {
      id: 'broadcast-runtime',
      kind: 'broadcast-player',
      minimumVersion: '1.0',
      requirements: ['exact-ticks', 'bt709'],
    },
  } as const;
}

function createPrintProfile() {
  return {
    id: 'print-a4',
    name: 'Print A4',
    kind: 'print',
    pageSize: { width: 210, height: 297, unit: 'mm' },
    orientation: 'portrait',
    outputIntent: {
      iccAssetId: 'icc-fogra39',
      renderingIntent: 'relative-colorimetric',
      blackPointCompensation: true,
    },
    bleed: { top: 3, right: 3, bottom: 3, left: 3 },
    trim: { top: 0, right: 0, bottom: 0, left: 0 },
    spotColorPolicy: 'preserve',
    overprintPolicy: 'preserve',
    pdf: { standard: 'pdf-x-4', conformance: 'strict' },
  } as const;
}

describe('outputProfileSchema', () => {
  it('parses strict complete motion and print variants', () => {
    expect(outputProfileSchema.parse(createMotionProfile())).toEqual(createMotionProfile());
    expect(outputProfileSchema.parse(createPrintProfile())).toEqual(createPrintProfile());
  });

  it('rejects missing required fields, unknown fields, and cross-variant fields', () => {
    const motion = createMotionProfile();
    const { alpha: _alpha, ...missingAlpha } = motion;

    expect(outputProfileSchema.safeParse(missingAlpha).success).toBe(false);
    expect(outputProfileSchema.safeParse({ ...motion, codec: 'h264' }).success).toBe(false);
    expect(
      outputProfileSchema.safeParse({ ...createPrintProfile(), frameRate: { numerator: 25, denominator: 1 } }).success,
    ).toBe(false);
  });

  it('covers progressive and both interlaced field-order variants', () => {
    const motion = createMotionProfile();

    expect(outputProfileSchema.safeParse({ ...motion, scan: { kind: 'progressive' } }).success).toBe(true);
    expect(outputProfileSchema.safeParse({ ...motion, scan: { kind: 'interlaced' } }).success).toBe(false);
    expect(
      outputProfileSchema.safeParse({ ...motion, scan: { kind: 'interlaced', fieldOrder: 'top-first' } }).success,
    ).toBe(true);
    expect(
      outputProfileSchema.safeParse({ ...motion, scan: { kind: 'interlaced', fieldOrder: 'bottom-first' } }).success,
    ).toBe(true);
    expect(
      outputProfileSchema.safeParse({ ...motion, scan: { kind: 'progressive', fieldOrder: 'top-first' } }).success,
    ).toBe(false);
  });

  it('enforces transfer compatibility structurally and defers luminance arithmetic', () => {
    const motion = createMotionProfile();

    expect(
      outputProfileSchema.safeParse({
        ...motion,
        colorSignal: { ...motion.colorSignal, dynamicRange: { kind: 'sdr', referenceWhiteNits: 100, peakNits: 80 } },
      }).success,
    ).toBe(true);

    const hlg = {
      ...motion,
      colorSignal: {
        primaries: 'bt2020',
        transfer: 'hlg',
        matrix: 'bt2020-ncl',
        range: 'limited',
        dynamicRange: { kind: 'hdr', format: 'hlg', referenceWhiteNits: 203, peakNits: 1_000 },
      },
    } as const;

    expect(outputProfileSchema.safeParse(hlg).success).toBe(true);
    expect(outputProfileSchema.safeParse({ ...hlg, colorSignal: { ...hlg.colorSignal, transfer: 'pq' } }).success).toBe(
      false,
    );
    expect(
      outputProfileSchema.safeParse({
        ...hlg,
        colorSignal: { ...hlg.colorSignal, dynamicRange: { kind: 'sdr', referenceWhiteNits: 100, peakNits: 100 } },
      }).success,
    ).toBe(false);
    expect(
      outputProfileSchema.safeParse({ ...motion, colorSignal: { ...motion.colorSignal, transfer: 'pq' } }).success,
    ).toBe(false);

    const hdr10 = {
      ...motion,
      colorSignal: {
        primaries: 'bt2020',
        transfer: 'pq',
        matrix: 'bt2020-ncl',
        range: 'limited',
        dynamicRange: {
          kind: 'hdr',
          format: 'hdr10',
          referenceWhiteNits: 203,
          peakNits: 1_000,
          maxCllNits: 1_000,
          maxFallNits: 400,
        },
      },
    } as const;

    expect(outputProfileSchema.safeParse(hdr10).success).toBe(true);
    expect(
      outputProfileSchema.safeParse({ ...hdr10, colorSignal: { ...hdr10.colorSignal, transfer: 'hlg' } }).success,
    ).toBe(false);
    expect(
      outputProfileSchema.safeParse({
        ...hdr10,
        colorSignal: {
          ...hdr10.colorSignal,
          dynamicRange: { ...hdr10.colorSignal.dynamicRange, maxCllNits: undefined },
        },
      }).success,
    ).toBe(false);
  });

  it('validates normalized custom safe areas and unique runtime requirements', () => {
    const motion = createMotionProfile();

    expect(
      outputProfileSchema.safeParse({
        ...motion,
        safeArea: {
          kind: 'custom',
          action: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
          title: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
        },
      }).success,
    ).toBe(true);
    expect(
      outputProfileSchema.safeParse({
        ...motion,
        safeArea: {
          kind: 'custom',
          action: { x: 0.5, y: 0, width: 0.6, height: 1 },
          title: { x: 0, y: 0, width: 1, height: 1 },
        },
      }).success,
    ).toBe(true);
    expect(
      outputProfileSchema.safeParse({
        ...motion,
        targetRuntime: { ...motion.targetRuntime, requirements: ['same', 'same'] },
      }).success,
    ).toBe(false);
  });

  it('rejects invalid dimensions, rationals, audio values, and alpha policy fields', () => {
    const motion = createMotionProfile();

    expect(outputProfileSchema.safeParse({ ...motion, dimensions: { width: 0, height: 1_080 } }).success).toBe(false);
    expect(
      outputProfileSchema.safeParse({ ...motion, pixelAspectRatio: { numerator: 2, denominator: 2 } }).success,
    ).toBe(true);
    expect(
      outputProfileSchema.safeParse({
        ...motion,
        audioRouting: { kind: 'pcm', layout: 'stereo', sampleRate: 48_000, bitDepth: 20 },
      }).success,
    ).toBe(false);
    expect(outputProfileSchema.safeParse({ ...motion, alpha: { kind: 'separate-key' } }).success).toBe(false);
  });

  it('validates print edges and every closed PDF target/conformance pair', () => {
    const print = createPrintProfile();
    const validTargets = [
      { standard: 'pdf-1.7', conformance: 'none' },
      { standard: 'pdf-2.0', conformance: 'none' },
      { standard: 'pdf-x-1a:2001', conformance: 'strict' },
      { standard: 'pdf-x-3:2002', conformance: 'strict' },
      { standard: 'pdf-x-4', conformance: 'strict' },
      { standard: 'pdf-x-6', conformance: 'strict' },
    ] as const;
    const invalidTargets = [
      { standard: 'pdf-1.7', conformance: 'strict' },
      { standard: 'pdf-2.0', conformance: 'strict' },
      { standard: 'pdf-x-1a:2001', conformance: 'none' },
      { standard: 'pdf-x-3:2002', conformance: 'none' },
      { standard: 'pdf-x-4', conformance: 'none' },
      { standard: 'pdf-x-6', conformance: 'none' },
    ] as const;

    expect(outputProfileSchema.safeParse({ ...print, bleed: { ...print.bleed, top: -1 } }).success).toBe(false);
    for (const pdf of validTargets) expect(outputProfileSchema.safeParse({ ...print, pdf }).success).toBe(true);
    for (const pdf of invalidTargets) expect(outputProfileSchema.safeParse({ ...print, pdf }).success).toBe(false);
  });
});
