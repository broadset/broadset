import { projectFormatV1 } from '@broadset/model';

import type { ResourceCollectorV1 } from '../../v1';

interface PsdFontReferenceV1 {
  readonly familyId: projectFormatV1.Id;
  readonly faceId: projectFormatV1.Id;
}

export interface PsdFontRegistryV1 {
  getFont(input: {
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
  }): PsdFontReferenceV1;
}

export function createPsdFontRegistryV1(resourceCollector: ResourceCollectorV1): PsdFontRegistryV1 {
  const fonts = new Map<string, PsdFontReferenceV1>();
  let sequence = 0;

  function getFont(input: {
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
  }): PsdFontReferenceV1 {
    const key = `${input.family}\u0000${String(input.weight)}\u0000${input.style}`;
    const existing = fonts.get(key);

    if (existing !== undefined) return existing;

    sequence += 1;

    const faceId = projectFormatV1.idSchema.parse(`psd-font-face-${String(sequence)}`);
    const familyId = resourceCollector.addFontFamily({
      id: projectFormatV1.idSchema.parse(`psd-font-family-${String(sequence)}`),
      familyName: input.family,
      faces: [{
        id: faceId,
        source: { kind: 'system', postScriptName: input.family },
        weight: input.weight,
        style: input.style,
        stretch: 1,
      }],
    });
    const reference: PsdFontReferenceV1 = { familyId, faceId };

    fonts.set(key, reference);

    return reference;
  }

  return { getFont };
}
