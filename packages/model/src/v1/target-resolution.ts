import type { Effect, FillLayer, GradientStop, StrokeLayer } from './appearance';
import type { BroadsetDocumentV1, GuideDefinition } from './document';
import type { Element } from './element';
import type { Id, PropertyTarget } from './identity';
import type { PageRootInstance } from './page';
import type { BroadsetProjectV1 } from './project';
import type { DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import { createSemanticIndexes } from './semantic-index';
import type { TextParagraph, TextRun } from './text';
import type { ValueType } from './typed-value';

type TargetEntity =
  | { readonly kind: 'element'; readonly value: Element }
  | { readonly kind: 'page-root'; readonly value: PageRootInstance }
  | { readonly kind: 'text-run'; readonly value: TextRun }
  | { readonly kind: 'paragraph'; readonly value: TextParagraph }
  | { readonly kind: 'fill'; readonly value: FillLayer }
  | { readonly kind: 'stroke'; readonly value: StrokeLayer }
  | { readonly kind: 'effect'; readonly value: Effect }
  | { readonly kind: 'gradient-stop'; readonly value: GradientStop }
  | { readonly kind: 'path-point'; readonly value: { readonly id: string } }
  | { readonly kind: 'guide'; readonly value: GuideDefinition };

const PARAGRAPH_STRING_POINTERS = new Set([
  '/properties/alignment',
  '/properties/direction',
  '/properties/hyphenation',
]);
const PARAGRAPH_LENGTH_POINTERS = new Set([
  '/properties/spaceBefore',
  '/properties/spaceAfter',
  '/properties/firstLineIndent',
  '/properties/startIndent',
  '/properties/endIndent',
]);
const PARAGRAPH_BOOLEAN_POINTERS = new Set([
  '/properties/keepTogether',
  '/properties/keepWithNext',
  '/properties/widowControl',
]);

function allElements(document: BroadsetDocumentV1): readonly Element[] {
  return [...document.elements, ...document.components.flatMap((component) => component.elements)];
}

function findTextEntity(
  document: BroadsetDocumentV1,
  kind: 'paragraph' | 'text-run',
  id: string,
): TargetEntity | undefined {
  for (const element of allElements(document)) {
    if (element.kind !== 'text') continue;

    for (const paragraph of element.text.paragraphs) {
      if (kind === 'paragraph' && paragraph.id === id) return { kind, value: paragraph };

      const run = paragraph.runs.find((candidate) => candidate.id === id);

      if (kind === 'text-run' && run !== undefined) return { kind, value: run };
    }
  }

  return undefined;
}

function findFillEntity(document: BroadsetDocumentV1, id: string): TargetEntity | undefined {
  for (const element of allElements(document)) {
    const fill = element.appearance.fills.find((candidate) => candidate.id === id);

    if (fill !== undefined) return { kind: 'fill', value: fill };
  }

  return undefined;
}

function findStrokeEntity(document: BroadsetDocumentV1, id: string): TargetEntity | undefined {
  for (const element of allElements(document)) {
    const stroke = element.appearance.strokes.find((candidate) => candidate.id === id);

    if (stroke !== undefined) return { kind: 'stroke', value: stroke };
  }

  return undefined;
}

function findEffectEntity(document: BroadsetDocumentV1, id: string): TargetEntity | undefined {
  for (const element of allElements(document)) {
    const effect = element.appearance.effects.find((candidate) => candidate.id === id);

    if (effect !== undefined) return { kind: 'effect', value: effect };
  }

  return undefined;
}

function findGradientStopEntity(document: BroadsetDocumentV1, id: string): TargetEntity | undefined {
  const layers = allElements(document).flatMap((element) => [
    ...element.appearance.fills,
    ...element.appearance.strokes,
  ]);

  for (const layer of layers) {
    if (layer.paint.kind !== 'gradient') continue;

    const stop = layer.paint.gradient.stops.find((candidate) => candidate.id === id);

    if (stop !== undefined) return { kind: 'gradient-stop', value: stop };
  }

  return undefined;
}

function resolveElementScope(
  documentIndex: DocumentSemanticIndex,
  instancePath: readonly Id[] | undefined,
): ReadonlyMap<Id, Element> | undefined {
  if (instancePath === undefined || instancePath.length === 0) return documentIndex.elements;

  let elements = documentIndex.elements;

  for (const instanceId of instancePath) {
    let instance = elements.get(instanceId);

    if (instance === undefined) {
      const root = documentIndex.document.pages
        .flatMap((page) => page.rootInstances)
        .find((candidate) => candidate.id === instanceId);

      instance = root === undefined ? undefined : documentIndex.elements.get(root.elementId);
    }

    if (instance?.kind !== 'component-instance') return undefined;

    const component = documentIndex.components.get(instance.componentId);

    if (component === undefined) return undefined;
    elements = component.elements;
  }

  return elements;
}

function findElementEntity(
  documentIndex: DocumentSemanticIndex,
  id: Id,
  instancePath: readonly Id[] | undefined,
): TargetEntity | undefined {
  const element = resolveElementScope(documentIndex, instancePath)?.get(id);

  if (element !== undefined) return { kind: 'element', value: element };

  return undefined;
}

function findPageRootEntity(document: BroadsetDocumentV1, id: string): TargetEntity | undefined {
  for (const page of document.pages) {
    const root = page.rootInstances.find((candidate) => candidate.id === id);

    if (root !== undefined) return { kind: 'page-root', value: root };
  }

  return undefined;
}

function findPathPointEntity(document: BroadsetDocumentV1, id: string): TargetEntity | undefined {
  for (const element of allElements(document)) {
    if (element.kind !== 'vector' || element.geometryData.kind !== 'path') continue;

    const point = element.geometryData.path.points.find((candidate) => candidate.id === id);

    if (point !== undefined) return { kind: 'path-point', value: point };
  }

  return undefined;
}

function findTargetEntity(indexes: SemanticIndexes, target: PropertyTarget): TargetEntity | undefined {
  if (target.entity.projectId !== indexes.project.id || target.entity.documentId === undefined) return undefined;

  const documentIndex = indexes.documents.get(target.entity.documentId);

  if (documentIndex === undefined) return undefined;

  switch (target.entity.entityKind) {
    case 'element':
      return findElementEntity(documentIndex, target.entity.entityId, target.entity.instancePath);
    case 'page-root':
      return findPageRootEntity(documentIndex.document, target.entity.entityId);
    case 'paragraph':
    case 'text-run':
      return findTextEntity(documentIndex.document, target.entity.entityKind, target.entity.entityId);
    case 'fill':
      return findFillEntity(documentIndex.document, target.entity.entityId);
    case 'stroke':
      return findStrokeEntity(documentIndex.document, target.entity.entityId);
    case 'effect':
      return findEffectEntity(documentIndex.document, target.entity.entityId);
    case 'gradient-stop':
      return findGradientStopEntity(documentIndex.document, target.entity.entityId);
    case 'path-point':
      return findPathPointEntity(documentIndex.document, target.entity.entityId);

    case 'guide': {
      const guide = documentIndex.document.surface.guides.find((candidate) => candidate.id === target.entity.entityId);

      return guide === undefined ? undefined : { kind: 'guide', value: guide };
    }

    default:
      return undefined;
  }
}

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

function resolveElementPointer(element: Element, pointer: string): ValueType | undefined {
  const common: Readonly<Record<string, ValueType>> = {
    '/geometry/bounds/width': 'length',
    '/geometry/bounds/height': 'length',
    '/geometry/origin': 'point3d',
    '/appearance/opacity': 'number',
    '/accessibility/label': 'string',
    '/accessibility/description': 'string',
  };
  const commonType = common[pointer] ?? resolveMatrixIndex(pointer, element.geometry.transform.kind);

  if (commonType !== undefined) return commonType;

  const stringType: Readonly<Record<string, ValueType>> = {
    '/clock/format': 'string',
    '/clock/timeZone': 'string',
    '/clock/locale': 'string',
    '/ticker/direction': 'string',
    '/qrcode/value': 'string',
    '/qrcode/errorCorrection': 'string',
    '/layout/verticalAlignment': 'string',
    '/layout/overflow': 'string',
    '/layout/autoSize': 'string',
  };

  switch (element.kind) {
    case 'image':
      return lookupType(pointer, { '/image/assetId': 'asset', '/image/focalPoint': 'point2d' });
    case 'video':
      return lookupType(pointer, {
        '/video/assetId': 'asset',
        '/video/autoplay': 'boolean',
        '/video/loop': 'boolean',
        '/video/muted': 'boolean',
        '/video/controls': 'boolean',
      });
    case 'audio':
      return lookupType(pointer, {
        '/audio/assetId': 'asset',
        '/audio/autoplay': 'boolean',
        '/audio/loop': 'boolean',
        '/audio/volume': 'number',
      });
    case 'clock':
      return stringType[pointer];
    case 'ticker':
      return lookupType(pointer, {
        ...stringType,
        '/ticker/speed': 'number',
        '/ticker/gap': 'number',
        '/ticker/repeat': 'boolean',
      });
    case 'qrcode':
      return lookupType(pointer, { ...stringType, '/qrcode/quietZone': 'length' });
    case 'text':
      return lookupType(pointer, {
        ...stringType,
        '/layout/columns': 'integer',
        '/layout/columnGap': 'length',
        '/textPath/startOffset': 'length',
      });
    case 'group':
      return pointer === '/group/clipChildren' ? 'boolean' : undefined;
    case 'foreign':
      return pointer === '/foreign/previewAssetId' ? 'asset' : undefined;
    default:
      return undefined;
  }
}

function resolvePaintPointer(layer: FillLayer, pointer: string): ValueType | undefined {
  if (pointer === '/enabled') return 'boolean';
  if (pointer === '/opacity') return 'number';
  if (pointer === '/paint/color' && layer.paint.kind === 'solid') return 'color';
  if (pointer === '/paint/assetId' && (layer.paint.kind === 'picture' || layer.paint.kind === 'pattern'))
    return 'asset';

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

function resolvePageRootPointer(root: PageRootInstance, pointer: string): ValueType | undefined {
  if (pointer === '/visible') return 'boolean';
  if (root.transform === undefined) return undefined;

  return resolveMatrixIndex(pointer.replace('/transform/', '/geometry/transform/'), root.transform.kind);
}

function resolveParagraphPointer(pointer: string): ValueType | undefined {
  if (PARAGRAPH_STRING_POINTERS.has(pointer)) return 'string';
  if (PARAGRAPH_LENGTH_POINTERS.has(pointer)) return 'length';

  return PARAGRAPH_BOOLEAN_POINTERS.has(pointer) ? 'boolean' : undefined;
}

function resolveGradientStopPointer(pointer: string): ValueType | undefined {
  return lookupType(pointer, { '/color': 'color', '/opacity': 'number', '/offset': 'number', '/midpoint': 'number' });
}

function resolveGuidePointer(pointer: string): ValueType | undefined {
  return lookupType(pointer, { '/position': 'length', '/locked': 'boolean' });
}

function resolveEntityPointer(entity: TargetEntity, pointer: string): ValueType | undefined {
  switch (entity.kind) {
    case 'element':
      return resolveElementPointer(entity.value, pointer);
    case 'page-root':
      return resolvePageRootPointer(entity.value, pointer);

    case 'text-run': {
      const mapping: Readonly<Record<string, ValueType>> = {
        '/text': 'string',
        '/properties/size': 'length',
        '/properties/color': 'color',
        '/properties/weight': 'integer',
        '/properties/baselineShift': 'length',
        '/properties/tracking': 'number',
        '/properties/hyperlink': 'string',
      };

      return mapping[pointer];
    }

    case 'paragraph':
      return resolveParagraphPointer(pointer);
    case 'fill':
      return resolvePaintPointer(entity.value, pointer);
    case 'stroke':
      return pointer === '/width' || pointer === '/dashOffset' ? 'length' : resolvePaintPointer(entity.value, pointer);
    case 'effect':
      return resolveEffectPointer(entity.value, pointer);
    case 'gradient-stop':
      return resolveGradientStopPointer(pointer);
    case 'path-point':
      return pointer === '/x' || pointer === '/y' ? 'length' : undefined;
    case 'guide':
      return resolveGuidePointer(pointer);
  }
}

export function resolvePropertyTargetValueTypeFromIndexes(
  indexes: SemanticIndexes,
  target: PropertyTarget,
): ValueType | undefined {
  const entity = findTargetEntity(indexes, target);

  return entity === undefined ? undefined : resolveEntityPointer(entity, target.pointer);
}

export function resolvePropertyTargetValueType(
  project: BroadsetProjectV1,
  target: PropertyTarget,
): ValueType | undefined {
  return resolvePropertyTargetValueTypeFromIndexes(createSemanticIndexes(project), target);
}
