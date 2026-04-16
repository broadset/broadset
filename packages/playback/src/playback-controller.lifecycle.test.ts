/** @jest-environment jsdom */

import type { AnimationDefinition } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { createPlaybackController } from './playback-controller';
import { createConfig, createHostElement, createKeyframe, createTimeline } from './playback-controller-test-helpers';

describe('createPlaybackController', () => {
  it('hides offscreen elements on attach, refreshes on setAnimations, and supports timeline seek/stop', () => {
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

    const controller = createPlaybackController({ root, animations });

    controller.attach();

    expect(host.style.visibility).toBe('hidden');
    expect(host.style.pointerEvents).toBe('none');

    host.classList.remove('offscreen');
    host.dataset['visibility'] = 'onscreen';

    controller.setAnimations(animations);
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

  /** @description suppressTransitions makes state transitions (IN/OUT) jump to their end state instantly. The syncTransitions code path does this by passing the timeline end time explicitly. */
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

    const controller = createPlaybackController({ root, animations, suppressTransitions: true });

    controller.attach();
    root.firstElementChild?.classList.add('onscreen');
    // Seek to the end of the IN timeline — suppressTransitions callers
    // (syncTransitions) pass the end time explicitly.
    controller.seekTimeline({ elementId: 'hero', timelineName: 'IN', timeMs: 200 });

    expect(opacityTarget.style.opacity).toBe('1');

    // Seeking to a specific time must respect that time — this is how
    // video export works (frame-by-frame seek through the timeline).
    controller.seekTimeline({ elementId: 'hero', timelineName: 'IN', timeMs: 100 });

    expect(Number(opacityTarget.style.opacity)).toBeCloseTo(0.5, 1);
  });

  /** @description seek() with suppressTransitions must apply the requested time — not the end of the timeline. This is critical for video export, which seeks to each frame time. */
  it('seek() with suppressTransitions applies the requested time, not the timeline end', () => {
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

    const controller = createPlaybackController({ root, animations, suppressTransitions: true });

    controller.attach();

    // Seek to 25% — must show 0.25 opacity, NOT 1.0 (the end value).
    controller.seek(250);
    expect(Number(opacityTarget.style.opacity)).toBeCloseTo(0.25, 1);

    // Seek to 50% — must show 0.5.
    controller.seek(500);
    expect(Number(opacityTarget.style.opacity)).toBeCloseTo(0.5, 1);

    // Seek to 0% — must show 0.
    controller.seek(0);
    expect(Number(opacityTarget.style.opacity)).toBeCloseTo(0, 1);

    controller.destroy();
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

      const controller = createPlaybackController({ root, animations });

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

    const controller = createPlaybackController({ root, animations, suppressTransitions: true });

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

  /** @description play() must trigger the IN timeline for elements with IN/OUT state bindings so the entrance animation plays when the user clicks the global play button. */
  it('plays the IN timeline on play() for elements with IN/OUT state bindings', () => {
    jest.useFakeTimers();

    try {
      const { opacityTarget, root } = createHostElement('hero');
      const animations: readonly AnimationDefinition[] = [
        {
          elementId: 'hero',
          config: createConfig({
            timelines: [
              createTimeline({
                id: 'tl-in',
                name: 'Score Bug In',
                durationMs: 600,
                keyframes: [
                  createKeyframe({
                    name: 'start',
                    offsetMs: 0,
                    properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
                  }),
                  createKeyframe({
                    name: 'end',
                    offsetMs: 600,
                    properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
                  }),
                ],
              }),
              createTimeline({
                id: 'tl-out',
                name: 'Score Bug Out',
                durationMs: 400,
                keyframes: [
                  createKeyframe({
                    name: 'start',
                    offsetMs: 0,
                    properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
                  }),
                  createKeyframe({
                    name: 'end',
                    offsetMs: 400,
                    properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
                  }),
                ],
              }),
            ],
            stateTimelineBindings: [
              { stateName: 'IN', timelineId: 'tl-in' },
              { stateName: 'OUT', timelineId: 'tl-out' },
            ],
          }),
        },
      ];

      const controller = createPlaybackController({ root, animations });

      controller.attach();
      controller.play();
      jest.advanceTimersByTime(600);

      expect(Number(opacityTarget.style.opacity)).toBeCloseTo(1, 1);

      controller.destroy();
    } finally {
      jest.useRealTimers();
    }
  });

  /** @description seek(Infinity) snaps IN timelines to their final keyframe (post-entrance resting state) so elements appear fully visible on mount. */
  it('seek(Infinity) shows elements at post-IN resting state', () => {
    const { opacityTarget, root } = createHostElement('hero');
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({
          timelines: [
            createTimeline({
              id: 'tl-in',
              name: 'In',
              durationMs: 600,
              keyframes: [
                createKeyframe({
                  name: 'start',
                  offsetMs: 0,
                  properties: { opacity: { type: 'number', value: 0, easing: 'linear' } },
                }),
                createKeyframe({
                  name: 'end',
                  offsetMs: 600,
                  properties: { opacity: { type: 'number', value: 1, easing: 'linear' } },
                }),
              ],
            }),
          ],
          stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
        }),
      },
    ];

    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seek(Infinity);

    expect(Number(opacityTarget.style.opacity)).toBeCloseTo(1, 1);

    controller.destroy();
  });
});
