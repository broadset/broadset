import { projectFormatV1 } from '@broadset/model';
import type { Layer } from 'ag-psd';

import type { ResourceCollectorV1 } from '../../v1';
import { mapPsdAppearanceV1 } from './appearance';
import type { PsdFontRegistryV1 } from './font-registry';
import { mapPsdRasterLayerV1 } from './map-raster';
import { mapPsdTextLayerV1 } from './map-text';
import { mapPsdVectorLayerV1 } from './map-vector';
import { psdLayerName } from './names';

export interface MappedPsdElementV1 {
  readonly element: projectFormatV1.Element;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
  readonly mappingConfidence: number;
  readonly editability: 'native' | 'partial' | 'appearance-only';
}

export interface PsdLayerTreeResultV1 {
  readonly mapped: readonly MappedPsdElementV1[];
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
  readonly pixelTotal: number;
}

const MINIMUM_BOUND = 1;

function diagnostic(input: {
  readonly code: string;
  readonly message: string;
  readonly dimension?: 'appearance' | 'editability' | 'semantics';
}): projectFormatV1.InteropDiagnostic {
  return {
    code: input.code,
    severity: 'warning',
    message: input.message,
    dimension: input.dimension ?? 'semantics',
    pointer: '/',
  };
}

function featureWarnings(layer: Layer): readonly projectFormatV1.InteropDiagnostic[] {
  const warnings: projectFormatV1.InteropDiagnostic[] = [];

  if (layer.placedLayer !== undefined) {
    warnings.push(diagnostic({
      code: 'psd.placed-layer-partial',
      message: 'PSD placed-layer transform and smart-object editing semantics use the imported raster appearance.',
      dimension: 'editability',
    }));
  }

  if (layer.effects !== undefined) {
    warnings.push(diagnostic({
      code: 'psd.layer-effects-partial',
      message: 'PSD layer effects are preserved in the source file but are not independently editable.',
      dimension: 'appearance',
    }));
  }

  if (layer.mask !== undefined) {
    warnings.push(diagnostic({
      code: 'psd.bitmap-mask-partial',
      message: 'PSD bitmap mask semantics are represented by the imported layer appearance.',
      dimension: 'appearance',
    }));
  }

  if ((layer.vectorMask?.paths.length ?? 0) > 1) {
    warnings.push(diagnostic({
      code: 'psd.additional-vector-paths-omitted',
      message: 'Only the first PSD vector-mask path is editable; additional paths remain in the preserved source.',
      dimension: 'appearance',
    }));
  }

  if (layer.adjustment !== undefined) {
    warnings.push(diagnostic({
      code: 'psd.adjustment-layer-partial',
      message: 'PSD adjustment-layer parameters remain in the preserved source and use a placeholder in Broadset.',
      dimension: 'editability',
    }));
  }

  return warnings;
}

function placeholder(layer: Layer, elementId: projectFormatV1.Id, parentId: projectFormatV1.Id): MappedPsdElementV1 {
  const left = Number.isFinite(layer.left) ? layer.left ?? 0 : 0;
  const top = Number.isFinite(layer.top) ? layer.top ?? 0 : 0;
  const right = Number.isFinite(layer.right) ? layer.right ?? left : left;
  const bottom = Number.isFinite(layer.bottom) ? layer.bottom ?? top : top;
  const element = projectFormatV1.createElementV1({
    id: elementId,
    name: psdLayerName(layer.name, 'PSD unsupported layer'),
    parentId,
    geometry: projectFormatV1.createElementGeometry({
      width: Math.max(MINIMUM_BOUND, right - left),
      height: Math.max(MINIMUM_BOUND, bottom - top),
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, left, top] },
    }),
    kind: 'vector',
    geometryData: projectFormatV1.createRectangleGeometry(),
  });

  return {
    element,
    warnings: [
      ...featureWarnings(layer),
      diagnostic({
        code: 'psd.layer-placeholder',
        message: `PSD layer ${element.name} had no natively mappable content and was preserved as a placeholder.`,
      }),
    ],
    mappingConfidence: 0.25,
    editability: 'partial',
  };
}

