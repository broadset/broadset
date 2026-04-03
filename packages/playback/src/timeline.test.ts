import type { Keyframe, Timeline } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { computeElementTimelines, computeTimelineDuration, computeTimelineFrame } from './timeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeKeyframe(overrides: Partial<Keyframe> & { readonly offsetMs: number }): Keyframe {
  return {
    name: '',
    action: 'none',
    properties: {},
    ...overrides,
  };
}

function makeTimeline(overrides: Partial<Timeline> & { readonly entries: readonly Keyframe[] }): Timeline {
  return {
    id: 'tl-1',
    name: 'main',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Timeline duration
// ---------------------------------------------------------------------------

describe('computeTimelineDuration', () => {
  /**
   * @description Empty timelines must report zero duration so that
   * playback controllers can skip them entirely.
   */
  it('returns 0 for an empty timeline', () => {
    const tl = makeTimeline({ entries: [] });

    expect(computeTimelineDuration(tl)).toBe(0);
  });

  /**
   * @description Duration is the max keyframe offset + 300ms default
   * tween duration. This is the primary rule for timeline length.
   */
  it('returns maxOffset + 300ms for a multi-keyframe timeline', () => {
    const tl = makeTimeline({
      entries: [makeKeyframe({ offsetMs: 0 }), makeKeyframe({ offsetMs: 500 }), makeKeyframe({ offsetMs: 1000 })],
    });

    expect(computeTimelineDuration(tl)).toBe(1300);
  });

  /**
   * @description Child timeline duration must extend the parent envelope.
   * Parent trigger offset + child maxOffset + 300ms tween.
   */
  it('accounts for child timeline extending parent duration', () => {
    const child = makeTimeline({
      id: 'child-1',
      name: 'child',
      entries: [makeKeyframe({ offsetMs: 0 }), makeKeyframe({ offsetMs: 800 })],
    });

    const parent = makeTimeline({
      entries: [makeKeyframe({ offsetMs: 200 })],
      childTimelines: [{ childElementId: 'el-child', timeline: child }],
    });

    // Parent: max own offset = 200 + 300 = 500
    // Child: 200 (trigger) + 800 + 300 = 1300
    // Duration = max(500, 1300) = 1300
    expect(computeTimelineDuration(parent)).toBe(1300);
  });
});

// ---------------------------------------------------------------------------
// Timeline frame computation
// ---------------------------------------------------------------------------

describe('computeTimelineFrame', () => {
  /**
   * @description Linear interpolation between two keyframes must produce
   * the expected intermediate value at the midpoint.
   */
  it('linearly interpolates opacity between keyframes', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({
          offsetMs: 0,
          properties: { opacity: { value: 0, interpolation: 'linear' } },
        }),
        makeKeyframe({
          offsetMs: 1000,
          properties: { opacity: { value: 1, interpolation: 'linear' } },
        }),
      ],
    });

    const frame = computeTimelineFrame(tl, 500);

    expect(frame.properties['opacity']).toBe(0.5);
  });

  /**
   * @description Step interpolation holds the from-value until the next
   * keyframe is reached, then snaps.
   */
  it('step interpolation holds value until next keyframe', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({
          offsetMs: 0,
          properties: { visibility: { value: 'hidden', interpolation: 'step' } },
        }),
        makeKeyframe({
          offsetMs: 500,
          properties: { visibility: { value: 'visible', interpolation: 'step' } },
        }),
      ],
    });

    const frame = computeTimelineFrame(tl, 250);

    expect(frame.properties['visibility']).toBe('hidden');
  });

  /**
   * @description Before the first keyframe, no properties should be set
   * because nothing has been animated yet.
   */
  it('returns empty properties before first keyframe', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({
          offsetMs: 500,
          properties: { opacity: { value: 1, interpolation: 'linear' } },
        }),
      ],
    });

    const frame = computeTimelineFrame(tl, 0);

    expect(Object.keys(frame.properties)).toHaveLength(0);
  });

  /**
   * @description After the last keyframe, properties must hold at the
   * last keyframe's values for the remainder of the timeline.
   */
  it('holds last keyframe values after timeline end', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({
          offsetMs: 0,
          properties: { opacity: { value: 0, interpolation: 'linear' } },
        }),
        makeKeyframe({
          offsetMs: 300,
          properties: { opacity: { value: 1, interpolation: 'linear' } },
        }),
      ],
    });

    const frame = computeTimelineFrame(tl, 5000);

    expect(frame.properties['opacity']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Action state accumulation
// ---------------------------------------------------------------------------

describe('computeTimelineFrame — action state', () => {
  /**
   * @description setState actions set the active state name.
   * At 250ms (between first and second setState), the state from the
   * first keyframe should be active.
   */
  it('accumulates setState correctly', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({ offsetMs: 0, action: 'setState', payload: 'IN' }),
        makeKeyframe({ offsetMs: 500, action: 'setState', payload: 'active' }),
      ],
    });

    const frame = computeTimelineFrame(tl, 250);

    expect(frame.activeState).toBe('IN');
  });

  /**
   * @description Modifier actions are additive (addModifier) and
   * subtractive (removeModifier). The modifier set must reflect
   * cumulative state at each point in time.
   */
  it('accumulates modifier add/remove correctly', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({ offsetMs: 0, action: 'addModifier', payload: 'pulse' }),
        makeKeyframe({ offsetMs: 200, action: 'addModifier', payload: 'glow' }),
        makeKeyframe({ offsetMs: 500, action: 'removeModifier', payload: 'pulse' }),
      ],
    });

    const at300 = computeTimelineFrame(tl, 300);

    expect(at300.modifiers).toContain('pulse');
    expect(at300.modifiers).toContain('glow');

    const at600 = computeTimelineFrame(tl, 600);

    expect(at600.modifiers).not.toContain('pulse');
    expect(at600.modifiers).toContain('glow');
  });

  /**
   * @description Backward seeks must replay from zero to produce correct
   * cumulative state. A seek backward must match a fresh computation.
   */
  it('backward seek produces same result as fresh computation', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({ offsetMs: 0, action: 'setState', payload: 'A' }),
        makeKeyframe({ offsetMs: 400, action: 'setState', payload: 'B' }),
        makeKeyframe({ offsetMs: 800, action: 'setState', payload: 'C' }),
      ],
    });

    // Compute forward to 800ms
    computeTimelineFrame(tl, 800);

    // Then backward to 200ms — must match a fresh computation at 200ms
    const backward = computeTimelineFrame(tl, 200);
    const fresh = computeTimelineFrame(tl, 200);

    expect(backward.activeState).toBe(fresh.activeState);
    expect(backward.activeState).toBe('A');
  });

  /**
   * @description Entries may arrive in non-chronological order. Actions
   * must be applied in offset order regardless of input ordering.
   */
  it('handles unsorted entries correctly', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({ offsetMs: 500, action: 'setState', payload: 'B' }),
        makeKeyframe({ offsetMs: 0, action: 'setState', payload: 'A' }),
      ],
    });

    const at250 = computeTimelineFrame(tl, 250);

    expect(at250.activeState).toBe('A');

    const at600 = computeTimelineFrame(tl, 600);

    expect(at600.activeState).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// Child timeline composition
