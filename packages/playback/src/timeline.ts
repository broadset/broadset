import type { AnimationDefinition, Keyframe, Timeline } from '@broadset/model';

import { applyEasing, interpolateKeyframeProperties } from './interpolation';
import { sampleMotionPath } from './motion-path';

export const DEFAULT_TWEEN_DURATION_MS = 300;

export interface DerivedTimelineState {
  readonly activeState: string | null;
  readonly modifiers: ReadonlySet<string>;
}

export interface TimelineFrame {
  readonly timelineId: string;
  readonly timelineName: string;
  readonly timeMs: number;
  readonly durationMs: number;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly targetProperties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly targetStates?: Readonly<Record<string, DerivedTimelineState>> | undefined;
  readonly activeState: string | null;
  readonly modifiers: ReadonlySet<string>;
  readonly childFrames: Readonly<Record<string, TimelineFrame>>;
}

export interface ComputeTimelineFrameOptions {
  readonly timeline: Timeline;
  readonly timeMs: number;
}

export interface ComputeElementTimelineFramesOptions {
  readonly animations: readonly AnimationDefinition[];
  readonly elementId: string;
  readonly timeMs: number;
}

export interface ComputeStaggerOffsetMsOptions {
  readonly index: number;
  readonly childCount: number;
  readonly delayMs: number;
  readonly direction: 'normal' | 'reverse' | 'center';
}

interface TimeMapping {
  readonly iterationIndex: number;
  readonly effectiveTimeMs: number;
}

function sortKeyframesByOffset(keyframes: readonly Keyframe[]): readonly Keyframe[] {
  return [...keyframes].sort((left, right) => left.offsetMs - right.offsetMs);
}

