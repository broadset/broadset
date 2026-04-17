import type { ResizeHandle } from '@broadset/editor';
import {
  type BroadsetDocument,
  broadsetDocumentSchema,
  type BroadsetElement,
  type BroadsetProject,
  type PageElementInstance,
} from '@broadset/model';
import type { LayerInfo, PanelElement } from '@broadset/ui';

import {
  DEFAULT_SIDEBAR_WIDTH,
  DOCUMENT_STORAGE_KEY,
  MAX_CANVAS_ZOOM,
  MAX_SIDEBAR_WIDTH,
  MIN_CANVAS_ZOOM,
  MIN_SIDEBAR_WIDTH,
  MIN_TRANSFORM_SIZE,
  SIDEBAR_STORAGE_KEY,
  type SidebarPreferences,
} from './demo-types';
import { DEMO_DOCUMENT } from './sampleDocument';

export function normalizeTransformRect(
  rect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
  handle: ResizeHandle,
): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
} {
  let { x, y, width, height } = rect;

  if (width < MIN_TRANSFORM_SIZE) {
    if (handle.includes('w')) {
      x += width - MIN_TRANSFORM_SIZE;
    }

    width = MIN_TRANSFORM_SIZE;
  }

  if (height < MIN_TRANSFORM_SIZE) {
    if (handle.includes('n')) {
      y += height - MIN_TRANSFORM_SIZE;
    }

    height = MIN_TRANSFORM_SIZE;
  }

  return { x, y, width, height };
}

export function clampSidebarWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

export function clampCanvasZoom(zoom: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Math.round(zoom * 100) / 100));
}

export function loadSavedDocument(): BroadsetDocument {
  try {
    if (typeof window === 'undefined') {
      return DEMO_DOCUMENT;
    }

    const stored = window.localStorage.getItem(DOCUMENT_STORAGE_KEY);

    if (stored === null) {
      return DEMO_DOCUMENT;
    }

    return broadsetDocumentSchema.parse(JSON.parse(stored));
  } catch {
    return DEMO_DOCUMENT;
  }
}

export function normalizeDocumentForEditMode(document: BroadsetDocument): BroadsetDocument {
  return document;
}

function buildPageElementInstanceMap(
  page: BroadsetDocument['pages'][number] | undefined,
): ReadonlyMap<string, PageElementInstance> {
  return new Map((page?.elements ?? []).map((instance) => [instance.elementId, instance]));
}

function buildVisibleRootElementIds(args: {
  readonly page: BroadsetDocument['pages'][number] | undefined;
  readonly rootElements: readonly BroadsetElement[];
}): ReadonlySet<string> {
  const instanceMap = buildPageElementInstanceMap(args.page);
  const visibleIds = new Set<string>();

  for (const rootElement of args.rootElements) {
    const instance = instanceMap.get(rootElement.id);

    if (instance === undefined) {
      continue;
    }

    if (instance.visible) {
      visibleIds.add(rootElement.id);
    }
  }

  return visibleIds;
}

function buildElementChildrenByParentId(
  elements: readonly BroadsetElement[],
): ReadonlyMap<string, readonly BroadsetElement[]> {
  const map = new Map<string, BroadsetElement[]>();

  for (const element of elements) {
    if (element.parentId === null) {
      continue;
    }

    const children = map.get(element.parentId) ?? [];

    children.push(element);
    map.set(element.parentId, children);
  }

  return new Map(Array.from(map.entries()).map(([key, value]) => [key, [...value]] as const));
}

function collectPageElements(args: {
  readonly document: BroadsetDocument;
  readonly page: BroadsetDocument['pages'][number] | undefined;
}): readonly BroadsetElement[] {
  const childrenByParentId = buildElementChildrenByParentId(args.document.elements);
  const instanceMap = buildPageElementInstanceMap(args.page);
  const rootElements = args.document.elements.filter((element) => element.parentId === null);
  const visibleRootIds = buildVisibleRootElementIds({ page: args.page, rootElements });
  const ordered: BroadsetElement[] = [];

  const appendSubtree = (element: BroadsetElement): void => {
    ordered.push(element);

    const children = childrenByParentId.get(element.id) ?? [];

    for (const child of children) {
      appendSubtree(child);
    }
  };

  for (const rootElement of rootElements) {
    if (!visibleRootIds.has(rootElement.id)) {
      continue;
    }

    const instance = instanceMap.get(rootElement.id);

    if (instance === undefined) {
      continue;
    }

    appendSubtree({
      ...rootElement,
      position: {
        x: instance.transform.position.x,
        y: instance.transform.position.y,
      },
      rotation: instance.transform.rotation.z,
      width: rootElement.width * instance.transform.scale.x,
      height: rootElement.height * instance.transform.scale.y,
    });
  }

  return ordered;
}

