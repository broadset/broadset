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
}): void {
  args.targetsResolver.applyStyles(args.container, args.frame.properties);
  syncStateClasses(args.container, args.config, args.frame.activeState, args.frame.modifiers);

  for (const [targetId, properties] of Object.entries(args.frame.targetProperties)) {
    const targetContainer = args.root.querySelector<HTMLElement>(
      `[data-element-id="${escapeCssIdentifier(targetId)}"]`,
    );

    if (targetContainer !== null) {
      args.targetsResolver.applyStyles(targetContainer, properties);
    }
  }

  applyTextAnimator(args);
}

function applyTextAnimator(args: {
  readonly targetsResolver: AnimationTargetsResolver;
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
    const span = charSpans[segment.index];

    if (span === undefined) {
      continue;
    }

    const segmentTimeMs = args.frame.timeMs - segment.startTimeMs;

    if (segmentTimeMs < 0) {
      // Segment hasn't started yet; apply keyframe zero to keep initial character state stable.
      const startFrame = computeTimelineFrame({ timeline, timeMs: 0 });

      args.targetsResolver.applyStyles(span, startFrame.properties);
      continue;
    }

    const segmentFrame = computeTimelineFrame({ timeline, timeMs: segmentTimeMs });

    args.targetsResolver.applyStyles(span, segmentFrame.properties);
  }
}
