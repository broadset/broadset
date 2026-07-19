import { projectFormatV1 } from '@broadset/model';

import { decodeDataUri } from '../../pdf/data-uri';
import type { ResourceCollectorV1 } from '../../v1';
import { mapAppearanceV1 } from './map-paint';
import { mapSvgPathV1 } from './map-path';
import { mapTextBodyV1 } from './map-text';
import type {
  ElementMappingContextV1,
  MappedElementV1,
  SvgImageAssetRegistryV1,
  SvgImageAssetResolutionV1,
} from './types';

const MINIMUM_BOUND = 1;
const DEG_TO_RAD = Math.PI / 180;

export function createSvgImageAssetRegistryV1(
  resourceCollector: ResourceCollectorV1,
  maxRetainedBytes: number,
): SvgImageAssetRegistryV1 {
  const byReference = new Map<string, Promise<SvgImageAssetResolutionV1>>();
  const budget = Number.isSafeInteger(maxRetainedBytes) && maxRetainedBytes >= 0 ? maxRetainedBytes : 0;
  let retainedBytes = 0;
  let resourceLimitFallback: Promise<projectFormatV1.Id> | undefined;

  async function register(
    reference: string,
    pixelSize: readonly [number, number],
  ): Promise<SvgImageAssetResolutionV1> {
    let decoded: ReturnType<typeof decodeDataUri>;

    try {
      decoded = decodeDataUri(reference);
    } catch {
      decoded = undefined;
    }

    if (decoded === undefined) {
      const assetId = await resourceCollector.addMissingImageAsset({ reference, pixelSize });

      return { assetId, limitExceeded: false };
    }

    if (decoded.bytes.byteLength > budget - retainedBytes) {
      resourceLimitFallback ??= resourceCollector.addImageAsset({
        bytes: new Uint8Array(),
        mediaType: 'image/png',
        name: 'SVG image resource-limit fallback',
        pixelSize: [1, 1],
      });

      return { assetId: await resourceLimitFallback, limitExceeded: true };
    }

    // Reserve synchronously before hashing so concurrent unique sources share one cumulative budget.
    retainedBytes += decoded.bytes.byteLength;

    const assetId = await resourceCollector.addImageAsset({
      bytes: decoded.bytes,
      mediaType: decoded.mime,
      pixelSize,
    });

    return { assetId, limitExceeded: false };
  }

  return {
    resolve(reference: string, pixelSize: readonly [number, number]): Promise<SvgImageAssetResolutionV1> {
      let resolved = byReference.get(reference);

      if (resolved === undefined) {
        resolved = register(reference, pixelSize);
        byReference.set(reference, resolved);
      }

      return resolved;
    },
  };
}

function positiveBound(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : MINIMUM_BOUND;
}

function rectangleRadius(rx: number, ry: number): number {
  if (Number.isFinite(rx)) return Math.max(0, rx);
  if (Number.isFinite(ry)) return Math.max(0, ry);

  return 0;
}

function mappingConfidence(element: projectFormatV1.Element | undefined, fallback: boolean): number {
  if (element === undefined) return 0;

  return fallback ? 0.7 : 1;
}

function geometry(context: ElementMappingContextV1): projectFormatV1.ElementGeometry {
  const radians = context.imported.rotation * DEG_TO_RAD;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return projectFormatV1.createElementGeometry({
    width: positiveBound(context.imported.width),
    height: positiveBound(context.imported.height),
    transform: {
      kind: 'affine2d',
      matrix: [cosine, sine, -sine, cosine, context.imported.position.x, context.imported.position.y],
    },
    origin: [0, 0, 0],
  });
}

function appearanceWarnings(context: ElementMappingContextV1): readonly projectFormatV1.InteropDiagnostic[] {
  const warnings: projectFormatV1.InteropDiagnostic[] = [];

  if (context.source.hasPaintServer) {
    warnings.push({
      code: 'svg.paint-server-fallback',
      severity: 'warning',
      message: 'SVG paint server was mapped to a solid fallback.',
      dimension: 'appearance',
      pointer: '/appearance/fills',
    });
  }

  if (context.source.hasFilter) warnings.push({ code: 'svg.filter-fallback', severity: 'warning', message: 'SVG filter was omitted from the native appearance.', dimension: 'appearance', pointer: '/appearance/effects' });
  if (context.source.hasClipPath) warnings.push({ code: 'svg.clip-path-fallback', severity: 'warning', message: 'SVG clip path could not be represented natively.', dimension: 'appearance', pointer: '/appearance/clip' });
  if (context.source.hasMask) warnings.push({ code: 'svg.mask-fallback', severity: 'warning', message: 'SVG mask could not be represented natively.', dimension: 'appearance', pointer: '/appearance/mask' });

  return warnings;
}