function rasterPixelCost(layer: Layer): number {
  const width = layer.imageData?.width ?? 0;
  const height = layer.imageData?.height ?? 0;

  return Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0
    ? width * height
    : 0;
}

export async function mapPsdLayerTreeV1(input: {
  readonly layers: readonly Layer[];
  readonly parentId: projectFormatV1.Id;
  readonly surfaceSize: readonly [number, number];
  readonly resourceCollector: ResourceCollectorV1;
  readonly fontRegistry: PsdFontRegistryV1;
  readonly maxDepth: number;
  readonly maxTotalPixels: number;
  readonly idPrefix: string;
}): Promise<PsdLayerTreeResultV1> {
  const mapped: MappedPsdElementV1[] = [];
  const warnings: projectFormatV1.InteropDiagnostic[] = [];
  let sequence = 0;
  let pixelTotal = 0;
  let depthWarningEmitted = false;
  let pixelWarningEmitted = false;

  function appendMapped(element: projectFormatV1.Element, layer: Layer): void {
    const warningsForLayer = featureWarnings(layer);

    mapped.push({
      element,
      warnings: warningsForLayer,
      mappingConfidence: warningsForLayer.length > 0 ? 0.75 : 1,
      editability: warningsForLayer.length > 0 ? 'partial' : 'native',
    });
  }

  function emitDepthWarning(): void {
    if (depthWarningEmitted) return;

    warnings.push(diagnostic({
      code: 'psd.depth-limit',
      message: `PSD layer nesting exceeded the ${String(input.maxDepth)} level limit; deeper layers were omitted.`,
    }));
    depthWarningEmitted = true;
  }

  function acceptRasterPixels(layer: Layer): boolean {
    const pixelCost = rasterPixelCost(layer);

    if (pixelCost === 0 || pixelTotal + pixelCost <= input.maxTotalPixels) {
      pixelTotal += pixelCost;

      return true;
    }

    if (!pixelWarningEmitted) {
      warnings.push(diagnostic({
        code: 'psd.pixel-limit',
        message: `PSD raster content exceeded the ${String(input.maxTotalPixels)} pixel limit; later layers were omitted.`,
      }));
      pixelWarningEmitted = true;
    }

    return false;
  }

  function groupElement(layer: Layer, elementId: projectFormatV1.Id, parentId: projectFormatV1.Id): projectFormatV1.Element {
    return projectFormatV1.createElementV1({
      id: elementId,
      name: psdLayerName(layer.name, 'PSD group'),
      parentId,
      geometry: projectFormatV1.createElementGeometry({
        width: input.surfaceSize[0],
        height: input.surfaceSize[1],
      }),
      appearance: mapPsdAppearanceV1({ layer }),
      kind: 'group',
    });
  }

  async function mapLeaf(layer: Layer, elementId: projectFormatV1.Id, parentId: projectFormatV1.Id): Promise<void> {
    if (!acceptRasterPixels(layer)) return;

    const text = mapPsdTextLayerV1({ layer, elementId, parentId, fontRegistry: input.fontRegistry });
    const vector = mapPsdVectorLayerV1({ layer, elementId, parentId });
    const element = text ?? vector ?? await mapPsdRasterLayerV1({
      layer,
      elementId,
      parentId,
      resourceCollector: input.resourceCollector,
    });

    if (element === undefined) mapped.push(placeholder(layer, elementId, parentId));
    else appendMapped(element, layer);
  }

  async function visit(layers: readonly Layer[], parentId: projectFormatV1.Id, depth: number): Promise<void> {
    if (depth > input.maxDepth) {
      emitDepthWarning();

      return;
    }

    for (const layer of layers) {
      sequence += 1;

      const elementId = projectFormatV1.idSchema.parse(`${input.idPrefix}-${String(sequence)}`);
      const children = layer.children ?? [];

      if (children.length === 0) await mapLeaf(layer, elementId, parentId);
      else {
        appendMapped(groupElement(layer, elementId, parentId), layer);
        await visit(children, elementId, depth + 1);
      }
    }
  }

  await visit(input.layers, input.parentId, 0);

  return { mapped, warnings, pixelTotal };
}
