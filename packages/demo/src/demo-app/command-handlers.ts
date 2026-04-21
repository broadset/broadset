import { appendPathPoint, cancelPlacement, type EditorStore, placeElement, startPlacement } from '@broadset/editor';
import type { BooleanOperation, BroadsetElement } from '@broadset/model';
import type { PropertyValue } from '@broadset/ui';
import { type Dispatch, type MouseEvent, type SetStateAction, useCallback } from 'react';

import {
  CONTEXT_MENU_HEIGHT,
  CONTEXT_MENU_WIDTH,
  type ContextMenuState,
  RULER_SIZE,
  type SidebarTab,
} from '../demo-types';
import { getElementLabel } from './helpers';

type PropertyUpdateContext = {
  readonly store: EditorStore;
  readonly element: BroadsetElement;
  readonly value: PropertyValue;
};

const VALID_BOOLEAN_OPS = new Set<string>(['union', 'subtract', 'intersect', 'exclude']);

function resolveBooleanOperation(stringValue: string): BooleanOperation | null {
  if (stringValue === '' || stringValue === 'none') return null;
  if (VALID_BOOLEAN_OPS.has(stringValue)) return stringValue as BooleanOperation;

  return null;
}

const PROPERTY_UPDATE_HANDLERS: Readonly<Record<string, (ctx: PropertyUpdateContext) => void>> = {
  x: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, {
      position: { ...element.position, x: Number(value) },
    });
  },
  y: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, {
      position: { ...element.position, y: Number(value) },
    });
  },
  width: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, { width: Number(value) });
  },
  height: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, { height: Number(value) });
  },
  rotation: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, { rotation: Number(value) });
  },
  name: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, { name: String(value) });
  },
  content: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, { content: String(value) });
  },
  assetId: ({ store, element, value }) => {
    const trimmed = String(value).trim();

    store.getState().commitElementUpdate(element.id, { assetId: trimmed === '' ? null : trimmed });
  },
  locked: ({ store, element, value }) => {
    if (element.locked !== Boolean(value)) store.getState().toggleLock(element.id);
  },
  booleanOperation: ({ store, element, value }) => {
    store.getState().commitElementUpdate(element.id, {
      booleanOperation: resolveBooleanOperation(String(value)),
    });
  },
};

interface UseCommandHandlersOptions {
  readonly currentDocumentCanvas: {
    readonly width: number;
    readonly height: number;
  };
  readonly currentDocumentElements: readonly BroadsetElement[];
  readonly editorStore: EditorStore;
  readonly activeElementIds: readonly string[];
  readonly selectedElement: BroadsetElement | null;
  readonly sidebarTab: SidebarTab;
  readonly clipboardRef: { current: readonly BroadsetElement[] };
  readonly pasteClipboardElements: () => void;
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
  readonly setIsSidebarOpen: Dispatch<SetStateAction<boolean>>;
  readonly setSidebarTab: Dispatch<SetStateAction<SidebarTab>>;
}

interface CommandHandlers {
  readonly handleCanvasClick: (event: MouseEvent<HTMLDivElement>) => void;
  readonly handleCanvasContextMenu: (event: MouseEvent<HTMLDivElement>) => void;
  readonly handleCopySelection: () => void;
  readonly handleCutSelection: () => void;
  readonly handleDuplicateSelection: () => void;
  readonly handleElementSelect: (elementType: string) => void;
  readonly handlePropertyUpdate: (key: string, value: PropertyValue) => void;
  readonly handleSidebarTabToggle: (nextTab: SidebarTab) => void;
}

