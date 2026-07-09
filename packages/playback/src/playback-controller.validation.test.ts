/** @vitest-environment jsdom */

import type { AnimationDefinition } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { escapeCssIdentifier, parseElementRuntimeState, validateAnimationDefinitions } from './playback-controller';
import { createConfig, createHostElement, createKeyframe, createTimeline } from './playback-controller-test-helpers';

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
      validateAnimationDefinitions(animations);
    }).toThrow(/circular dependency/i);

    expect(() => {
      validateAnimationDefinitions([
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
