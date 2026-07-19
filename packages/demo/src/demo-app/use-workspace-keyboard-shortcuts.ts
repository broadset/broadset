import { type ProjectEditorStore, selectActiveDocumentV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { useEffect } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function cancelPlacementFromEscape(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || store.getState().placement === null) return false;

  event.preventDefault();
  store.getState().cancelPlacement();

  return true;
}

function finishPathDrawingFromKeyboard(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  const state = store.getState();
  const elementId = state.pathDrawingElementId;

  if (elementId === null || (event.key !== 'Enter' && event.key !== 'Escape')) return false;

  event.preventDefault();

  if (event.key === 'Enter') {
    state.updateElement(elementId, (element) => {
      if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return element;
      if (element.geometryData.path.closed) return element;

      return {
        ...element,
        geometryData: {
          ...element.geometryData,
          path: {
            ...element.geometryData.path,
            closed: true,
            segments: [
              ...element.geometryData.path.segments,
              { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'close' },
            ],
          },
        },
      };
    });
  }

  store.getState().finishPathDrawing();

  return true;
}

function exitEditingFromEscape(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  const state = store.getState();

  if (event.key !== 'Escape' || (state.pathEditingElementId === null && state.clipPathEditingElementId === null)) {
    return false;
  }

  event.preventDefault();
  state.finishPathDrawing();

  return true;
}

function handleClipboardWorkspaceShortcut(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;

  const state = store.getState();

  switch (event.key.toLowerCase()) {
    case 'c':
      event.preventDefault();
      void state.copySelection();

      return true;
    case 'd':
      event.preventDefault();
      void state.duplicateSelection();

      return true;
    case 'v':
      event.preventDefault();
      void state.pasteClipboard();

      return true;
    case 'x':
      event.preventDefault();
      void state.cutSelection();

      return true;
    default:
      return false;
  }
}

function handleGeneralWorkspaceShortcut(store: ProjectEditorStore, event: KeyboardEvent): void {
  const state = store.getState();
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if ((event.key === 'Delete' || event.key === 'Backspace') && state.activeInstanceAddresses.length > 0) {
    event.preventDefault();
    state.removeElements(state.activeInstanceAddresses.map(({ elementId }) => elementId));

    return;
  }

  if (modifier && key === 'a') {
    const document = selectActiveDocumentV1(state);

    if (document === undefined) return;

    event.preventDefault();
    state.setActiveElements(document.elements.map(({ id }) => id));

    return;
  }

  if (handleClipboardWorkspaceShortcut(store, event)) return;

  if (modifier && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) state.redo();
    else state.undo();

    return;
  }

  if (modifier && key === 'y') {
    event.preventDefault();
    state.redo();
  }
}

function handleWorkspaceKeyDown(store: ProjectEditorStore, event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) return;
  if (finishPathDrawingFromKeyboard(store, event)) return;
  if (exitEditingFromEscape(store, event)) return;
  if (cancelPlacementFromEscape(store, event)) return;

  handleGeneralWorkspaceShortcut(store, event);
}

interface UseWorkspaceKeyboardShortcutsOptions {
  readonly editorStore: ProjectEditorStore;
}

/**
 * Wires the workspace's global keyboard shortcuts (delete/undo/redo/copy-paste/select-all/path
 * editing) to the window, and clears the clipboard when the workspace unmounts. Kept as a hook so
 * the workspace component only declares the effect dependency once instead of inlining the
 * listener wiring alongside its other effects.
 */
export function useWorkspaceKeyboardShortcuts(options: UseWorkspaceKeyboardShortcutsOptions): void {
  const { editorStore } = options;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      handleWorkspaceKeyDown(editorStore, event);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      editorStore.getState().clearClipboard();
    };
  }, [editorStore]);
}
