import type { AnimationRegistryEntry, Keyframe, Timeline } from '@broadset/model';

import { interpolateKeyframeProperties } from './interpolation';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default tween duration appended after the last keyframe offset. */
const DEFAULT_TWEEN_DURATION_MS = 300;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Computed frame output for a single timeline at a specific point in time. */
export interface TimelineFrame {
  readonly timelineId: string;
  readonly timelineName: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly activeState: string | null;
  readonly modifiers: readonly string[];
  readonly targetProperties: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly childFrames: Readonly<Record<string, TimelineFrame>>;
}

// ---------------------------------------------------------------------------
// Duration computation
// ---------------------------------------------------------------------------

/**
 * Compute the total duration of a timeline in milliseconds.
 *
 * Duration = max(own max offset, child envelope max) + DEFAULT_TWEEN_DURATION_MS.
 * Empty timelines have duration 0.
 */
export function computeTimelineDuration(timeline: Timeline): number {
  let maxOffset = 0;

  for (const entry of timeline.entries) {
    if (entry.offsetMs > maxOffset) {
      maxOffset = entry.offsetMs;
    }
  }

  // Account for child timelines: parent trigger offset + child duration
  if (timeline.childTimelines) {
    const parentTriggerOffset = maxOffset;
    let maxChildEnvelope = 0;

    for (const childBinding of timeline.childTimelines) {
      const childDuration = computeTimelineDuration(childBinding.timeline);
      const childEnvelope = parentTriggerOffset + childDuration;

      if (childEnvelope > maxChildEnvelope) {
        maxChildEnvelope = childEnvelope;
      }
    }

    if (maxChildEnvelope > maxOffset + DEFAULT_TWEEN_DURATION_MS) {
      return maxChildEnvelope;
    }
  }

  if (maxOffset === 0 && timeline.entries.length === 0) {
    return 0;
  }

  return maxOffset + DEFAULT_TWEEN_DURATION_MS;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Sort keyframes by offsetMs (ascending), stable. */
function sortedEntries(entries: readonly Keyframe[]): readonly Keyframe[] {
  return [...entries].sort((a, b) => a.offsetMs - b.offsetMs);
}

/**
 * Compute action state (activeState + modifiers) by replaying all actions
 * from t=0 up to the given time. Always replays from scratch (idempotent).
 */
function computeActionState(
  sorted: readonly Keyframe[],
  timeMs: number,
): { readonly activeState: string | null; readonly modifiers: readonly string[] } {
  let activeState: string | null = null;
  const modifierSet = new Set<string>();

  for (const kf of sorted) {
    if (kf.offsetMs > timeMs) break;

    switch (kf.action) {
      case 'setState':
        activeState = kf.payload ?? null;
        break;
      case 'addModifier':
        if (kf.payload) {
          modifierSet.add(kf.payload);
        }

        break;
      case 'removeModifier':
        if (kf.payload) {
          modifierSet.delete(kf.payload);
        }

        break;
      case 'none':
        break;
    }
  }

  return { activeState, modifiers: [...modifierSet] };
}

/**
 * Find the surrounding keyframe pair for interpolation at a given time.
 * Groups keyframes by whether they have a target, then finds the pair
 * for each group.
 */
function findSurroundingKeyframes(
  sorted: readonly Keyframe[],
  timeMs: number,
  target: string | undefined,
): {
  readonly from: Keyframe | undefined;
  readonly to: Keyframe | undefined;
} {
  const filtered =
    target !== undefined ? sorted.filter((kf) => kf.target === target) : sorted.filter((kf) => kf.target === undefined);

  // Only consider keyframes with properties
  const withProps = filtered.filter((kf) => Object.keys(kf.properties).length > 0);

  let from: Keyframe | undefined;
  let to: Keyframe | undefined;

  for (const kf of withProps) {
    if (kf.offsetMs <= timeMs) {
      from = kf;
    } else if (to === undefined) {
      to = kf;
    }
  }

  return { from, to };
}

/**
 * Interpolate properties between two keyframes at a given time.
 */
function interpolateProperties(from: Keyframe, to: Keyframe | undefined, timeMs: number): Record<string, unknown> {
  if (!to) {
    // After last keyframe — hold from-values
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(from.properties)) {
      const prop = from.properties[key];

      if (prop) {
        result[key] = prop.value;
      }
    }

    return result;
  }

  const duration = to.offsetMs - from.offsetMs;

  if (duration <= 0) {
    // Same offset — use to-values
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(to.properties)) {
      const prop = to.properties[key];

      if (prop) {
        result[key] = prop.value;
      }
    }

    return result;
  }

  const rawT = (timeMs - from.offsetMs) / duration;
  const t = Math.max(0, Math.min(1, rawT));

  return interpolateKeyframeProperties(from.properties, to.properties, t);
}

