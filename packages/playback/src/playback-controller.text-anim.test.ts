/** @jest-environment jsdom */

import type { ElementAnimationConfig } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { resolveAnimationTargets } from './playback-controller';
import { createHostElement, createKeyframe, createTimeline } from './playback-controller-test-helpers';
import { applyTimelineFrameToDom } from './playback-dom';
import { computeTimelineFrame } from './timeline';

function createCharSpans(contentTarget: HTMLElement, text: string): void {
  contentTarget.textContent = '';

  for (let i = 0; i < text.length; i += 1) {
    const span = document.createElement('span');

    span.setAttribute('data-char-index', String(i));
    span.textContent = text[i] ?? '';
    contentTarget.appendChild(span);
  }
}

describe('per-character text animation integration', () => {
  /** @description Per-character animation applies staggered opacity to individual character spans. */
  it('applies staggered timeline properties to character spans', () => {
    const { root, contentTarget } = createHostElement('text-el');

    createCharSpans(contentTarget, 'ABC');

    const charTimeline = createTimeline({
      id: 'tl-char',
      name: 'char-reveal',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 200,
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
      ],
    });
    const config: ElementAnimationConfig = {
      timelines: [charTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: {
        rangeMode: 'characters',
        staggerDelayMs: 100,
        randomOrder: false,
        timelineId: 'tl-char',
      },
    };
    const targetsResolver = resolveAnimationTargets();

    const parentTimeline = createTimeline({
      id: 'tl-parent',
      name: 'parent',
      keyframes: [
        createKeyframe({ name: 'start', offsetMs: 0, properties: {} }),
        createKeyframe({ name: 'end', offsetMs: 1000, properties: {} }),
      ],
    });
    const frame = computeTimelineFrame({ timeline: parentTimeline, timeMs: 150 });

    applyTimelineFrameToDom({
      root,
      targetsResolver,
      container: root.querySelector<HTMLElement>('[data-element-id]') ?? root,
      config,
      frame,
    });

    const charSpans = contentTarget.querySelectorAll<HTMLElement>('[data-char-index]');

    expect(charSpans[0]?.style.opacity).toBeDefined();
    expect(Number(charSpans[0]?.style.opacity)).toBeCloseTo(0.75, 1);
    expect(Number(charSpans[1]?.style.opacity)).toBeCloseTo(0.25, 1);
    expect(Number(charSpans[2]?.style.opacity)).toBeCloseTo(0, 1);
  });

  /** @description Non-text elements with textAnimator configured are silently ignored. */
  it('ignores textAnimator when no character spans exist', () => {
    const { root, contentTarget } = createHostElement('rect-el');

    contentTarget.textContent = 'not-wrapped';

    const charTimeline = createTimeline({
      id: 'tl-char',
      name: 'char-reveal',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
      ],
    });
    const config: ElementAnimationConfig = {
      timelines: [charTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: {
        rangeMode: 'characters',
        staggerDelayMs: 50,
        randomOrder: false,
        timelineId: 'tl-char',
      },
    };
    const targetsResolver = resolveAnimationTargets();
    const parentTimeline = createTimeline({
      id: 'tl-parent',
      name: 'parent',
      keyframes: [
        createKeyframe({ name: 'start', offsetMs: 0, properties: {} }),
        createKeyframe({ name: 'end', offsetMs: 1000, properties: {} }),
      ],
    });
    const frame = computeTimelineFrame({ timeline: parentTimeline, timeMs: 100 });

    expect(() => {
      applyTimelineFrameToDom({
        root,
        targetsResolver,
        container: root.querySelector<HTMLElement>('[data-element-id]') ?? root,
        config,
        frame,
      });
    }).not.toThrow();

    expect(contentTarget.textContent).toBe('not-wrapped');
  });

  /** @description All characters should have completed animation when time exceeds total duration. */
  it('fully animates all characters after total stagger+timeline duration', () => {
    const { root, contentTarget } = createHostElement('text-el-2');

    createCharSpans(contentTarget, 'AB');

    const charTimeline = createTimeline({
      id: 'tl-char',
      name: 'char-reveal',
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'end',
          offsetMs: 100,
          properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
        }),
      ],
    });
    const config: ElementAnimationConfig = {
      timelines: [charTimeline],
      stateTimelineBindings: [],
      modifierTimelineBindings: [],
      textAnimator: {
        rangeMode: 'characters',
        staggerDelayMs: 50,
        randomOrder: false,
        timelineId: 'tl-char',
      },
    };
    const targetsResolver = resolveAnimationTargets();
    const parentTimeline = createTimeline({
      id: 'tl-parent',
      name: 'parent',
      keyframes: [
        createKeyframe({ name: 'start', offsetMs: 0, properties: {} }),
        createKeyframe({ name: 'end', offsetMs: 1000, properties: {} }),
      ],
    });

    const frame = computeTimelineFrame({ timeline: parentTimeline, timeMs: 500 });

    applyTimelineFrameToDom({
      root,
      targetsResolver,
      container: root.querySelector<HTMLElement>('[data-element-id]') ?? root,
      config,
      frame,
    });

    const charSpans = contentTarget.querySelectorAll<HTMLElement>('[data-char-index]');

    expect(Number(charSpans[0]?.style.opacity)).toBeCloseTo(1, 1);
    expect(Number(charSpans[1]?.style.opacity)).toBeCloseTo(1, 1);
  });
});
