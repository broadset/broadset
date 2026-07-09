/** @vitest-environment jsdom */

import type { ElementAnimationConfig } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

import { resolveAnimationTargets } from './playback-controller';
import { createConfig, createHostElement, createKeyframe, createTimeline } from './playback-controller-test-helpers';
import { applyTimelineFrameToDom } from './playback-dom';
import { computeTimelineFrame, type TimelineFrame } from './timeline';

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
  /** @description Editor preview can filter model-composed properties so renderer-owned opacity is not overwritten by DOM playback baselines. */
  it('filters owner frame properties before applying DOM styles', () => {
    const { contentTarget, host, opacityTarget, root } = createHostElement('hero');
    const frame: TimelineFrame = {
      timelineId: 'tl-preview',
      timelineName: 'Preview',
      timeMs: 300,
      durationMs: 600,
      properties: {
        opacity: 0.5,
        transform: 'translateX(10px)',
      },
      targetProperties: {},
      activeState: null,
      modifiers: new Set(),
      childFrames: {},
    };

    opacityTarget.style.opacity = '1';

    applyTimelineFrameToDom({
      root,
      targetsResolver: resolveAnimationTargets(),
      container: host,
      config: createConfig(),
      frame,
      shouldApplyProperty: (propertyName) => propertyName === 'transform',
    });

    expect(opacityTarget.style.opacity).toBe('1');
    expect(contentTarget.style.transform).toBe('translateX(10px)');
  });

  /** @description DOM frame application must report applied text-animator styles so editor scrub cleanup can remove stale per-character styles. */
  it('reports text animator style applications for cleanup', () => {
    const { root, contentTarget } = createHostElement('text-el');
    const onApplyStyles = vi.fn<(container: HTMLElement, propertyNames: readonly string[]) => void>();

    createCharSpans(contentTarget, 'A');

    const charTimeline = createTimeline({
      id: 'tl-char',
      name: 'char',
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
    const frame: TimelineFrame = {
      timelineId: 'tl-preview',
      timelineName: 'Preview',
      timeMs: 50,
      durationMs: 100,
      properties: {},
      targetProperties: {},
      activeState: null,
      modifiers: new Set(),
      childFrames: {},
    };

    applyTimelineFrameToDom({
      root,
      targetsResolver: resolveAnimationTargets(),
      container: root.querySelector<HTMLElement>('[data-element-id]') ?? root,
      config: {
        ...createConfig({ timelines: [charTimeline] }),
        textAnimator: {
          rangeMode: 'characters',
          staggerDelayMs: 0,
          randomOrder: false,
          timelineId: 'tl-char',
        },
      },
      frame,
      onApplyStyles,
    });

    expect(onApplyStyles).toHaveBeenCalledWith(contentTarget.querySelector('[data-char-index]'), ['opacity']);
  });

  /** @description Child timeline frames must apply to child containers so editor scrub and playback do not diverge for nested animations. */
  it('applies child frame properties to child containers', () => {
    const { root } = createHostElement('parent');
    const child = createHostElement('child').host;
    const childOpacityTarget = child.querySelector<HTMLElement>('[data-opacity-target]');
    const frame: TimelineFrame = {
      timelineId: 'tl-parent',
      timelineName: 'Parent',
      timeMs: 250,
      durationMs: 500,
      properties: {},
      targetProperties: {},
      activeState: null,
      modifiers: new Set(),
      childFrames: {
        child: {
          timelineId: 'tl-child',
          timelineName: 'Child',
          timeMs: 250,
          durationMs: 500,
          properties: { opacity: 0.4 },
          targetProperties: {},
          activeState: null,
          modifiers: new Set(),
          childFrames: {},
        },
      },
    };

    root.appendChild(child);

    applyTimelineFrameToDom({
      root,
      targetsResolver: resolveAnimationTargets(),
      container: root.querySelector<HTMLElement>('[data-element-id="parent"]') ?? root,
      config: createConfig(),
      frame,
    });

    expect(childOpacityTarget?.style.opacity).toBe('0.4');
  });

  /** @description Child timeline frame application must recurse so nested group animations reach grandchildren. */
  it('applies nested child frame properties to grandchild containers', () => {
    const { root } = createHostElement('parent');
    const child = createHostElement('child').host;
    const { contentTarget: grandchildContentTarget, host: grandchildHost } = createHostElement('grandchild');
    const frame: TimelineFrame = {
      timelineId: 'tl-parent',
      timelineName: 'Parent',
      timeMs: 250,
      durationMs: 500,
      properties: {},
      targetProperties: {},
      activeState: null,
      modifiers: new Set(),
      childFrames: {
        child: {
          timelineId: 'tl-child',
          timelineName: 'Child',
          timeMs: 250,
          durationMs: 500,
          properties: {},
          targetProperties: {},
          activeState: null,
          modifiers: new Set(),
          childFrames: {
            grandchild: {
              timelineId: 'tl-grandchild',
              timelineName: 'Grandchild',
              timeMs: 250,
              durationMs: 500,
              properties: { scaleX: 1.5 },
              targetProperties: {},
              activeState: null,
              modifiers: new Set(),
              childFrames: {},
            },
          },
        },
      },
    };

    root.appendChild(child);
    root.appendChild(grandchildHost);

    applyTimelineFrameToDom({
      root,
      targetsResolver: resolveAnimationTargets(),
      container: root.querySelector<HTMLElement>('[data-element-id="parent"]') ?? root,
      config: createConfig(),
      frame,
    });

    expect(grandchildContentTarget.style.transform).toContain('scale(1.5, 1)');
  });

  /** @description Targeted action states must apply to the targeted element and clear on later frames even when the state was not declared in that element's binding list. */
  it('applies and clears targeted action state classes', () => {
    const { root, host } = createHostElement('parent');
    const child = createHostElement('child').host;
    const activeFrame: TimelineFrame = {
      timelineId: 'tl-parent',
      timelineName: 'Parent',
      timeMs: 250,
      durationMs: 500,
      properties: {},
      targetProperties: {},
      targetStates: { child: { activeState: 'TARGET', modifiers: new Set(['glow']) } },
      activeState: null,
      modifiers: new Set(),
      childFrames: {},
    };
    const clearFrame: TimelineFrame = {
      ...activeFrame,
      targetStates: { child: { activeState: null, modifiers: new Set() } },
    };

    root.appendChild(child);

    const targetsResolver = resolveAnimationTargets();

    applyTimelineFrameToDom({
      root,
      targetsResolver,
      container: host,
      config: createConfig(),
      frame: activeFrame,
    });

    expect(child.classList.contains('TARGET')).toBe(true);
    expect(child.classList.contains('glow')).toBe(true);

    applyTimelineFrameToDom({
      root,
      targetsResolver,
      container: host,
      config: createConfig(),
      frame: clearFrame,
    });

    expect(child.classList.contains('TARGET')).toBe(false);
    expect(child.classList.contains('glow')).toBe(false);
  });

  /** @description Child timeline action states must apply to child containers so nested animation preview and playback keep visual state in sync. */
  it('applies child frame state classes to child containers', () => {
    const { root, host } = createHostElement('parent');
    const child = createHostElement('child').host;
    const frame: TimelineFrame = {
      timelineId: 'tl-parent',
      timelineName: 'Parent',
      timeMs: 250,
      durationMs: 500,
      properties: {},
      targetProperties: {},
      targetStates: {},
      activeState: null,
      modifiers: new Set(),
      childFrames: {
        child: {
          timelineId: 'tl-child',
          timelineName: 'Child',
          timeMs: 250,
          durationMs: 500,
          properties: {},
          targetProperties: {},
          targetStates: {},
          activeState: 'CHILD_ACTIVE',
          modifiers: new Set(['child-glow']),
          childFrames: {},
        },
      },
    };

    root.appendChild(child);

    applyTimelineFrameToDom({
      root,
      targetsResolver: resolveAnimationTargets(),
      container: host,
      config: createConfig(),
      frame,
    });

    expect(child.classList.contains('CHILD_ACTIVE')).toBe(true);
    expect(child.classList.contains('child-glow')).toBe(true);
  });

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
