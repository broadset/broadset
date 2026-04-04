import type { BroadsetElement } from '@broadset/model';

import type { EditorStore } from './store-actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Small nudge step in mm (1 mm). */
export const NUDGE_SMALL_MM = 1;

/** Large nudge step in mm (10 mm). */
export const NUDGE_LARGE_MM = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * All keyboard shortcut actions the editor supports.
 * Each action has a default key binding in DEFAULT_SHORTCUT_MAP.
 */
export type ShortcutAction =
  | 'nudge-up'
  | 'nudge-down'
  | 'nudge-left'
  | 'nudge-right'
  | 'nudge-up-large'
  | 'nudge-down-large'
  | 'nudge-left-large'
  | 'nudge-right-large'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'select-all'
  | 'toggle-lock'
  | 'layer-forward'
  | 'layer-backward'
  | 'layer-front'
  | 'layer-back'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'group'
  | 'ungroup';

export interface ShortcutModifiers {
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly meta?: boolean;
}

export interface ShortcutBinding {
  readonly key: string;
  readonly modifiers?: ShortcutModifiers;
  readonly label: string;
}

export type ShortcutMap = Record<ShortcutAction, ShortcutBinding>;

// ---------------------------------------------------------------------------
// Default bindings
// ---------------------------------------------------------------------------

export const DEFAULT_SHORTCUT_MAP: ShortcutMap = {
  'nudge-up': { key: 'ArrowUp', label: '↑' },
  'nudge-down': { key: 'ArrowDown', label: '↓' },
  'nudge-left': { key: 'ArrowLeft', label: '←' },
  'nudge-right': { key: 'ArrowRight', label: '→' },
  'nudge-up-large': { key: 'ArrowUp', modifiers: { shift: true }, label: 'Shift+↑' },
  'nudge-down-large': { key: 'ArrowDown', modifiers: { shift: true }, label: 'Shift+↓' },
  'nudge-left-large': { key: 'ArrowLeft', modifiers: { shift: true }, label: 'Shift+←' },
  'nudge-right-large': { key: 'ArrowRight', modifiers: { shift: true }, label: 'Shift+→' },
  copy: { key: 'c', modifiers: { ctrl: true }, label: 'Ctrl+C' },
  paste: { key: 'v', modifiers: { ctrl: true }, label: 'Ctrl+V' },
  duplicate: { key: 'd', modifiers: { ctrl: true }, label: 'Ctrl+D' },
  delete: { key: 'Delete', label: 'Delete' },
  'select-all': { key: 'a', modifiers: { ctrl: true }, label: 'Ctrl+A' },
  'toggle-lock': { key: 'l', modifiers: { ctrl: true }, label: 'Ctrl+L' },
  'layer-forward': { key: ']', modifiers: { ctrl: true }, label: 'Ctrl+]' },
  'layer-backward': { key: '[', modifiers: { ctrl: true }, label: 'Ctrl+[' },
  'layer-front': { key: ']', modifiers: { ctrl: true, shift: true }, label: 'Ctrl+Shift+]' },
  'layer-back': { key: '[', modifiers: { ctrl: true, shift: true }, label: 'Ctrl+Shift+[' },
  undo: { key: 'z', modifiers: { ctrl: true }, label: 'Ctrl+Z' },
  redo: { key: 'y', modifiers: { ctrl: true }, label: 'Ctrl+Y' },
  'zoom-in': { key: '=', modifiers: { ctrl: true }, label: 'Ctrl+=' },
  'zoom-out': { key: '-', modifiers: { ctrl: true }, label: 'Ctrl+-' },
  'zoom-reset': { key: '0', modifiers: { ctrl: true }, label: 'Ctrl+0' },
  group: { key: 'g', modifiers: { ctrl: true }, label: 'Ctrl+G' },
  ungroup: { key: 'g', modifiers: { ctrl: true, shift: true }, label: 'Ctrl+Shift+G' },
};

/**
 * Additional key aliases that map to existing actions (e.g. Backspace → delete).
 * These are applied after the primary map so they don't conflict.
 */
const ADDITIONAL_BINDINGS: ReadonlyArray<{
  readonly action: ShortcutAction;
  readonly binding: ShortcutBinding;
}> = [{ action: 'delete', binding: { key: 'Backspace', label: 'Backspace' } }];

