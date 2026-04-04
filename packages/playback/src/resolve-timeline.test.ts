// ---------------------------------------------------------------------------
// Timeline resolution — tests
// ---------------------------------------------------------------------------

import type { ElementAnimationConfig, Timeline } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { resolveModifierTimelines, resolveStateTimeline } from './resolve-timeline';

// ---------------------------------------------------------------------------
// State timeline resolution
// ---------------------------------------------------------------------------

describe('resolveStateTimeline', () => {
  const timeline1: Timeline = {
    id: 'tl-enter',
    name: 'entrance',
    entries: [],
  };

  const timeline2: Timeline = {
    id: 'tl-002',
    name: 'exit',
    entries: [],
  };

  const config: ElementAnimationConfig = {
    timelines: [timeline1, timeline2],
    stateTimelineBindings: [
      { stateName: 'IN', timelineId: 'tl-enter' },
      { stateName: 'OUT', timelineId: 'exit' }, // matched by name, not ID
    ],
    modifierTimelineBindings: [],
  };

  /**
   * @description State timeline lookup by binding name → timeline ID.
   */
  it('resolves IN state timeline by ID', () => {
    const result = resolveStateTimeline(config, 'IN');

    expect(result).toBe(timeline1);
  });

  /**
   * @description Unknown states must return null.
   */
  it('returns null for unknown state', () => {
    const result = resolveStateTimeline(config, 'UNKNOWN');

    expect(result).toBeNull();
  });

  /**
   * @description When the binding references a timeline name (not ID),
   * the resolution must fall back to name matching.
   */
  it('resolves timeline by name fallback', () => {
    const result = resolveStateTimeline(config, 'OUT');

    expect(result).toBe(timeline2);
  });
});

// ---------------------------------------------------------------------------
// Modifier timeline resolution
// ---------------------------------------------------------------------------

describe('resolveModifierTimelines', () => {
  const inTimeline: Timeline = {
    id: 'tl-pulse-in',
    name: 'pulse-in',
    entries: [],
  };

  const outTimeline: Timeline = {
    id: 'tl-pulse-out',
    name: 'pulse-out',
    entries: [],
  };

  const config: ElementAnimationConfig = {
    timelines: [inTimeline, outTimeline],
    stateTimelineBindings: [],
    modifierTimelineBindings: [
      { modifierName: 'pulse', inTimelineId: 'tl-pulse-in', outTimelineId: 'tl-pulse-out' },
      { modifierName: 'glow', inTimelineId: 'tl-glow-in' }, // no out timeline
    ],
  };

  /**
   * @description Resolves both in and out timelines for a modifier.
   */
  it('resolves modifier in and out timelines', () => {
    const result = resolveModifierTimelines(config, 'pulse');

    expect(result?.inTimeline).toBe(inTimeline);
    expect(result?.outTimeline).toBe(outTimeline);
  });

  /**
   * @description When no out timeline is defined, outTimeline is null.
   */
  it('returns null outTimeline when not defined', () => {
    const result = resolveModifierTimelines(config, 'glow');

    expect(result?.inTimeline).toBeUndefined();
    expect(result?.outTimeline).toBeNull();
  });

  /**
   * @description Unknown modifiers return null.
   */
  it('returns null for unknown modifier', () => {
    const result = resolveModifierTimelines(config, 'unknown');

    expect(result).toBeNull();
  });
});