// ---------------------------------------------------------------------------

describe('computeTimelineFrame — child timelines', () => {
  /**
   * @description Child timelines must not produce frames before their
   * parent trigger offset.
   */
  it('child frames not present before parent trigger', () => {
    const child = makeTimeline({
      id: 'child-tl',
      name: 'child',
      entries: [
        makeKeyframe({
          offsetMs: 0,
          properties: { x: { value: 0, interpolation: 'linear' } },
        }),
        makeKeyframe({
          offsetMs: 1000,
          properties: { x: { value: 100, interpolation: 'linear' } },
        }),
      ],
    });

    const parent = makeTimeline({
      entries: [makeKeyframe({ offsetMs: 500 })],
      childTimelines: [{ childElementId: 'el-child', timeline: child }],
    });

    const frame = computeTimelineFrame(parent, 400);

    expect(frame.childFrames['el-child']).toBeUndefined();
  });

  /**
   * @description After the parent trigger, child timeline frames must
   * reflect elapsed time relative to the trigger offset.
   */
  it('child frames reflect relative elapsed time after trigger', () => {
    const child = makeTimeline({
      id: 'child-tl',
      name: 'child',
      entries: [
        makeKeyframe({
          offsetMs: 0,
          properties: { x: { value: 0, interpolation: 'linear' } },
        }),
        makeKeyframe({
          offsetMs: 1000,
          properties: { x: { value: 100, interpolation: 'linear' } },
        }),
      ],
    });

    const parent = makeTimeline({
      entries: [makeKeyframe({ offsetMs: 500 })],
      childTimelines: [{ childElementId: 'el-child', timeline: child }],
    });

    const frame = computeTimelineFrame(parent, 600);
    const childFrame = frame.childFrames['el-child'];

    expect(childFrame).toBeDefined();
    expect(childFrame?.properties['x']).toBe(10);
  });

  /**
   * @description Child triggered at 200ms with keyframes at 0ms and 1000ms,
   * computed at parent t=700ms → child is at 500ms → 50% progress.
   */
  it('child properties interpolate at correct offset', () => {
    const child = makeTimeline({
      id: 'child-tl',
      name: 'child',
      entries: [
        makeKeyframe({
          offsetMs: 0,
          properties: { opacity: { value: 0, interpolation: 'linear' } },
        }),
        makeKeyframe({
          offsetMs: 1000,
          properties: { opacity: { value: 1, interpolation: 'linear' } },
        }),
      ],
    });

    const parent = makeTimeline({
      entries: [makeKeyframe({ offsetMs: 200 })],
      childTimelines: [{ childElementId: 'el-child', timeline: child }],
    });

    const frame = computeTimelineFrame(parent, 700);
    const childFrame = frame.childFrames['el-child'];

    expect(childFrame?.properties['opacity']).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Target property routing
// ---------------------------------------------------------------------------

describe('computeTimelineFrame — target routing', () => {
  /**
   * @description Properties with an explicit target must be routed to
   * targetProperties[elementId] instead of the owner's properties.
   */
  it('routes target properties to targetProperties map', () => {
    const tl = makeTimeline({
      entries: [
        makeKeyframe({
          offsetMs: 0,
          target: 'other-el',
          properties: { opacity: { value: 0, interpolation: 'linear' } },
        }),
        makeKeyframe({
          offsetMs: 1000,
          target: 'other-el',
          properties: { opacity: { value: 1, interpolation: 'linear' } },
        }),
      ],
    });

    const frame = computeTimelineFrame(tl, 500);

    expect(frame.targetProperties['other-el']?.['opacity']).toBe(0.5);
    expect(frame.properties['opacity']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Batch element timeline computation
// ---------------------------------------------------------------------------

describe('computeElementTimelines', () => {
  /**
   * @description Missing element IDs must return an empty array —
   * elements with no animation config simply don't animate.
   */
  it('returns empty array for missing element ID', () => {
    const result = computeElementTimelines([], 'nonexistent', 0);

    expect(result).toEqual([]);
  });

  /**
   * @description When an element has multiple timelines, all should
   * be computed and returned with their interpolated values.
   */
  it('computes all timelines for an element', () => {
    const registry = [
      {
        elementId: 'el-1',
        config: {
          timelines: [
            makeTimeline({
              id: 'intro',
              name: 'intro',
              entries: [
                makeKeyframe({
                  offsetMs: 0,
                  properties: { opacity: { value: 0, interpolation: 'linear' } },
                }),
                makeKeyframe({
                  offsetMs: 500,
                  properties: { opacity: { value: 1, interpolation: 'linear' } },
                }),
              ],
            }),
            makeTimeline({
              id: 'outro',
              name: 'outro',
              entries: [
                makeKeyframe({
                  offsetMs: 0,
                  properties: { x: { value: 100, interpolation: 'linear' } },
                }),
                makeKeyframe({
                  offsetMs: 500,
                  properties: { x: { value: 0, interpolation: 'linear' } },
                }),
              ],
            }),
          ],
          stateTimelineBindings: [],
          modifierTimelineBindings: [],
        },
      },
    ];

    const result = computeElementTimelines(registry, 'el-1', 250);

    expect(result).toHaveLength(2);
    expect(result[0]?.properties['opacity']).toBe(0.5);
    expect(result[1]?.properties['x']).toBe(50);
  });
});
