import { type EasingMode, type ElementAnimationConfig, type Keyframe, type Timeline } from '@broadset/model';

const DEFAULT_TIMELINE_DURATION_MS = 1000;
const DEFAULT_TIMELINE_PAD_MS = 1000;
const MIN_TIMELINE_DURATION_MS = 3000;

function createKeyframe(offsetMs: number, name: string): Keyframe {
  return {
    name,
    action: 'none',
    offsetMs,
    properties: {},
  };
}

export function computeTimelineDurationMs(timeline: Timeline): number {
  if (timeline.durationMs !== undefined) {
    return timeline.durationMs;
  }

  if (timeline.keyframes.length === 0) {
    return MIN_TIMELINE_DURATION_MS;
  }

  const maxOffsetMs = timeline.keyframes.reduce((currentMax, keyframe) => Math.max(currentMax, keyframe.offsetMs), 0);

  return Math.max(maxOffsetMs + DEFAULT_TIMELINE_PAD_MS, MIN_TIMELINE_DURATION_MS);
}

export function createDemoTimeline(name: string): Timeline {
  return {
    id: crypto.randomUUID(),
    name,
    keyframes: [createKeyframe(0, 'start'), createKeyframe(DEFAULT_TIMELINE_DURATION_MS, 'end')],
    loop: 'none',
    loopCount: null,
    durationMs: DEFAULT_TIMELINE_DURATION_MS,
    childTimelines: [],
    audioCues: [],
  };
}

export function duplicateDemoTimeline(timeline: Timeline, name: string): Timeline {
  return {
    ...timeline,
    id: crypto.randomUUID(),
    name,
    keyframes: timeline.keyframes.map((keyframe) => ({ ...keyframe, properties: { ...keyframe.properties } })),
  };
}

export function addTimelineKeyframe(timeline: Timeline): Timeline {
  const nextOffsetMs = timeline.keyframes.at(-1)?.offsetMs ?? 0;
  const nextKeyframes = [
    ...timeline.keyframes,
    createKeyframe(nextOffsetMs, `keyframe-${String(timeline.keyframes.length + 1)}`),
  ].sort((left, right) => left.offsetMs - right.offsetMs);

  return {
    ...timeline,
    durationMs: Math.max(computeTimelineDurationMs(timeline), nextOffsetMs),
    keyframes: nextKeyframes,
  };
}

export function moveTimelineKeyframe(timeline: Timeline, index: number, offsetMs: number): Timeline {
  const keyframe = timeline.keyframes[index];

  if (keyframe === undefined) {
    return timeline;
  }

  const clampedOffsetMs = Math.max(0, offsetMs);

  const nextKeyframes = timeline.keyframes
    .map((entry, entryIndex) => (entryIndex === index ? { ...entry, offsetMs: clampedOffsetMs } : entry))
    .sort((left, right) => left.offsetMs - right.offsetMs);

  return {
    ...timeline,
    durationMs: Math.max(computeTimelineDurationMs(timeline), clampedOffsetMs),
    keyframes: nextKeyframes,
  };
}

export function changeTimelineKeyframeEasing(timeline: Timeline, index: number, easing: EasingMode): Timeline {
  const keyframe = timeline.keyframes[index];

  if (keyframe === undefined) {
    return timeline;
  }

  const nextProperties = Object.fromEntries(
    Object.entries(keyframe.properties).map(([propertyName, value]) => [propertyName, { ...value, easing }]),
  );

  return {
    ...timeline,
    keyframes: timeline.keyframes.map((entry, entryIndex) =>
      entryIndex === index ? { ...entry, properties: nextProperties } : entry,
    ),
  };
}

export function updateTimelineById(
  config: ElementAnimationConfig,
  timelineId: string,
  updater: (timeline: Timeline) => Timeline,
): ElementAnimationConfig {
  return {
    ...config,
    timelines: config.timelines.map((timeline) => (timeline.id === timelineId ? updater(timeline) : timeline)),
  };
}

export function removeTimelineReferences(config: ElementAnimationConfig, timelineId: string): ElementAnimationConfig {
  return {
    ...config,
    stateTimelineBindings: config.stateTimelineBindings.filter((binding) => binding.timelineId !== timelineId),
    modifierTimelineBindings: config.modifierTimelineBindings.filter(
      (binding) => binding.inTimelineId !== timelineId && binding.outTimelineId !== timelineId,
    ),
    textAnimator: config.textAnimator?.timelineId === timelineId ? null : config.textAnimator,
  };
}

export function getNextAvailableBindingName(
  candidates: readonly string[],
  usedNames: ReadonlySet<string>,
): string | null {
  return candidates.find((candidate) => !usedNames.has(candidate)) ?? null;
}
