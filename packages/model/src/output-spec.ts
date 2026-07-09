import { z } from 'zod';

export const VALID_FRAME_RATES = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60] as const;
export type FrameRate = (typeof VALID_FRAME_RATES)[number];

export type ColorSpace = 'rec709' | 'rec2020' | 'srgb';
export type DynamicRange = 'sdr' | 'hlg' | 'pq';

export interface OutputSpec {
  readonly frameRate: FrameRate;
  readonly colorSpace: ColorSpace;
  readonly dynamicRange: DynamicRange;
}

/**
 * Compute frame duration in milliseconds for a given frame rate.
 */
export function frameDurationMs(frameRate: number): number {
  return 1000 / frameRate;
}

/**
 * Quantize a millisecond offset to the nearest frame boundary for the given frame rate.
 */
export function quantizeToFrame(offsetMs: number, frameRate: number): number {
  const duration = frameDurationMs(frameRate);

  return Math.round(offsetMs / duration) * duration;
}

const frameRateLiterals = VALID_FRAME_RATES.map((rate) => z.literal(rate)) as [
  z.ZodLiteral<23.976>,
  z.ZodLiteral<24>,
  ...z.ZodLiteral<FrameRate>[],
];
const frameRateSchema = z.union(frameRateLiterals);

export const outputSpecSchema: z.ZodType<OutputSpec> = z.object({
  frameRate: frameRateSchema,
  colorSpace: z.enum(['rec709', 'rec2020', 'srgb']),
  dynamicRange: z.enum(['sdr', 'hlg', 'pq']),
});
