import type { BroadsetElement } from '@broadset/model';

import type { EditorStore } from './store-actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Zoom step per keyboard shortcut press (10 percentage points). */
export const ZOOM_STEP = 0.1;

/** Minimum allowed zoom level. */
export const ZOOM_MIN = 0.1;

/** Maximum allowed zoom level. */
export const ZOOM_MAX = 4.0;

/** Small nudge distance in canvas units (1 mm). */
export const SMALL_NUDGE = 1;

/** Large nudge distance in canvas units (10 mm). */
export const LARGE_NUDGE = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ShortcutAction =
  | 'delete'
  | 'undo'
  | 'redo'
  | 'save'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'selectAll'
  | 'group'
  | 'ungroup'
  | 'toggleLock'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'nudgeUp'
  | 'nudgeDown'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeLargeUp'
  | 'nudgeLargeDown'
  | 'nudgeLargeLeft'
  | 'nudgeLargeRight'
  | 'layerForward'
  | 'layerBackward'
  | 'layerFront'
  | 'layerBack';

export interface ShortcutBinding {
  readonly key: string;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
  readonly metaKey?: boolean;
}

export type ShortcutMap = Readonly<Record<ShortcutAction, ShortcutBinding>>;

// ---------------------------------------------------------------------------
// Default shortcut map
// ---------------------------------------------------------------------------

export const DEFAULT_SHORTCUT_MAP: ShortcutMap = {
  delete: { key: 'Delete' },
  undo: { key: 'z', ctrlKey: true },
  redo: { key: 'y', ctrlKey: true },
  save: { key: 's', ctrlKey: true },
  copy: { key: 'c', ctrlKey: true },
  cut: { key: 'x', ctrlKey: true },
  paste: { key: 'v', ctrlKey: true },
  duplicate: { key: 'd', ctrlKey: true },
  selectAll: { key: 'a', ctrlKey: true },
  group: { key: 'g', ctrlKey: true },
  ungroup: { key: 'g', ctrlKey: true, shiftKey: true },
  toggleLock: { key: 'l', ctrlKey: true, shiftKey: true },
  zoomIn: { key: '=', ctrlKey: true },
  zoomOut: { key: '-', ctrlKey: true },
  zoomReset: { key: '0', ctrlKey: true },
  nudgeUp: { key: 'ArrowUp' },
  nudgeDown: { key: 'ArrowDown' },
  nudgeLeft: { key: 'ArrowLeft' },
  nudgeRight: { key: 'ArrowRight' },
  nudgeLargeUp: { key: 'ArrowUp', shiftKey: true },
  nudgeLargeDown: { key: 'ArrowDown', shiftKey: true },
  nudgeLargeLeft: { key: 'ArrowLeft', shiftKey: true },
  nudgeLargeRight: { key: 'ArrowRight', shiftKey: true },
  layerForward: { key: ']' },
  layerBackward: { key: '[' },
  layerFront: { key: ']', ctrlKey: true },
  layerBack: { key: '[', ctrlKey: true },
};

/**
 * Also treat Backspace as an alias for the delete binding.
 * This is not in the shortcut map because it shares the same action.
 */
const DELETE_ALIAS_KEY = 'Backspace';

/**
 * Alternative redo binding: Ctrl+Shift+Z.
 * Handled as a special case because the shortcut map has exactly one binding per action.
 */
const REDO_ALT_BINDING: ShortcutBinding = { key: 'z', ctrlKey: true, shiftKey: true };

// ---------------------------------------------------------------------------
// Shortcut resolution
// ---------------------------------------------------------------------------