type ProjectAsset = BroadsetProject['assets'][number];

function resolveAssetContent(asset: ProjectAsset): string | null {
  if (asset.source.type === 'url') {
    return asset.source.url;
  }

  if (asset.source.type === 'embedded') {
    return asset.source.dataUri;
  }

  return null;
}

export function buildRenderableDocumentForActivePage(
  document: BroadsetDocument,
  activePageIndex: number,
  assets: readonly ProjectAsset[] = [],
): BroadsetDocument {
  const activePage = document.pages[activePageIndex] ?? document.pages[0];
  const pageElements = collectPageElements({ document, page: activePage });
  const assetContentById = new Map(
    assets
      .map((asset) => [asset.id, resolveAssetContent(asset)] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== null),
  );

  return {
    ...document,
    elements: pageElements.map((element) => {
      if (element.type !== 'image' || element.content.trim() !== '') {
        return element;
      }

      const resolvedContent = element.assetId === null ? undefined : assetContentById.get(element.assetId);

      if (resolvedContent === undefined) {
        return element;
      }

      return {
        ...element,
        content: resolvedContent,
      };
    }),
  };
}

export function getElementWorldPosition(
  elements: readonly BroadsetElement[],
  elementId: string,
): {
  readonly x: number;
  readonly y: number;
} {
  const elementsById = new Map(elements.map((element) => [element.id, element]));
  let currentElement = elementsById.get(elementId);
  let x = 0;
  let y = 0;

  while (currentElement !== undefined) {
    x += currentElement.position.x;
    y += currentElement.position.y;

    if (currentElement.parentId === null) {
      break;
    }

    currentElement = elementsById.get(currentElement.parentId);
  }

  return { x, y };
}

export function buildLayerInfoList(document: BroadsetDocument, activePageIndex: number): readonly LayerInfo[] {
  const activePage = document.pages[activePageIndex] ?? document.pages[0];
  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const pageInstanceById = new Map((activePage?.elements ?? []).map((instance) => [instance.elementId, instance]));
  const childrenByParentId = new Map<string, readonly BroadsetElement[]>();
  const layerOrderIds = [...document.elements].reverse().map((element) => element.id);
  const layerOrderIndexById = new Map(layerOrderIds.map((id, index) => [id, index]));

  for (const element of document.elements) {
    if (element.parentId === null) {
      continue;
    }

    const currentChildren = childrenByParentId.get(element.parentId) ?? [];

    childrenByParentId.set(element.parentId, [...currentChildren, element]);
  }

  const getDepth = (element: BroadsetElement): number => {
    let depth = 0;
    let parent = element.parentId === null ? undefined : elementsById.get(element.parentId);

    while (parent !== undefined) {
      depth += 1;
      parent = parent.parentId === null ? undefined : elementsById.get(parent.parentId);
    }

    return depth;
  };

  const toSortedChildren = (parentId: string): readonly BroadsetElement[] => {
    const children = childrenByParentId.get(parentId) ?? [];

    return [...children].sort((left, right) => {
      const leftIndex = layerOrderIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = layerOrderIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER;

      return leftIndex - rightIndex;
    });
  };

  const orderedElements: BroadsetElement[] = [];
  const visitedIds = new Set<string>();

  const appendSubtree = (element: BroadsetElement): void => {
    if (visitedIds.has(element.id)) {
      return;
    }

    visitedIds.add(element.id);
    orderedElements.push(element);

    for (const child of toSortedChildren(element.id)) {
      appendSubtree(child);
    }
  };

  const includedRootElements = (activePage?.elements ?? [])
    .map((instance) => elementsById.get(instance.elementId))
    .filter((element): element is BroadsetElement => element !== undefined && element.parentId === null)
    .sort((left, right) => {
      const leftIndex = layerOrderIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex = layerOrderIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER;

      return leftIndex - rightIndex;
    });

  for (const element of includedRootElements) {
    appendSubtree(element);
  }

  const getLayerVisible = (element: BroadsetElement): boolean => {
    let cursor: BroadsetElement | undefined = element;

    while (cursor !== undefined && cursor.parentId !== null) {
      cursor = elementsById.get(cursor.parentId);
    }

    if (cursor === undefined) {
      return true;
    }

    return pageInstanceById.get(cursor.id)?.visible ?? true;
  };

  return orderedElements.map((element) => {
    const depth = getDepth(element);

    const parentName =
      element.parentId === null ? undefined : (elementsById.get(element.parentId)?.name ?? 'Missing parent');

    return toLayerInfo(element, getLayerVisible(element), {
      depth,
      expanded: true,
      hasChildren: (childrenByParentId.get(element.id)?.length ?? 0) > 0,
      parentName,
    });
  });
}