// ---------------------------------------------------------------------------
// Resolution and matching
// ---------------------------------------------------------------------------

/**
 * Merge host overrides into the default shortcut map.
 * Only the actions present in the overrides object are replaced.
 */
export function resolveShortcuts(overrides: Partial<Record<ShortcutAction, ShortcutBinding>>): ShortcutMap {
  return { ...DEFAULT_SHORTCUT_MAP, ...overrides };
}

interface ResolvedEntry {
  readonly action: ShortcutAction;
  readonly binding: ShortcutBinding;
}

function buildLookup(map: ShortcutMap): readonly ResolvedEntry[] {
  const entries: ResolvedEntry[] = [];

  for (const [action, binding] of Object.entries(map) as ReadonlyArray<[ShortcutAction, ShortcutBinding]>) {
    entries.push({ action, binding });
  }

  for (const extra of ADDITIONAL_BINDINGS) {
    entries.push(extra);
  }

  return entries;
}

function modifiersMatch(binding: ShortcutModifiers | undefined, event: ShortcutModifiers): boolean {
  const ctrl = binding?.ctrl ?? false;
  const shift = binding?.shift ?? false;
  const alt = binding?.alt ?? false;
  const meta = binding?.meta ?? false;

  return (
    ctrl === (event.ctrl ?? false) &&
    shift === (event.shift ?? false) &&
    alt === (event.alt ?? false) &&
    meta === (event.meta ?? false)
  );
}

/**
 * Given a resolved shortcut map and key event details, return the matching action or null.
 * More-specific bindings (with more modifiers) are checked first to avoid
 * ambiguity between e.g. ArrowUp and Shift+ArrowUp.
 */