/**
 * Collect all unique target element IDs from the keyframe entries.
 */
function collectTargetIds(entries: readonly Keyframe[]): readonly string[] {
  const targets = new Set<string>();

  for (const kf of entries) {
    if (kf.target !== undefined) {
      targets.add(kf.target);
    }
  }

  return [...targets];
}

// ---------------------------------------------------------------------------
// Frame computation — public API
// ---------------------------------------------------------------------------

/**
 * Compute the full interpolated frame for a timeline at a specific time.
 *
 * Returns interpolated properties, cumulative action state, target property
 * routing, and child timeline frames — all as a pure function.
 */
export function computeTimelineFrame(timeline: Timeline, timeMs: number): TimelineFrame {
  const sorted = sortedEntries(timeline.entries);

  // 1. Action state
  const { activeState, modifiers } = computeActionState(sorted, timeMs);

  // 2. Owner properties (entries without target)
  const { from: ownerFrom, to: ownerTo } = findSurroundingKeyframes(sorted, timeMs, undefined);
  const properties: Record<string, unknown> = ownerFrom ? interpolateProperties(ownerFrom, ownerTo, timeMs) : {};

  // 3. Target properties
  const targetIds = collectTargetIds(sorted);
  const targetProperties: Record<string, Record<string, unknown>> = {};

  for (const targetId of targetIds) {
    const { from: tFrom, to: tTo } = findSurroundingKeyframes(sorted, timeMs, targetId);

    if (tFrom) {
      targetProperties[targetId] = interpolateProperties(tFrom, tTo, timeMs);
    }
  }

  // 4. Child timeline frames
  const childFrames: Record<string, TimelineFrame> = {};

  if (timeline.childTimelines) {
    // Child trigger offset = max own keyframe offset
    const maxOwnOffset = sorted.length > 0 ? (sorted[sorted.length - 1]?.offsetMs ?? 0) : 0;

    for (const childBinding of timeline.childTimelines) {
      if (timeMs < maxOwnOffset) {
        // Child hasn't started yet
        continue;
      }

      const childTimeMs = timeMs - maxOwnOffset;
      const childFrame = computeTimelineFrame(childBinding.timeline, childTimeMs);

      childFrames[childBinding.childElementId] = childFrame;
    }
  }

  return {
    timelineId: timeline.id,
    timelineName: timeline.name,
    properties,
    activeState,
    modifiers,
    targetProperties,
    childFrames,
  };
}

// ---------------------------------------------------------------------------
// Batch element timeline computation — public API
// ---------------------------------------------------------------------------

/**
 * Compute all named timeline frames for an element at a given time.
 *
 * Elements with no registry entry return an empty array.
 */
export function computeElementTimelines(
  registry: readonly AnimationRegistryEntry[],
  elementId: string,
  timeMs: number,
): readonly TimelineFrame[] {
  const entry = registry.find((e) => e.elementId === elementId);

  if (!entry) {
    return [];
  }

  return entry.config.timelines.map((tl) => computeTimelineFrame(tl, timeMs));
}
