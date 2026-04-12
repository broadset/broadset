/** @jest-environment jsdom */

import type { AnimationDefinition, ElementAnimationConfig, Keyframe, Timeline } from '@broadset/model';

import {
  createPlaybackController,
  createPlaybackHandle,
  escapeCssIdentifier,
  parseElementRuntimeState,
  resolveAnimationTargets,
  validateAnimationRegistry,
} from './playback-controller';
import { applyTimelineFrameToDom } from './playback-dom';
import { computeTimelineFrame } from './timeline';

function createKeyframe(args: {
  readonly name: string;
  readonly offsetMs: number;
  readonly action?: Keyframe['action'] | undefined;
  readonly payload?: string | undefined;
  readonly target?: string | undefined;
  readonly properties?: Keyframe['properties'] | undefined;
}): Keyframe {
  return {
    name: args.name,
    action: args.action ?? 'none',
    offsetMs: args.offsetMs,
    properties: args.properties ?? {},
    payload: args.payload,
    target: args.target,
  };
}

function createTimeline(args: {
  readonly id: string;
  readonly name: string;
  readonly keyframes: readonly Keyframe[];
  readonly durationMs?: number | undefined;
  readonly loop?: Timeline['loop'] | undefined;
  readonly loopCount?: Timeline['loopCount'] | undefined;
}): Timeline {
  return {
    id: args.id,
    name: args.name,
    keyframes: args.keyframes,
    durationMs: args.durationMs,
    loop: args.loop ?? 'none',
    loopCount: args.loopCount ?? null,
    childTimelines: [],
    audioCues: [],
  };
}

function createConfig(args?: {
  readonly timelines?: readonly Timeline[] | undefined;
  readonly stateTimelineBindings?: ElementAnimationConfig['stateTimelineBindings'] | undefined;
  readonly modifierTimelineBindings?: ElementAnimationConfig['modifierTimelineBindings'] | undefined;
}): ElementAnimationConfig {
  return {
    timelines: args?.timelines ?? [],
    stateTimelineBindings: args?.stateTimelineBindings ?? [],
    modifierTimelineBindings: args?.modifierTimelineBindings ?? [],
    textAnimator: null,
  };
}

function createHostElement(elementId: string): {
  readonly root: HTMLDivElement;
  readonly host: HTMLDivElement;
  readonly opacityTarget: HTMLDivElement;
  readonly contentTarget: HTMLDivElement;
} {
  const root = document.createElement('div');
  const host = document.createElement('div');
  const opacityTarget = document.createElement('div');
  const contentTarget = document.createElement('div');

  host.dataset['elementId'] = elementId;
  host.dataset['visibility'] = 'onscreen';
  opacityTarget.dataset['opacityTarget'] = '';
  contentTarget.dataset['elementContent'] = '';

  opacityTarget.appendChild(contentTarget);
  host.appendChild(opacityTarget);
  root.appendChild(host);

  return { root, host, opacityTarget, contentTarget };
}

describe('createPlaybackHandle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-04-06T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clamps seeks, respects cancel, and fires onComplete exactly once', () => {
    const onFrame = jest.fn();
    const onComplete = jest.fn();
    const handle = createPlaybackHandle({ durationMs: 800, onFrame, onComplete });

    handle.seek(-100);
    expect(handle.currentTimeMs).toBe(0);

    handle.seek(99999);
    expect(handle.currentTimeMs).toBe(800);

    handle.seek(0);
    handle.play();
    jest.advanceTimersByTime(850);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(handle.isActive).toBe(false);
    expect(onFrame).toHaveBeenCalledWith(800);

    handle.cancel();
    handle.play();

    expect(handle.isActive).toBe(false);
  });
});

