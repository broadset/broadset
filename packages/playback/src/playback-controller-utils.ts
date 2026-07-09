import type { AnimationDefinition, ElementAnimationConfig, Timeline } from '@broadset/model';

export const EMPTY_ANIMATION_CONFIG: ElementAnimationConfig = {
  timelines: [],
  stateTimelineBindings: [],
  modifierTimelineBindings: [],
  textAnimator: null,
};

interface TimelineReferenceOptions {
  readonly timelineId?: string | undefined;
  readonly timelineName?: string | undefined;
}

function findTimelineByReference(timelines: readonly Timeline[], reference: string): Timeline | null {
  for (const timeline of timelines) {
    if (timeline.id === reference || timeline.name === reference) {
      return timeline;
    }
  }

  return null;
}

export function resolveTimelineFromReference(
  config: ElementAnimationConfig,
  options: TimelineReferenceOptions,
): Timeline | null {
  if (options.timelineId !== undefined) {
    return findTimelineByReference(config.timelines, options.timelineId);
  }

  if (options.timelineName !== undefined) {
    return findTimelineByReference(config.timelines, options.timelineName);
  }

  return config.timelines[0] ?? null;
}

export function resolveStateTimeline(config: ElementAnimationConfig, stateName: string): Timeline | null {
  const binding = config.stateTimelineBindings.find((entry) => entry.stateName === stateName);

  if (binding === undefined) {
    return null;
  }

  return findTimelineByReference(config.timelines, binding.timelineId);
}

export function getDefaultTimelines(config: ElementAnimationConfig): readonly Timeline[] {
  const inTimeline = resolveStateTimeline(config, 'IN');

  if (inTimeline !== null) {
    return [inTimeline];
  }

  const firstTimeline = config.timelines[0];

  return firstTimeline === undefined ? [] : [firstTimeline];
}

export function resolveModifierTimeline(
  config: ElementAnimationConfig,
  modifierName: string,
  kind: 'in' | 'out',
): Timeline | null {
  const binding = config.modifierTimelineBindings.find((entry) => entry.modifierName === modifierName);

  if (binding === undefined) {
    return null;
  }

  const reference = kind === 'in' ? binding.inTimelineId : binding.outTimelineId;

  if (reference === undefined) {
    return null;
  }

  return findTimelineByReference(config.timelines, reference);
}

function collectTriggeredReferences(entry: AnimationDefinition): Set<string> {
  const references = new Set<string>();

  for (const binding of entry.config.stateTimelineBindings) {
    references.add(binding.timelineId);
  }

  for (const binding of entry.config.modifierTimelineBindings) {
    references.add(binding.inTimelineId);

    if (binding.outTimelineId !== undefined) references.add(binding.outTimelineId);
  }

  return references;
}

function assertNoSelfTargetingActions(entry: AnimationDefinition, reference: string): void {
  const timeline = findTimelineByReference(entry.config.timelines, reference);

  if (timeline === null) return;

  for (const keyframe of timeline.keyframes) {
    if (keyframe.action === 'none') continue;

    if (keyframe.target === undefined || keyframe.target === entry.elementId) {
      throw new Error(
        `Circular dependency detected: triggered timeline "${timeline.name}" for element "${entry.elementId}" contains a self-targeting action marker.`,
      );
    }
  }
}

export function validateAnimationDefinitions(definitions: readonly AnimationDefinition[]): void {
  for (const entry of definitions) {
    for (const reference of setValues(collectTriggeredReferences(entry))) {
      assertNoSelfTargetingActions(entry, reference);
    }
  }
}

function setValues(values: ReadonlySet<string>): readonly string[] {
  return Array.from(values.values());
}
