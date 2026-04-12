/** @jest-environment jsdom */

import type { AudioCue, Timeline } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { createAudioCueEngine } from './audio-cues';

function createTimeline(overrides?: {
  readonly id?: string;
  readonly audioCues?: readonly AudioCue[];
  readonly durationMs?: number;
}): Timeline {
  return {
    id: overrides?.id ?? 'tl-1',
    name: 'main',
    keyframes: [],
    loop: 'none',
    loopCount: null,
    durationMs: overrides?.durationMs ?? 1000,
    childTimelines: [],
    audioCues: overrides?.audioCues ?? [],
  };
}

/** @description AudioCueEngine tracks which cues have fired and provides fire-and-forget semantics. */
describe('AudioCueEngine', () => {
  /** @description Forward playback through a cue's offsetMs must return the cue in the fired list. */
  it('fires cues during forward playback through offsetMs', () => {
    const cue: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 0.8, loop: false };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    // Advance from 0 to 200ms — should fire the cue at 100ms
    const fired = engine.advance(timeline, 0, 200);

    expect(fired).toHaveLength(1);
    expect(fired[0]?.assetId).toBe('whoosh');
    expect(fired[0]?.volume).toBe(0.8);
  });

  /** @description Seeking past a cue offset without forward play must NOT fire the cue. */
  it('does not fire cues when seeking past offset', () => {
    const cue: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    // Seek directly from 0 to 500 — no forward play
    engine.seek(timeline, 500);

    // Now advance slightly forward — should NOT fire the 100ms cue since we seeked past it
    const fired = engine.advance(timeline, 500, 510);

    expect(fired).toHaveLength(0);
  });

  /** @description After backward seek, cue re-fires when played forward through its offset again. */
  it('re-fires cue after backward seek and forward play', () => {
    const cue: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    // Forward play through 100ms — fires
    const fired1 = engine.advance(timeline, 0, 200);

    expect(fired1).toHaveLength(1);

    // Playing further forward should NOT re-fire
    const fired2 = engine.advance(timeline, 200, 300);

    expect(fired2).toHaveLength(0);

    // Seek backward to 0ms
    engine.seek(timeline, 0);

    // Forward play through 100ms again — should re-fire
    const fired3 = engine.advance(timeline, 0, 200);

    expect(fired3).toHaveLength(1);
    expect(fired3[0]?.assetId).toBe('whoosh');
  });

  /** @description Multiple cues at different offsets fire in order during forward play. */
  it('fires multiple cues at different offsets during forward play', () => {
    const cue1: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 0.8, loop: false };
    const cue2: AudioCue = { assetId: 'ding', offsetMs: 500, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue1, cue2] });
    const engine = createAudioCueEngine();

    // Forward play from 0 to 600ms — both cues should fire
    const fired = engine.advance(timeline, 0, 600);

    expect(fired).toHaveLength(2);
    expect(fired[0]?.assetId).toBe('whoosh');
    expect(fired[1]?.assetId).toBe('ding');
  });

  /** @description Only cues within the advance range fire; earlier cues already passed are not fired. */
  it('fires only cues in the advance range', () => {
    const cue1: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const cue2: AudioCue = { assetId: 'ding', offsetMs: 500, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue1, cue2] });
    const engine = createAudioCueEngine();

    // Play from 0 to 200 — fires only whoosh
    const fired1 = engine.advance(timeline, 0, 200);

    expect(fired1).toHaveLength(1);
    expect(fired1[0]?.assetId).toBe('whoosh');

    // Continue from 200 to 600 — fires only ding
    const fired2 = engine.advance(timeline, 200, 600);

    expect(fired2).toHaveLength(1);
    expect(fired2[0]?.assetId).toBe('ding');
  });

  /** @description A cue at exactly the start of the advance range (inclusive start) fires. */
  it('fires cue at exact boundary of advance start', () => {
    const cue: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    // Advance from exactly 100 to 200
    const fired = engine.advance(timeline, 100, 200);

    expect(fired).toHaveLength(1);
  });

  /** @description A timeline with no audioCues returns no fired cues. */
  it('returns empty for timeline with no audio cues', () => {
    const timeline = createTimeline({ audioCues: [] });
    const engine = createAudioCueEngine();

    const fired = engine.advance(timeline, 0, 500);

    expect(fired).toHaveLength(0);
  });

  /** @description The loop property is preserved on fired cues for downstream consumers. */
  it('preserves loop property on fired cues', () => {
    const cue: AudioCue = { assetId: 'bgm', offsetMs: 0, volume: 0.5, loop: true };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    const fired = engine.advance(timeline, 0, 100);

    expect(fired).toHaveLength(1);
    expect(fired[0]?.loop).toBe(true);
  });

  /** @description reset() clears all fired state, allowing all cues to fire again. */
  it('reset clears all fired state', () => {
    const cue: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    engine.advance(timeline, 0, 200);
    engine.reset();

    const fired = engine.advance(timeline, 0, 200);

    expect(fired).toHaveLength(1);
  });

  /** @description Separate timelines have independent fired state. */
  it('tracks fired state per timeline independently', () => {
    const cue1: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const cue2: AudioCue = { assetId: 'ding', offsetMs: 100, volume: 1, loop: false };
    const timeline1 = createTimeline({ id: 'tl-1', audioCues: [cue1] });
    const timeline2 = createTimeline({ id: 'tl-2', audioCues: [cue2] });
    const engine = createAudioCueEngine();

    // Fire cues on timeline 1
    const fired1 = engine.advance(timeline1, 0, 200);

    expect(fired1).toHaveLength(1);

    // Timeline 2's cue should still fire even though timeline 1's is exhausted
    const fired2 = engine.advance(timeline2, 0, 200);

    expect(fired2).toHaveLength(1);
    expect(fired2[0]?.assetId).toBe('ding');
  });

  /** @description Seeking to exactly a cue's offset marks it as fired, preventing spurious re-fire on subsequent advance. */
  it('does not re-fire cue at exact seek boundary', () => {
    const cue: AudioCue = { assetId: 'whoosh', offsetMs: 100, volume: 1, loop: false };
    const timeline = createTimeline({ audioCues: [cue] });
    const engine = createAudioCueEngine();

    // Seek to exactly the cue's offset
    engine.seek(timeline, 100);

    // Advance from 100 — the cue at 100 should not fire since seek marked it already fired
    const fired = engine.advance(timeline, 100, 200);

    expect(fired).toHaveLength(0);
  });
});