export type LayerDropPosition = 'before' | 'inside' | 'after';

function buildChildrenByParentId(elements: readonly BroadsetElement[]): ReadonlyMap<string, readonly string[]> {
  const mutable = new Map<string, string[]>();

  for (const element of elements) {
    if (element.parentId === null) {
      continue;
    }

    const children = mutable.get(element.parentId) ?? [];

    children.push(element.id);
    mutable.set(element.parentId, children);
  }

  return mutable;
}

function collectSubtreeIds(
  childrenByParentId: ReadonlyMap<string, readonly string[]>,
  rootId: string,
): ReadonlySet<string> {
  const ids = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();

    if (currentId === undefined) {
      break;
    }

    const children = childrenByParentId.get(currentId) ?? [];

    for (const childId of children) {
      if (ids.has(childId)) {
        continue;
      }

      ids.add(childId);
      queue.push(childId);
    }
  }

  return ids;
}

function isDescendantOf(
  candidateId: string,
  ancestorId: string,
  elementsById: ReadonlyMap<string, BroadsetElement>,
): boolean {
  let current = elementsById.get(candidateId);

  while (current !== undefined && current.parentId !== null) {
    if (current.parentId === ancestorId) {
      return true;
    }

    current = elementsById.get(current.parentId);
  }

  return false;
}

function isTargetOrDescendant(
  candidateId: string,
  targetId: string,
  elementsById: ReadonlyMap<string, BroadsetElement>,
): boolean {
  return candidateId === targetId || isDescendantOf(candidateId, targetId, elementsById);
}

