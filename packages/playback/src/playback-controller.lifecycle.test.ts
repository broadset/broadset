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
});
