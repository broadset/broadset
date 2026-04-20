import { describe, expect, it, vi } from 'vitest';

import { createKeyboardHandler, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from './keyboard';
import { makeDocument, makeElement, pressKey } from './keyboard-test-helpers';
import { createEditorStore } from './store-actions';

describe('keyboard', () => {
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
      const onSave = vi.fn();
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

      expect(() => { handler(pressKey('s', { ctrlKey: true })); }).not.toThrow();
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