function mapVector(context: ElementMappingContextV1): projectFormatV1.Element | undefined {
  let geometryData: projectFormatV1.VectorGeometryData;

  if (context.imported.type === 'rectangle') {
    const rx = Number.parseFloat(context.source.element?.getAttribute('rx') ?? '0');
    const ry = Number.parseFloat(context.source.element?.getAttribute('ry') ?? String(rx));
    const radius = rectangleRadius(rx, ry);

    geometryData = projectFormatV1.createRectangleGeometry([radius, radius, radius, radius]);
  } else if (context.imported.type === 'ellipse') {
    geometryData = projectFormatV1.createEllipseGeometry();
  } else if (context.imported.type === 'path' && typeof context.imported.content === 'string') {
    geometryData = {
      kind: 'path',
      fillRule: context.imported.style.fillRule ?? 'nonzero',
      path: mapSvgPathV1({ d: context.imported.content, elementId: context.elementId }),
    };
  } else {
    return undefined;
  }

  const style = context.imported.style.fill === undefined && context.imported.style.backgroundGradient === undefined
    ? { ...context.imported.style, fill: '#000000' }
    : context.imported.style;
  const mappedAppearance = mapAppearanceV1({
    style,
    source: context.source,
    elementId: context.elementId,
  });

  return projectFormatV1.createElementV1({
    id: context.elementId,
    name: context.imported.dataBsId ?? context.imported.type,
    parentId: context.parentId,
    geometry: geometry(context),
    appearance: mappedAppearance.appearance,
    kind: 'vector',
    geometryData,
  });
}

async function mapImage(context: ElementMappingContextV1): Promise<{
  readonly element: projectFormatV1.Element;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
}> {
  const reference = typeof context.imported.content === 'string' ? context.imported.content : '';
  const pixelSize: readonly [number, number] = [
    positiveBound(context.imported.width),
    positiveBound(context.imported.height),
  ];
  const resolution = await context.imageAssetRegistry.resolve(reference, pixelSize);
  const mappedAppearance = mapAppearanceV1({
    style: context.imported.style,
    source: context.source,
    elementId: context.elementId,
  });

  const element = projectFormatV1.createElementV1({
    id: context.elementId,
    name: context.imported.dataBsId ?? 'image',
    parentId: context.parentId,
    geometry: geometry(context),
    appearance: mappedAppearance.appearance,
    kind: 'image',
    image: { assetId: resolution.assetId, fit: context.imported.style.objectFit ?? 'fill' },
  });

  return {
    element,
    warnings: resolution.limitExceeded ? [{
      code: 'svg.image-resource-limit',
      severity: 'warning',
      message: 'SVG embedded image exceeded the cumulative retained-resource limit and was replaced by a fallback asset.',
      dimension: 'appearance',
      pointer: '/image/assetId',
    }] : [],
  };
}

export async function mapSvgElementV1(context: ElementMappingContextV1): Promise<MappedElementV1> {
  let warnings = appearanceWarnings(context);
  let element = mapVector(context);

  if (context.imported.type === 'group') {
    const mappedAppearance = mapAppearanceV1({
      style: context.imported.style,
      source: context.source,
      elementId: context.elementId,
    });

    element = projectFormatV1.createElementV1({
      id: context.elementId,
      name: context.imported.dataBsId ?? 'Group',
      parentId: context.parentId,
      geometry: geometry(context),
      appearance: mappedAppearance.appearance,
      kind: 'group',
      clipChildren: context.imported.style.clipChildren ?? false,
    });
  } else if (context.imported.type === 'text') {
    const mappedAppearance = mapAppearanceV1({
      style: context.imported.style,
      source: context.source,
      elementId: context.elementId,
    });

    element = projectFormatV1.createElementV1({
      id: context.elementId,
      name: context.imported.dataBsId ?? 'text',
      parentId: context.parentId,
      geometry: geometry(context),
      appearance: mappedAppearance.appearance,
      kind: 'text',
      text: mapTextBodyV1({
        content: context.imported.content,
        style: context.imported.style,
        source: context.source.element,
        elementId: context.elementId,
        fontRegistry: context.fontRegistry,
      }),
    });
  } else if (context.imported.type === 'image') {
    const mappedImage = await mapImage(context);

    element = mappedImage.element;
    warnings = [...warnings, ...mappedImage.warnings];
  }

  const fallback = warnings.length > 0;

  return {
    element,
    warnings,
    mappingConfidence: mappingConfidence(element, fallback),
    editability: fallback ? 'appearance-only' : 'native',
  };
}
