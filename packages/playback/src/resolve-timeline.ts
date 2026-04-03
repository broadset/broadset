// ---------------------------------------------------------------------------
// Timeline resolution — lookup from animation config bindings
// ---------------------------------------------------------------------------

import type { ElementAnimationConfig, Timeline } from '@broadset/model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModifierTimelines {
  readonly inTimeline: Timeline | undefined;
  readonly outTimeline: Timeline | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find a timeline by ID first, falling back to name match.
 */
function findTimeline(timelines: readonly Timeline[], idOrName: string): Timeline | undefined {
  return timelines.find((tl) => tl.id === idOrName) ?? timelines.find((tl) => tl.name === idOrName);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the timeline bound to a given state name.
 *
 * Two-step lookup: find the binding by stateName, then resolve the
 * timeline by ID with name fallback. Returns null if no binding
 * exists for the requested state.
 */
export function resolveStateTimeline(config: ElementAnimationConfig, stateName: string): Timeline | null {
  const binding = config.stateTimelineBindings.find((b) => b.stateName === stateName);

  if (!binding) return null;

  return findTimeline(config.timelines, binding.timelineId) ?? null;
}

/**
 * Resolve in/out timelines for a modifier.
 *
 * Returns null if no binding exists. When a binding exists but a
 * timeline ID is not found in the config, the corresponding field
 * is undefined. When outTimelineId is not configured, outTimeline
 * is null.
 */
export function resolveModifierTimelines(
  config: ElementAnimationConfig,
  modifierName: string,
): ModifierTimelines | null {
  const binding = config.modifierTimelineBindings.find((b) => b.modifierName === modifierName);

  if (!binding) return null;

  const inTimeline = findTimeline(config.timelines, binding.inTimelineId);
  const outTimeline: Timeline | null =
    binding.outTimelineId ? (findTimeline(config.timelines, binding.outTimelineId) ?? null) : null;

  return { inTimeline, outTimeline };
}
