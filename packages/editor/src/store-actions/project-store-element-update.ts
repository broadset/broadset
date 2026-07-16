import type { projectFormatV1 } from '@broadset/model';

import { updateElementRectV1 } from '../v1-element-geometry';

export interface ProjectElementUpdateV1 {
  readonly position?: { readonly x: number; readonly y: number };
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: number;
  readonly name?: string;
}

export function applyProjectElementUpdate(
  element: projectFormatV1.Element,
  update: ProjectElementUpdateV1,
): projectFormatV1.Element {
  const geometryUpdated = updateElementRectV1(element, {
    ...(update.position === undefined ? {} : { x: update.position.x, y: update.position.y }),
    ...(update.width === undefined ? {} : { width: update.width }),
    ...(update.height === undefined ? {} : { height: update.height }),
    ...(update.rotation === undefined ? {} : { rotation: update.rotation }),
  });

  return update.name === undefined || update.name === geometryUpdated.name ?
      geometryUpdated
    : { ...geometryUpdated, name: update.name };
}
