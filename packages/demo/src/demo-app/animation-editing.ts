import {
  type EasingMode,
  type ElementAnimationConfig,
  type Keyframe,
  type KeyframeValue,
  type Timeline,
} from '@broadset/model';
import { computeTimelineFrame } from '@broadset/playback';

const DEFAULT_TIMELINE_DURATION_MS = 1000;
const DEFAULT_TIMELINE_PAD_MS = 1000;
const MIN_TIMELINE_DURATION_MS = 3000;
const TIMELINE_SNAP_INTERVAL_MS = 100;

function createKeyframe(
  offsetMs: number,
  name: string,
  properties: Readonly<Record<string, KeyframeValue>> = {},
  target?: string,
): Keyframe {
  return {
    name,
    action: 'none',
    offsetMs,
    properties,
    ...(target === undefined ? {} : { target }),
  };
}

function collectPropertyPrototypes(
  timeline: Timeline,
  targetId: string | null = null,
): Readonly<Record<string, KeyframeValue>> {
  const prototypes: Record<string, KeyframeValue> = {};

  for (const keyframe of timeline.keyframes) {
    if ((keyframe.target ?? null) !== targetId) {
      continue;
    }

    for (const [propertyName, value] of Object.entries(keyframe.properties)) {
      prototypes[propertyName] = value;
    }
  }

  return prototypes;
}

function createKeyframeValueFromSample(
  sampledValue: unknown,
  prototype: KeyframeValue | undefined,
): KeyframeValue | null {
  const easing = prototype?.easing ?? 'ease';

  if (typeof sampledValue === 'number') {
    return { type: 'number', value: sampledValue, easing };
  }

  if (Array.isArray(sampledValue)) {
    const sampledTuple: readonly unknown[] = sampledValue;

    if (sampledTuple.every((entry: unknown) => typeof entry === 'number')) {
      return { type: 'tuple', value: sampledTuple, easing };
    }
  }

  if (typeof sampledValue === 'string') {
    if (prototype?.type === 'color') {
      return { type: 'color', value: sampledValue, easing };
    }

    if (prototype?.type === 'string' && prototype.countingFormat !== undefined) {
      return { type: 'string', value: sampledValue, easing, countingFormat: prototype.countingFormat };
    }

    return { type: 'string', value: sampledValue, easing };
  }

  return null;
}

function createSampledProperties(
  sampledValues: Readonly<Record<string, unknown>>,
  prototypes: Readonly<Record<string, KeyframeValue>>,
): Readonly<Record<string, KeyframeValue>> {
  const sampledProperties: Record<string, KeyframeValue> = {};

  for (const [propertyName, sampledValue] of Object.entries(sampledValues)) {
    const nextValue = createKeyframeValueFromSample(sampledValue, prototypes[propertyName]);

    if (nextValue !== null) {
      sampledProperties[propertyName] = nextValue;
    }
  }

  return sampledProperties;
}

function createSampledKeyframes(
  timeline: Timeline,
  offsetMs: number,
  frame: ReturnType<typeof computeTimelineFrame>,
): readonly Keyframe[] {
  const keyframeBaseName = `keyframe-${String(timeline.keyframes.length + 1)}`;
  const ownerProperties = createSampledProperties(frame.properties, collectPropertyPrototypes(timeline));
  const keyframes: Keyframe[] =
    Object.keys(ownerProperties).length === 0 ? [] : [createKeyframe(offsetMs, keyframeBaseName, ownerProperties)];

  for (const [targetId, targetProperties] of Object.entries(frame.targetProperties)) {
    const sampledTargetProperties = createSampledProperties(
      targetProperties,
      collectPropertyPrototypes(timeline, targetId),
    );

    if (Object.keys(sampledTargetProperties).length > 0) {
      keyframes.push(createKeyframe(offsetMs, `${keyframeBaseName}-${targetId}`, sampledTargetProperties, targetId));
    }
  }

  if (keyframes.length === 0) {
    keyframes.push(createKeyframe(offsetMs, keyframeBaseName));
  }

  return keyframes;
}

function addTimelineKeyframeWithFrame(
  timeline: Timeline,
  offsetMs: number,
  frame: ReturnType<typeof computeTimelineFrame>,
): Timeline {
  const nextOffsetMs = snapTimelineOffsetMs(offsetMs);
  const nextKeyframes = [...timeline.keyframes, ...createSampledKeyframes(timeline, nextOffsetMs, frame)].sort(
    (left, right) => left.offsetMs - right.offsetMs,
  );
  const nextChildTimelines = timeline.childTimelines?.map((childBinding) => {
    const childFrame = frame.childFrames[childBinding.childElementId];

    if (childFrame === undefined) {
      return childBinding;
    }

    return {
      ...childBinding,
      timeline: addTimelineKeyframeWithFrame(childBinding.timeline, childFrame.timeMs, childFrame),
    };
  });

  return {
    ...timeline,
    ...(nextChildTimelines === undefined ? {} : { childTimelines: nextChildTimelines }),
    durationMs: Math.max(computeTimelineDurationMs(timeline), nextOffsetMs),
    keyframes: nextKeyframes,
  };
}

export function snapTimelineOffsetMs(offsetMs: number): number {
  return Math.round(Math.max(0, offsetMs) / TIMELINE_SNAP_INTERVAL_MS) * TIMELINE_SNAP_INTERVAL_MS;
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

export function addTimelineKeyframe(timeline: Timeline, offsetMs: number): Timeline {
  const nextOffsetMs = snapTimelineOffsetMs(offsetMs);
  const frame = computeTimelineFrame({ timeline, timeMs: nextOffsetMs });

  return addTimelineKeyframeWithFrame(timeline, nextOffsetMs, frame);
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
