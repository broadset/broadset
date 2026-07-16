import { projectFormatV1 } from '@broadset/model';

import type { ResourceCollectorV1 } from '../../v1';
import { encodeRgbPngV1 } from './encode-png';
import { imageGeometryV1 } from './geometry';
import type { ParsedPdfPageV1, PdfImageUseV1, PdfMappedElementV1 } from './types';

export async function mapPdfImageV1(input: {
  readonly use: PdfImageUseV1;
  readonly page: ParsedPdfPageV1;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id;
  readonly resourceCollector: ResourceCollectorV1;
}): Promise<PdfMappedElementV1> {
  const resource = input.page.images.get(input.use.resourceName);
  const pixelSize = resource?.pixelSize ?? [1, 1];
  const extractable = resource?.bytes !== undefined;
  const placeholder = encodeRgbPngV1({ rgb: new Uint8Array([0, 0, 0]), width: 1, height: 1 });
  const assetId = extractable
    ? await input.resourceCollector.addImageAsset({
        bytes: resource.bytes,
        mediaType: resource.mediaType,
        name: input.use.resourceName,
        pixelSize,
      })
    : await input.resourceCollector.addImageAsset({
        bytes: placeholder,
        mediaType: 'image/png',
        name: `${input.use.resourceName} placeholder`,
        pixelSize: [1, 1],
      });
  const missingWarning: readonly projectFormatV1.InteropDiagnostic[] = extractable ? [] : [{
    code: 'pdf.image-bytes-unavailable',
    severity: 'warning',
    message: `PDF image XObject ${input.use.resourceName} could not be extracted; a placeholder asset was registered.`,
    dimension: 'appearance',
    pointer: '/image/assetId',
  }];
  const warnings = [...(resource?.warnings ?? []), ...missingWarning];
  const fallback = !extractable || warnings.length > 0;
  const element = projectFormatV1.createElementV1({
    id: input.elementId,
    name: `PDF image ${input.use.resourceName}`,
    parentId: input.parentId,
    geometry: imageGeometryV1(input.page, input.use.transform),
    kind: 'image',
    image: { assetId, fit: 'fill' },
  });

  return {
    element,
    warnings,
    mappingConfidence: fallback ? 0.5 : 1,
    editability: fallback ? 'appearance-only' : 'native',
  };
}