export function reorderDocumentLayers(
  document: BroadsetDocument,
  dragId: string,
  targetId: string,
  position: LayerDropPosition,
): BroadsetDocument {
  if (dragId === targetId) {
    return document;
  }

  const elementsById = new Map(document.elements.map((element) => [element.id, element]));
  const dragElement = elementsById.get(dragId);
  const targetElement = elementsById.get(targetId);

  if (dragElement === undefined || targetElement === undefined) {
    return document;
  }

  const childrenByParentId = buildChildrenByParentId(document.elements);
  const movedIds = collectSubtreeIds(childrenByParentId, dragId);

  if (movedIds.has(targetId)) {
    return document;
  }

  const shouldReparentToTarget = position === 'inside' || position === 'before';
  const nextParentId = shouldReparentToTarget ? targetId : targetElement.parentId;

  if (position === 'inside' && targetElement.type !== 'group') {
    return document;
  }

  if (nextParentId === dragId) {
    return document;
  }

  if (nextParentId !== null && isDescendantOf(nextParentId, dragId, elementsById)) {
    return document;
  }

  const layerOrderIds = [...document.elements].reverse().map((element) => element.id);
  const movedLayerOrderIds = layerOrderIds.filter((id) => movedIds.has(id));
  const remainingLayerOrderIds = layerOrderIds.filter((id) => !movedIds.has(id));
  const targetIndex = remainingLayerOrderIds.indexOf(targetId);

  if (targetIndex < 0) {
    return document;
  }

  const insertionIndex =
    position === 'before' ? targetIndex + 1
    : position !== 'after' ? targetIndex
    : (() => {
        let lastSubtreeIndex = targetIndex;

        for (let index = targetIndex + 1; index < remainingLayerOrderIds.length; index += 1) {
          const candidateId = remainingLayerOrderIds[index];

          if (candidateId === undefined || !isTargetOrDescendant(candidateId, targetId, elementsById)) {
            break;
          }

          lastSubtreeIndex = index;
        }

        return lastSubtreeIndex + 1;
      })();

  const nextLayerOrderIds = [
    ...remainingLayerOrderIds.slice(0, insertionIndex),
    ...movedLayerOrderIds,
    ...remainingLayerOrderIds.slice(insertionIndex),
  ];

  const nextElements = [...nextLayerOrderIds]
    .reverse()
    .map((id) => {
      const element = elementsById.get(id);

      if (element === undefined) {
        return undefined;
      }

      if (id !== dragId || element.parentId === nextParentId) {
        return element;
      }

      return {
        ...element,
        parentId: nextParentId,
      };
    })
    .filter((element): element is BroadsetElement => element !== undefined);

  if (nextElements.length !== document.elements.length) {
    return document;
  }

  const changed = nextElements.some((element, index) => {
    const current = document.elements[index];

    return current === undefined || current.id !== element.id || current.parentId !== element.parentId;
  });

  if (!changed) {
    return document;
  }

  return {
    ...document,
    elements: nextElements,
  };
}

export function loadSidebarPreferences(): SidebarPreferences {
  const defaults: SidebarPreferences = {
    isOpen: true,
    tab: 'properties',
    width: DEFAULT_SIDEBAR_WIDTH,
  };

  try {
    if (typeof window === 'undefined') {
      return defaults;
    }

    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

    if (stored === null) {
      return defaults;
    }

    const parsed = JSON.parse(stored) as Partial<Record<'isOpen' | 'tab' | 'width', unknown>>;
    const storedTab = parsed['tab'];

    return {
      isOpen: typeof parsed['isOpen'] === 'boolean' ? parsed['isOpen'] : defaults.isOpen,
      tab:
        (
          storedTab === 'layers' ||
          storedTab === 'properties' ||
          storedTab === 'animation' ||
          storedTab === 'preflight' ||
          storedTab === 'template-groups'
        ) ?
          storedTab
        : defaults.tab,
      width: typeof parsed['width'] === 'number' ? clampSidebarWidth(parsed['width']) : defaults.width,
    };
  } catch {
    return defaults;
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA')
  );
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 0);
}

function normalizeBoxTuple(value: number | readonly number[] | undefined): readonly [number, number, number, number] {
  if (typeof value === 'number') {
    return [value, value, value, value];
  }

  if (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  ) {
    return [value[0], value[1], value[2], value[3]];
  }

  return [0, 0, 0, 0];
}

