import { cancelPlacement, type EditorStore, placeElement, startPlacement } from '@broadset/editor';
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
        x: Math.max(minX, Math.min(event.clientX, maxX)),
        y: Math.max(minY, Math.min(event.clientY, maxY)),
      });
    },
    [editorStore, setContextMenu],
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
      if (selectedElement === null) {
        return;
      }

      if (key === 'x' || key === 'y') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          position: {
            ...selectedElement.position,
            [key]: Number(value),
          },
        });

        return;
      }

      if (key === 'width' || key === 'height' || key === 'rotation') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          [key]: Number(value),
        });

        return;
      }

      if (key === 'name') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          name: String(value),
        });

        return;
      }

      if (key === 'content') {
        editorStore.getState().commitElementUpdate(selectedElement.id, {
          content: String(value),
        });

        return;
      }

      if (key === 'assetId') {
        const assetIdValue = String(value).trim();

        editorStore.getState().commitElementUpdate(selectedElement.id, {
          assetId: assetIdValue === '' ? null : assetIdValue,
        });

        return;
      }

      if (key === 'locked') {
        const nextLocked = Boolean(value);

        if (selectedElement.locked !== nextLocked) {
          editorStore.getState().toggleLock(selectedElement.id);
        }

        return;
      }

      if (key === 'booleanOperation') {
        const validOps = new Set<string>(['union', 'subtract', 'intersect', 'exclude']);
        const stringValue = String(value);

        editorStore.getState().commitElementUpdate(selectedElement.id, {
          booleanOperation:
            stringValue === '' || stringValue === 'none' ? null
            : validOps.has(stringValue) ? (stringValue as BooleanOperation)
            : null,
        });

        return;
      }

      editorStore.getState().updateElementStyle(selectedElement.id, {
        [key]: value,
      });
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
