import { describe, expect, it } from '@jest/globals';

import { timelineSchema } from './index';

/** @description Audio cue validation enforces non-empty assetId, non-negative offsetMs, volume 0–1, and boolean loop with sensible defaults. */
describe('Audio cue validation', () => {
  const validTimeline = {
    id: 'tl-1',
    name: 'main',
    keyframes: [],
    audioCues: [{ assetId: 'asset-whoosh', offsetMs: 0, volume: 0.8, loop: false }],
  };

  /** @description A timeline with a valid audioCue array must parse successfully. */
  it('accepts a valid audio cue array', () => {
    const result = timelineSchema.safeParse(validTimeline);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.audioCues).toHaveLength(1);
      expect(result.data.audioCues?.[0]?.assetId).toBe('asset-whoosh');
    }
  });

  /** @description Omitted audioCues field defaults to an empty array. */
  it('defaults omitted audioCues to empty array', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.audioCues).toEqual([]);
    }
  });

  /** @description Volume defaults to 1 when omitted. */
  it('defaults volume to 1 when omitted', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [{ assetId: 'asset-ding', offsetMs: 500 }],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.audioCues?.[0]?.volume).toBe(1);
    }
  });

  /** @description Loop defaults to false when omitted. */
  it('defaults loop to false when omitted', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [{ assetId: 'asset-ding', offsetMs: 500 }],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.audioCues?.[0]?.loop).toBe(false);
    }
  });

  /** @description Volume above 1 must be rejected. */
  it('rejects volume above 1', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [{ assetId: 'asset-ding', offsetMs: 0, volume: 1.5 }],
    });

    expect(result.success).toBe(false);
  });

  /** @description Volume below 0 must be rejected. */
  it('rejects volume below 0', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [{ assetId: 'asset-ding', offsetMs: 0, volume: -0.1 }],
    });

    expect(result.success).toBe(false);
  });

  /** @description Empty assetId must be rejected. */
  it('rejects empty assetId', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [{ assetId: '', offsetMs: 0 }],
    });

    expect(result.success).toBe(false);
  });

  /** @description Negative offsetMs must be rejected. */
  it('rejects negative offsetMs', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [{ assetId: 'asset-ding', offsetMs: -100 }],
    });

    expect(result.success).toBe(false);
  });

  /** @description Multiple cues at different offsets are all preserved on round-trip. */
  it('accepts multiple audio cues at different offsets', () => {
    const result = timelineSchema.safeParse({
      id: 'tl-1',
      name: 'main',
      keyframes: [],
      audioCues: [
        { assetId: 'asset-whoosh', offsetMs: 0 },
        { assetId: 'asset-ding', offsetMs: 500 },
      ],
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.audioCues).toHaveLength(2);
    }
  });
});