export function toPanelElement(element: BroadsetElement, instance?: PageElementInstance): PanelElement {
  const borderRadiusValue = normalizeBoxTuple(element.style.borderRadius);
  const paddingValue = normalizeBoxTuple(element.style.padding);

  return {
    id: element.id,
    type: element.type,
    name: element.name,
    content: element.content,
    assetId: element.assetId,
    x: instance !== undefined ? instance.transform.position.x : element.position.x,
    y: instance !== undefined ? instance.transform.position.y : element.position.y,
    width: element.width,
    height: element.height,
    rotation: instance !== undefined ? instance.transform.rotation.z : element.rotation,
    backgroundColor: element.style.backgroundColor ?? '',
    backgroundGradient:
      typeof element.style.backgroundGradient === 'string' ? element.style.backgroundGradient
      : element.style.backgroundGradient === undefined ? ''
      : JSON.stringify(element.style.backgroundGradient),
    borderWidth: element.style.borderWidth ?? 0,
    borderColor: element.style.borderColor ?? '',
    borderStyle: typeof element.style.borderStyle === 'string' ? element.style.borderStyle : 'solid',
    borderRadius: borderRadiusValue,
    opacity: element.style.opacity,
    blendMode: typeof element.style.mixBlendMode === 'string' ? element.style.mixBlendMode : 'normal',
    mixBlendMode: typeof element.style.mixBlendMode === 'string' ? element.style.mixBlendMode : 'normal',
    isolation: element.style.isolation ?? 'auto',
    boxShadow: element.style.boxShadow ?? '',
    filter: element.style.filter ?? '',
    backdropFilter: element.style.backdropFilter ?? '',
    fontFamily: element.style.fontFamily ?? '',
    fontSize: element.style.fontSize ?? 16,
    fontColor: element.style.fontColor ?? '#000000',
    fontWeight: element.style.fontWeight ?? 400,
    fontStyle: element.style.fontStyle ?? 'normal',
    textAlignment: element.style.textAlignment ?? 'left',
    verticalAlignment: element.style.verticalAlignment ?? 'top',
    textDecoration: element.style.textDecoration ?? 'none',
    textTransform: element.style.textTransform ?? 'none',
    letterSpacing: element.style.letterSpacing ?? 0,
    lineHeight:
      typeof element.style.lineHeight === 'number' ?
        String(element.style.lineHeight)
      : (element.style.lineHeight ?? 'normal'),
    wordSpacing: element.style.wordSpacing ?? 0,
    textStroke: element.style.textStroke ?? '',
    textShadow: element.style.textShadow ?? '',
    writingMode: element.style.writingMode ?? 'horizontal-tb',
    fontVariationSettings: element.style.fontVariationSettings ?? '',
    padding: paddingValue,
    stroke: element.style.stroke ?? '',
    strokeWidth: element.style.strokeWidth ?? 1,
    strokeDasharray: element.style.strokeDasharray ?? '',
    strokeDashoffset: element.style.strokeDashoffset ?? 0,
    strokeLinecap: element.style.strokeLinecap ?? 'butt',
    strokeLinejoin: element.style.strokeLinejoin ?? 'miter',
    strokeOpacity: element.style.strokeOpacity ?? 1,
    fill: element.style.fill ?? '',
    fillOpacity: element.style.fillOpacity ?? 1,
    fillRule: element.style.fillRule ?? 'nonzero',
    trimStart: element.style.trimStart ?? 0,
    trimEnd: element.style.trimEnd ?? 1,
    trimOffset: element.style.trimOffset ?? 0,
    maskType: element.style.maskType ?? 'none',
    customClipPath: element.style.customClipPath ?? '',
    clipChildren: element.style.clipChildren ?? false,
    rotateX: element.style.rotateX ?? 0,
    rotateY: element.style.rotateY ?? 0,
    rotateZ: element.style.rotateZ ?? 0,
    translateZ: element.style.translateZ ?? 0,
    objectFit: element.style.objectFit ?? 'fill',
    autoSize: element.autoSize,
    errorCorrection: 'M',
    qrForegroundColor: '#000000',
    qrBackgroundColor: '#ffffff',
    booleanOperation: element.booleanOperation,
  };
}

export function toLayerInfo(
  element: BroadsetElement,
  visible: boolean,
  metadata?: {
    readonly depth?: number | undefined;
    readonly expanded?: boolean | undefined;
    readonly hasChildren?: boolean | undefined;
    readonly parentName?: string | undefined;
  },
): LayerInfo {
  return {
    ...(metadata?.depth !== undefined ? { depth: metadata.depth } : {}),
    ...(metadata?.expanded !== undefined ? { expanded: metadata.expanded } : {}),
    ...(metadata?.hasChildren !== undefined ? { hasChildren: metadata.hasChildren } : {}),
    ...(metadata?.parentName !== undefined ? { parentName: metadata.parentName } : {}),
    id: element.id,
    type: element.type,
    name: element.name,
    locked: element.locked,
    visible,
  };
}

export function greatestCommonDivisor(left: number, right: number): number {
  if (right === 0) {
    return left;
  }

  return greatestCommonDivisor(right, left % right);
}

export function formatResolutionLabel(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);

  return `${String(width)}×${String(height)} — ${String(width / divisor)}:${String(height / divisor)}`;
}
