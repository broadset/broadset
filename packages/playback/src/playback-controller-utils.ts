import type { AnimationDefinition, ElementAnimationConfig, Timeline } from '@broadset/model';

import { type AnimationTargetsResolver, escapeCssIdentifier } from './playback-dom';

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

function collectTimelinePropertyNames(timeline: Timeline): ReadonlyMap<string | null, ReadonlySet<string>> {
  const propertiesByTarget = new Map<string | null, Set<string>>();

  for (const keyframe of timeline.keyframes) {
    const targetId = keyframe.target ?? null;
    const propertyNames = propertiesByTarget.get(targetId) ?? new Set<string>();

    for (const propertyName of Object.keys(keyframe.properties)) {
      if (propertyName === 'pathCommands') {
        continue;
      }

      if (propertyName === 'motionPath') {
        propertyNames.add('x');
        propertyNames.add('y');
        continue;
      }

      if (propertyName === 'motionRotate') {
        propertyNames.add('rotation');
        continue;
      }

      propertyNames.add(propertyName);
    }

    propertiesByTarget.set(targetId, propertyNames);
  }

  return propertiesByTarget;
}

export function clearTimelineStyles(args: {
  readonly root: HTMLElement;
  readonly targetsResolver: AnimationTargetsResolver;
  readonly container: HTMLElement;
  readonly timeline: Timeline;
}): void {
  for (const [targetId, propertyNames] of collectTimelinePropertyNames(args.timeline).entries()) {
    const container =
      targetId === null ?
        args.container
      : args.root.querySelector<HTMLElement>(`[data-element-id="${escapeCssIdentifier(targetId)}"]`);

    if (container === null) {
      continue;
    }

    args.targetsResolver.clearStyles(container, [...propertyNames]);
  }
}

export function validateAnimationRegistry(registry: readonly AnimationDefinition[]): void {
  for (const entry of registry) {
    const triggeredReferences = new Set<string>();

    for (const binding of entry.config.stateTimelineBindings) {
      triggeredReferences.add(binding.timelineId);
    }

    for (const binding of entry.config.modifierTimelineBindings) {
      triggeredReferences.add(binding.inTimelineId);
      binding.outTimelineId !== undefined && triggeredReferences.add(binding.outTimelineId);
    }

    for (const reference of triggeredReferences) {
      const timeline = findTimelineByReference(entry.config.timelines, reference);

      if (timeline === null) {
        continue;
      }

      for (const keyframe of timeline.keyframes) {
        if (keyframe.action === 'none') {
          continue;
        }

        if (keyframe.target === undefined || keyframe.target === entry.elementId) {
          throw new Error(
            `Circular dependency detected: triggered timeline "${timeline.name}" for element "${entry.elementId}" contains a self-targeting action marker.`,
          );
        }
      }
    }
  }
}
