import { describe, expect, it } from '@jest/globals';

import { frameDurationMs, outputSpecSchema, quantizeToFrame, VALID_FRAME_RATES } from './index';

/** @description OutputSpec validates frame rate, color space, and dynamic range for broadcast output configuration. */
describe('OutputSpec validation', () => {
  /** @description A valid European broadcast spec (25fps, rec709, sdr) must be accepted. */
  it('accepts valid European broadcast spec', () => {
    const result = outputSpecSchema.safeParse({
      frameRate: 25,
      colorSpace: 'rec709',
      dynamicRange: 'sdr',
    });

    expect(result.success).toBe(true);
  });

  /** @description A valid North American broadcast spec (29.97fps) must be accepted. */
  it('accepts valid North American broadcast spec', () => {
    const result = outputSpecSchema.safeParse({
      frameRate: 29.97,
      colorSpace: 'rec709',
      dynamicRange: 'sdr',
    });

    expect(result.success).toBe(true);
  });

  /** @description A valid UHD HDR workflow spec must be accepted. */
  it('accepts UHD HDR workflow spec', () => {
    const result = outputSpecSchema.safeParse({
      frameRate: 50,
      colorSpace: 'rec2020',
      dynamicRange: 'hlg',
    });

    expect(result.success).toBe(true);
  });

  /** @description All valid frame rates must be accepted. */
  it('accepts all valid frame rates', () => {
    for (const rate of VALID_FRAME_RATES) {
      const result = outputSpecSchema.safeParse({
        frameRate: rate,
        colorSpace: 'srgb',
        dynamicRange: 'sdr',
      });

      expect(result.success).toBe(true);
    }
  });

  /** @description An unsupported frame rate (120) must be rejected. */
  it('rejects unsupported frame rate', () => {
    const result = outputSpecSchema.safeParse({
      frameRate: 120,
      colorSpace: 'rec709',
      dynamicRange: 'sdr',
    });

    expect(result.success).toBe(false);
  });

  /** @description An unsupported colorSpace value must be rejected. */
  it('rejects unsupported colorSpace', () => {
    const result = outputSpecSchema.safeParse({
      frameRate: 25,
      colorSpace: 'dci-p3',
      dynamicRange: 'sdr',
    });

    expect(result.success).toBe(false);
  });

  /** @description An unsupported dynamicRange value must be rejected. */
  it('rejects unsupported dynamicRange', () => {
    const result = outputSpecSchema.safeParse({
      frameRate: 25,
      colorSpace: 'rec709',
      dynamicRange: 'dolby-vision',
    });

    expect(result.success).toBe(false);
  });
});

/** @description Frame duration and quantization utilities for broadcast output frame alignment. */
describe('Frame rate utilities', () => {
  /** @description 25fps frame duration is exactly 40ms. */
  it('computes 40ms frame duration for 25fps', () => {
    expect(frameDurationMs(25)).toBe(40);
  });

  /** @description 29.97fps frame duration is approximately 33.37ms. */
  it('computes approximately 33.37ms frame duration for 29.97fps', () => {
    expect(frameDurationMs(29.97)).toBeCloseTo(33.37, 1);
  });

  /** @description 60fps frame duration is approximately 16.67ms. */
  it('computes approximately 16.67ms frame duration for 60fps', () => {
    expect(frameDurationMs(60)).toBeCloseTo(16.67, 1);
  });

  /** @description Quantization snaps 45ms to 40ms at 25fps (nearest frame boundary). */
  it('quantizes 45ms to 40ms at 25fps', () => {
    expect(quantizeToFrame(45, 25)).toBe(40);
  });

  /** @description Quantization snaps 65ms to 80ms at 25fps (nearest frame boundary). */
  it('quantizes 65ms to 80ms at 25fps', () => {
    expect(quantizeToFrame(65, 25)).toBe(80);
  });

  /** @description Exact frame boundary values remain unchanged after quantization. */
  it('preserves exact frame boundary values', () => {
    expect(quantizeToFrame(80, 25)).toBe(80);
  });

  /** @description Zero offset quantizes to zero. */
  it('quantizes 0ms to 0ms', () => {
    expect(quantizeToFrame(0, 25)).toBe(0);
  });
});
