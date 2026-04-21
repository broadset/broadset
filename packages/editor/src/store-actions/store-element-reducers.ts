import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { createInteractionState } from './selection';
import type { PlacementState } from './store';
import { collectDescendantIds } from './transform';

export type ReorderDirection = 'forward' | 'backward' | 'front' | 'back';

/**
 * Returns a reordered copy of the elements array, or `null` when no change is
 * needed (e.g. the element is already at the requested boundary).
 */
function targetIndexFor(direction: ReorderDirection, currentIndex: number, lastIndex: number): number | null {
  switch (direction) {
    case 'forward':
      return currentIndex >= lastIndex ? null : currentIndex + 1;
    case 'backward':
      return currentIndex <= 0 ? null : currentIndex - 1;
    case 'front':
      return currentIndex === lastIndex ? null : lastIndex;
    case 'back':
      return currentIndex === 0 ? null : 0;
  }
}

export function reorderElementInList(
  elements: readonly BroadsetElement[],
  elementId: string,
  direction: ReorderDirection,
): readonly BroadsetElement[] | null {
  const currentIndex = elements.findIndex((element) => element.id === elementId);

  if (currentIndex === -1) return null;

  const targetIndex = targetIndexFor(direction, currentIndex, elements.length - 1);

  if (targetIndex === null) return null;

  const nextElements = [...elements];
  const [element] = nextElements.splice(currentIndex, 1);

  if (element === undefined) return null;

  nextElements.splice(targetIndex, 0, element);

  return nextElements;
}

interface RemovalStateInput {
  readonly document: BroadsetDocument;
  readonly activeElementIds: readonly string[];
  readonly placement: PlacementState | null;
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
      state.placement,
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
      state.placement,
      cleanInteractionId(state.pathEditingElementId, allDeletedIds),
      cleanInteractionId(state.pathDrawingElementId, allDeletedIds),
      cleanInteractionId(state.inlineTextEditingElementId, allDeletedIds),
      cleanInteractionId(state.clipPathEditingElementId, allDeletedIds),
      cleanInteractionId(state.motionPathEditingElementId, allDeletedIds),
    ),
  };
}