describe('resolveAnimationTargets', () => {
  it('routes opacity to the opacity target, other styles to the content target, and invalidates cache', () => {
    const { contentTarget, host, opacityTarget } = createHostElement('hero');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { opacity: 0.5, transform: 'translateX(20px)' });

    expect(opacityTarget.style.opacity).toBe('0.5');
    expect(contentTarget.style.transform).toBe('translateX(20px)');

    contentTarget.removeAttribute('data-element-content');

    const replacement = document.createElement('div');

    replacement.dataset['elementContent'] = '';
    opacityTarget.appendChild(replacement);

    targets.invalidate(host);
    targets.applyStyles(host, { backgroundColor: 'red' });

    expect(replacement.style.backgroundColor).toBe('red');
  });

  it('falls back to the container when no content target is present', () => {
    const host = document.createElement('div');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { color: 'rgb(255, 255, 255)' });

    expect(host.style.color).toBe('rgb(255, 255, 255)');
  });

  /** @description Trim path properties must be handled specially (not set as generic CSS) to avoid polluting the style attribute. */
  it('does not set trim path properties as generic CSS', () => {
    const { contentTarget, host } = createHostElement('path-el');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, {
      trimStart: 0.25,
      trimEnd: 0.75,
      trimOffset: 0.1,
    });

    /* trimStart/trimEnd/trimOffset are NOT valid CSS properties and must not
       appear on the element style — the applyStyles code should route them
       through the trim path handler instead of the generic setProperty path. */
    expect(contentTarget.style.getPropertyValue('trim-start')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-end')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-offset')).toBe('');
  });

  /** @description Clearing trim path properties must not leave residual CSS. */
  it('clears trim path properties without residual CSS', () => {
    const { contentTarget, host } = createHostElement('path-el2');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { trimStart: 0.5 });
    targets.clearStyles(host, ['trimStart', 'trimEnd', 'trimOffset']);

    expect(contentTarget.style.getPropertyValue('trim-start')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-end')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-offset')).toBe('');
  });
});

describe('parseElementRuntimeState and validation helpers', () => {
  it('parses visibility from data attributes and classes and escapes CSS identifiers', () => {
    const { host } = createHostElement('hero"quote');

    host.className = 'offscreen IN glow';
    host.dataset['visibility'] = 'onscreen';

    const parsed = parseElementRuntimeState({
      element: host,
      config: createConfig({
        stateTimelineBindings: [
          { stateName: 'IN', timelineId: 'tl-in' },
          { stateName: 'OUT', timelineId: 'tl-out' },
        ],
        modifierTimelineBindings: [{ modifierName: 'glow', inTimelineId: 'tl-glow' }],
      }),
    });

    expect(parsed.visibility).toBe('onscreen');
    expect(parsed.activeState).toBe('IN');
    expect(Array.from(parsed.modifiers)).toEqual(['glow']);
    expect(escapeCssIdentifier('hero"quote')).toBe('hero\\"quote');
  });

  it('rejects self-targeting action markers in triggered state and modifier timelines', () => {
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({
          timelines: [
            createTimeline({
              id: 'tl-in',
              name: 'in',
              keyframes: [createKeyframe({ name: 'bad', offsetMs: 0, action: 'setState', payload: 'IN' })],
            }),
            createTimeline({
              id: 'tl-glow',
              name: 'glow',
              keyframes: [createKeyframe({ name: 'bad', offsetMs: 0, action: 'addModifier', payload: 'glow' })],
            }),
          ],
          stateTimelineBindings: [
            { stateName: 'IN', timelineId: 'tl-in' },
            { stateName: 'OUT', timelineId: 'tl-in' },
          ],
          modifierTimelineBindings: [{ modifierName: 'glow', inTimelineId: 'tl-glow' }],
        }),
      },
    ];

    expect(() => {
      validateAnimationRegistry(animations);
    }).toThrow(/circular dependency/i);

    expect(() => {
      validateAnimationRegistry([
        {
          elementId: 'hero',
          config: createConfig({
            timelines: [
              createTimeline({
                id: 'tl-in',
                name: 'in',
                keyframes: [
                  createKeyframe({
                    name: 'allowed',
                    offsetMs: 0,
                    action: 'setState',
                    payload: 'active',
                    target: 'other-el',
                  }),
                ],
              }),
            ],
            stateTimelineBindings: [
              { stateName: 'IN', timelineId: 'tl-in' },
              { stateName: 'OUT', timelineId: 'tl-in' },
            ],
          }),
        },
      ]);
    }).not.toThrow();
  });
});

