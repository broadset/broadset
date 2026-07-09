import { type BroadsetDocument, createDefaultElement, createDefaultStyle } from '@broadset/model';

import { createRootPageInstances } from './base-document';
import { createParentingTransformTestDocument } from './fixture-parenting';
import { createDemoAppPlaybackTestDocument } from './fixture-playback';
import { FIXTURE_IDS } from './ids';

export function createPlaybackAndParentingComboDocument(): BroadsetDocument {
  const playback = createDemoAppPlaybackTestDocument();
  const parenting = createParentingTransformTestDocument();
  const elements = [...playback.elements, ...parenting.elements];

  return {
    ...playback,
    name: 'Fixture: Playback + Parenting Combo',
    elements,
    pages: playback.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
  };
}

export function createVisibilityAndDataBindingComboDocument(): BroadsetDocument {
  const playback = createDemoAppPlaybackTestDocument();
  const elements = [
    ...playback.elements,
    createDefaultElement('image', {
      id: FIXTURE_IDS.logo,
      name: 'Visibility + Data Logo',
      position: { x: 1600, y: 540 },
      width: 220,
      height: 220,
      content: 'data:image/svg+xml;base64,PHN2Zy8+',
      visibleWhen: 'sponsorVisible == true',
      dataField: { fieldName: 'sponsorLogo', overflow: 'clip', prefix: '', suffix: '' },
      style: {
        ...createDefaultStyle(),
        objectFit: 'contain',
      },
    }),
  ];

  return {
    ...playback,
    name: 'Fixture: Visibility + Data Binding Combo',
    elements,
    pages: playback.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    dataSchema: {
      description: 'Combo fixture data fields',
      fields: [
        { name: 'sponsorVisible', type: 'boolean', label: 'Show Sponsor', defaultValue: true },
        {
          name: 'sponsorLogo',
          type: 'string',
          label: 'Sponsor Logo',
          defaultValue: 'data:image/svg+xml;base64,PHN2Zy8+',
        },
      ],
    },
  };
}
