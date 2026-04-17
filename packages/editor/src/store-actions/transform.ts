import type { BroadsetDocument, BroadsetElement, PageElementInstance, Vector3 } from '@broadset/model';

import type { ElementUpdate } from './store';

export function applyElementUpdate(element: BroadsetElement, updates: ElementUpdate): BroadsetElement {
  return {
    ...element,
    ...(updates.position !== undefined ? { position: updates.position } : {}),
    ...(updates.width !== undefined ? { width: updates.width } : {}),
    ...(updates.height !== undefined ? { height: updates.height } : {}),
    ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
    ...(updates.content !== undefined ? { content: updates.content } : {}),
    ...(updates.assetId !== undefined ? { assetId: updates.assetId } : {}),
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.booleanOperation !== undefined ? { booleanOperation: updates.booleanOperation } : {}),
  };
}

export function updateDocumentElement(
  document: BroadsetDocument,
  elementId: string,
  updater: (element: BroadsetElement) => BroadsetElement,
): BroadsetDocument {
  return {
    ...document,
    elements: document.elements.map((element) => (element.id === elementId ? updater(element) : element)),
  };
}

export function updateDocumentElements(
  document: BroadsetDocument,
  elementIds: ReadonlySet<string>,
  updater: (element: BroadsetElement) => BroadsetElement,
): BroadsetDocument {
  return {
    ...document,
    elements: document.elements.map((element) => (elementIds.has(element.id) ? updater(element) : element)),
  };
}

export function collectDescendantIds(document: BroadsetDocument, rootElementId: string): ReadonlySet<string> {
  const pendingIds = [rootElementId];
  const collectedIds = new Set<string>(pendingIds);

  while (pendingIds.length > 0) {
    const currentId = pendingIds.pop();

    if (currentId === undefined) {
      continue;
    }

    for (const element of document.elements) {
      if (element.parentId === currentId && !collectedIds.has(element.id)) {
        collectedIds.add(element.id);
        pendingIds.push(element.id);
      }
    }
  }

  return collectedIds;
}

export function applyPageInstanceTransformUpdate(
  document: BroadsetDocument,
  activePageIndex: number,
  elementId: string,
  updates: {
    readonly position?: { readonly x: number; readonly y: number };
    readonly rotation?: number;
  },
): BroadsetDocument {
  const { pages } = document;

  if (activePageIndex < 0 || activePageIndex >= pages.length) {
    return document;
  }

  const page = pages[activePageIndex];

  if (page === undefined) {
    return document;
  }

  const instanceIndex = page.elements.findIndex((inst) => inst.elementId === elementId);

  if (instanceIndex === -1) {
    return document;
  }

  const instance = page.elements[instanceIndex];

  if (instance === undefined) {
    return document;
  }

  const nextPosition: Vector3 =
    updates.position !== undefined ?
      { ...instance.transform.position, x: updates.position.x, y: updates.position.y }
    : instance.transform.position;
  const nextRotation: Vector3 =
    updates.rotation !== undefined ?
      { ...instance.transform.rotation, z: updates.rotation }
    : instance.transform.rotation;
  const nextTransform = { ...instance.transform, position: nextPosition, rotation: nextRotation };

  return {
    ...document,
    pages: pages.map((p, idx) =>
      idx !== activePageIndex ? p : (
        {
          ...p,
          elements: p.elements.map((inst, instIdx) =>
            instIdx !== instanceIndex ? inst : { ...inst, transform: nextTransform },
          ),
        }
      ),
    ),
  };
}

export function applyPageInstancePositionBatch(
  document: BroadsetDocument,
  activePageIndex: number,
  updates: ReadonlyArray<{ readonly elementId: string; readonly position: { readonly x: number; readonly y: number } }>,
): BroadsetDocument {
  let result = document;

  for (const update of updates) {
    result = applyPageInstanceTransformUpdate(result, activePageIndex, update.elementId, {
      position: update.position,
    });
  }

  return result;
}

export function togglePageElementVisibility(
  pageElements: readonly PageElementInstance[],
  elementId: string,
): readonly PageElementInstance[] {
  const elementIndex = pageElements.findIndex((element) => element.elementId === elementId);

  if (elementIndex === -1) {
    return pageElements;
  }

  return pageElements.map((element, index) => {
    if (index !== elementIndex) {
      return element;
    }

    return {
      ...element,
      visible: !element.visible,
    };
  });
}
