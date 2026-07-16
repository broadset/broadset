import { projectFormatV1 } from '@broadset/model';
import type { Layer } from 'ag-psd';

import type { ResourceCollectorV1 } from '../../v1';
import { mapPsdAppearanceV1 } from './appearance';
import { encodeRgbaPngV1 } from './encode-png';
import { psdLayerName } from './names';

const MINIMUM_BOUND = 1;

function positiveDimension(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : MINIMUM_BOUND;
}

export async function mapPsdRasterLayerV1(input: {
  readonly layer: Layer;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
  readonly resourceCollector: ResourceCollectorV1;
}): Promise<projectFormatV1.Element | undefined> {
  const imageData = input.layer.imageData;

  if (imageData === undefined) return undefined;

  const width = positiveDimension(imageData.width);
  const height = positiveDimension(imageData.height);
  const rgba = Uint8Array.from(imageData.data);
  const bytes = encodeRgbaPngV1({ rgba, width, height });
  const assetId = await input.resourceCollector.addImageAsset({
    bytes,
    mediaType: 'image/png',
    name: input.layer.name ?? 'PSD raster layer',
    pixelSize: [width, height],
  });
  const left = Number.isFinite(input.layer.left) ? input.layer.left ?? 0 : 0;
  const top = Number.isFinite(input.layer.top) ? input.layer.top ?? 0 : 0;

  return projectFormatV1.createElementV1({
    id: input.elementId,
    name: psdLayerName(input.layer.name, 'PSD raster layer'),
    parentId: input.parentId,
    geometry: projectFormatV1.createElementGeometry({
      width,
      height,
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, left, top] },
    }),
    appearance: mapPsdAppearanceV1({ layer: input.layer }),
    kind: 'image',
    image: { assetId, fit: 'fill' },
  });
}
