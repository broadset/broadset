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
