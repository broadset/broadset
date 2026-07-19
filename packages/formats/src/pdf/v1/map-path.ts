import { projectFormatV1 } from '@broadset/model';

import { geometryFromBoundsV1, mapPathGeometryV1, pathBoundsV1 } from './geometry';
import { mapPdfColorV1 } from './map-color';
import type { ParsedPdfPageV1, PdfMappedElementV1, PdfPathV1 } from './types';

const DEFAULT_MITER_LIMIT = 10;

export function mapPdfPathV1(input: {
  readonly path: PdfPathV1;
  readonly page: ParsedPdfPageV1;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
}): PdfMappedElementV1 {
  const bounds = pathBoundsV1(input.page, input.path.commands);
  const fills: projectFormatV1.FillLayer[] = input.path.fill === undefined ? [] : [{
    id: projectFormatV1.idSchema.parse(`${input.elementId}-fill`),
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    paint: { kind: 'solid', color: mapPdfColorV1(input.path.fill) },
  }];
  const strokes: projectFormatV1.StrokeLayer[] = input.path.stroke === undefined ? [] : [{
    id: projectFormatV1.idSchema.parse(`${input.elementId}-stroke`),
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    paint: { kind: 'solid', color: mapPdfColorV1(input.path.stroke) },
    width: input.path.lineWidth,
    alignment: 'center',
    cap: 'butt',
    join: 'miter',
    miterLimit: DEFAULT_MITER_LIMIT,
    dash: [],
    dashOffset: 0,
  }];
  const element = projectFormatV1.createElementV1({
    id: input.elementId,
    name: 'PDF path',
    parentId: input.parentId,
    geometry: geometryFromBoundsV1(bounds),
    appearance: {
      opacity: 1,
      blendMode: 'normal',
      isolation: false,
      fills,
      strokes,
      effects: [],
    },
    kind: 'vector',
    geometryData: {
      kind: 'path',
      fillRule: input.path.fillRule,
      path: mapPathGeometryV1({
        page: input.page,
        commands: input.path.commands,
        elementId: input.elementId,
        bounds,
      }),
    },
  });

  return { element, warnings: [], mappingConfidence: 1, editability: 'native' };
}
