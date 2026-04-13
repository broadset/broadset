import type { BroadsetDocument, BroadsetElement, ElementOverride } from '@broadset/model';

import type { ElementUpdate } from './store';

export function applyElementUpdate(element: BroadsetElement, updates: ElementUpdate): BroadsetElement {
  return {
    ...element,
    ...(updates.position !== undefined ? { position: updates.position } : {}),
    ...(updates.width !== undefined ? { width: updates.width } : {}),
    ...(updates.height !== undefined ? { height: updates.height } : {}),
    ...(updates.rotation !== undefined ? { rotation: updates.rotation } : {}),
    ...(updates.content !== undefined ? { content: updates.content } : {}),
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

export function toggleOverrideVisibility(
  pageOverrides: readonly ElementOverride[],
  elementId: string,
): readonly ElementOverride[] {
  const overrideIndex = pageOverrides.findIndex((override) => override.elementId === elementId);

  if (overrideIndex === -1) {
    return [...pageOverrides, { elementId, visible: false }];
  }

  return pageOverrides.map((override, index) => {
    if (index !== overrideIndex) {
      return override;
    }

    const currentVisible = override.visible ?? true;

    return {
      ...override,
      visible: !currentVisible,
    };
  });
}