export function resolveShortcuts(
  defaults: ShortcutMap,
  overrides: Partial<Record<ShortcutAction, Partial<ShortcutBinding>>>,
): ShortcutMap {
  const result = { ...defaults };

  for (const action of Object.keys(overrides) as ShortcutAction[]) {
    const override = overrides[action];

    if (override !== undefined) {
      result[action] = {
        ...defaults[action],
        ...override,
      };
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Binding matching
// ---------------------------------------------------------------------------

function bindingMatches(binding: ShortcutBinding, event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== binding.key.toLowerCase()) {
    return false;
  }

  const wantCtrl = binding.ctrlKey === true;
  const wantShift = binding.shiftKey === true;
  const wantAlt = binding.altKey === true;
  const wantMeta = binding.metaKey === true;

  // Exact modifier matching: each specified modifier must be active and no
  // unspecified modifiers may be active. ctrlKey and metaKey are compared
  // independently (no aliasing).
  return (
    event.ctrlKey === wantCtrl && event.shiftKey === wantShift && event.altKey === wantAlt && event.metaKey === wantMeta
  );
}

function findAction(shortcuts: ShortcutMap, event: KeyboardEvent): ShortcutAction | null {
  // Check alternative redo binding first (Ctrl+Shift+Z)
  if (bindingMatches(REDO_ALT_BINDING, event)) {
    return 'redo';
  }

  // Check Backspace alias for delete
  if (event.key === DELETE_ALIAS_KEY && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    return 'delete';
  }

  for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
    if (bindingMatches(shortcuts[action], event)) {
      return action;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Clipboard (internal fallback + Clipboard API primary)
// ---------------------------------------------------------------------------

function cloneElement(element: BroadsetElement): BroadsetElement {
  return {
    ...element,
    id: crypto.randomUUID(),
  };
}

function serializeClipboard(elements: readonly BroadsetElement[]): string {
  return JSON.stringify(elements);
}

async function writeToSystemClipboard(elements: readonly BroadsetElement[]): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && 'clipboard' in navigator) {
      await navigator.clipboard.writeText(serializeClipboard(elements));
    }
  } catch {
    // Clipboard API denied or unavailable — internal fallback already set
  }
}

function pasteElements(store: EditorStore, elements: readonly BroadsetElement[]): void {
  const newIds: string[] = [];

  for (const element of elements) {
    const cloned = cloneElement(element);

    store.getState().addElement(cloned);
    newIds.push(cloned.id);
  }

  store.getState().setActiveElements(newIds);
}

// ---------------------------------------------------------------------------
// Keyboard handler configuration
// ---------------------------------------------------------------------------

export interface KeyboardHandlerConfig {
  readonly shortcuts?: Partial<Record<ShortcutAction, Partial<ShortcutBinding>>>;
  readonly onSave?: (document: unknown) => void;
}

// ---------------------------------------------------------------------------
// Handler type with destroy method
// ---------------------------------------------------------------------------

export interface KeyboardHandler {
  (event: KeyboardEvent): void;
  readonly destroy: () => void;
}

// ---------------------------------------------------------------------------
// Create handler
// ---------------------------------------------------------------------------

export function createKeyboardHandler(store: EditorStore, config: KeyboardHandlerConfig): KeyboardHandler {
  const shortcuts = resolveShortcuts(DEFAULT_SHORTCUT_MAP, config.shortcuts ?? {});
  let clipboard: readonly BroadsetElement[] = [];

  function dispatchNudge(action: ShortcutAction, state: ReturnType<typeof store.getState>): void {
    if (state.activeElementIds.length === 0) {
      return;
    }

    const isLarge = action.startsWith('nudgeLarge');
    const step = isLarge ? LARGE_NUDGE : SMALL_NUDGE;
    const direction = action.replace('nudgeLarge', '').replace('nudge', '');
    const lowerDir = direction.toLowerCase();
    let dx = 0;
    let dy = 0;

    if (lowerDir === 'up') {
      dy = -step;
    } else if (lowerDir === 'down') {
      dy = step;
    } else if (lowerDir === 'left') {
      dx = -step;
    } else if (lowerDir === 'right') {
      dx = step;
    }

    const updates = state.activeElementIds
      .map((elementId) => {
        const element = state.document.elements.find((e) => e.id === elementId);

        if (element === undefined) {
          return null;
        }

        return {
          elementId,
          position: {
            x: element.position.x + dx,
            y: element.position.y + dy,
          },
        };
      })
      .filter((update): update is NonNullable<typeof update> => update !== null);

    if (updates.length > 0) {
      state.commitGroupMove(updates);
    }
  }

  function dispatchLayerReorder(action: ShortcutAction, state: ReturnType<typeof store.getState>): void {
    if (state.activeElementIds.length === 0) {
      return;
    }

    const directionMap: Record<string, 'forward' | 'backward' | 'front' | 'back'> = {
      layerForward: 'forward',
      layerBackward: 'backward',
      layerFront: 'front',
      layerBack: 'back',
    };

    const dir = directionMap[action];

    if (dir === undefined) {
      return;
    }

    for (const elementId of state.activeElementIds) {
      state.reorderElement(elementId, dir);
    }
  }

  const NUDGE_ACTIONS = new Set<ShortcutAction>([
    'nudgeUp',
    'nudgeDown',
    'nudgeLeft',
    'nudgeRight',
    'nudgeLargeUp',
    'nudgeLargeDown',
    'nudgeLargeLeft',
    'nudgeLargeRight',
  ]);

  const LAYER_ACTIONS = new Set<ShortcutAction>(['layerForward', 'layerBackward', 'layerFront', 'layerBack']);

  function dispatch(action: ShortcutAction): void {
    const state = store.getState();

    if (NUDGE_ACTIONS.has(action)) {
      dispatchNudge(action, state);

      return;
    }

    if (LAYER_ACTIONS.has(action)) {
      dispatchLayerReorder(action, state);

      return;
    }

    switch (action) {
      case 'delete': {
        for (const elementId of state.activeElementIds) {
          state.removeElement(elementId);
        }

        state.selectElement(null);
        break;
      }

      case 'undo': {
        state.undo();
        break;
      }

      case 'redo': {
        state.redo();
        break;
      }

      case 'save': {
        if (config.onSave !== undefined) {
          config.onSave(state.getDocument());
        }

        break;
      }

      case 'copy': {
        const selectedIds = new Set(state.activeElementIds);

        clipboard = state.document.elements.filter((element) => selectedIds.has(element.id));
        void writeToSystemClipboard(clipboard);
        break;
      }

      case 'cut': {
        const selectedIds = new Set(state.activeElementIds);

        clipboard = state.document.elements.filter((element) => selectedIds.has(element.id));
        void writeToSystemClipboard(clipboard);

        for (const elementId of state.activeElementIds) {
          state.removeElement(elementId);
        }

        state.selectElement(null);
        break;
      }

      case 'paste': {
        if (clipboard.length === 0) {
          return;
        }

        pasteElements(store, clipboard);
        break;
      }

      case 'duplicate': {
        const selectedIds = new Set(state.activeElementIds);
        const toDuplicate = state.document.elements.filter((element) => selectedIds.has(element.id));

        if (toDuplicate.length === 0) {
          return;
        }

        pasteElements(store, toDuplicate);
        break;
      }

      case 'selectAll': {
        const allIds = state.document.elements.map((element) => element.id);

        state.setActiveElements(allIds);
        break;
      }

      case 'group': {
        state.groupElements();
        break;
      }

      case 'ungroup': {
        state.ungroupElements();
        break;
      }

      case 'toggleLock': {
        for (const elementId of state.activeElementIds) {
          state.toggleLock(elementId);
        }

        break;
      }

      case 'zoomIn': {
        const currentZoom = state.canvasSettings.zoom;

        if (currentZoom >= ZOOM_MAX) {
          return;
        }

        const nextZoom = Math.min(ZOOM_MAX, Math.round((currentZoom + ZOOM_STEP) * 100) / 100);

        state.updateCanvasSettings({ zoom: nextZoom });
        break;
      }

      case 'zoomOut': {
        const currentZoom = state.canvasSettings.zoom;

        if (currentZoom <= ZOOM_MIN) {
          return;
        }

        const nextZoom = Math.max(ZOOM_MIN, Math.round((currentZoom - ZOOM_STEP) * 100) / 100);

        state.updateCanvasSettings({ zoom: nextZoom });
        break;
      }

      case 'zoomReset': {
        state.updateCanvasSettings({ zoom: 1.0 });
        break;
      }
    }
  }

  const handler: KeyboardHandler = Object.assign(
    (event: KeyboardEvent): void => {
      const action = findAction(shortcuts, event);

      if (action === null) {
        return;
      }

      event.preventDefault();
      dispatch(action);
    },
    {
      destroy(): void {
        clipboard = [];
      },
    },
  );

  return handler;
}
