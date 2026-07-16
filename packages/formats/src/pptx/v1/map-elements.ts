import { projectFormatV1 } from '@broadset/model';

import { decodeDataUri } from '../../psd/data-uri';
import { mapSvgPathV1 } from '../../svg/v1/map-path';
import type { ResourceCollectorV1 } from '../../v1';
import type { PptxSourceDocument, PptxSourceElement } from '../project-model';
import { mapPptxAppearanceV1, pptxAppearanceWarningsV1 } from './appearance';
import type { PptxFontRegistryV1 } from './font-registry';
import { mapPptxTextElementV1, pptxTransform } from './map-text';

export interface MappedPptxElementV1 {
  readonly element: projectFormatV1.Element;
  readonly sourceId: string;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
}

function warning(code: string, message: string): projectFormatV1.InteropDiagnostic {
  return { code, severity: 'warning', message, dimension: 'appearance', pointer: '/' };
}

function elementName(source: PptxSourceElement): string {
  return source.name.trim() === '' ? `PPTX ${source.type}` : source.name;
}

function base(input: {
  readonly source: PptxSourceElement;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id | null;
}): projectFormatV1.ElementBaseOptions {
  return {
    id: input.elementId,
    name: elementName(input.source),
    parentId: input.parentId,
    locked: input.source.locked,
    geometry: projectFormatV1.createElementGeometry({
      width: Math.max(1, input.source.width),
      height: Math.max(1, input.source.height),
      transform: pptxTransform(input.source),
    }),
    appearance: mapPptxAppearanceV1({ style: input.source.style, elementId: input.elementId }),
  };
}

async function mapImage(input: {
  readonly source: PptxSourceElement;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id | null;
  readonly resources: ResourceCollectorV1;
}): Promise<MappedPptxElementV1> {
  const decoded = typeof input.source.content === 'string' ? decodeDataUri(input.source.content) : undefined;
  const assetId =
    decoded === undefined ?
      await input.resources.addMissingImageAsset({ reference: 'pptx:image', name: input.source.name })
    : await input.resources.addImageAsset({
        bytes: decoded.bytes,
        mediaType: decoded.mime,
        name: input.source.name,
        pixelSize: [Math.max(1, Math.round(input.source.width)), Math.max(1, Math.round(input.source.height))],
      });
  const imageWarnings =
    decoded === undefined ?
      [warning('pptx.image-bytes-missing', 'The PPTX image reference had no decodable embedded bytes.')]
    : [];

  return {
    element: projectFormatV1.createElementV1({
      ...base(input),
      kind: 'image',
      image: { assetId, fit: input.source.style.objectFit ?? 'fill' },
    }),
    sourceId: input.source.id,
    warnings: [...imageWarnings, ...pptxAppearanceWarningsV1(input.source.style)],
  };
}

function mapNative(input: {
  readonly source: PptxSourceElement;
  readonly elementId: projectFormatV1.Id;
  readonly parentId: projectFormatV1.Id | null;
  readonly fontRegistry: PptxFontRegistryV1;
}): MappedPptxElementV1 {
  const appearanceWarnings = pptxAppearanceWarningsV1(input.source.style);

  if (input.source.type === 'text') {
    return {
      element: mapPptxTextElementV1(input),
      sourceId: input.source.id,
      warnings: appearanceWarnings,
    };
  }

  if (input.source.type === 'group') {
    return {
      element: projectFormatV1.createElementV1({ ...base(input), kind: 'group' }),
      sourceId: input.source.id,
      warnings: appearanceWarnings,
    };
  }

  const vector = mapVectorGeometry(input);

  return {
    element: projectFormatV1.createElementV1({ ...base(input), kind: 'vector', geometryData: vector.geometryData }),
    sourceId: input.source.id,
    warnings: [...appearanceWarnings, ...vector.warnings],
  };
}

function mapVectorGeometry(input: { readonly source: PptxSourceElement; readonly elementId: projectFormatV1.Id }): {
  readonly geometryData: projectFormatV1.VectorGeometryData;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
} {
  if (input.source.type === 'ellipse') return { geometryData: projectFormatV1.createEllipseGeometry(), warnings: [] };

  if (input.source.type === 'path' && typeof input.source.content === 'string') {
    try {
      const path = mapSvgPathV1({ d: input.source.content, elementId: input.elementId });

      if (path.segments.length > 0) {
        return {
          geometryData: { kind: 'path', path, fillRule: input.source.style.fillRule ?? 'nonzero' },
          warnings: [],
        };
      }

      return {
        geometryData: projectFormatV1.createRectangleGeometry(),
        warnings: [warning('pptx.path-placeholder', 'Empty PPTX custom geometry used a vector placeholder.')],
      };
    } catch {
      return {
        geometryData: projectFormatV1.createRectangleGeometry(),
        warnings: [warning('pptx.path-placeholder', 'Malformed PPTX custom geometry used a vector placeholder.')],
      };
    }
  }

  const unsupported = !['rectangle', 'svg'].includes(input.source.type);

  return {
    geometryData: projectFormatV1.createRectangleGeometry(input.source.style.borderRadius ?? [0, 0, 0, 0]),
    warnings:
      unsupported ?
        [
          warning(
            'pptx.element-placeholder',
            `PPTX element type ${input.source.type} was represented by an editable vector placeholder.`,
          ),
        ]
      : [],
  };
}

export async function mapPptxElementsV1(input: {
  readonly document: PptxSourceDocument;
  readonly resources: ResourceCollectorV1;
  readonly fontRegistry: PptxFontRegistryV1;
}): Promise<readonly MappedPptxElementV1[]> {
  const ids = new Map<string, projectFormatV1.Id>();
  const usedIds = new Set<projectFormatV1.Id>();

  input.document.elements.forEach((element, index) => {
    const parsed = projectFormatV1.idSchema.safeParse(element.id);
    let candidate = projectFormatV1.idSchema.parse(`pptx-element-${String(index + 1)}`);
    let suffix = 1;

    if (parsed.success && !usedIds.has(parsed.data)) candidate = parsed.data;

    while (usedIds.has(candidate)) {
      candidate = projectFormatV1.idSchema.parse(`pptx-element-${String(index + 1)}-${String(suffix)}`);
      suffix += 1;
    }

    ids.set(element.id, candidate);
    usedIds.add(candidate);
  });

  const mapped: MappedPptxElementV1[] = [];

  for (const source of input.document.elements) {
    const elementId = ids.get(source.id);

    if (elementId === undefined) continue;

    const parentId = source.parentId === null ? null : (ids.get(source.parentId) ?? null);

    mapped.push(
      source.type === 'image' ?
        await mapImage({ source, elementId, parentId, resources: input.resources })
      : mapNative({ source, elementId, parentId, fontRegistry: input.fontRegistry }),
    );
  }

  return mapped;
}
