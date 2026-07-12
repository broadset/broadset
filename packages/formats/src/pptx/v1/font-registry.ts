import type { FontAsset } from '@broadset/model';
import { projectFormatV1 } from '@broadset/model';

import { decodeDataUri } from '../../psd/data-uri';
import type { ResourceCollectorV1 } from '../../v1';

interface PptxFontReferenceV1 {
  readonly familyId: projectFormatV1.Id;
  readonly faceId: projectFormatV1.Id;
}

export interface PptxFontRegistryV1 {
  getFont(input: {
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
  }): PptxFontReferenceV1;
}

export async function createPptxFontRegistryV1(options: {
  readonly resourceCollector: ResourceCollectorV1;
  readonly embeddedFonts: readonly FontAsset[];
}): Promise<PptxFontRegistryV1> {
  const fonts = new Map<string, PptxFontReferenceV1>();
  let sequence = 0;

  for (const embedded of options.embeddedFonts) {
    if (embedded.source.type !== 'embedded') continue;

    const decoded = decodeDataUri(embedded.source.dataUri);

    if (decoded === undefined) continue;

    sequence += 1;

    const assetId = await options.resourceCollector.addFontAsset({
      bytes: decoded.bytes,
      mediaType: embedded.mimeType,
      name: embedded.name,
      id: projectFormatV1.idSchema.parse(`pptx-embedded-font-${String(sequence)}`),
    });
    const faceId = projectFormatV1.idSchema.parse(`pptx-font-face-${String(sequence)}`);
    const familyId = options.resourceCollector.addFontFamily({
      id: projectFormatV1.idSchema.parse(`pptx-font-family-${String(sequence)}`),
      familyName: embedded.familyName,
      faces: [
        {
          id: faceId,
          source: { kind: 'asset', assetId },
          weight: embedded.weight ?? 400,
          style: embedded.italic === true ? 'italic' : 'normal',
          stretch: 1,
        },
      ],
    });

    fonts.set(
      `${embedded.familyName}\u0000${String(embedded.weight ?? 400)}\u0000${embedded.italic === true ? 'italic' : 'normal'}`,
      { familyId, faceId },
    );
  }

  function getFont(input: {
    readonly family: string;
    readonly weight: number;
    readonly style: 'normal' | 'italic';
  }): PptxFontReferenceV1 {
    const family = input.family.trim() === '' ? 'Arial' : input.family;
    const key = `${family}\u0000${String(input.weight)}\u0000${input.style}`;
    const existing = fonts.get(key);

    if (existing !== undefined) return existing;

    sequence += 1;

    const faceId = projectFormatV1.idSchema.parse(`pptx-font-face-${String(sequence)}`);
    const familyId = options.resourceCollector.addFontFamily({
      id: projectFormatV1.idSchema.parse(`pptx-font-family-${String(sequence)}`),
      familyName: family,
      faces: [
        {
          id: faceId,
          source: { kind: 'system', postScriptName: family },
          weight: input.weight,
          style: input.style,
          stretch: 1,
        },
      ],
    });
    const reference: PptxFontReferenceV1 = { familyId, faceId };

    fonts.set(key, reference);

    return reference;
  }

  return { getFont };
}
