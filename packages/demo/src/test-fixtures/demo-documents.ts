import {
  type BroadsetDocument,
  createDefaultAnimationConfig,
  createDefaultElement,
  createDefaultStyle,
  createEmptyBroadsetDocument,
} from '@broadset/model';

import { FIXTURE_IDS } from '../../ct/fixture-selectors';

function createBaseDocument(name: string): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    name,
    canvas: {
      ...base.canvas,
      width: 1920,
      height: 1080,
      backgroundColor: '#0b1320',
      backgroundMode: 'solid',
    },
    pages: [
      {
        id: 'page-live',
        name: 'Live',
        overrides: [],
        locale: 'en-GB',
        extensions: {},
      },
    ],
  };
}

export function createDemoAppChromeTestDocument(): BroadsetDocument {
  const base = createBaseDocument('Demo Chrome Test Document');

  return {
    ...base,
    elements: [
      createDefaultElement('rectangle', {
        id: FIXTURE_IDS.background,
        name: 'Background',
        locked: true,
        width: 1920,
        height: 1080,
        style: {
          ...createDefaultStyle(),
          backgroundColor: '#0b1320',
        },
      }),
      createDefaultElement('text', {
        id: FIXTURE_IDS.title,
        name: 'Score Title',
        position: { x: 96, y: 84 },
        width: 600,
        height: 80,
        content: '<b>CHROME TEST</b>',
        style: {
          ...createDefaultStyle(),
          fontFamily: 'Inter',
          fontSize: 48,
          fontWeight: 700,
          fontColor: '#f7fbff',
        },
      }),
    ],
  };
}

export function createDemoAppPlaybackTestDocument(): BroadsetDocument {
  const base = createBaseDocument('Demo Playback Test Document');

  return {
    ...base,
    elements: [
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
    ],
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

export function createParentingTransformTestDocument(): BroadsetDocument {
  const base = createBaseDocument('Parenting Transform Test Document');

  return {
    ...base,
    elements: [
      createDefaultElement('group', {
        id: FIXTURE_IDS.promoGroup,
        name: 'Promo Group',
        position: { x: 1430, y: 770 },
        width: 430,
        height: 246,
        style: {
          ...createDefaultStyle(),
          backgroundColor: 'rgba(19, 36, 60, 0.92)',
          borderRadius: [20, 20, 20, 20],
          clipChildren: true,
          padding: [20, 24, 28, 32],
        },
      }),
      createDefaultElement('qrcode', {
        id: FIXTURE_IDS.promoQr,
        name: 'Promo QR',
        parentId: FIXTURE_IDS.promoGroup,
        position: { x: 12, y: 18 },
        width: 140,
        height: 140,
        content: 'https://broadset.dev/live',
        style: {
          ...createDefaultStyle(),
          backgroundColor: '#ffffff',
          padding: [10, 10, 10, 10],
          borderRadius: [12, 12, 12, 12],
        },
      }),
    ],
  };
}
