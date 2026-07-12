import { projectFormatV1 } from '@broadset/model';

import type { ResourceCollectorV1 } from '../../v1';
import type { FontReferenceV1, FontRegistryV1 } from './types';

export function createSvgFontRegistryV1(resourceCollector: ResourceCollectorV1): FontRegistryV1 {
  const fonts = new Map<string, FontReferenceV1>();
  let sequence = 0;

  function getFont(input: {
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic' | 'oblique';
  }): FontReferenceV1 {
    const key = `${input.family}\u0000${String(input.weight)}\u0000${input.style}`;
    const existing = fonts.get(key);

    if (existing !== undefined) return existing;

    sequence += 1;

    const faceId = projectFormatV1.idSchema.parse(`svg-font-face-${String(sequence)}`);
    const familyId = resourceCollector.addFontFamily({
      id: projectFormatV1.idSchema.parse(`svg-font-family-${String(sequence)}`),
      familyName: input.family.trim() === '' ? 'sans-serif' : input.family,
      faces: [{
        id: faceId,
        source: { kind: 'system', postScriptName: input.family.trim() === '' ? 'sans-serif' : input.family },
        weight: input.weight,
        style: input.style,
        stretch: 1,
      }],
    });
    const reference = { familyId, faceId };

    fonts.set(key, reference);

    return reference;
  }

  return { getFont };
}
