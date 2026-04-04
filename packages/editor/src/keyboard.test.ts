import type { BroadsetElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import type { ShortcutAction } from './keyboard';
import {
  DEFAULT_SHORTCUT_MAP,
  handleShortcutAction,
  matchShortcut,
  NUDGE_LARGE_MM,
  NUDGE_SMALL_MM,
  resolveShortcuts,
} from './keyboard';
import type { EditorStore } from './store-actions';
import { createEditorStore } from './store-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestStore(): EditorStore {
  return createEditorStore();
}

function addTestElement(store: EditorStore, overrides?: Partial<BroadsetElement>): string {
  const id = store.getState().addElement('rectangle');
  const state = store.getState();
  const page = state.document.pages[state.activePageIndex];
  const el = page?.elements.find((e) => e.id === id);

  if (el && overrides) {
    store.getState().commitElementUpdate(id, {
      position: overrides.position ?? el.position,
      width: overrides.width ?? el.width,
      height: overrides.height ?? el.height,
    });
  }

  return id;
}

function getElement(store: EditorStore, id: string): BroadsetElement | undefined {
  const state = store.getState();
  const page = state.document.pages[state.activePageIndex];

  return page?.elements.find((e) => e.id === id);
}

// ---------------------------------------------------------------------------
// Shortcut Binding Resolution
// ---------------------------------------------------------------------------

describe('Shortcut Binding Resolution', () => {
  /** @description Verifies that the default shortcut map contains a binding for every ShortcutAction. */
  it('default map has a binding for every action', () => {
    const actions: readonly ShortcutAction[] = [
      'nudge-up',
      'nudge-down',
      'nudge-left',
      'nudge-right',
      'nudge-up-large',
      'nudge-down-large',
      'nudge-left-large',
      'nudge-right-large',
      'copy',
      'paste',
      'duplicate',
      'delete',
      'select-all',
      'toggle-lock',
      'layer-forward',
      'layer-backward',
      'layer-front',
      'layer-back',
      'undo',
      'redo',
      'zoom-in',
      'zoom-out',
      'zoom-reset',
      'group',
      'ungroup',
    ];

    for (const action of actions) {
      const binding = DEFAULT_SHORTCUT_MAP[action];

      expect(binding).toBeDefined();
      expect(binding.key).toBeTruthy();
      expect(binding.label).toBeTruthy();
    }
  });

  /** @description Verifies that the correct action is dispatched for each default key binding. */
  it('default binding maps key to correct action', () => {
    const resolved = resolveShortcuts({});

    // Delete key should map to 'delete'
    const deleteAction = matchShortcut(resolved, 'Delete', {});

    expect(deleteAction).toBe('delete');

    // Ctrl+Z should map to 'undo'
    const undoAction = matchShortcut(resolved, 'z', { ctrl: true });

    expect(undoAction).toBe('undo');

    // ArrowRight should map to 'nudge-right'
    const nudgeAction = matchShortcut(resolved, 'ArrowRight', {});

    expect(nudgeAction).toBe('nudge-right');
  });

  /** @description Verifies that host overrides replace the binding for a specific action. */
  it('host override replaces the binding for the overridden action', () => {
    const resolved = resolveShortcuts({ delete: { key: 'x', label: 'Delete' } });

    // 'x' with no modifiers should now be 'delete'
    const deleteAction = matchShortcut(resolved, 'x', {});

    expect(deleteAction).toBe('delete');

    // original 'Delete' key should no longer match
    const noAction = matchShortcut(resolved, 'Delete', {});

    expect(noAction).toBeNull();
  });

  /** @description Verifies that non-overridden bindings keep their defaults when a partial override is given. */
  it('non-overridden bindings keep their defaults', () => {
    const resolved = resolveShortcuts({ delete: { key: 'x', label: 'Delete' } });

    // Ctrl+Z should still be 'undo'
    const undoAction = matchShortcut(resolved, 'z', { ctrl: true });

    expect(undoAction).toBe('undo');

    // Ctrl+C should still be 'copy'
    const copyAction = matchShortcut(resolved, 'c', { ctrl: true });

    expect(copyAction).toBe('copy');
  });
});

