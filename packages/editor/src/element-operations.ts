import type { BroadsetElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';

import type { EditorStore } from './store-actions';

/**
 * MIME type used for Broadset element data on the system clipboard.
 * Matches the spec's `application/x-broadset-elements` requirement.
 */
export const BROADSET_CLIPBOARD_MIME_TYPE = 'application/x-broadset-elements';

export type AlignmentDirection = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';
export type DistributionAxis = 'horizontal' | 'vertical';

export interface ClipboardResult {
  readonly elements: readonly BroadsetElement[];
  readonly json: string;
  readonly plainText?: string;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface PositionUpdate {
  readonly elementId: string;
  readonly position: Point;
}

function positionUpdates(positions: ReadonlyMap<string, Point>): readonly PositionUpdate[] {
  return Array.from(positions.entries()).map(([elementId, position]) => ({ elementId, position }));
}

/**
 * Aligns selected elements along the specified axis using the bounding box
 * of all selected elements as reference. Requires at least 2 selected elements.
 */
export function alignElements(store: EditorStore, direction: AlignmentDirection): void {
  const state = store.getState();
  const selectedIds = new Set(state.activeElementIds);

  if (selectedIds.size < 2) {
    return;
  }

  const selectedElements = state.document.elements.filter((element) => selectedIds.has(element.id));

  if (selectedElements.length < 2) {
    return;
  }

  const positions = computeAlignedPositions(selectedElements, direction);

  store.getState().commitGroupMove(positionUpdates(positions));
}

function computeAlignedPositions(
  elements: readonly BroadsetElement[],
  direction: AlignmentDirection,
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const positions = new Map<string, { readonly x: number; readonly y: number }>();

  const minX = Math.min(...elements.map((element) => element.position.x));
  const maxRight = Math.max(...elements.map((element) => element.position.x + element.width));
  const minY = Math.min(...elements.map((element) => element.position.y));
  const maxBottom = Math.max(...elements.map((element) => element.position.y + element.height));

  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;

  for (const element of elements) {
    switch (direction) {
      case 'left':
        positions.set(element.id, { x: minX, y: element.position.y });
        break;

      case 'right':
        positions.set(element.id, { x: maxRight - element.width, y: element.position.y });
        break;

      case 'center-x':
        positions.set(element.id, { x: centerX - element.width / 2, y: element.position.y });
        break;

      case 'top':
        positions.set(element.id, { x: element.position.x, y: minY });
        break;

      case 'bottom':
        positions.set(element.id, { x: element.position.x, y: maxBottom - element.height });
        break;

      case 'center-y':
        positions.set(element.id, { x: element.position.x, y: centerY - element.height / 2 });
        break;
    }
  }

  return positions;
}

/**
 * Distributes selected elements evenly along the specified axis.
 * Requires at least 3 selected elements. Elements are sorted by their
 * center position along the axis, and the middle elements are repositioned
 * to create equal spacing between centers.
 */
export function distributeElements(store: EditorStore, axis: DistributionAxis): void {
  const state = store.getState();
  const selectedIds = new Set(state.activeElementIds);

  if (selectedIds.size < 3) {
    return;
  }

  const selectedElements = state.document.elements.filter((element) => selectedIds.has(element.id));

  if (selectedElements.length < 3) {
    return;
  }

  const positions = computeDistributedPositions(selectedElements, axis);

  store.getState().commitGroupMove(positionUpdates(positions));
}

function computeDistributedPositions(
  elements: readonly BroadsetElement[],
  axis: DistributionAxis,
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  const positions = new Map<string, { readonly x: number; readonly y: number }>();

  const sorted = [...elements].sort((elementA, elementB) => {
    if (axis === 'horizontal') {
      return elementA.position.x + elementA.width / 2 - (elementB.position.x + elementB.width / 2);
    }

    return elementA.position.y + elementA.height / 2 - (elementB.position.y + elementB.height / 2);
  });

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (first === undefined || last === undefined) {
    return positions;
  }

  if (axis === 'horizontal') {
    const firstCenter = first.position.x + first.width / 2;
    const lastCenter = last.position.x + last.width / 2;
    const spacing = (lastCenter - firstCenter) / (sorted.length - 1);

    for (let index = 0; index < sorted.length; index++) {
      const element = sorted[index];

      if (element === undefined) {
        continue;
      }

      const targetCenter = firstCenter + spacing * index;

      positions.set(element.id, { x: targetCenter - element.width / 2, y: element.position.y });
    }
  } else {
    const firstCenter = first.position.y + first.height / 2;
    const lastCenter = last.position.y + last.height / 2;
    const spacing = (lastCenter - firstCenter) / (sorted.length - 1);

    for (let index = 0; index < sorted.length; index++) {
      const element = sorted[index];

      if (element === undefined) {
        continue;
      }

      const targetCenter = firstCenter + spacing * index;

      positions.set(element.id, { x: element.position.x, y: targetCenter - element.height / 2 });
    }
  }

  return positions;
}

/**
 * Copies the currently selected elements to a clipboard result.
 * Does not modify the store. Returns a deep snapshot of the selected
 * elements so later edits to the live store cannot mutate what will be
 * pasted. Also returns the serialized JSON for writing to the system
 * clipboard.
 */
export function copyElements(store: EditorStore): ClipboardResult {
  const state = store.getState();
  const selectedIds = new Set(state.activeElementIds);
  const selectedElements = state.document.elements.filter((element) => selectedIds.has(element.id));
  const snapshotJson = JSON.stringify(selectedElements);
  const snapshotElements = JSON.parse(snapshotJson) as readonly BroadsetElement[];

  return {
    elements: snapshotElements,
    json: snapshotJson,
  };
}

/**
 * Cuts the currently selected elements — copies them to a clipboard result
 * and removes them from the document as a single atomic undoable action.
 * Required elements are serialized but not deleted.
 */
export function cutElements(store: EditorStore): ClipboardResult {
  const result = copyElements(store);

  store.getState().removeElements(result.elements.map((element) => element.id));

  return result;
}

/**
 * Pastes elements from a clipboard result into the store.
 * Each element receives a new unique ID. Elements are placed centered
 * at the specified viewport center, maintaining their relative positions.
 * If the clipboard contains plain text (no elements), a new text element
 * is created with that content.
 */
export function pasteElements(store: EditorStore, clipboard: ClipboardResult, viewportCenter: Point): void {
  if (clipboard.elements.length === 0 && clipboard.plainText !== undefined && clipboard.plainText !== '') {
    if (isImageDataUrl(clipboard.plainText)) {
      pasteAsImageElement(store, clipboard.plainText, viewportCenter);
    } else {
      pasteAsTextElement(store, clipboard.plainText, viewportCenter);
    }

    return;
  }

  if (clipboard.elements.length === 0) {
    return;
  }

  const groupBounds = computeGroupBounds(clipboard.elements);
  const offsetX = viewportCenter.x - groupBounds.centerX;
  const offsetY = viewportCenter.y - groupBounds.centerY;

  const newIds: string[] = [];

  for (const element of clipboard.elements) {
    const newElement: BroadsetElement = {
      ...element,
      id: crypto.randomUUID(),
      position: {
        x: element.position.x + offsetX,
        y: element.position.y + offsetY,
      },
    };

    store.getState().addElement(newElement);
    newIds.push(newElement.id);
  }

  store.getState().setActiveElements(newIds);
}

function pasteAsTextElement(store: EditorStore, text: string, viewportCenter: Point): void {
  const textElement = createDefaultElement('text', {
    content: text,
    position: {
      x: viewportCenter.x - 40,
      y: viewportCenter.y - 10,
    },
    width: 80,
    height: 20,
  });

  store.getState().addElement(textElement);
}

function isImageDataUrl(text: string): boolean {
  return text.startsWith('data:image/');
}

function pasteAsImageElement(store: EditorStore, dataUrl: string, viewportCenter: Point): void {
  const imageElement = createDefaultElement('image', {
    content: dataUrl,
    position: {
      x: viewportCenter.x - 50,
      y: viewportCenter.y - 50,
    },
    width: 100,
    height: 100,
  });

  store.getState().addElement(imageElement);
}

function computeGroupBounds(elements: readonly BroadsetElement[]): {
  readonly centerX: number;
  readonly centerY: number;
} {
  const minX = Math.min(...elements.map((element) => element.position.x));
  const maxX = Math.max(...elements.map((element) => element.position.x + element.width));
  const minY = Math.min(...elements.map((element) => element.position.y));
  const maxY = Math.max(...elements.map((element) => element.position.y + element.height));

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}
