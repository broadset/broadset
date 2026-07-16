import { projectFormatV1 } from '@broadset/model';

import { FIXTURE_IDS } from './ids';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function translatedGeometry(options: {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}): projectFormatV1.ElementGeometry {
  return projectFormatV1.createElementGeometry({
    width: options.width,
    height: options.height,
    transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, options.x, options.y] },
  });
}

export function createParentingTransformTestProjectV1(): projectFormatV1.BroadsetProjectV1 {
  const group = projectFormatV1.createElementV1({
    id: id(FIXTURE_IDS.promoGroup),
    name: 'Promo Group',
    geometry: translatedGeometry({ width: 430, height: 246, x: 1430, y: 770 }),
    kind: 'group',
    clipChildren: true,
  });
  const qrcode = projectFormatV1.createElementV1({
    id: id(FIXTURE_IDS.promoQr),
    name: 'Promo QR',
    parentId: group.id,
    geometry: translatedGeometry({ width: 140, height: 140, x: 12, y: 18 }),
    kind: 'qrcode',
    qrcode: { value: 'https://broadset.dev/live', errorCorrection: 'M', quietZone: 4 },
  });
  const page = projectFormatV1.createPageV1({
    id: id('page-parenting-transform'),
    name: 'Parenting transform',
    rootInstances: [
      {
        id: id('instance-promo-group'),
        elementId: group.id,
        overrides: [],
        componentPropertyValues: [],
      },
    ],
  });
  const document = projectFormatV1.createDocumentV1({
    id: id('document-parenting-transform'),
    name: 'Fixture: Parenting Transform',
    elements: [group, qrcode],
    pages: [page],
  });

  return projectFormatV1.createProjectV1({
    id: id('project-parenting-transform'),
    name: 'Fixture: Parenting Transform',
    documents: [document],
  });
}