// ---------------------------------------------------------------------------
// Nudge Actions
// ---------------------------------------------------------------------------

describe('Nudge Actions', () => {
  /** @description Verifies that a small nudge moves a selected element by 1mm in the given direction. */
  it('arrow key nudges selected element by 1mm', () => {
    const store = createTestStore();
    const id = addTestElement(store, { position: { x: 100, y: 100 } });

    store.getState().selectElement(id);

    handleShortcutAction(store, 'nudge-right');

    const el = getElement(store, id);

    expect(el?.position.x).toBe(100 + NUDGE_SMALL_MM);
    expect(el?.position.y).toBe(100);
  });

  /** @description Verifies that Shift+Arrow nudges the selected element by 10mm. */
  it('Shift+Arrow nudges selected element by 10mm', () => {
    const store = createTestStore();
    const id = addTestElement(store, { position: { x: 100, y: 100 } });

    store.getState().selectElement(id);

    handleShortcutAction(store, 'nudge-right-large');

    const el = getElement(store, id);

    expect(el?.position.x).toBe(100 + NUDGE_LARGE_MM);
    expect(el?.position.y).toBe(100);
  });

  /** @description Verifies that multiple selected elements all move by the same nudge step. */
  it('multi-selection nudges all elements by the same step', () => {
    const store = createTestStore();
    const id1 = addTestElement(store, { position: { x: 50, y: 50 } });
    const id2 = addTestElement(store, { position: { x: 200, y: 200 } });

    store.getState().selectElement(id1);
    store.getState().toggleSelectElement(id2);

    handleShortcutAction(store, 'nudge-down');

    const el1 = getElement(store, id1);
    const el2 = getElement(store, id2);

    expect(el1?.position.y).toBe(50 + NUDGE_SMALL_MM);
    expect(el2?.position.y).toBe(200 + NUDGE_SMALL_MM);
  });

  /** @description Verifies that multi-selected elements all move by 10mm on Shift+Arrow. */
  it('multi-selection nudges all by 10mm on large nudge', () => {
    const store = createTestStore();
    const id1 = addTestElement(store, { position: { x: 50, y: 50 } });
    const id2 = addTestElement(store, { position: { x: 200, y: 200 } });

    store.getState().selectElement(id1);
    store.getState().toggleSelectElement(id2);

    handleShortcutAction(store, 'nudge-up-large');

    const el1 = getElement(store, id1);
    const el2 = getElement(store, id2);

    expect(el1?.position.y).toBe(50 - NUDGE_LARGE_MM);
    expect(el2?.position.y).toBe(200 - NUDGE_LARGE_MM);
  });
});

// ---------------------------------------------------------------------------
// Clipboard Copy and Paste
// ---------------------------------------------------------------------------

