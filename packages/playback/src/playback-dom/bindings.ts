import type { ElementAnimationConfig } from '@broadset/model';

import { computeTextSegments } from '../text-animator';
import { computeTimelineFrame, type TimelineFrame } from '../timeline';
import { escapeCssIdentifier } from './runtime-guards';
import type { AnimationTargetsResolver } from './style-apply';
import { syncStateClasses } from './visibility';

export function applyTimelineFrameToDom(args: {
  readonly root: HTMLElement;
  readonly targetsResolver: AnimationTargetsResolver;
  readonly container: HTMLElement;
  readonly config: ElementAnimationConfig;
  readonly frame: TimelineFrame;
  readonly resolveElementConfig?: ((elementId: string) => ElementAnimationConfig | null | undefined) | undefined;
  readonly shouldApplyProperty?: ((propertyName: string) => boolean) | undefined;
  readonly onApplyStyles?: ((container: HTMLElement, propertyNames: readonly string[]) => void) | undefined;
}): void {
  const ownerProperties = filterProperties(args.frame.properties, args.shouldApplyProperty);

  if (Object.keys(ownerProperties).length > 0) {
    applyRuntimeStyles(args, args.container, ownerProperties);
  }

  syncStateClasses(args.container, args.config, args.frame.activeState, args.frame.modifiers);

  applyTargetProperties(args, args.frame.targetProperties);
  applyTargetStatesToDom(args, args.frame.targetStates);
  applyChildFramesToDom(args, args.frame.childFrames);

  applyTextAnimator(args);
}

function queryElementContainer(root: HTMLElement, elementId: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-element-id="${escapeCssIdentifier(elementId)}"]`);
}

function applyRuntimeStyles(
  args: {
    readonly targetsResolver: AnimationTargetsResolver;
    readonly onApplyStyles?: ((container: HTMLElement, propertyNames: readonly string[]) => void) | undefined;
  },
  container: HTMLElement,
  properties: Readonly<Record<string, unknown>>,
): void {
  args.targetsResolver.applyStyles(container, properties);
  args.onApplyStyles?.(container, Object.keys(properties));
}

function applyTargetProperties(
  args: {
    readonly root: HTMLElement;
    readonly targetsResolver: AnimationTargetsResolver;
    readonly shouldApplyProperty?: ((propertyName: string) => boolean) | undefined;
    readonly onApplyStyles?: ((container: HTMLElement, propertyNames: readonly string[]) => void) | undefined;
  },
  targetProperties: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
): void {
  for (const [targetId, properties] of Object.entries(targetProperties)) {
    const filteredProperties = filterProperties(properties, args.shouldApplyProperty);

    if (Object.keys(filteredProperties).length === 0) {
      continue;
    }

    const targetContainer = queryElementContainer(args.root, targetId);

    if (targetContainer !== null) {
      applyRuntimeStyles(args, targetContainer, filteredProperties);
    }
  }
}

function resolveConfigForElement(
  args: {
    readonly config: ElementAnimationConfig;
    readonly resolveElementConfig?: ((elementId: string) => ElementAnimationConfig | null | undefined) | undefined;
  },
  elementId: string,
): ElementAnimationConfig {
  return args.resolveElementConfig?.(elementId) ?? args.config;
}

function applyTargetStatesToDom(
  args: {
    readonly root: HTMLElement;
    readonly config: ElementAnimationConfig;
    readonly resolveElementConfig?: ((elementId: string) => ElementAnimationConfig | null | undefined) | undefined;
  },
  targetStates: TimelineFrame['targetStates'] | undefined,
): void {
  for (const [targetId, state] of Object.entries(targetStates ?? {})) {
    const targetContainer = queryElementContainer(args.root, targetId);

    if (targetContainer !== null) {
      syncStateClasses(targetContainer, resolveConfigForElement(args, targetId), state.activeState, state.modifiers);
    }
  }
}

function applyChildFramesToDom(
  args: {
    readonly root: HTMLElement;
    readonly targetsResolver: AnimationTargetsResolver;
    readonly config: ElementAnimationConfig;
    readonly resolveElementConfig?: ((elementId: string) => ElementAnimationConfig | null | undefined) | undefined;
    readonly shouldApplyProperty?: ((propertyName: string) => boolean) | undefined;
    readonly onApplyStyles?: ((container: HTMLElement, propertyNames: readonly string[]) => void) | undefined;
  },
  childFrames: TimelineFrame['childFrames'],
): void {
  for (const [childElementId, childFrame] of Object.entries(childFrames)) {
    const childContainer = queryElementContainer(args.root, childElementId);

    if (childContainer === null) {
      continue;
    }

    syncStateClasses(
      childContainer,
      resolveConfigForElement(args, childElementId),
      childFrame.activeState,
      childFrame.modifiers,
    );

    const childProperties = filterProperties(childFrame.properties, args.shouldApplyProperty);

    if (Object.keys(childProperties).length > 0) {
      applyRuntimeStyles(args, childContainer, childProperties);
    }

    applyTargetProperties(args, childFrame.targetProperties);
    applyTargetStatesToDom(args, childFrame.targetStates);
    applyChildFramesToDom(args, childFrame.childFrames);
  }
}

function filterProperties(
  properties: Readonly<Record<string, unknown>>,
  shouldApplyProperty: ((propertyName: string) => boolean) | undefined,
): Readonly<Record<string, unknown>> {
  if (shouldApplyProperty === undefined) {
    return properties;
  }

  return Object.fromEntries(Object.entries(properties).filter(([propertyName]) => shouldApplyProperty(propertyName)));
}

function applyTextAnimator(args: {
  readonly targetsResolver: AnimationTargetsResolver;
  readonly onApplyStyles?: ((container: HTMLElement, propertyNames: readonly string[]) => void) | undefined;
  readonly container: HTMLElement;
  readonly config: ElementAnimationConfig;
  readonly frame: TimelineFrame;
}): void {
  const textAnimator = args.config.textAnimator;

  if (textAnimator === null) {
    return;
  }

  const contentTarget = args.container.querySelector<HTMLElement>('[data-element-content]') ?? args.container;
  const charSpans = contentTarget.querySelectorAll<HTMLElement>('[data-char-index]');

  if (charSpans.length === 0) {
    return;
  }

  const timeline = args.config.timelines.find((tl) => tl.id === textAnimator.timelineId);

  if (timeline === undefined) {
    return;
  }

  const textContent = Array.from(charSpans)
    .map((span) => span.textContent)
    .join('');
  const segments = computeTextSegments(textContent, textAnimator);

  for (const segment of segments) {
    const segmentTimeMs = args.frame.timeMs - segment.startTimeMs;
    // Apply segment styles to every char span covered by the segment's
    // character range so `rangeMode: 'words' | 'lines'` animates whole
    // words/lines — not only the first N character spans.
    const frameProperties =
      segmentTimeMs < 0 ?
        computeTimelineFrame({ timeline, timeMs: 0 }).properties
      : computeTimelineFrame({ timeline, timeMs: segmentTimeMs }).properties;

    for (let charIndex = segment.charStartIndex; charIndex < segment.charEndIndex; charIndex += 1) {
      const span = charSpans[charIndex];

      if (span === undefined) {
        continue;
      }

      applyRuntimeStyles(args, span, frameProperties);
    }
  }
}
