import { describe, expect, it } from 'vitest';

import { createKeyboardHandler } from './keyboard';
import { makeDocument, makeElement, pressKey } from './keyboard-test-helpers';
import { createEditorStore } from './store-actions';

describe('keyboard', () => {
  describe('Clipboard Copy and Paste', () => {
    /** @description Copy then paste creates a new element at the same position (zero offset). */
    it('copy then paste creates element at same position', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 50, y: 80 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('c', { ctrlKey: true })); // copy
      handler(pressKey('v', { ctrlKey: true })); // paste

      const elements = store.getState().document.elements;

      expect(elements).toHaveLength(2);

      const pasted = elements[1];

      expect(pasted?.position).toEqual({ x: 50, y: 80 });
    });

    /** @description Duplicate creates element at same position in one step. */
    it('duplicate creates element at same position', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 50, y: 80 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('d', { ctrlKey: true })); // duplicate

      const elements = store.getState().document.elements;

      expect(elements).toHaveLength(2);
      expect(elements[1]?.position).toEqual({ x: 50, y: 80 });
    });

    /** @description Copy on one page and paste on another page succeeds. */
    it('cross-page paste works', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 50, y: 80 } })]);

      store.getState().loadTemplate(doc);
      store.getState().addPage();
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('c', { ctrlKey: true })); // copy on page 0
      store.getState().switchPage(1); // switch to page 1
      handler(pressKey('v', { ctrlKey: true })); // paste on page 1

      // Paste adds elements to the document-level elements array
      expect(store.getState().document.elements).toHaveLength(2);
    });

    /** @description A new copy replaces previous clipboard content. */
    it('second copy replaces clipboard', () => {
      const store = createEditorStore();
      const doc = makeDocument([
        makeElement('a', { position: { x: 10, y: 10 } }),
        makeElement('b', { position: { x: 20, y: 20 } }),
      ]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('c', { ctrlKey: true })); // copy A

      store.getState().selectElement('b');
      handler(pressKey('c', { ctrlKey: true })); // copy B (replaces A)

      handler(pressKey('v', { ctrlKey: true })); // paste → B clone

      const elements = store.getState().document.elements;

      expect(elements).toHaveLength(3);
      expect(elements[2]?.position).toEqual({ x: 20, y: 20 });
    });

    /** @description Cut removes original and clipboard holds it for paste. */
    it('cut removes element and allows paste', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 30, y: 40 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('x', { ctrlKey: true })); // cut
      expect(store.getState().document.elements).toHaveLength(0);

      handler(pressKey('v', { ctrlKey: true })); // paste
      expect(store.getState().document.elements).toHaveLength(1);
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 30, y: 40 });
    });

    /** @description Paste with empty clipboard is a no-op. */
    it('paste with empty clipboard is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('v', { ctrlKey: true }));
      expect(store.getState().document.elements).toHaveLength(1);
    });
  });

  // =========================================================================
  // Delete Action
  // =========================================================================
  describe('Delete Action', () => {
    /** @description Delete key removes selected element. */
    it('Delete key removes selected element', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('Delete'));
      expect(store.getState().document.elements).toHaveLength(0);
      expect(store.getState().activeElementIds).toHaveLength(0);
    });

    /** @description Backspace key also removes selected element. */
    it('Backspace key removes selected element', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('Backspace'));
      expect(store.getState().document.elements).toHaveLength(0);
    });

    /** @description Delete with no selection is a no-op. */
    it('delete with no selection is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('Delete'));
      expect(store.getState().document.elements).toHaveLength(1);
    });
  });

  // =========================================================================
  // Select All
  // =========================================================================
  describe('Select All', () => {
    /** @description Ctrl+A selects every element on the active page. */
    it('selects all elements on active page', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b'), makeElement('c')]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('a', { ctrlKey: true }));
      expect(store.getState().activeElementIds).toEqual(['a', 'b', 'c']);
    });
  });

  // =========================================================================
  // Group and Ungroup Shortcuts
  // =========================================================================
  describe('Group and Ungroup Shortcuts', () => {
    /** @description Ctrl+G groups multi-selected elements. */
    it('Ctrl+G groups multi-selected elements', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b')]);

      store.getState().loadTemplate(doc);
      store.getState().setActiveElements(['a', 'b']);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('g', { ctrlKey: true }));

      const elements = store.getState().document.elements;

      expect(elements[0]?.groupId).toBeDefined();
      expect(elements[0]?.groupId).toBe(elements[1]?.groupId);
    });

    /** @description Single selection Ctrl+G is a no-op. */
    it('Ctrl+G with single selection is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('g', { ctrlKey: true }));
      expect(store.getState().document.elements[0]?.groupId).toBeNull();
    });

    /** @description Ctrl+Shift+G ungroups. */
    it('Ctrl+Shift+G ungroups elements', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b')]);

      store.getState().loadTemplate(doc);
      store.getState().setActiveElements(['a', 'b']);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('g', { ctrlKey: true })); // group first
      expect(store.getState().document.elements[0]?.groupId).not.toBeNull();

      handler(pressKey('g', { ctrlKey: true, shiftKey: true })); // ungroup
      expect(store.getState().document.elements[0]?.groupId).toBeNull();
      expect(store.getState().document.elements[1]?.groupId).toBeNull();
    });
  });

  // =========================================================================
  // Undo and Redo Shortcuts
  // =========================================================================
});