describe('Clipboard Copy and Paste', () => {
  /** @description Verifies copy then paste creates a new element at the same position (zero offset). */
  it('copy then paste creates a clone at the same position', () => {
    const store = createTestStore();
    const id = addTestElement(store, { position: { x: 50, y: 80 } });

    store.getState().selectElement(id);

    handleShortcutAction(store, 'copy');
    handleShortcutAction(store, 'paste');

    const state = store.getState();
    const page = state.document.pages[state.activePageIndex];

    expect(page?.elements).toHaveLength(2);

    const pasted = page?.elements.find((e) => e.id !== id);

    expect(pasted).toBeDefined();
    expect(pasted?.position.x).toBe(50);
    expect(pasted?.position.y).toBe(80);
    expect(pasted?.id).not.toBe(id);
  });

  /** @description Verifies duplicate creates a clone at the same position in one step. */
  it('duplicate creates a clone at the same position in one step', () => {
    const store = createTestStore();
    const id = addTestElement(store, { position: { x: 50, y: 80 } });

    store.getState().selectElement(id);

    handleShortcutAction(store, 'duplicate');

    const state = store.getState();
    const page = state.document.pages[state.activePageIndex];

    expect(page?.elements).toHaveLength(2);

    const pasted = page?.elements.find((e) => e.id !== id);

    expect(pasted).toBeDefined();
    expect(pasted?.position.x).toBe(50);
    expect(pasted?.position.y).toBe(80);
  });

  /** @description Verifies that paste on a different page places elements on the active page. */
  it('paste on a different page places elements on the active page', () => {
    const store = createTestStore();
    const id = addTestElement(store, { position: { x: 50, y: 80 } });

    store.getState().selectElement(id);

    handleShortcutAction(store, 'copy');

    // Add a second page and switch to it
    store.getState().addPage();
    store.getState().switchPage(1);

    handleShortcutAction(store, 'paste');

    const state = store.getState();

    // Page 0 should still have only the original
    expect(state.document.pages[0]?.elements).toHaveLength(1);

    // Page 1 should have the pasted element
    expect(state.document.pages[1]?.elements).toHaveLength(1);
    expect(state.document.pages[1]?.elements[0]?.position.x).toBe(50);
    expect(state.document.pages[1]?.elements[0]?.position.y).toBe(80);
  });

  /** @description Verifies that a new copy replaces the previous clipboard content. */
  it('second copy fully replaces clipboard content', () => {
    const store = createTestStore();
    const id1 = addTestElement(store, { position: { x: 10, y: 10 } });
    const id2 = addTestElement(store, { position: { x: 99, y: 99 } });

    // Copy element 1
    store.getState().selectElement(id1);
    handleShortcutAction(store, 'copy');

    // Copy element 2 (replaces clipboard)
    store.getState().selectElement(id2);
    handleShortcutAction(store, 'copy');

    handleShortcutAction(store, 'paste');

    const state = store.getState();
    const page = state.document.pages[state.activePageIndex];

    // Should have original 2 + 1 pasted = 3
    expect(page?.elements).toHaveLength(3);

    // Pasted element should match element 2, not element 1
    const pasted = page?.elements.find((e) => e.id !== id1 && e.id !== id2);

    expect(pasted?.position.x).toBe(99);
    expect(pasted?.position.y).toBe(99);
  });

  /** @description Verifies that destroying the editor clears the clipboard. */
  it('editor destroy clears the clipboard', () => {
    const store = createTestStore();
    const id = addTestElement(store);

    store.getState().selectElement(id);
    handleShortcutAction(store, 'copy');

    // A new store (simulating editor destruction and recreation) should have no clipboard
    const store2 = createTestStore();

    addTestElement(store2);

    handleShortcutAction(store2, 'paste');

    const state = store2.getState();
    const page = state.document.pages[state.activePageIndex];

    // Only the element added to store2 should exist — no clipboard to paste from
    expect(page?.elements).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Delete Action
// ---------------------------------------------------------------------------

describe('Delete Action', () => {
  /** @description Verifies that the delete action removes the selected element. */
  it('delete removes selected element', () => {
    const store = createTestStore();
    const id = addTestElement(store);

    store.getState().selectElement(id);

    handleShortcutAction(store, 'delete');

    const state = store.getState();
    const page = state.document.pages[state.activePageIndex];

    expect(page?.elements).toHaveLength(0);
    expect(state.activeElementIds).toHaveLength(0);
  });

  /** @description Verifies that Backspace also triggers deletion (same action). */
  it('Backspace key maps to delete action', () => {
    const resolved = resolveShortcuts({});
    const action = matchShortcut(resolved, 'Backspace', {});

    expect(action).toBe('delete');
  });
});

// ---------------------------------------------------------------------------
// Select All
// ---------------------------------------------------------------------------

describe('Select All', () => {
  /** @description Verifies that select-all selects every element on the active page. */
  it('selects every element on the active page', () => {
    const store = createTestStore();
    const id1 = addTestElement(store);
    const id2 = addTestElement(store);
    const id3 = addTestElement(store);

    handleShortcutAction(store, 'select-all');

    const state = store.getState();

    expect(state.activeElementIds).toHaveLength(3);
    expect(state.activeElementIds).toContain(id1);
    expect(state.activeElementIds).toContain(id2);
    expect(state.activeElementIds).toContain(id3);
  });
});

// ---------------------------------------------------------------------------
// Group and Ungroup Shortcuts
// ---------------------------------------------------------------------------

describe('Group and Ungroup Shortcuts', () => {
  /** @description Verifies that Ctrl+G groups multi-selected elements. */
  it('groups multi-selected elements', () => {
    const store = createTestStore();
    const id1 = addTestElement(store);
    const id2 = addTestElement(store);

    store.getState().selectElement(id1);
    store.getState().toggleSelectElement(id2);

    handleShortcutAction(store, 'group');

    const el1 = getElement(store, id1);
    const el2 = getElement(store, id2);

    expect(el1?.groupId).toBeTruthy();
    expect(el2?.groupId).toBeTruthy();
    expect(el1?.groupId).toBe(el2?.groupId);
  });

  /** @description Verifies that Ctrl+G with single selection is a no-op. */
  it('single selection group is a no-op', () => {
    const store = createTestStore();
    const id = addTestElement(store);

    store.getState().selectElement(id);

    handleShortcutAction(store, 'group');

    const el = getElement(store, id);

    expect(el?.groupId).toBeNull();
  });

  /** @description Verifies that Ctrl+Shift+G ungroups selected elements. */
  it('ungroups selected elements', () => {
    const store = createTestStore();
    const id1 = addTestElement(store);
    const id2 = addTestElement(store);

    // Group them first
    store.getState().selectElement(id1);
    store.getState().toggleSelectElement(id2);
    store.getState().groupElements();

    // Ungroup
    handleShortcutAction(store, 'ungroup');

    const el1 = getElement(store, id1);
    const el2 = getElement(store, id2);

    expect(el1?.groupId).toBeNull();
    expect(el2?.groupId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Clipboard Scope
// ---------------------------------------------------------------------------

describe('Clipboard Scope', () => {
  /** @description Verifies cross-page paste: copy on page 0, paste on page 1. */
  it('elements copied on one page can be pasted on a different page', () => {
    const store = createTestStore();
    const id = addTestElement(store, { position: { x: 42, y: 77 } });

    store.getState().selectElement(id);
    handleShortcutAction(store, 'copy');

    store.getState().addPage();
    store.getState().switchPage(1);

    handleShortcutAction(store, 'paste');

    const state = store.getState();

    expect(state.document.pages[1]?.elements).toHaveLength(1);
    expect(state.document.pages[1]?.elements[0]?.position.x).toBe(42);
  });

  /** @description Verifies second copy replaces clipboard — only latest elements are pasted. */
  it('second copy replaces clipboard content', () => {
    const store = createTestStore();
    const id1 = addTestElement(store, { position: { x: 10, y: 10 } });
    const id2 = addTestElement(store, { position: { x: 99, y: 99 } });

    store.getState().selectElement(id1);
    handleShortcutAction(store, 'copy');

    store.getState().selectElement(id2);
    handleShortcutAction(store, 'copy');

    handleShortcutAction(store, 'paste');

    const state = store.getState();
    const page = state.document.pages[state.activePageIndex];
    const pasted = page?.elements.find((e) => e.id !== id1 && e.id !== id2);

    expect(pasted?.position.x).toBe(99);
  });

  /** @description Verifies clipboard is discarded when the editor store is destroyed (new instance). */
  it('clipboard is discarded on editor destruction', () => {
    const store = createTestStore();
    const id = addTestElement(store);

    store.getState().selectElement(id);
    handleShortcutAction(store, 'copy');

    // New store = new editor instance; clipboard should not carry over
    const store2 = createTestStore();

    addTestElement(store2);
    handleShortcutAction(store2, 'paste');

    const state = store2.getState();
    const page = state.document.pages[state.activePageIndex];

    expect(page?.elements).toHaveLength(1);
  });
});
