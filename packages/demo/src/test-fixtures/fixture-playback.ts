import {
  type BroadsetDocument,
  createDefaultAnimationConfig,
  createDefaultElement,
  createDefaultStyle,
} from '@broadset/model';

import { createBaseFixtureDocument, createRootPageInstances } from './base-document';
import { FIXTURE_IDS } from './ids';

export function createDemoAppPlaybackTestDocument(): BroadsetDocument {
  const base = createBaseFixtureDocument('Fixture: Demo Playback');
  const elements = [
    createDefaultElement('ellipse', {
      id: FIXTURE_IDS.liveOrb,
      name: 'Live Orb',
      position: { x: 980, y: 116 },
      width: 96,
      height: 96,
      style: {
        ...createDefaultStyle(),
        backgroundColor: '#3da9fc',
      },
    }),
    createDefaultElement('text', {
      id: FIXTURE_IDS.title,
      name: 'Score Title',
      position: { x: 96, y: 84 },
      width: 600,
      height: 80,
      content: '<b>PLAYBACK TEST</b>',
      style: {
        ...createDefaultStyle(),
        fontFamily: 'Inter',
        fontSize: 48,
        fontWeight: 700,
        fontColor: '#f7fbff',
      },
    }),
  ];

  return {
    ...base,
    elements,
    pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    animations: [
      {
        elementId: FIXTURE_IDS.liveOrb,
        config: {
          ...createDefaultAnimationConfig(),
          timelines: [
            {
              id: 'tl-live-pulse',
              name: 'Live Pulse',
              durationMs: 1200,
              loop: 'ping-pong',
              loopCount: null,
              keyframes: [
                {
                  name: 'start',
                  action: 'none',
                  offsetMs: 0,
                  properties: {
                    opacity: { type: 'number', value: 0.6, easing: 'linear' },
                    translateX: { type: 'number', value: 0, easing: 'ease-in-out' },
                  },
                },
                {
                  name: 'end',
                  action: 'none',
                  offsetMs: 1200,
                  properties: {
                    opacity: { type: 'number', value: 1, easing: 'linear' },
                    translateX: { type: 'number', value: 80, easing: 'ease-in-out' },
                  },
                },
              ],
              childTimelines: [],
              audioCues: [],
            },
          ],
        },
      },
    ],
  };
}
