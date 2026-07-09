/** @vitest-environment jsdom */

import type { AnimationDefinition } from '@broadset/model';
import { describe, expect, it, vi } from 'vitest';

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
    vi.useFakeTimers();

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
      vi.advanceTimersByTime(250);

      const pausedOpacity = Number(opacityTarget.style.opacity);

      controller.pause();
      vi.advanceTimersByTime(150);

      expect(Number(opacityTarget.style.opacity)).toBeCloseTo(pausedOpacity, 3);

      controller.play();
      vi.advanceTimersByTime(150);

      expect(Number(opacityTarget.style.opacity)).toBeGreaterThan(pausedOpacity);

      controller.destroy();
    } finally {
      vi.useRealTimers();
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

  it('clears animation-applied styles through the playback controller API', () => {
    const { contentTarget, opacityTarget, root } = createHostElement('hero');

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
        }),
      },
    ];

    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'hero', timelineName: 'Active', timeMs: 300 });

    expect(opacityTarget.style.opacity).toBe('1');
    expect(contentTarget.style.transform).toContain('translate(');

    controller.clearStyles();

    expect(opacityTarget.style.opacity).toBe('0.6');
    expect(contentTarget.style.transform).toBe('scale(1.1)');

    controller.destroy();
  });

  /** @description Editor preview can clear DOM-only playback residue without restoring renderer-owned preview properties such as opacity. */
  it('filters cleared playback properties when requested', () => {
    const { contentTarget, opacityTarget, root } = createHostElement('hero');

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
        }),
      },
    ];

    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'hero', timelineName: 'Active', timeMs: 300 });

    expect(opacityTarget.style.opacity).toBe('1');
    expect(contentTarget.style.transform).toContain('translate(');

    controller.clearStyles({ shouldClearProperty: (propertyName) => propertyName !== 'opacity' });

    expect(opacityTarget.style.opacity).toBe('1');
    expect(contentTarget.style.transform).toBe('scale(1.1)');

    controller.destroy();
  });

  /** @description clearStyles must only clear DOM properties that playback actually applied, not every property from every configured timeline. */
  it('does not clear renderer-owned styles from inactive configured timelines', () => {
    const { contentTarget, opacityTarget, root } = createHostElement('hero');

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
                  properties: { translateX: { type: 'number', value: 12, easing: 'linear' } },
                }),
              ],
            }),
            createTimeline({
              id: 'tl-inactive',
              name: 'Inactive',
              durationMs: 300,
              keyframes: [
                createKeyframe({
                  name: 'start',
                  offsetMs: 0,
                  properties: { opacity: { type: 'number', value: 0.2, easing: 'linear' } },
                }),
              ],
            }),
          ],
        }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'hero', timelineName: 'Active', timeMs: 0 });
    controller.clearStyles();

    expect(opacityTarget.style.opacity).toBe('0.6');
    expect(contentTarget.style.transform).toBe('scale(1.1)');

    controller.destroy();
  });

  /** @description setAnimations must cancel and clear styles for playing timelines that no longer exist after an animation edit. */
  it('clears removed playing timeline styles when animations are replaced', () => {
    vi.useFakeTimers();

    try {
      const { opacityTarget, root } = createHostElement('hero');

      opacityTarget.style.opacity = '0.6';

      const playingTimeline = createTimeline({
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
      });
      const animations: readonly AnimationDefinition[] = [
        {
          elementId: 'hero',
          config: createConfig({ timelines: [playingTimeline] }),
        },
      ];
      const controller = createPlaybackController({ root, animations });

      controller.attach();
      controller.play();
      vi.advanceTimersByTime(300);

      expect(Number(opacityTarget.style.opacity)).toBeGreaterThan(0);

      controller.setAnimations([{ elementId: 'hero', config: createConfig({ timelines: [] }) }]);

      expect(opacityTarget.style.opacity).toBe('0.6');

      vi.advanceTimersByTime(300);

      expect(opacityTarget.style.opacity).toBe('0.6');

      controller.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  /** @description stopTimeline is a visual stop, not just a timer pause; it must restore properties owned by the stopped timeline. */
  it('clears stopped timeline styles through stopTimeline', () => {
    const { opacityTarget, root } = createHostElement('hero');

    opacityTarget.style.opacity = '0.6';

    const timeline = createTimeline({
      id: 'tl-active',
      name: 'Active',
      durationMs: 300,
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { opacity: { type: 'number', value: 0.2, easing: 'linear' } },
        }),
      ],
    });
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({ timelines: [timeline] }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'hero', timelineName: 'Active', timeMs: 0 });

    expect(opacityTarget.style.opacity).toBe('0.2');

    controller.stopTimeline({ elementId: 'hero', timelineName: 'Active' });

    expect(opacityTarget.style.opacity).toBe('0.6');

    controller.destroy();
  });

  /** @description stopTimeline must clear state/modifier classes applied by owner, targeted, and child timeline frames. */
  it('clears owner targeted and child timeline state classes through stopTimeline', () => {
    const { contentTarget: childContent, host: childHost } = createHostElement('child');
    const { contentTarget: parentContent, host: parentHost, root } = createHostElement('parent');
    const { contentTarget: targetContent, host: targetHost } = createHostElement('target');

    root.appendChild(targetHost);
    root.appendChild(childHost);

    const childTimeline = createTimeline({
      id: 'tl-child',
      name: 'Child',
      durationMs: 100,
      keyframes: [
        createKeyframe({
          name: 'child-state',
          offsetMs: 0,
          action: 'setState',
          payload: 'child-active',
          properties: {},
        }),
      ],
    });
    const parentTimeline = {
      ...createTimeline({
        id: 'tl-parent',
        name: 'Parent',
        durationMs: 100,
        keyframes: [
          createKeyframe({
            name: 'owner-state',
            offsetMs: 0,
            action: 'setState',
            payload: 'owner-active',
            properties: {},
          }),
          createKeyframe({
            name: 'owner-modifier',
            offsetMs: 0,
            action: 'addModifier',
            payload: 'owner-glow',
            properties: {},
          }),
          createKeyframe({
            name: 'target-state',
            offsetMs: 0,
            action: 'setState',
            payload: 'target-active',
            target: 'target',
            properties: {},
          }),
        ],
      }),
      childTimelines: [{ childElementId: 'child', timeline: childTimeline }],
    };
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'parent',
        config: createConfig({ timelines: [parentTimeline] }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'parent', timelineName: 'Parent', timeMs: 0 });

    expect(parentHost.classList.contains('owner-active')).toBe(true);
    expect(parentContent.classList.contains('owner-glow')).toBe(true);
    expect(targetContent.classList.contains('target-active')).toBe(true);
    expect(childContent.classList.contains('child-active')).toBe(true);

    controller.stopTimeline({ elementId: 'parent', timelineName: 'Parent' });

    expect(parentHost.classList.contains('owner-active')).toBe(false);
    expect(parentContent.classList.contains('owner-glow')).toBe(false);
    expect(targetContent.classList.contains('target-active')).toBe(false);
    expect(childContent.classList.contains('child-active')).toBe(false);

    controller.destroy();
  });

  /** @description setAnimations must clear state/modifier classes from timelines that disappear after an edit. */
  it('clears removed timeline state classes when animations are replaced', () => {
    const { contentTarget, host, root } = createHostElement('hero');
    const timeline = createTimeline({
      id: 'tl-active',
      name: 'Active',
      durationMs: 100,
      keyframes: [
        createKeyframe({
          name: 'active',
          offsetMs: 0,
          action: 'setState',
          payload: 'active',
          properties: {},
        }),
        createKeyframe({
          name: 'glow',
          offsetMs: 0,
          action: 'addModifier',
          payload: 'glow',
          properties: {},
        }),
      ],
    });
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({ timelines: [timeline] }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'hero', timelineName: 'Active', timeMs: 0 });

    expect(host.classList.contains('active')).toBe(true);
    expect(contentTarget.classList.contains('glow')).toBe(true);

    controller.setAnimations([{ elementId: 'hero', config: createConfig({ timelines: [] }) }]);

    expect(host.classList.contains('active')).toBe(false);
    expect(contentTarget.classList.contains('glow')).toBe(false);

    controller.destroy();
  });

  /** @description Filtered style cleanup can preserve timeline state classes when callers only need inline style cleanup. */
  it('preserves state classes during filtered clear when requested', () => {
    const { contentTarget, host, opacityTarget, root } = createHostElement('hero');

    opacityTarget.style.opacity = '0.6';

    const timeline = createTimeline({
      id: 'tl-active',
      name: 'Active',
      durationMs: 100,
      keyframes: [
        createKeyframe({
          name: 'active',
          offsetMs: 0,
          action: 'setState',
          payload: 'active',
          properties: { opacity: { type: 'number', value: 0.2, easing: 'linear' } },
        }),
        createKeyframe({
          name: 'glow',
          offsetMs: 0,
          action: 'addModifier',
          payload: 'glow',
          properties: {},
        }),
      ],
    });
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'hero',
        config: createConfig({ timelines: [timeline] }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'hero', timelineName: 'Active', timeMs: 0 });

    expect(opacityTarget.style.opacity).toBe('0.2');
    expect(host.classList.contains('active')).toBe(true);
    expect(contentTarget.classList.contains('glow')).toBe(true);

    controller.clearStyles({ shouldClearProperty: () => false, clearStateClasses: false });

    expect(opacityTarget.style.opacity).toBe('0.2');
    expect(host.classList.contains('active')).toBe(true);
    expect(contentTarget.classList.contains('glow')).toBe(true);

    controller.destroy();
  });

  /** @description destroy must restore timeline-owned inline styles and runtime classes before clearing controller state. */
  it('clears timeline styles and state classes when destroyed', () => {
    const { contentTarget: childContent, host: childHost } = createHostElement('child');
    const { contentTarget: parentContent, host: parentHost, opacityTarget, root } = createHostElement('parent');
    const { contentTarget: targetContent, host: targetHost } = createHostElement('target');

    opacityTarget.style.opacity = '0.7';
    root.appendChild(targetHost);
    root.appendChild(childHost);

    const childTimeline = createTimeline({
      id: 'tl-child',
      name: 'Child',
      durationMs: 100,
      keyframes: [
        createKeyframe({
          name: 'child-state',
          offsetMs: 0,
          action: 'setState',
          payload: 'child-active',
          properties: {},
        }),
      ],
    });
    const parentTimeline = {
      ...createTimeline({
        id: 'tl-parent',
        name: 'Parent',
        durationMs: 100,
        keyframes: [
          createKeyframe({
            name: 'owner-state',
            offsetMs: 0,
            action: 'setState',
            payload: 'owner-active',
            properties: { opacity: { type: 'number', value: 0.2, easing: 'linear' } },
          }),
          createKeyframe({
            name: 'owner-modifier',
            offsetMs: 0,
            action: 'addModifier',
            payload: 'owner-glow',
            properties: {},
          }),
          createKeyframe({
            name: 'target-state',
            offsetMs: 0,
            action: 'setState',
            payload: 'target-active',
            target: 'target',
            properties: {},
          }),
        ],
      }),
      childTimelines: [{ childElementId: 'child', timeline: childTimeline }],
    };
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'parent',
        config: createConfig({ timelines: [parentTimeline] }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'parent', timelineName: 'Parent', timeMs: 0 });

    expect(opacityTarget.style.opacity).toBe('0.2');
    expect(parentHost.classList.contains('owner-active')).toBe(true);
    expect(parentContent.classList.contains('owner-glow')).toBe(true);
    expect(targetContent.classList.contains('target-active')).toBe(true);
    expect(childContent.classList.contains('child-active')).toBe(true);

    controller.destroy();

    expect(opacityTarget.style.opacity).toBe('0.7');
    expect(parentHost.classList.contains('owner-active')).toBe(false);
    expect(parentContent.classList.contains('owner-glow')).toBe(false);
    expect(targetContent.classList.contains('target-active')).toBe(false);
    expect(childContent.classList.contains('child-active')).toBe(false);
  });

  /** @description Clearing a parent timeline must also clear DOM-only styles applied by child timeline bindings. */
  it('clears child timeline DOM-only styles through the playback controller API', () => {
    const { root } = createHostElement('parent');
    const { contentTarget: childContentTarget, host: childHost } = createHostElement('child');

    root.appendChild(childHost);
    childContentTarget.style.transform = 'scale(1.1)';

    const childTimeline = createTimeline({
      id: 'tl-child',
      name: 'Child',
      durationMs: 300,
      keyframes: [
        createKeyframe({
          name: 'start',
          offsetMs: 0,
          properties: { scaleX: { type: 'number', value: 1.5, easing: 'linear' } },
        }),
      ],
    });
    const parentTimeline = {
      ...createTimeline({
        id: 'tl-parent',
        name: 'Parent',
        durationMs: 300,
        keyframes: [createKeyframe({ name: 'start', offsetMs: 0, properties: {} })],
      }),
      childTimelines: [{ childElementId: 'child', timeline: childTimeline }],
    };
    const animations: readonly AnimationDefinition[] = [
      {
        elementId: 'parent',
        config: createConfig({ timelines: [parentTimeline] }),
      },
    ];
    const controller = createPlaybackController({ root, animations });

    controller.attach();
    controller.seekTimeline({ elementId: 'parent', timelineName: 'Parent', timeMs: 0 });

    expect(childContentTarget.style.transform).toContain('scale');

    controller.clearStyles();

    expect(childContentTarget.style.transform).toBe('scale(1.1)');

    controller.destroy();
  });

  /** @description play() must trigger the IN timeline for elements with IN/OUT state bindings so the entrance animation plays when the user clicks the global play button. */
  it('plays the IN timeline on play() for elements with IN/OUT state bindings', () => {
    vi.useFakeTimers();

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
      vi.advanceTimersByTime(600);

      expect(Number(opacityTarget.style.opacity)).toBeCloseTo(1, 1);

      controller.destroy();
    } finally {
      vi.useRealTimers();
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