export function matchShortcut(map: ShortcutMap, key: string, modifiers: ShortcutModifiers): ShortcutAction | null {
  const entries = buildLookup(map);

  // Sort by specificity: more modifiers first to avoid shadowing
  const sorted = [...entries].sort((a, b) => {
    const countMods = (m: ShortcutModifiers | undefined): number => {
      if (!m) return 0;

      return (m.ctrl ? 1 : 0) + (m.shift ? 1 : 0) + (m.alt ? 1 : 0) + (m.meta ? 1 : 0);
    };

    return countMods(b.binding.modifiers) - countMods(a.binding.modifiers);
  });

  for (const { action, binding } of sorted) {
    if (binding.key === key && modifiersMatch(binding.modifiers, modifiers)) {
      return action;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Internal clipboard (scoped to a keyboard module instance)
// ---------------------------------------------------------------------------

const clipboards = new WeakMap<EditorStore, readonly BroadsetElement[]>();

function getClipboard(store: EditorStore): readonly BroadsetElement[] {
  return clipboards.get(store) ?? [];
}

function setClipboard(store: EditorStore, elements: readonly BroadsetElement[]): void {
  clipboards.set(store, elements);
}

/**
 * Clear the clipboard for the given store.
 * Called when the editor is destroyed via loadTemplate.
 */
export function clearClipboard(store: EditorStore): void {
  clipboards.delete(store);
}

// ---------------------------------------------------------------------------
// Action dispatch
// ---------------------------------------------------------------------------

/**
 * Execute a shortcut action against the editor store.
 * This is the main entry point for keyboard-driven editing operations.
 */
export function handleShortcutAction(store: EditorStore, action: ShortcutAction): void {
  switch (action) {
    case 'nudge-up':
      nudgeElements(store, 0, -NUDGE_SMALL_MM);
      break;
    case 'nudge-down':
      nudgeElements(store, 0, NUDGE_SMALL_MM);
      break;
    case 'nudge-left':
      nudgeElements(store, -NUDGE_SMALL_MM, 0);
      break;
    case 'nudge-right':
      nudgeElements(store, NUDGE_SMALL_MM, 0);
      break;
    case 'nudge-up-large':
      nudgeElements(store, 0, -NUDGE_LARGE_MM);
      break;
    case 'nudge-down-large':
      nudgeElements(store, 0, NUDGE_LARGE_MM);
      break;
    case 'nudge-left-large':
      nudgeElements(store, -NUDGE_LARGE_MM, 0);
      break;
    case 'nudge-right-large':
      nudgeElements(store, NUDGE_LARGE_MM, 0);
      break;
    case 'copy':
      copyElements(store);
      break;
    case 'paste':
      pasteElements(store);
      break;
    case 'duplicate':
      copyElements(store);
      pasteElements(store);
      break;
    case 'delete':
      deleteSelected(store);
      break;
    case 'select-all':
      selectAll(store);
      break;
    case 'toggle-lock':
      toggleLockSelected(store);
      break;
    case 'layer-forward':
      reorderSelected(store, 'forward');
      break;
    case 'layer-backward':
      reorderSelected(store, 'backward');
      break;
    case 'layer-front':
      reorderSelected(store, 'front');
      break;
    case 'layer-back':
      reorderSelected(store, 'back');
      break;
    case 'undo':
      store.getState().undo();
      break;
    case 'redo':
      store.getState().redo();
      break;
    case 'zoom-in':
    case 'zoom-out':
    case 'zoom-reset':
      // Zoom actions are handled at the UI/demo layer
      break;
    case 'group':
      store.getState().groupElements();
      break;
    case 'ungroup':
      store.getState().ungroupElements();
      break;
  }
}

// ---------------------------------------------------------------------------
// Action implementations
// ---------------------------------------------------------------------------

function nudgeElements(store: EditorStore, dx: number, dy: number): void {
  const state = store.getState();
  const { activeElementIds, activePageIndex } = state;
  const page = state.document.pages[activePageIndex];

  if (!page || activeElementIds.length === 0) return;

  const updates: Array<{
    readonly elementId: string;
    readonly position: { readonly x: number; readonly y: number };
  }> = [];

  for (const elementId of activeElementIds) {
    const el = page.elements.find((e) => e.id === elementId);

    if (!el) continue;

    updates.push({
      elementId,
      position: { x: el.position.x + dx, y: el.position.y + dy },
    });
  }

  if (updates.length > 0) {
    store.getState().commitGroupMove(updates);
  }
}

function copyElements(store: EditorStore): void {
  const state = store.getState();
  const { activeElementIds, activePageIndex } = state;
  const page = state.document.pages[activePageIndex];

  if (!page || activeElementIds.length === 0) return;

  const selectedIds = new Set(activeElementIds);
  const elements = page.elements.filter((e) => selectedIds.has(e.id));

  setClipboard(
    store,
    elements.map((e) => JSON.parse(JSON.stringify(e)) as BroadsetElement),
  );
}

function pasteElements(store: EditorStore): void {
  const clipboard = getClipboard(store);

  if (clipboard.length === 0) return;

  const state = store.getState();
  const { activePageIndex } = state;
  const page = state.document.pages[activePageIndex];

  if (!page) return;

  const newElements: BroadsetElement[] = clipboard.map((el) => ({
    ...(JSON.parse(JSON.stringify(el)) as BroadsetElement),
    id: crypto.randomUUID(),
  }));

  const newElementIds = newElements.map((e) => e.id);

  store.setState({
    document: {
      ...state.document,
      pages: state.document.pages.map((p, i) =>
        i === activePageIndex ? { ...p, elements: [...p.elements, ...newElements] } : p,
      ),
    },
    activeElementIds: newElementIds,
  });
}

function deleteSelected(store: EditorStore): void {
  const state = store.getState();
  const { activeElementIds } = state;

  for (const id of [...activeElementIds]) {
    store.getState().removeElement(id);
  }
}

function selectAll(store: EditorStore): void {
  const state = store.getState();
  const page = state.document.pages[state.activePageIndex];

  if (!page) return;

  store.setState({
    activeElementIds: page.elements.map((e) => e.id),
  });
}

function toggleLockSelected(store: EditorStore): void {
  const state = store.getState();

  for (const id of state.activeElementIds) {
    store.getState().toggleLock(id);
  }
}

function reorderSelected(store: EditorStore, direction: 'forward' | 'backward' | 'front' | 'back'): void {
  const state = store.getState();

  for (const id of state.activeElementIds) {
    store.getState().reorderElement(id, direction);
  }
}
