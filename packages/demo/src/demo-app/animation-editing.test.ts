import { createDefaultAnimationConfig, type ElementAnimationConfig, type Timeline } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import {
  addTimelineKeyframe,
  changeTimelineKeyframeEasing,
  computeTimelineDurationMs,
  createDemoTimeline,
  duplicateDemoTimeline,
  getNextAvailableBindingName,
  moveTimelineKeyframe,
  removeTimelineReferences,
  snapTimelineOffsetMs,
  updateTimelineById,
} from './animation-editing';

function createConfig(timelines: readonly Timeline[]): ElementAnimationConfig {
  return {
    ...createDefaultAnimationConfig(),
    timelines,
    stateTimelineBindings: [
      { stateName: 'IN', timelineId: timelines[0]?.id ?? 'missing' },
      { stateName: 'OUT', timelineId: timelines[0]?.id ?? 'missing' },
    ],
    modifierTimelineBindings: [{ modifierName: 'hover', inTimelineId: timelines[0]?.id ?? 'missing' }],
  };
}

describe('demo animation editing helpers', () => {
  /** @description New demo timelines must start with a usable two-keyframe shape so the editor can immediately preview and edit them. */
  it('creates a default demo timeline with start and end keyframes', () => {
    const timeline = createDemoTimeline('Intro');

    expect(timeline.name).toBe('Intro');
    expect(timeline.keyframes).toHaveLength(2);
    expect(timeline.keyframes[0]?.offsetMs).toBe(0);
  });

  /** @description Duplicating a timeline must create a distinct identity while preserving editable content. */
  it('duplicates timelines with a new id', () => {
    const timeline = createDemoTimeline('Intro');
    const duplicate = duplicateDemoTimeline(timeline, 'Intro Copy');

    expect(duplicate.id).not.toBe(timeline.id);
    expect(duplicate.name).toBe('Intro Copy');
    expect(duplicate.keyframes).toEqual(timeline.keyframes);
  });

  /** @description Adding keyframes must extend the timeline without losing existing markers. */
  it('adds a new keyframe to a timeline', () => {
    const timeline = addTimelineKeyframe(createDemoTimeline('Intro'), 500);

    expect(timeline.keyframes).toHaveLength(3);
  });

  /** @description Adding a keyframe must use the playhead offset rather than duplicating the last marker. */
  it('adds a new keyframe at the requested playhead offset', () => {
    const timeline = addTimelineKeyframe(createDemoTimeline('Intro'), 500);

    expect(timeline.keyframes.some((keyframe) => keyframe.offsetMs === 500)).toBe(true);
  });

  /** @description Playhead insertion is snapped in the shared helper so playback-time adds cannot create fractional RAF offsets. */
  it('snaps added keyframes to the timeline grid', () => {
    const timeline = addTimelineKeyframe(createDemoTimeline('Intro'), 451);

    expect(timeline.keyframes.some((keyframe) => keyframe.offsetMs === 500)).toBe(true);
    expect(snapTimelineOffsetMs(449)).toBe(400);
  });

  /** @description Adding a keyframe at the playhead should seed existing animated properties with their sampled values for immediate editing. */
  it('seeds added keyframes with sampled timeline properties', () => {
    const base = createDemoTimeline('Intro');
    const timeline = addTimelineKeyframe(
      {
        ...base,
        keyframes: [
          {
            name: 'start',
            action: 'none',
            offsetMs: 0,
            properties: {
              opacity: { type: 'number', value: 0, easing: 'linear' },
            },
          },
          {
            name: 'end',
            action: 'none',
            offsetMs: 1000,
            properties: {
              opacity: { type: 'number', value: 1, easing: 'linear' },
            },
          },
        ],
        durationMs: 1000,
      },
      500,
    );
    const inserted = timeline.keyframes.find((keyframe) => keyframe.name === 'keyframe-3');

    expect(inserted?.properties['opacity']).toEqual({ type: 'number', value: 0.5, easing: 'linear' });
  });

  /** @description Adding a keyframe must preserve sampled targeted properties, not collapse them into an empty owner keyframe. */
  it('seeds added keyframes with sampled targeted properties', () => {
    const base = createDemoTimeline('Intro');
    const timeline = addTimelineKeyframe(
      {
        ...base,
        keyframes: [
          {
            name: 'target-start',
            action: 'none',
            offsetMs: 0,
            target: 'other-el',
            properties: {
              opacity: { type: 'number', value: 0, easing: 'linear' },
            },
          },
          {
            name: 'target-end',
            action: 'none',
            offsetMs: 1000,
            target: 'other-el',
            properties: {
              opacity: { type: 'number', value: 1, easing: 'linear' },
            },
          },
        ],
        durationMs: 1000,
      },
      500,
    );
    const inserted = timeline.keyframes.find(
      (keyframe) => keyframe.name === 'keyframe-3-other-el' && keyframe.target === 'other-el',
    );

    expect(inserted?.properties['opacity']).toEqual({ type: 'number', value: 0.5, easing: 'linear' });
    expect(timeline.keyframes.some((keyframe) => keyframe.name === 'keyframe-3' && keyframe.target === undefined)).toBe(
      false,
    );
  });

  /** @description Adding a parent timeline keyframe must also preserve sampled child timeline channels at the child-local playhead time. */
  it('seeds child timeline keyframes from sampled child frames', () => {
    const base = createDemoTimeline('Parent');
    const childTimeline = {
      ...createDemoTimeline('Child'),
      id: 'child-timeline',
      keyframes: [
        {
          name: 'child-start',
          action: 'none',
          offsetMs: 0,
          properties: {
            opacity: { type: 'number', value: 0, easing: 'linear' },
          },
        },
        {
          name: 'child-end',
          action: 'none',
          offsetMs: 600,
          properties: {
            opacity: { type: 'number', value: 1, easing: 'linear' },
          },
        },
      ],
      durationMs: 600,
    } satisfies Timeline;
    const timeline = addTimelineKeyframe(
      {
        ...base,
        keyframes: [{ name: 'parent-start', action: 'none', offsetMs: 0, properties: {} }],
        durationMs: 1000,
        childTimelines: [{ childElementId: 'child-el', timeline: childTimeline, delayMs: 200 }],
      },
      500,
    );
    const updatedChildTimeline = timeline.childTimelines?.[0]?.timeline;
    const inserted = updatedChildTimeline?.keyframes.find(
      (keyframe) => keyframe.name === 'keyframe-3' && keyframe.offsetMs === 300,
    );

    expect(inserted?.properties['opacity']).toEqual({ type: 'number', value: 0.5, easing: 'linear' });
  });

  /** @description Dragging a keyframe must update its offset and keep keyframes sorted by time. */
  it('moves a keyframe and keeps keyframes sorted', () => {
    const moved = moveTimelineKeyframe(createDemoTimeline('Intro'), 1, 250);

    expect(moved.keyframes.map((keyframe) => keyframe.offsetMs)).toEqual([0, 250]);
  });

  /** @description Changing easing must rewrite the selected keyframe properties without affecting other keyframes. */
  it('updates easing across the selected keyframe properties', () => {
    const timeline = {
      ...createDemoTimeline('Intro'),
      keyframes: [
        {
          name: 'start',
          action: 'none',
          offsetMs: 0,
          properties: {
            opacity: { type: 'number', value: 0, easing: 'linear' },
          },
        },
      ],
    } satisfies Timeline;
    const updated = changeTimelineKeyframeEasing(timeline, 0, 'ease-in');

    expect(updated.keyframes[0]?.properties['opacity']).toEqual({ type: 'number', value: 0, easing: 'ease-in' });
  });

  /** @description Removing a timeline from the config must also prune stale bindings that would otherwise point at missing timelines. */
  it('removes state and modifier bindings that reference a deleted timeline', () => {
    const timeline = createDemoTimeline('Intro');
    const result = removeTimelineReferences(createConfig([timeline]), timeline.id);

    expect(result.stateTimelineBindings).toEqual([]);
    expect(result.modifierTimelineBindings).toEqual([]);
  });

  /** @description Timeline updates must be scoped to the selected timeline so unrelated animations remain stable. */
  it('updates only the targeted timeline by id', () => {
    const first = createDemoTimeline('First');
    const second = createDemoTimeline('Second');
    const config = updateTimelineById(createConfig([first, second]), first.id, (timeline) => ({
      ...timeline,
      name: 'Renamed',
    }));

    expect(config.timelines[0]?.name).toBe('Renamed');
    expect(config.timelines[1]?.name).toBe('Second');
  });

  /** @description Binding creation must choose the next unused candidate so the sidebar adds meaningful defaults instead of duplicating names. */
  it('returns the next available binding name', () => {
    const nextBinding = getNextAvailableBindingName(['hover', 'focus', 'active'], new Set(['hover']));

    expect(nextBinding).toBe('focus');
  });

  /** @description Negative drag offsets must be clamped to zero so keyframes never have impossible negative timestamps. */
  it('clamps negative keyframe offsets to zero', () => {
    const moved = moveTimelineKeyframe(createDemoTimeline('Intro'), 1, -500);

    expect(moved.keyframes.every((keyframe) => keyframe.offsetMs >= 0)).toBe(true);
    expect(moved.keyframes[0]?.offsetMs).toBe(0);
  });

  /** @description Moving a keyframe past the current duration must expand the timeline duration without truncation. */
  it('expands timeline duration when keyframe moved past current end', () => {
    const timeline = createDemoTimeline('Intro');
    const moved = moveTimelineKeyframe(timeline, 1, 5000);
    const duration = computeTimelineDurationMs(moved);

    expect(duration).toBeGreaterThanOrEqual(5000);
  });

  /** @description Moving a non-existent keyframe index must return the timeline unchanged to prevent crash. */
  it('returns unchanged timeline for out-of-bounds keyframe index', () => {
    const timeline = createDemoTimeline('Intro');
    const moved = moveTimelineKeyframe(timeline, 99, 500);

    expect(moved).toBe(timeline);
  });

  /** @description Changing easing on a non-existent keyframe index must return the timeline unchanged. */
  it('returns unchanged timeline when changing easing on invalid index', () => {
    const timeline = createDemoTimeline('Intro');
    const updated = changeTimelineKeyframeEasing(timeline, 99, 'ease-in');

    expect(updated).toBe(timeline);
  });

  /** @description An empty-keyframe timeline should use the minimum duration default to ensure the editor can display something. */
  it('computes minimum duration for empty-keyframe timelines', () => {
    const timeline: Timeline = {
      ...createDemoTimeline('Empty'),
      keyframes: [],
      durationMs: undefined,
    };
    const duration = computeTimelineDurationMs(timeline);

    expect(duration).toBeGreaterThanOrEqual(3000);
  });

  /** @description computeTimelineDurationMs respects explicitly set durationMs, ignoring keyframe positions. */
  it('respects explicit durationMs over keyframe positions', () => {
    const timeline = createDemoTimeline('Explicit');

    expect(computeTimelineDurationMs(timeline)).toBe(timeline.durationMs);
  });

  /** @description Adding repeated keyframes should keep growing the list, ensuring each add operation creates a unique marker. */
  it('adds multiple keyframes incrementally', () => {
    let timeline = createDemoTimeline('Multi');

    timeline = addTimelineKeyframe(timeline, 400);
    timeline = addTimelineKeyframe(timeline, 600);

    expect(timeline.keyframes).toHaveLength(4);

    // Keyframes stay sorted by offsetMs
    for (let index = 1; index < timeline.keyframes.length; index++) {
      const current = timeline.keyframes[index];
      const previous = timeline.keyframes[index - 1];

      expect(current).toBeDefined();
      expect(previous).toBeDefined();

      if (current !== undefined && previous !== undefined) {
        expect(current.offsetMs).toBeGreaterThanOrEqual(previous.offsetMs);
      }
    }
  });

  /** @description When all candidate names are used, getNextAvailableBindingName should return null rather than duplicating. */
  it('returns null when all binding names are exhausted', () => {
    const result = getNextAvailableBindingName(['hover', 'focus'], new Set(['hover', 'focus']));

    expect(result).toBeNull();
  });

  /** @description removeTimelineReferences must also clear textAnimator if it references the deleted timeline. */
  it('clears textAnimator binding when its timeline is removed', () => {
    const timeline = createDemoTimeline('TextAnim');
    const config: ElementAnimationConfig = {
      ...createConfig([timeline]),
      textAnimator: { rangeMode: 'characters', staggerDelayMs: 50, randomOrder: false, timelineId: timeline.id },
    };
    const result = removeTimelineReferences(config, timeline.id);

    expect(result.textAnimator).toBeNull();
  });
});