function isFiniteDuration(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function computeStaggerOffsetMs(options: ComputeStaggerOffsetMsOptions): number {
  if (options.childCount <= 0 || options.delayMs <= 0) {
    return 0;
  }

  switch (options.direction) {
    case 'reverse':
      return (options.childCount - 1 - options.index) * options.delayMs;

    case 'center': {
      const centerIndex = (options.childCount - 1) / 2;

      return Math.floor(Math.abs(options.index - centerIndex)) * options.delayMs;
    }

    case 'normal':
    default:
      return options.index * options.delayMs;
  }
}

function computeChildStartOffsetMs(timeline: Timeline, childIndex: number): number {
  const childBinding = timeline.childTimelines?.[childIndex];

  if (childBinding === undefined) {
    return 0;
  }

  const baseOffsetMs = childBinding.delayMs ?? 0;
  const staggerOffsetMs = computeStaggerOffsetMs({
    index: childIndex,
    childCount: timeline.childTimelines?.length ?? 0,
    delayMs: childBinding.delayMs ?? 0,
    direction: childBinding.direction ?? 'normal',
  });

  return baseOffsetMs + staggerOffsetMs;
}

export function computeTimelineDuration(timeline: Timeline): number {
  if (timeline.durationMs !== undefined) {
    return timeline.durationMs;
  }

  if (timeline.keyframes.length === 0 && (timeline.childTimelines?.length ?? 0) === 0) {
    return 0;
  }

  const maxKeyframeOffset = timeline.keyframes.reduce(
    (currentMax, keyframe) => Math.max(currentMax, keyframe.offsetMs),
    0,
  );
  let durationMs = maxKeyframeOffset + DEFAULT_TWEEN_DURATION_MS;

  for (let index = 0; index < (timeline.childTimelines?.length ?? 0); index += 1) {
    const childBinding = timeline.childTimelines?.[index];

    if (childBinding === undefined) {
      continue;
    }

    const childDuration = computeTimelineDuration(childBinding.timeline);
    const childStartOffsetMs = computeChildStartOffsetMs(timeline, index);

    durationMs = Math.max(durationMs, childStartOffsetMs + childDuration);
  }

  return durationMs;
}

export function computeTimelineLoopDuration(timeline: Timeline): number {
  const baseDuration = computeTimelineDuration(timeline);

  if (!isFiniteDuration(baseDuration)) {
    return 0;
  }

  if (timeline.loop === 'none' || timeline.loop === undefined) {
    return baseDuration;
  }

  if (timeline.loopCount === null || timeline.loopCount === undefined) {
    return Infinity;
  }

  return baseDuration * timeline.loopCount;
}

function mapTimelineTime(timeline: Timeline, timeMs: number): TimeMapping {
  const baseDuration = computeTimelineDuration(timeline);

  if (!isFiniteDuration(baseDuration)) {
    return { iterationIndex: 0, effectiveTimeMs: 0 };
  }

  const normalizedTime = Math.max(0, timeMs);

  if (timeline.loop === 'loop') {
    return {
      iterationIndex: Math.floor(normalizedTime / baseDuration),
      effectiveTimeMs: normalizedTime % baseDuration,
    };
  }

  if (timeline.loop === 'ping-pong') {
    const iterationIndex = Math.floor(normalizedTime / baseDuration);
    const iterationTime = normalizedTime % baseDuration;
    const effectiveTimeMs = iterationIndex % 2 === 1 ? baseDuration - iterationTime : iterationTime;

    return { iterationIndex, effectiveTimeMs };
  }

  return {
    iterationIndex: 0,
    effectiveTimeMs: Math.min(normalizedTime, baseDuration),
  };
}

export function deriveTimelineState(timeline: Timeline, timeMs: number, targetId: string | null = null): DerivedTimelineState {
  const mapping = mapTimelineTime(timeline, timeMs);
  const activeModifiers = new Set<string>();
  let activeState: string | null = null;

  for (const keyframe of sortKeyframesByOffset(timeline.keyframes)) {
    if ((keyframe.target ?? null) !== targetId) {
      continue;
    }

    if (keyframe.offsetMs > mapping.effectiveTimeMs) {
      break;
    }

    switch (keyframe.action) {
      case 'setState':
        activeState = keyframe.payload ?? null;
        break;
      case 'addModifier':
        keyframe.payload !== undefined && activeModifiers.add(keyframe.payload);
        break;
      case 'removeModifier':
        keyframe.payload !== undefined && activeModifiers.delete(keyframe.payload);
        break;
      case 'none':
      default:
        break;
    }
  }

  return {
    activeState,
    modifiers: activeModifiers,
  };
}

function collectTargetIds(timeline: Timeline): readonly (string | null)[] {
  const targetIds = new Set<string | null>([null]);

  for (const keyframe of timeline.keyframes) {
    targetIds.add(keyframe.target ?? null);
  }

  return [...targetIds];
}

function collectActionTargetIds(timeline: Timeline): readonly string[] {
  const targetIds = new Set<string>();

  for (const keyframe of timeline.keyframes) {
    if (keyframe.action === 'none' || keyframe.target === undefined) {
      continue;
    }

    targetIds.add(keyframe.target);
  }

  return [...targetIds];
}

function collectPropertyNamesForTarget(timeline: Timeline, targetId: string | null): readonly string[] {
  const propertyNames = new Set<string>();

  for (const keyframe of timeline.keyframes) {
    if ((keyframe.target ?? null) !== targetId) {
      continue;
    }

    for (const propertyName of Object.keys(keyframe.properties)) {
      if (propertyName !== 'pathCommands') {
        propertyNames.add(propertyName);
      }
    }
  }

  return [...propertyNames];
}

function findBoundingKeyframes(
  timeline: Timeline,
  targetId: string | null,
  propertyName: string,
  timeMs: number,
): { readonly fromKeyframe?: Keyframe | undefined; readonly toKeyframe?: Keyframe | undefined } {
  let fromKeyframe: Keyframe | undefined;
  let toKeyframe: Keyframe | undefined;

  for (const keyframe of sortKeyframesByOffset(timeline.keyframes)) {
    if ((keyframe.target ?? null) !== targetId) {
      continue;
    }

    if (keyframe.properties[propertyName] === undefined) {
      continue;
    }

    if (keyframe.offsetMs <= timeMs) {
      fromKeyframe = keyframe;
      continue;
    }

    toKeyframe = keyframe;
    break;
  }

  return { fromKeyframe, toKeyframe };
}

function computePropertyValue(
  timeline: Timeline,
  targetId: string | null,
  propertyName: string,
  timeMs: number,
): unknown {
  const bounds = findBoundingKeyframes(timeline, targetId, propertyName, timeMs);

  if (bounds.fromKeyframe === undefined) {
    return undefined;
  }

  if (bounds.toKeyframe === undefined) {
    return bounds.fromKeyframe.properties[propertyName]?.value;
  }

  const duration = bounds.toKeyframe.offsetMs - bounds.fromKeyframe.offsetMs;
  const progress = duration <= 0 ? 1 : (timeMs - bounds.fromKeyframe.offsetMs) / duration;
  const interpolatedProperties = interpolateKeyframeProperties({
    fromProperties: bounds.fromKeyframe.properties,
    toProperties: bounds.toKeyframe.properties,
    progress,
  });

  return interpolatedProperties[propertyName];
}

function computePropertiesForTarget(
  timeline: Timeline,
  targetId: string | null,
  timeMs: number,
): Readonly<Record<string, unknown>> {
  const properties: Record<string, unknown> = {};

  for (const propertyName of collectPropertyNamesForTarget(timeline, targetId)) {
    const value = computePropertyValue(timeline, targetId, propertyName, timeMs);

    if (value !== undefined) {
      properties[propertyName] = value;
    }
  }

  return properties;
}

function applyMotionPathProperties(timeline: Timeline, timeMs: number, properties: Record<string, unknown>): void {
  const motionPathBounds = findBoundingKeyframes(timeline, null, 'motionPath', timeMs);
  const fromPath = motionPathBounds.fromKeyframe?.properties['motionPath'];

  if (fromPath?.type !== 'string') {
    return;
  }

  const toPath = motionPathBounds.toKeyframe?.properties['motionPath'];
  const fromOffset = motionPathBounds.fromKeyframe?.offsetMs ?? 0;
  const toOffset = motionPathBounds.toKeyframe?.offsetMs ?? fromOffset;
  const duration = toOffset - fromOffset;
  const localProgress = duration <= 0 ? 1 : (timeMs - fromOffset) / duration;
  const easedProgress = applyEasing(fromPath.easing, localProgress);
  const sample = sampleMotionPath(toPath?.type === 'string' ? toPath.value : fromPath.value, easedProgress);

  properties['x'] = sample.x;
  properties['y'] = sample.y;

  const motionRotateValue = computePropertyValue(timeline, null, 'motionRotate', timeMs);
  const motionRotateEnabled = motionRotateValue === true || motionRotateValue === 'true';

  if (motionRotateEnabled) {
    const baseRotation = typeof properties['rotation'] === 'number' ? properties['rotation'] : 0;

    properties['rotation'] = baseRotation + sample.angleDegrees;
  }
}

export function computeTimelineFrame(options: ComputeTimelineFrameOptions): TimelineFrame {
  const durationMs = computeTimelineDuration(options.timeline);
  const mappedTime = mapTimelineTime(options.timeline, options.timeMs).effectiveTimeMs;
  const ownerProperties = { ...computePropertiesForTarget(options.timeline, null, mappedTime) };

  applyMotionPathProperties(options.timeline, mappedTime, ownerProperties);

  const targetProperties: Record<string, Readonly<Record<string, unknown>>> = {};

  for (const targetId of collectTargetIds(options.timeline)) {
    if (targetId === null) {
      continue;
    }

    const properties = computePropertiesForTarget(options.timeline, targetId, mappedTime);

    if (Object.keys(properties).length > 0) {
      targetProperties[targetId] = properties;
    }
  }

  const targetStates: Record<string, DerivedTimelineState> = {};

  for (const targetId of collectActionTargetIds(options.timeline)) {
    targetStates[targetId] = deriveTimelineState(options.timeline, options.timeMs, targetId);
  }

  const childFrames: Record<string, TimelineFrame> = {};

  for (let index = 0; index < (options.timeline.childTimelines?.length ?? 0); index += 1) {
    const childBinding = options.timeline.childTimelines?.[index];

    if (childBinding === undefined) {
      continue;
    }

    const childStartOffsetMs = computeChildStartOffsetMs(options.timeline, index);

    if (mappedTime < childStartOffsetMs) {
      continue;
    }

    childFrames[childBinding.childElementId] = computeTimelineFrame({
      timeline: childBinding.timeline,
      timeMs: mappedTime - childStartOffsetMs,
    });
  }

  const derivedState = deriveTimelineState(options.timeline, options.timeMs);

  return {
    timelineId: options.timeline.id,
    timelineName: options.timeline.name,
    timeMs: mappedTime,
    durationMs,
    properties: ownerProperties,
    targetProperties,
    targetStates,
    activeState: derivedState.activeState,
    modifiers: derivedState.modifiers,
    childFrames,
  };
}

export function computeElementTimelineFrames(options: ComputeElementTimelineFramesOptions): readonly TimelineFrame[] {
  const animationEntry = options.animations.find((entry) => entry.elementId === options.elementId);

  if (animationEntry === undefined) {
    return [];
  }

  return animationEntry.config.timelines.map((timeline) =>
    computeTimelineFrame({
      timeline,
      timeMs: options.timeMs,
    }),
  );
}
