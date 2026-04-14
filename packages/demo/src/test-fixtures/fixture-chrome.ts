import { type BroadsetDocument, createDefaultElement, createDefaultStyle } from '@broadset/model';

import { createBaseFixtureDocument } from './base-document';
import { FIXTURE_IDS } from './ids';

export function createDemoAppChromeTestDocument(): BroadsetDocument {
  const base = createBaseFixtureDocument('Fixture: Demo Chrome');

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
