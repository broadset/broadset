import { createDefaultAnimationConfig, type ElementAnimationConfig, type Timeline } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  addTimelineKeyframe,
  changeTimelineKeyframeEasing,
  computeTimelineDurationMs,
  createDemoTimeline,
  duplicateDemoTimeline,
  getNextAvailableBindingName,
  moveTimelineKeyframe,
  removeTimelineReferences,
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
    const timeline = addTimelineKeyframe(createDemoTimeline('Intro'));

    expect(timeline.keyframes).toHaveLength(3);
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

    timeline = addTimelineKeyframe(timeline);
    timeline = addTimelineKeyframe(timeline);

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
