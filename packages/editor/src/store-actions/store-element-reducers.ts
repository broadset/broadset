import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { createInteractionState } from './selection';
import { collectDescendantIds } from './transform';

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

/**
 * Returns a reordered copy of the elements array, or `null` when no change is
 * needed (e.g. the element is already at the requested boundary).
 */
export function reorderElementInList(
  elements: readonly BroadsetElement[],
  elementId: string,
  direction: ReorderDirection,
): readonly BroadsetElement[] | null {
  const currentIndex = elements.findIndex((element) => element.id === elementId);

  if (currentIndex === -1) {
    return null;
  }

  const nextElements = [...elements];

  switch (direction) {
    case 'forward': {
      if (currentIndex >= nextElements.length - 1) {
        return null;
      }

      const [element] = nextElements.splice(currentIndex, 1);

      if (element === undefined) {
        return null;
      }

      nextElements.splice(currentIndex + 1, 0, element);
      break;
    }

    case 'backward': {
      if (currentIndex <= 0) {
        return null;
      }

      const [element] = nextElements.splice(currentIndex, 1);

      if (element === undefined) {
        return null;
      }

      nextElements.splice(currentIndex - 1, 0, element);
      break;
    }

    case 'front': {
      if (currentIndex === nextElements.length - 1) {
        return null;
      }

      const [element] = nextElements.splice(currentIndex, 1);

      if (element === undefined) {
        return null;
      }

      nextElements.push(element);
      break;
    }

    case 'back': {
      if (currentIndex === 0) {
        return null;
      }

      const [element] = nextElements.splice(currentIndex, 1);

      if (element === undefined) {
        return null;
      }

      nextElements.unshift(element);
      break;
    }
  }

  return nextElements;
}

interface RemovalStateInput {
  readonly document: BroadsetDocument;
  readonly activeElementIds: readonly string[];
  readonly pendingPlacementType: string | null;
  readonly pathEditingElementId: string | null;
  readonly pathDrawingElementId: string | null;
  readonly clipPathEditingElementId: string | null;
  readonly motionPathEditingElementId: string | null;
  readonly inlineTextEditingElementId: string | null;
}

function cleanInteractionId(id: string | null, deletedIds: ReadonlySet<string>): string | null {
  return id !== null && deletedIds.has(id) ? null : id;
}

/**
 * Compute the next state slice after removing a single element (plus its
 * descendants). Returns `null` when the element is protected by
 * `requiredElementIds`.
 */
export function computeRemoveElementState(
  state: RemovalStateInput,
  elementId: string,
  requiredElementIds: ReadonlySet<string>,
): (ReturnType<typeof createInteractionState> & { readonly document: BroadsetDocument }) | null {
  if (requiredElementIds.has(elementId)) {
    return null;
  }

  const affectedIds = collectDescendantIds(state.document, elementId);
  const promotedIds = new Set<string>(
    [...affectedIds].filter((affectedId) => affectedId !== elementId && requiredElementIds.has(affectedId)),
  );
  const deletedIds = new Set<string>([...affectedIds].filter((affectedId) => !promotedIds.has(affectedId)));

  const nextDocument: BroadsetDocument = {
    ...state.document,
    elements: state.document.elements
      .filter((element) => !deletedIds.has(element.id))
      .map((element) =>
        promotedIds.has(element.id) ?
          {
            ...element,
            parentId: null,
          }
        : element,
      ),
    pages: state.document.pages.map((page) => ({
      ...page,
      elements: page.elements.filter((element) => !deletedIds.has(element.elementId)),
    })),
  };

  return {
    document: nextDocument,
    ...createInteractionState(
      state.activeElementIds.filter((activeId) => !deletedIds.has(activeId)),
      state.pendingPlacementType,
      cleanInteractionId(state.pathEditingElementId, deletedIds),
      cleanInteractionId(state.pathDrawingElementId, deletedIds),
      cleanInteractionId(state.inlineTextEditingElementId, deletedIds),
      cleanInteractionId(state.clipPathEditingElementId, deletedIds),
      cleanInteractionId(state.motionPathEditingElementId, deletedIds),
    ),
  };
}

/**
 * Compute the next state slice after removing multiple elements (and their
 * descendants). Returns `null` when every requested element is protected or the
 * effective deletion set is empty.
 */
export function computeRemoveElementsState(
  state: RemovalStateInput,
  elementIds: readonly string[],
  requiredElementIds: ReadonlySet<string>,
): (ReturnType<typeof createInteractionState> & { readonly document: BroadsetDocument }) | null {
  const removableIds = elementIds.filter((elementId) => !requiredElementIds.has(elementId));

  if (removableIds.length === 0) {
    return null;
  }

  const allDeletedIds = new Set<string>();

  for (const elementId of removableIds) {
    const descendants = collectDescendantIds(state.document, elementId);

    for (const descendantId of descendants) {
      if (!requiredElementIds.has(descendantId)) {
        allDeletedIds.add(descendantId);
      }
    }
  }

  const nextDocument: BroadsetDocument = {
    ...state.document,
    elements: state.document.elements
      .filter((element) => !allDeletedIds.has(element.id))
      .map((element) =>
        requiredElementIds.has(element.id) && element.parentId !== null && allDeletedIds.has(element.parentId) ?
          { ...element, parentId: null }
        : element,
      ),
    pages: state.document.pages.map((page) => ({
      ...page,
      elements: page.elements.filter((element) => !allDeletedIds.has(element.elementId)),
    })),
  };

  return {
    document: nextDocument,
    ...createInteractionState(
      state.activeElementIds.filter((activeId) => !allDeletedIds.has(activeId)),
      state.pendingPlacementType,
      cleanInteractionId(state.pathEditingElementId, allDeletedIds),
      cleanInteractionId(state.pathDrawingElementId, allDeletedIds),
      cleanInteractionId(state.inlineTextEditingElementId, allDeletedIds),
      cleanInteractionId(state.clipPathEditingElementId, allDeletedIds),
      cleanInteractionId(state.motionPathEditingElementId, allDeletedIds),
    ),
  };
}
