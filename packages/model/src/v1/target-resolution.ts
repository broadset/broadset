import type { Effect, FillLayer } from './appearance';
import type { Element } from './element';
import type { PropertyTarget } from './identity';
import type { BroadsetProjectV1 } from './project';
import {
  type AddressScope,
  createDocumentAddressScope,
  createPageAddressScope,
  type ResolvedTargetEntity,
  resolveTargetEntityAddress,
} from './resolved-address';
import { createSemanticIndexes, type SemanticIndexes } from './semantic-index';
import type { ValueType } from './typed-value';

function resolveMatrixIndex(pointer: string, transformKind: 'affine2d' | 'matrix3d'): ValueType | undefined {
  const prefix = '/geometry/transform/matrix/';

  if (!pointer.startsWith(prefix)) return undefined;

  const indexText = pointer.slice(prefix.length);

  if (!/^\d{1,2}$/u.test(indexText)) return undefined;

  const index = Number(indexText);

  if (transformKind === 'affine2d') {
    if (index >= 0 && index <= 3) return 'number';
    if (index === 4 || index === 5) return 'length';

    return undefined;
  }

  if (index >= 0 && index <= 11) return 'number';
  if (index >= 12 && index <= 14) return 'length';

  return index === 15 ? 'number' : undefined;
}

function lookupType(pointer: string, mapping: Readonly<Record<string, ValueType>>): ValueType | undefined {
  return mapping[pointer];
}

function resolveCommonElementPointer(element: Element, pointer: string): ValueType | undefined {
  const common = lookupType(pointer, {
    '/geometry/bounds/width': 'length',
    '/geometry/bounds/height': 'length',
    '/geometry/origin': 'point3d',
    '/appearance/opacity': 'number',
  });

  if (common !== undefined) return common;

  const matrix = resolveMatrixIndex(pointer, element.geometry.transform.kind);

  if (matrix !== undefined) return matrix;
  if (pointer === '/accessibility/label' && element.accessibility?.label !== undefined) return 'string';
  if (pointer === '/accessibility/description' && element.accessibility?.description !== undefined) return 'string';

  return undefined;
}

function resolveElementVariantPointer(element: Element, pointer: string): ValueType | undefined {
  switch (element.kind) {
    case 'image':
      if (pointer === '/image/focalPoint' && element.image.focalPoint === undefined) return undefined;

      return lookupType(pointer, { '/image/assetId': 'asset', '/image/focalPoint': 'point2d' });
    case 'video':
      return lookupType(pointer, {
        '/video/assetId': 'asset', '/video/autoplay': 'boolean', '/video/loop': 'boolean',
        '/video/muted': 'boolean', '/video/controls': 'boolean',
      });
    case 'audio':
      return lookupType(pointer, {
        '/audio/assetId': 'asset', '/audio/autoplay': 'boolean', '/audio/loop': 'boolean', '/audio/volume': 'number',
      });
    case 'clock':
      if (pointer === '/clock/locale' && element.clock.locale === undefined) return undefined;

      return lookupType(pointer, { '/clock/format': 'string', '/clock/timeZone': 'string', '/clock/locale': 'string' });
    case 'ticker':
      return lookupType(pointer, {
        '/ticker/direction': 'string', '/ticker/speed': 'number', '/ticker/gap': 'number', '/ticker/repeat': 'boolean',
      });
    case 'qrcode':
      return lookupType(pointer, {
        '/qrcode/value': 'string', '/qrcode/errorCorrection': 'string', '/qrcode/quietZone': 'length',
      });
    case 'text':
      if (pointer === '/textPath/startOffset' && element.textPath === undefined) return undefined;

      return lookupType(pointer, {
        '/layout/columns': 'integer', '/layout/columnGap': 'length', '/layout/verticalAlignment': 'string',
        '/layout/overflow': 'string', '/layout/autoSize': 'string', '/textPath/startOffset': 'length',
      });
    case 'group':
      return pointer === '/group/clipChildren' ? 'boolean' : undefined;
    case 'foreign':
      return pointer === '/foreign/previewAssetId' ? 'asset' : undefined;
    default:
      return undefined;
  }
}

function resolveElementPointer(element: Element, pointer: string): ValueType | undefined {
  return resolveCommonElementPointer(element, pointer) ?? resolveElementVariantPointer(element, pointer);
}

function resolvePaintPointer(layer: FillLayer, pointer: string): ValueType | undefined {
  if (pointer === '/enabled') return 'boolean';
  if (pointer === '/opacity') return 'number';
  if (pointer === '/paint/color' && layer.paint.kind === 'solid') return 'color';
  if (pointer === '/paint/assetId' && (layer.paint.kind === 'picture' || layer.paint.kind === 'pattern')) return 'asset';

  return undefined;
}

