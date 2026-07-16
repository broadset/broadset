import { projectFormatV1 } from '@broadset/model';

import type { ResourceCollectorV1 } from '../../v1';
import type { PdfFontReferenceV1, PdfFontRegistryV1 } from './types';

const DEFAULT_FONT_FAMILY = 'Helvetica';
const DEFAULT_FONT_WEIGHT = 400;

export function createPdfFontRegistryV1(resourceCollector: ResourceCollectorV1): PdfFontRegistryV1 {
  const fonts = new Map<string, PdfFontReferenceV1>();
  let sequence = 0;

  function getFont(input: { readonly family: string; readonly weight: number }): PdfFontReferenceV1 {
    const family = input.family.trim() === '' ? DEFAULT_FONT_FAMILY : input.family;
    const weight = Number.isFinite(input.weight) ? Math.min(1000, Math.max(1, Math.round(input.weight))) : DEFAULT_FONT_WEIGHT;
    const key = `${family}\u0000${String(weight)}`;
    const existing = fonts.get(key);

    if (existing !== undefined) return existing;

    sequence += 1;

    const faceId = projectFormatV1.idSchema.parse(`pdf-font-face-${String(sequence)}`);
    const familyId = resourceCollector.addFontFamily({
      id: projectFormatV1.idSchema.parse(`pdf-font-family-${String(sequence)}`),
      familyName: family,
      faces: [{
        id: faceId,
        source: { kind: 'system', postScriptName: family },
        weight,
        style: 'normal',
        stretch: 1,
      }],
    });
    const reference: PdfFontReferenceV1 = { familyId, faceId };

    fonts.set(key, reference);

    return reference;
  }

  return { getFont };
}
