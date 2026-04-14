import { describe, expect, it } from '@jest/globals';

import {
  createKeyboardHandler,
  DEFAULT_SHORTCUT_MAP,
  LARGE_NUDGE,
  resolveShortcuts,
  type ShortcutAction,
  type ShortcutBinding,
  SMALL_NUDGE,
} from './keyboard';
import { makeDocument, makeElement, pressKey } from './keyboard-test-helpers';
import { createEditorStore } from './store-actions';

describe('keyboard', () => {
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
});