describe('createPlaybackController', () => {
  it('hides offscreen elements on attach, refreshes on setRegistry, and supports timeline seek/stop', () => {
    const { contentTarget, host, root } = createHostElement('hero');

    host.dataset['visibility'] = 'offscreen';

    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({
          timelines: [
            createTimeline({
              id: 'spin',
              name: 'spin',
              durationMs: 1000,
              keyframes: [
                createKeyframe({
                  name: 'start',
                  offsetMs: 0,
                  action: 'setState',
                  payload: 'IN',
                  properties: {
                    opacity: { type: 'number', value: 0, easing: 'linear' },
                    transform: { type: 'string', value: 'translateX(0px)', easing: 'step' },
                  },
                }),
                createKeyframe({
                  name: 'mid',
                  offsetMs: 500,
                  action: 'addModifier',
                  payload: 'glow',
                  properties: {
                    opacity: { type: 'number', value: 0.5, easing: 'linear' },
                    transform: { type: 'string', value: 'translateX(40px)', easing: 'step' },
                  },
                }),
                createKeyframe({
                  name: 'end',
                  offsetMs: 1000,
                  action: 'setState',
                  payload: 'active',
                  properties: {
                    opacity: { type: 'number', value: 1, easing: 'linear' },
                    transform: { type: 'string', value: 'translateX(80px)', easing: 'step' },
                  },
                }),
              ],
            }),
          ],
        }),
      },
    ];

    const controller = createPlaybackController({ root, registry: animations });

    controller.attach();

    expect(host.style.visibility).toBe('hidden');
    expect(host.style.pointerEvents).toBe('none');

    host.classList.remove('offscreen');
    host.dataset['visibility'] = 'onscreen';

    controller.setRegistry(animations);
    controller.seekTimeline({ elementId: 'hero', timelineName: 'spin', timeMs: 1000 });

    expect(contentTarget.style.transform).toBe('translateX(80px)');
    expect(contentTarget.classList.contains('active')).toBe(true);
    expect(contentTarget.classList.contains('glow')).toBe(true);

    expect(() => {
      controller.stopTimeline({ elementId: 'hero', timelineName: 'spin' });
    }).not.toThrow();
    expect(() => {
      controller.destroy();
    }).not.toThrow();
  });

  it('supports suppressTransitions for instant snapshots', () => {
    const { opacityTarget, root } = createHostElement('hero');
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({
          timelines: [
            createTimeline({
              id: 'tl-in',
              name: 'IN',
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
            }),
          ],
          stateTimelineBindings: [
            { stateName: 'IN', timelineId: 'tl-in' },
            { stateName: 'OUT', timelineId: 'tl-in' },
          ],
        }),
      },
    ];

    const controller = createPlaybackController({ root, registry: animations, suppressTransitions: true });

    controller.attach();
    root.firstElementChild?.classList.add('onscreen');
    controller.seekTimeline({ elementId: 'hero', timelineName: 'IN', timeMs: 0 });

    expect(opacityTarget.style.opacity).toBe('1');
  });

  it('resumes paused default timelines from the paused position instead of restarting them', () => {
    jest.useFakeTimers();

    try {
      const { opacityTarget, root } = createHostElement('hero');
      const animations: readonly AnimationDefinition[] = [
        {
          elementId: 'hero',
          config: createConfig({
            timelines: [
              createTimeline({
                id: 'tl-default',
                name: 'Default',
                durationMs: 1000,
                keyframes: [
                  createKeyframe({
                    name: 'start',
                    offsetMs: 0,
                    properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
                  }),
                  createKeyframe({
                    name: 'end',
                    offsetMs: 1000,
                    properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
                  }),
                ],
              }),
            ],
          }),
        },
      ];

      const controller = createPlaybackController({ root, registry: animations });

      controller.attach();
      controller.play();
      jest.advanceTimersByTime(250);

      const pausedOpacity = Number(opacityTarget.style.opacity);

      controller.pause();
      jest.advanceTimersByTime(150);

      expect(Number(opacityTarget.style.opacity)).toBeCloseTo(pausedOpacity, 3);

      controller.play();
      jest.advanceTimersByTime(150);

      expect(Number(opacityTarget.style.opacity)).toBeGreaterThan(pausedOpacity);

      controller.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('restores baseline styles when a state timeline is cleared back to null', async () => {
    const { contentTarget, host, opacityTarget, root } = createHostElement('hero');

    opacityTarget.style.opacity = '0.6';
    contentTarget.style.transform = 'scale(1.1)';

    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({
          timelines: [
            createTimeline({
              id: 'tl-active',
              name: 'Active',
              durationMs: 300,
              keyframes: [
                createKeyframe({
                  name: 'start',
                  offsetMs: 0,
                  properties: {
                    opacity: { type: 'number', value: 0.2, easing: 'linear' },
                    translateX: { type: 'number', value: 12, easing: 'linear' },
                  },
                }),
                createKeyframe({
                  name: 'end',
                  offsetMs: 300,
                  properties: {
                    opacity: { type: 'number', value: 1, easing: 'linear' },
                    translateX: { type: 'number', value: 48, easing: 'linear' },
                  },
                }),
              ],
            }),
          ],
          stateTimelineBindings: [{ stateName: 'active', timelineId: 'tl-active' }],
        }),
      },
    ];

    const controller = createPlaybackController({ root, registry: animations, suppressTransitions: true });

    controller.attach();
    host.classList.add('active');
    await Promise.resolve();

    expect(opacityTarget.style.opacity).toBe('1');
    expect(contentTarget.style.transform).toContain('translate(');

    host.classList.remove('active');
    await Promise.resolve();

    expect(opacityTarget.style.opacity).toBe('0.6');
    expect(contentTarget.style.transform).toBe('scale(1.1)');

    controller.destroy();
  });
});

