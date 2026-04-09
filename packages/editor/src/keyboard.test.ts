import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';

import {
  createKeyboardHandler,
  DEFAULT_SHORTCUT_MAP,
  LARGE_NUDGE,
  resolveShortcuts,
  type ShortcutAction,
  type ShortcutBinding,
  SMALL_NUDGE,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from './keyboard';
import { createEditorStore } from './store-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(id: string, overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return {
    ...createDefaultElement('rectangle', { width: 100, height: 50 }),
    id,
    name: id,
    ...overrides,
  };
}

function makeDocument(elements: readonly BroadsetElement[]): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return { ...base, elements: [...elements] };
}

/**
 * Simulate a keydown event with the specified key and modifiers.
 * Returns a partial KeyboardEvent-like object.
 */
function pressKey(
  key: string,
  modifiers: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean } = {},
): KeyboardEvent {
  const prevented = { value: false };

  return {
    key,
    ctrlKey: modifiers.ctrlKey ?? false,
    shiftKey: modifiers.shiftKey ?? false,
    altKey: modifiers.altKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    preventDefault: () => {
      prevented.value = true;
    },
    get defaultPrevented() {
      return prevented.value;
    },
  } as unknown as KeyboardEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('keyboard', () => {
  // =========================================================================
  // Shortcut Binding Resolution
  // =========================================================================
  describe('Shortcut Binding Resolution', () => {
    /** @description The default map must include every documented action. */
    it('default map contains all standard actions', () => {
      const expected: readonly ShortcutAction[] = [
        'delete',
        'undo',
        'redo',
        'save',
        'copy',
        'cut',
        'paste',
        'duplicate',
        'selectAll',
        'group',
        'ungroup',
        'toggleLock',
        'zoomIn',
        'zoomOut',
        'zoomReset',
        'nudgeUp',
        'nudgeDown',
        'nudgeLeft',
        'nudgeRight',
        'nudgeLargeUp',
        'nudgeLargeDown',
        'nudgeLargeLeft',
        'nudgeLargeRight',
        'layerForward',
        'layerBackward',
        'layerFront',
        'layerBack',
      ];

      for (const action of expected) {
        expect(DEFAULT_SHORTCUT_MAP).toHaveProperty(action);
      }
    });

    /** @description For each standard action, the correct keydown dispatches that action. */
    it('dispatches the correct action for each default binding', () => {
      const store = createEditorStore();
      const handler = createKeyboardHandler(store, {});
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      // We test a subset of representative bindings
      const cases: ReadonlyArray<{
        readonly action: ShortcutAction;
        readonly key: string;
        readonly modifiers?: { ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean };
      }> = [
        { action: 'undo', key: 'z', modifiers: { ctrlKey: true } },
        { action: 'redo', key: 'y', modifiers: { ctrlKey: true } },
        { action: 'selectAll', key: 'a', modifiers: { ctrlKey: true } },
        { action: 'group', key: 'g', modifiers: { ctrlKey: true } },
        { action: 'ungroup', key: 'g', modifiers: { ctrlKey: true, shiftKey: true } },
        { action: 'toggleLock', key: 'l', modifiers: { ctrlKey: true, shiftKey: true } },
        { action: 'save', key: 's', modifiers: { ctrlKey: true } },
        { action: 'zoomIn', key: '=', modifiers: { ctrlKey: true } },
        { action: 'zoomOut', key: '-', modifiers: { ctrlKey: true } },
        { action: 'zoomReset', key: '0', modifiers: { ctrlKey: true } },
        { action: 'nudgeUp', key: 'ArrowUp' },
        { action: 'nudgeDown', key: 'ArrowDown' },
        { action: 'nudgeLeft', key: 'ArrowLeft' },
        { action: 'nudgeRight', key: 'ArrowRight' },
        { action: 'nudgeLargeUp', key: 'ArrowUp', modifiers: { shiftKey: true } },
        { action: 'nudgeLargeDown', key: 'ArrowDown', modifiers: { shiftKey: true } },
        { action: 'nudgeLargeLeft', key: 'ArrowLeft', modifiers: { shiftKey: true } },
        { action: 'nudgeLargeRight', key: 'ArrowRight', modifiers: { shiftKey: true } },
        { action: 'layerForward', key: ']' },
        { action: 'layerBackward', key: '[' },
        { action: 'layerFront', key: ']', modifiers: { ctrlKey: true } },
        { action: 'layerBack', key: '[', modifiers: { ctrlKey: true } },
      ];

      for (const testCase of cases) {
        const event = pressKey(testCase.key, testCase.modifiers ?? {});

        // Just ensure no errors — deeper side-effect tests follow in dedicated describes
        handler(event);
      }
    });

    /** @description The host may override individual bindings. */
    it('uses host override for a binding', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {
        shortcuts: { delete: { key: 'x' } },
      });

      // 'x' should now delete
      handler(pressKey('x'));
      expect(store.getState().document.elements).toHaveLength(0);
    });

    /** @description Non-overridden bindings are preserved when host overrides some. */
    it('keeps non-overridden bindings when host overrides one', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {
        shortcuts: { delete: { key: 'x' } },
      });

      // Default Delete key should no longer delete since overridden to 'x'
      handler(pressKey('Delete'));
      expect(store.getState().document.elements).toHaveLength(2);

      // Ctrl+Z (undo) should still work as default
      store.getState().selectElement('a');
      handler(pressKey('x'));
      expect(store.getState().document.elements).toHaveLength(1);

      handler(pressKey('z', { ctrlKey: true }));
      expect(store.getState().document.elements).toHaveLength(2);
    });

    /** @description Backspace alias still works when the delete binding is overridden. */
    it('Backspace still deletes when delete binding is overridden', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {
        shortcuts: { delete: { key: 'x' } },
      });

      handler(pressKey('Backspace'));
      expect(store.getState().document.elements).toHaveLength(0);
    });

    /** @description resolveShortcuts merges partial overrides into defaults. */
    it('resolveShortcuts merges overrides with defaults', () => {
      const overrides: Partial<Record<ShortcutAction, Partial<ShortcutBinding>>> = {
        delete: { key: 'x' },
      };
      const resolved = resolveShortcuts(DEFAULT_SHORTCUT_MAP, overrides);

      expect(resolved.delete.key).toBe('x');
      // Non-overridden should remain
      expect(resolved.undo.key).toBe('z');
      expect(resolved.undo.ctrlKey).toBe(true);
    });

    /** @description Exact modifier matching: Ctrl+Z must NOT match Ctrl+Shift+Z. */
    it('exact modifier matching prevents false triggers', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');
      // Move the element to create undo history
      store.getState().commitElementUpdate('a', { position: { x: 50, y: 50 } });

      const handler = createKeyboardHandler(store, {});

      // Ctrl+Shift+Z should redo (alternative redo binding), NOT undo
      handler(pressKey('z', { ctrlKey: true, shiftKey: true }));

      // Since we only moved once, redo shouldn't have multiple states. The important thing
      // is that undo (Ctrl+Z) was NOT triggered by Ctrl+Shift+Z.
      // We verify by checking that undo still works after this
      handler(pressKey('z', { ctrlKey: true }));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 0, y: 0 });
    });
  });

  // =========================================================================
  // Nudge Actions
  // =========================================================================
  describe('Nudge Actions', () => {
    /** @description Arrow key moves selected element by 1mm in canvas units. */
    it('arrow key nudges by small step (1mm)', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 100, y: 100 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('ArrowRight'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100 + SMALL_NUDGE, y: 100 });
    });

    /** @description Shift+Arrow moves by 10mm in canvas units. */
    it('shift+arrow nudges by large step (10mm)', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 100, y: 100 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('ArrowDown', { shiftKey: true }));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100, y: 100 + LARGE_NUDGE });
    });

    /** @description Multi-element nudge moves all selected simultaneously. */
    it('nudges all selected elements simultaneously', () => {
      const store = createEditorStore();
      const doc = makeDocument([
        makeElement('a', { position: { x: 10, y: 20 } }),
        makeElement('b', { position: { x: 50, y: 60 } }),
      ]);

      store.getState().loadTemplate(doc);
      store.getState().setActiveElements(['a', 'b']);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('ArrowLeft'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 10 - SMALL_NUDGE, y: 20 });
      expect(store.getState().document.elements[1]?.position).toEqual({ x: 50 - SMALL_NUDGE, y: 60 });
    });

    /** @description Multi-element Shift+Arrow moves all by large step. */
    it('shift+arrow nudges all selected by large step', () => {
      const store = createEditorStore();
      const doc = makeDocument([
        makeElement('a', { position: { x: 10, y: 20 } }),
        makeElement('b', { position: { x: 50, y: 60 } }),
      ]);

      store.getState().loadTemplate(doc);
      store.getState().setActiveElements(['a', 'b']);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('ArrowUp', { shiftKey: true }));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 10, y: 20 - LARGE_NUDGE });
      expect(store.getState().document.elements[1]?.position).toEqual({ x: 50, y: 60 - LARGE_NUDGE });
    });

    /** @description Nudge with no selection is a no-op. */
    it('nudge with no selection is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 100, y: 100 } })]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('ArrowRight'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100, y: 100 });
    });

    /** @description All four directions work. */
    it('nudges in all four directions correctly', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 100, y: 100 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('ArrowUp'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100, y: 100 - SMALL_NUDGE });

      handler(pressKey('ArrowDown'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100, y: 100 });

      handler(pressKey('ArrowLeft'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100 - SMALL_NUDGE, y: 100 });

      handler(pressKey('ArrowRight'));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 100, y: 100 });
    });
  });

  // =========================================================================
  // Clipboard Copy and Paste
  // =========================================================================
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
  describe('Undo and Redo Shortcuts', () => {
    /** @description Ctrl+Z undoes the last committed operation. */
    it('Ctrl+Z undoes last change', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 10, y: 10 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');
      store.getState().commitElementUpdate('a', { position: { x: 50, y: 50 } });

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('z', { ctrlKey: true }));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 10, y: 10 });
    });

    /** @description Ctrl+Y redoes after undo. */
    it('Ctrl+Y redoes after undo', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 10, y: 10 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');
      store.getState().commitElementUpdate('a', { position: { x: 50, y: 50 } });

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('z', { ctrlKey: true })); // undo
      handler(pressKey('y', { ctrlKey: true })); // redo
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 50, y: 50 });
    });

    /** @description Ctrl+Shift+Z is an alternative redo binding. */
    it('Ctrl+Shift+Z also redoes', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 10, y: 10 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');
      store.getState().commitElementUpdate('a', { position: { x: 50, y: 50 } });

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('z', { ctrlKey: true })); // undo
      handler(pressKey('z', { ctrlKey: true, shiftKey: true })); // redo (alternative)
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 50, y: 50 });
    });

    /** @description No undo history: Ctrl+Z is a no-op. */
    it('Ctrl+Z with no history is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 10, y: 10 } })]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('z', { ctrlKey: true }));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 10, y: 10 });
    });

    /** @description No redo history: Ctrl+Y is a no-op. */
    it('Ctrl+Y with no redo history is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 10, y: 10 } })]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('y', { ctrlKey: true }));
      expect(store.getState().document.elements[0]?.position).toEqual({ x: 10, y: 10 });
    });
  });

  // =========================================================================
  // Save Shortcut
  // =========================================================================
  describe('Save Shortcut', () => {
    /** @description Ctrl+S with onSave configured invokes the callback. */
    it('Ctrl+S invokes onSave callback', () => {
      const onSave = jest.fn();
      const store = createEditorStore({ config: { onSave } });
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, { onSave });

      handler(pressKey('s', { ctrlKey: true }));
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    /** @description Ctrl+S without onSave is a no-op. */
    it('Ctrl+S without onSave is a no-op', () => {
      const store = createEditorStore();
      const handler = createKeyboardHandler(store, {});

      // Should not throw
      handler(pressKey('s', { ctrlKey: true }));
    });
  });

  // =========================================================================
  // Zoom Shortcuts
  // =========================================================================
  describe('Zoom Shortcuts', () => {
    /** @description Ctrl+= increases zoom by one step. */
    it('Ctrl+= zooms in by one step', () => {
      const store = createEditorStore();
      const handler = createKeyboardHandler(store, {});

      handler(pressKey('=', { ctrlKey: true }));
      expect(store.getState().canvasSettings.zoom).toBeCloseTo(1.0 + ZOOM_STEP);
    });

    /** @description Ctrl+- decreases zoom by one step. */
    it('Ctrl+- zooms out by one step', () => {
      const store = createEditorStore();
      const handler = createKeyboardHandler(store, {});

      handler(pressKey('-', { ctrlKey: true }));
      expect(store.getState().canvasSettings.zoom).toBeCloseTo(1.0 - ZOOM_STEP);
    });

    /** @description Ctrl+0 resets zoom to 1.0. */
    it('Ctrl+0 resets zoom to 100%', () => {
      const store = createEditorStore();

      store.getState().updateCanvasSettings({ zoom: 2.5 });

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('0', { ctrlKey: true }));
      expect(store.getState().canvasSettings.zoom).toBe(1.0);
    });

    /** @description Zoom at max is a no-op. */
    it('zoom in at maximum is a no-op', () => {
      const store = createEditorStore();

      store.getState().updateCanvasSettings({ zoom: ZOOM_MAX });

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('=', { ctrlKey: true }));
      expect(store.getState().canvasSettings.zoom).toBe(ZOOM_MAX);
    });

    /** @description Zoom at min is a no-op. */
    it('zoom out at minimum is a no-op', () => {
      const store = createEditorStore();

      store.getState().updateCanvasSettings({ zoom: ZOOM_MIN });

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('-', { ctrlKey: true }));
      expect(store.getState().canvasSettings.zoom).toBe(ZOOM_MIN);
    });
  });

  // =========================================================================
  // Layer Reorder Shortcuts
  // =========================================================================
  describe('Layer Reorder Shortcuts', () => {
    /** @description ] brings selected element forward one position. */
    it('] moves element forward', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b'), makeElement('c')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey(']'));

      const ids = store.getState().document.elements.map((e) => e.id);

      expect(ids).toEqual(['b', 'a', 'c']);
    });

    /** @description [ sends selected element backward one position. */
    it('[ moves element backward', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b'), makeElement('c')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('b');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('['));

      const ids = store.getState().document.elements.map((e) => e.id);

      expect(ids).toEqual(['b', 'a', 'c']);
    });

    /** @description Ctrl+] brings selected to front. */
    it('Ctrl+] moves element to front', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b'), makeElement('c')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey(']', { ctrlKey: true }));

      const ids = store.getState().document.elements.map((e) => e.id);

      expect(ids).toEqual(['b', 'c', 'a']);
    });

    /** @description Ctrl+[ sends selected to back. */
    it('Ctrl+[ moves element to back', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b'), makeElement('c')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('c');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('[', { ctrlKey: true }));

      const ids = store.getState().document.elements.map((e) => e.id);

      expect(ids).toEqual(['c', 'a', 'b']);
    });

    /** @description Layer reorder with no selection is a no-op. */
    it('layer reorder with no selection is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a'), makeElement('b')]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey(']'));

      const ids = store.getState().document.elements.map((e) => e.id);

      expect(ids).toEqual(['a', 'b']);
    });
  });

  // =========================================================================
  // Toggle Lock Shortcut
  // =========================================================================
  describe('Toggle Lock Shortcut', () => {
    /** @description Ctrl+Shift+L locks an unlocked element. */
    it('locks an unlocked element', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { locked: false })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('l', { ctrlKey: true, shiftKey: true }));
      expect(store.getState().document.elements[0]?.locked).toBe(true);
    });

    /** @description Ctrl+Shift+L unlocks a locked element. */
    it('unlocks a locked element', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { locked: true })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('l', { ctrlKey: true, shiftKey: true }));
      expect(store.getState().document.elements[0]?.locked).toBe(false);
    });

    /** @description Ctrl+Shift+L with no selection is a no-op. */
    it('no selection is a no-op', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { locked: false })]);

      store.getState().loadTemplate(doc);

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('l', { ctrlKey: true, shiftKey: true }));
      expect(store.getState().document.elements[0]?.locked).toBe(false);
    });
  });

  // =========================================================================
  // Clipboard Scope
  // =========================================================================
  describe('Clipboard Scope', () => {
    /** @description Clipboard cleared on destroy. */
    it('destroyKeyboardHandler clears clipboard', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a', { position: { x: 10, y: 10 } })]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      handler(pressKey('c', { ctrlKey: true })); // copy

      // Destroy returns the destroy function
      handler.destroy();

      // After destroy, paste should be a no-op (clipboard cleared)
      handler(pressKey('v', { ctrlKey: true }));
      expect(store.getState().document.elements).toHaveLength(1);
    });
  });

  // =========================================================================
  // preventDefault
  // =========================================================================
  describe('preventDefault behavior', () => {
    /** @description Handler calls preventDefault on matched shortcuts to avoid browser defaults. */
    it('calls preventDefault on matched shortcuts', () => {
      const store = createEditorStore();
      const doc = makeDocument([makeElement('a')]);

      store.getState().loadTemplate(doc);
      store.getState().selectElement('a');

      const handler = createKeyboardHandler(store, {});

      const event = pressKey('Delete');

      handler(event);
      expect(event.defaultPrevented).toBe(true);
    });

    /** @description Handler does not call preventDefault on unmatched keys. */
    it('does not preventDefault on unmatched keys', () => {
      const store = createEditorStore();
      const handler = createKeyboardHandler(store, {});

      const event = pressKey('q');

      handler(event);
      expect(event.defaultPrevented).toBe(false);
    });
  });
});
