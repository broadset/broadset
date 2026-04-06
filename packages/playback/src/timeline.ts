import type { AnimationDefinition, Keyframe, Timeline } from '@broadset/model';

import { applyEasing, interpolateKeyframeProperties } from './interpolation';

export const DEFAULT_TWEEN_DURATION_MS = 300;

const MOTION_PATH_SAMPLE_COUNT = 64;

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

interface Point {
  readonly x: number;
  readonly y: number;
}

interface SamplePoint extends Point {
  readonly distance: number;
}

interface MotionSample extends Point {
  readonly angleDegrees: number;
}

interface PathSegment {
  readonly start: Point;
  readonly end: Point;
  pointAt(t: number): Point;
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

export function deriveTimelineState(timeline: Timeline, timeMs: number): DerivedTimelineState {
  const mapping = mapTimelineTime(timeline, timeMs);
  const activeModifiers = new Set<string>();
  let activeState: string | null = null;

  for (const keyframe of sortKeyframesByOffset(timeline.keyframes)) {
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

function parsePathTokens(pathData: string): readonly string[] {
  return pathData.match(/[a-zA-Z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gu) ?? [];
}

function createLineSegment(start: Point, end: Point): PathSegment {
  return {
    start,
    end,
    pointAt(t: number): Point {
      return {
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
      };
    },
  };
}

function createQuadraticSegment(start: Point, control: Point, end: Point): PathSegment {
  return {
    start,
    end,
    pointAt(t: number): Point {
      const inverse = 1 - t;

      return {
        x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
        y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
      };
    },
  };
}

function createCubicSegment(start: Point, controlOne: Point, controlTwo: Point, end: Point): PathSegment {
  return {
    start,
    end,
    pointAt(t: number): Point {
      const inverse = 1 - t;

      return {
        x:
          inverse * inverse * inverse * start.x +
          3 * inverse * inverse * t * controlOne.x +
          3 * inverse * t * t * controlTwo.x +
          t * t * t * end.x,
        y:
          inverse * inverse * inverse * start.y +
          3 * inverse * inverse * t * controlOne.y +
          3 * inverse * t * t * controlTwo.y +
          t * t * t * end.y,
      };
    },
  };
}

function parseMotionPath(pathData: string): readonly PathSegment[] {
  const tokens = parsePathTokens(pathData);
  const segments: PathSegment[] = [];
  let tokenIndex = 0;
  let currentPoint: Point = { x: 0, y: 0 };
  let subpathStart: Point = currentPoint;
  let command = '';

  while (tokenIndex < tokens.length) {
    const nextToken = tokens[tokenIndex];

    if (nextToken === undefined) {
      break;
    }

    if (/^[a-zA-Z]$/u.test(nextToken)) {
      command = nextToken;
      tokenIndex += 1;
    }

    const relative = command === command.toLowerCase();
    const normalizedCommand = command.toUpperCase();

    switch (normalizedCommand) {
      case 'M': {
        const x = Number(tokens[tokenIndex] ?? '0');
        const y = Number(tokens[tokenIndex + 1] ?? '0');

        tokenIndex += 2;
        currentPoint = relative ? { x: currentPoint.x + x, y: currentPoint.y + y } : { x, y };
        subpathStart = currentPoint;
        command = relative ? 'l' : 'L';
        break;
      }

      case 'L': {
        const x = Number(tokens[tokenIndex] ?? '0');
        const y = Number(tokens[tokenIndex + 1] ?? '0');

        tokenIndex += 2;

        const end = relative ? { x: currentPoint.x + x, y: currentPoint.y + y } : { x, y };

        segments.push(createLineSegment(currentPoint, end));
        currentPoint = end;
        break;
      }

      case 'Q': {
        const controlX = Number(tokens[tokenIndex] ?? '0');
        const controlY = Number(tokens[tokenIndex + 1] ?? '0');
        const endX = Number(tokens[tokenIndex + 2] ?? '0');
        const endY = Number(tokens[tokenIndex + 3] ?? '0');

        tokenIndex += 4;

        const control =
          relative ? { x: currentPoint.x + controlX, y: currentPoint.y + controlY } : { x: controlX, y: controlY };
        const end = relative ? { x: currentPoint.x + endX, y: currentPoint.y + endY } : { x: endX, y: endY };

        segments.push(createQuadraticSegment(currentPoint, control, end));
        currentPoint = end;
        break;
      }

      case 'C': {
        const controlOneX = Number(tokens[tokenIndex] ?? '0');
        const controlOneY = Number(tokens[tokenIndex + 1] ?? '0');
        const controlTwoX = Number(tokens[tokenIndex + 2] ?? '0');
        const controlTwoY = Number(tokens[tokenIndex + 3] ?? '0');
        const endX = Number(tokens[tokenIndex + 4] ?? '0');
        const endY = Number(tokens[tokenIndex + 5] ?? '0');

        tokenIndex += 6;

        const controlOne =
          relative ?
            { x: currentPoint.x + controlOneX, y: currentPoint.y + controlOneY }
          : { x: controlOneX, y: controlOneY };
        const controlTwo =
          relative ?
            { x: currentPoint.x + controlTwoX, y: currentPoint.y + controlTwoY }
          : { x: controlTwoX, y: controlTwoY };
        const end = relative ? { x: currentPoint.x + endX, y: currentPoint.y + endY } : { x: endX, y: endY };

        segments.push(createCubicSegment(currentPoint, controlOne, controlTwo, end));
        currentPoint = end;
        break;
      }

      case 'Z': {
        segments.push(createLineSegment(currentPoint, subpathStart));
        currentPoint = subpathStart;
        break;
      }

      default:
        tokenIndex += 1;
        break;
    }
  }

  return segments;
}

function getSegmentSamples(segment: PathSegment): readonly SamplePoint[] {
  const samples: SamplePoint[] = [{ x: segment.start.x, y: segment.start.y, distance: 0 }];
  let distance = 0;
  let previousPoint = segment.start;

  for (let index = 1; index <= MOTION_PATH_SAMPLE_COUNT; index += 1) {
    const point = segment.pointAt(index / MOTION_PATH_SAMPLE_COUNT);
    const deltaX = point.x - previousPoint.x;
    const deltaY = point.y - previousPoint.y;

    distance += Math.hypot(deltaX, deltaY);
    samples.push({ x: point.x, y: point.y, distance });
    previousPoint = point;
  }

  return samples;
}

function sampleMotionPath(pathData: string, progress: number): MotionSample {
  const segments = parseMotionPath(pathData);

  if (segments.length === 0) {
    return { x: 0, y: 0, angleDegrees: 0 };
  }

  const segmentSamples = segments.map((segment) => getSegmentSamples(segment));
  const segmentLengths = segmentSamples.map((samples) => samples[samples.length - 1]?.distance ?? 0);
  const totalLength = segmentLengths.reduce((sum, value) => sum + value, 0);

  if (totalLength <= 0) {
    const firstSegment = segments[0];

    if (firstSegment === undefined) {
      return { x: 0, y: 0, angleDegrees: 0 };
    }

    return { x: firstSegment.start.x, y: firstSegment.start.y, angleDegrees: 0 };
  }

  const targetDistance = totalLength * Math.max(0, Math.min(1, progress));
  let traversedLength = 0;

  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const samples = segmentSamples[segmentIndex];
    const segmentLength = segmentLengths[segmentIndex] ?? 0;

    if (samples === undefined) {
      continue;
    }

    if (targetDistance > traversedLength + segmentLength && segmentIndex < segments.length - 1) {
      traversedLength += segmentLength;
      continue;
    }

    const localDistance = targetDistance - traversedLength;

    for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
      const previousSample = samples[sampleIndex - 1];
      const currentSample = samples[sampleIndex];

      if (previousSample === undefined || currentSample === undefined) {
        continue;
      }

      if (currentSample.distance < localDistance && sampleIndex < samples.length - 1) {
        continue;
      }

      const distanceDelta = currentSample.distance - previousSample.distance;
      const interpolation = distanceDelta <= 0 ? 0 : (localDistance - previousSample.distance) / distanceDelta;
      const x = previousSample.x + (currentSample.x - previousSample.x) * interpolation;
      const y = previousSample.y + (currentSample.y - previousSample.y) * interpolation;
      const angleDegrees =
        Math.atan2(currentSample.y - previousSample.y, currentSample.x - previousSample.x) * (180 / Math.PI);

      return { x, y, angleDegrees };
    }

    const lastSample = samples[samples.length - 1];

    if (lastSample !== undefined) {
      return { x: lastSample.x, y: lastSample.y, angleDegrees: 0 };
    }
  }

  const fallback = segments[segments.length - 1]?.end ?? { x: 0, y: 0 };

  return { x: fallback.x, y: fallback.y, angleDegrees: 0 };
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
    properties['rotation'] = sample.angleDegrees;
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