function resolveEffectPointer(effect: Effect, pointer: string): ValueType | undefined {
  if (pointer === '/enabled') return 'boolean';
  if (pointer === '/opacity') return 'number';
  if (['/radius', '/spread', '/depth', '/soften'].includes(pointer) && pointer.slice(1) in effect) return 'length';
  if (['/offset', '/scale'].includes(pointer) && pointer.slice(1) in effect) return 'point2d';
  if (['/color', '/highlightColor', '/shadowColor'].includes(pointer) && pointer.slice(1) in effect) return 'color';
  if (pointer === '/amount' && 'amount' in effect) return 'number';
  if (['/angle', '/altitude'].includes(pointer) && pointer.slice(1) in effect) return 'angle';

  return pointer === '/assetId' && 'assetId' in effect ? 'asset' : undefined;
}

function resolvePageRootPointer(entity: Extract<ResolvedTargetEntity, { readonly kind: 'page-root' }>, pointer: string): ValueType | undefined {
  if (pointer === '/visible') return entity.value.visible === undefined ? undefined : 'boolean';
  if (entity.value.transform === undefined) return undefined;

  return resolveMatrixIndex(pointer.replace('/transform/', '/geometry/transform/'), entity.value.transform.kind);
}

function resolveEntityPointer(entity: ResolvedTargetEntity, pointer: string): ValueType | undefined {
  switch (entity.kind) {
    case 'element':
      return resolveElementPointer(entity.value, pointer);
    case 'page-root':
      return resolvePageRootPointer(entity, pointer);
    case 'text-run':
      if (pointer === '/properties/hyperlink' && entity.value.properties.hyperlink === undefined) return undefined;

      return lookupType(pointer, {
        '/text': 'string', '/properties/size': 'length', '/properties/color': 'color',
        '/properties/weight': 'integer', '/properties/baselineShift': 'length',
        '/properties/tracking': 'number', '/properties/hyperlink': 'string',
      });
    case 'paragraph':
      return lookupType(pointer, {
        '/properties/alignment': 'string', '/properties/direction': 'string', '/properties/hyphenation': 'string',
        '/properties/spaceBefore': 'length', '/properties/spaceAfter': 'length',
        '/properties/firstLineIndent': 'length', '/properties/startIndent': 'length', '/properties/endIndent': 'length',
        '/properties/keepTogether': 'boolean', '/properties/keepWithNext': 'boolean', '/properties/widowControl': 'boolean',
      });
    case 'fill':
      return resolvePaintPointer(entity.value, pointer);
    case 'stroke':
      return pointer === '/width' || pointer === '/dashOffset' ? 'length' : resolvePaintPointer(entity.value, pointer);
    case 'effect':
      return resolveEffectPointer(entity.value, pointer);
    case 'gradient-stop':
      if (pointer === '/midpoint' && entity.value.midpoint === undefined) return undefined;

      return lookupType(pointer, { '/color': 'color', '/opacity': 'number', '/offset': 'number', '/midpoint': 'number' });
    case 'path-point':
      return pointer === '/x' || pointer === '/y' ? 'length' : undefined;
    case 'guide':
      return lookupType(pointer, { '/position': 'length', '/locked': 'boolean' });
  }
}

export function resolvePropertyTargetValueTypeInScope(
  scope: AddressScope,
  target: PropertyTarget,
): ValueType | undefined {
  const entity = resolveTargetEntityAddress(scope, target.entity);

  return entity === undefined ? undefined : resolveEntityPointer(entity, target.pointer);
}

export function resolvePropertyTargetValueTypeFromIndexes(
  indexes: SemanticIndexes,
  target: PropertyTarget,
): ValueType | undefined {
  if (target.entity.projectId !== indexes.project.id) return undefined;
  if (target.entity.documentId === undefined) return undefined;

  const document = indexes.documents.get(target.entity.documentId);

  if (document === undefined) return undefined;

  const rootId = target.entity.instancePath?.[0];

  if (rootId !== undefined) {
    const page = document.document.pages.find((candidate) => candidate.id === target.entity.pageId);

    if (page === undefined) return undefined;

    const root = page.rootInstances.find((candidate) => candidate.id === rootId);

    if (root !== undefined) return resolvePropertyTargetValueTypeInScope(createPageAddressScope(document, page, root), target);

    return undefined;
  }

  return resolvePropertyTargetValueTypeInScope(createDocumentAddressScope(document), target);
}

export function resolvePropertyTargetValueType(project: BroadsetProjectV1, target: PropertyTarget): ValueType | undefined {
  return resolvePropertyTargetValueTypeFromIndexes(createSemanticIndexes(project), target);
}
