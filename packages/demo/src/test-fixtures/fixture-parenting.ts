import { type BroadsetDocument, createDefaultElement, createDefaultStyle } from '@broadset/model';

import { createBaseFixtureDocument, createRootPageInstances } from './base-document';
import { FIXTURE_IDS } from './ids';

export function createParentingTransformTestDocument(): BroadsetDocument {
  const base = createBaseFixtureDocument('Fixture: Parenting Transform');
  const elements = [
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
  ];

  return {
    ...base,
    elements,
    pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
  };
}