export function useCommandHandlers({
  activeElementIds,
  clipboardRef,
  currentDocumentCanvas,
  currentDocumentElements,
  editorStore,
  pasteClipboardElements,
  pushToast,
  selectedElement,
  setContextMenu,
  setIsSidebarOpen,
  setSidebarTab,
  sidebarTab,
}: UseCommandHandlersOptions): CommandHandlers {
  const handleCanvasClick = useCallback(
    (event: MouseEvent<HTMLDivElement>): void => {
      const target =
        event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-element-id]') : null;
      const state = editorStore.getState();

      if (state.pathDrawingElementId !== null) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const docX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * currentDocumentCanvas.width;
        const docY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * currentDocumentCanvas.height;

        appendPathPoint(editorStore, docX, docY);

        return;
      }

      if (state.pendingPlacementType !== null) {
        const bounds = event.currentTarget.getBoundingClientRect();
        const docX = ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) * currentDocumentCanvas.width;
        const docY = ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) * currentDocumentCanvas.height;

        placeElement(editorStore, docX, docY);

        return;
      }

      if (target !== null) {
        const elementId = target.dataset['elementId'];

        if (typeof elementId === 'string' && elementId !== '') {
          if (event.metaKey || event.ctrlKey || event.shiftKey) {
            state.toggleSelectElement(elementId);
          } else {
            state.selectElement(elementId);
          }
        }

        return;
      }

      state.selectElement(null);
    },
    [currentDocumentCanvas.height, currentDocumentCanvas.width, editorStore],
  );

  const handleCanvasContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>): void => {
      event.preventDefault();
      event.stopPropagation();

      const target =
        event.target instanceof HTMLElement ? event.target.closest<HTMLElement>('[data-element-id]') : null;
      const hitElementId =
        typeof target?.dataset['elementId'] === 'string' && target.dataset['elementId'] !== '' ?
          target.dataset['elementId']
        : null;
      const state = editorStore.getState();
      const contextElementId = hitElementId ?? state.activeElementIds[0] ?? null;

      if (contextElementId !== null) {
        const hasMultipleSelection = state.activeElementIds.length > 1;
        const isElementAlreadySelected = state.activeElementIds.includes(contextElementId);

        if (!(hasMultipleSelection && isElementAlreadySelected)) {
          state.selectElement(contextElementId);
        }
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      const minX = bounds.left + RULER_SIZE;
      const maxX = bounds.right - CONTEXT_MENU_WIDTH + RULER_SIZE;
      const minY = bounds.top + RULER_SIZE;
      const maxY = bounds.bottom - CONTEXT_MENU_HEIGHT + RULER_SIZE;

      setContextMenu({
        elementId: contextElementId,
        hasClipboardContents: clipboardRef.current.length > 0,
        x: Math.max(minX, Math.min(event.clientX, maxX)),
        y: Math.max(minY, Math.min(event.clientY, maxY)),
      });
    },
    [clipboardRef, editorStore, setContextMenu],
  );

  const handleCopySelection = useCallback((): void => {
    const selectedElements = currentDocumentElements.filter((element) => activeElementIds.includes(element.id));

    if (selectedElements.length === 0) {
      pushToast('info', 'Select an element before copying.');

      return;
    }

    clipboardRef.current = selectedElements.map((element) => ({
      ...element,
      position: { ...element.position },
      style: { ...element.style },
    }));
    setContextMenu(null);
    pushToast(
      'success',
      `Copied ${String(selectedElements.length)} element${selectedElements.length === 1 ? '' : 's'}.`,
    );
  }, [activeElementIds, clipboardRef, currentDocumentElements, pushToast, setContextMenu]);

  const handleCutSelection = useCallback((): void => {
    handleCopySelection();

    for (const elementId of editorStore.getState().activeElementIds) {
      editorStore.getState().removeElement(elementId);
    }

    pushToast('info', 'Cut the selected element.');
  }, [editorStore, handleCopySelection, pushToast]);

  const handleDuplicateSelection = useCallback((): void => {
    const selectedElements = currentDocumentElements.filter((element) => activeElementIds.includes(element.id));

    if (selectedElements.length === 0) {
      pushToast('info', 'Select an element before duplicating.');

      return;
    }

    clipboardRef.current = selectedElements;
    pasteClipboardElements();
  }, [activeElementIds, clipboardRef, currentDocumentElements, pasteClipboardElements, pushToast]);

  const handleElementSelect = useCallback(
    (elementType: string): void => {
      const pendingType = editorStore.getState().pendingPlacementType;

      if (pendingType === elementType) {
        cancelPlacement(editorStore);
        pushToast('info', `${getElementLabel(elementType)} placement cancelled.`);

        return;
      }

      startPlacement(editorStore, elementType);
      setIsSidebarOpen(true);
      pushToast('info', `${getElementLabel(elementType)} placement is ready.`);
    },
    [editorStore, pushToast, setIsSidebarOpen],
  );

  const handlePropertyUpdate = useCallback(
    (key: string, value: PropertyValue): void => {
      if (selectedElement === null) return;

      const handler = PROPERTY_UPDATE_HANDLERS[key];

      if (handler !== undefined) {
        handler({ store: editorStore, element: selectedElement, value });

        return;
      }

      editorStore.getState().updateElementStyle(selectedElement.id, { [key]: value });
    },
    [editorStore, selectedElement],
  );

  const handleSidebarTabToggle = useCallback(
    (nextTab: SidebarTab): void => {
      setIsSidebarOpen((currentValue) => !(currentValue && sidebarTab === nextTab));
      setSidebarTab(nextTab);
    },
    [setIsSidebarOpen, setSidebarTab, sidebarTab],
  );

  return {
    handleCanvasClick,
    handleCanvasContextMenu,
    handleCopySelection,
    handleCutSelection,
    handleDuplicateSelection,
    handleElementSelect,
    handlePropertyUpdate,
    handleSidebarTabToggle,
  };
}