describe('per-character text animation integration', () => {
  function createCharSpans(contentTarget: HTMLElement, text: string): void {
    contentTarget.textContent = '';

    for (let i = 0; i < text.length; i += 1) {
      const span = document.createElement('span');

      span.setAttribute('data-char-index', String(i));
      span.textContent = text[i] ?? '';
      contentTarget.appendChild(span);
    }
  }

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

    // Create a parent timeline with sufficient duration to cover the animation.
    // computeTimelineFrame uses mapTimelineTime which clamps to the timeline's computed duration.
    const parentTimeline = createTimeline({
      id: 'tl-parent',
      name: 'parent',
      keyframes: [
        createKeyframe({ name: 'start', offsetMs: 0, properties: {} }),
        createKeyframe({ name: 'end', offsetMs: 1000, properties: {} }),
      ],
    });
    // At time 150ms: A started at 0ms (t=150, interpolated), B started at 100ms (t=50), C started at 200ms (t<0, start state)
    const frame = computeTimelineFrame({ timeline: parentTimeline, timeMs: 150 });

    applyTimelineFrameToDom({
      root,
      targetsResolver,
      container: root.querySelector<HTMLElement>('[data-element-id]') ?? root,
      config,
      frame,
    });

    const charSpans = contentTarget.querySelectorAll<HTMLElement>('[data-char-index]');

    // A: at t=150/200 = 0.75 → opacity ~0.75
    expect(charSpans[0]?.style.opacity).toBeDefined();
    expect(Number(charSpans[0]?.style.opacity)).toBeCloseTo(0.75, 1);

    // B: at t=50/200 = 0.25 → opacity ~0.25
    expect(Number(charSpans[1]?.style.opacity)).toBeCloseTo(0.25, 1);

    // C: hasn't started yet → opacity = 0 (first keyframe value)
    expect(Number(charSpans[2]?.style.opacity)).toBeCloseTo(0, 1);
  });

  /** @description Non-text elements with textAnimator configured are silently ignored. */
  it('ignores textAnimator when no character spans exist', () => {
    const { root, contentTarget } = createHostElement('rect-el');

    // No character spans — simulates a rectangle element
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

    // Should not throw
    expect(() => {
      applyTimelineFrameToDom({
        root,
        targetsResolver,
        container: root.querySelector<HTMLElement>('[data-element-id]') ?? root,
        config,
        frame,
      });
    }).not.toThrow();

    // Content should be unchanged
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

    // At time 500ms, both characters should be fully animated (stagger 50ms + 100ms duration)
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
