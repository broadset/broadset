import type {
  AnimationRegistryEntry,
  AnimationUpdateChange,
  DocumentChange,
  ElementAnimationConfig,
} from '@broadset/model';

import type { EditorDocument, EditorPage } from './store-actions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Runtime animation fields on screen props that MUST be excluded from diffs.
 * These are ephemeral values managed by the playback engine, not document state.
 */
const RUNTIME_ANIMATION_FIELDS: ReadonlySet<string> = new Set(['visibility', 'activeState', 'modifiers']);

// ---------------------------------------------------------------------------
// Deep equality helper
// ---------------------------------------------------------------------------

/** Fast structural equality check for JSON-serializable values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;

    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }

    return true;
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Deep value setter
// ---------------------------------------------------------------------------

/**
 * Sets a value at a dot-separated path in a nested readonly object,
 * returning a shallow-cloned copy at each level.
 */
function setDeepValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');

  if (parts.length === 0) return obj;

  if (parts.length === 1) {
    const key = parts[0];

    if (key === undefined) return obj;

    return { ...obj, [key]: value };
  }

  const [head, ...rest] = parts;
  const headKey = head ?? '';
  const child = (obj[headKey] ?? {}) as Record<string, unknown>;

  return { ...obj, [headKey]: setDeepValue(child, rest.join('.'), value) };
}

// ---------------------------------------------------------------------------
// Element diffing helpers
// ---------------------------------------------------------------------------

/**
 * Filters out runtime animation fields from a screen props object for comparison.
 */
function stripRuntimeFields(screen: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!screen) return {};

  const stripped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(screen)) {
    if (!RUNTIME_ANIMATION_FIELDS.has(key)) {
      stripped[key] = value;
    }
  }

  return stripped;
}

/**
 * Compares two elements (ignoring runtime animation fields) and returns
 * the property paths that changed.
 */
function diffElement(prev: EditorPage['elements'][number], next: EditorPage['elements'][number]): readonly string[] {
  const changedPaths: string[] = [];

  // Compare top-level scalar/object fields
  const topLevelKeys: ReadonlyArray<keyof EditorPage['elements'][number]> = [
    'position',
    'width',
    'height',
    'rotation',
    'content',
    'parentId',
    'groupId',
    'type',
  ];

  for (const key of topLevelKeys) {
    if (!deepEqual(prev[key], next[key])) {
      changedPaths.push(key);
    }
  }

  // Compare style
  if (!deepEqual(prev.style, next.style)) {
    changedPaths.push('style');
  }

  // Compare screen (excluding runtime animation fields)
  const prevScreen = stripRuntimeFields(prev.screen as unknown as Record<string, unknown> | undefined);
  const nextScreen = stripRuntimeFields(next.screen as unknown as Record<string, unknown> | undefined);

  if (!deepEqual(prevScreen, nextScreen)) {
    changedPaths.push('screen');
  }

  return changedPaths;
}

// ---------------------------------------------------------------------------
// Document Diffing
// ---------------------------------------------------------------------------

/**
 * Produces a list of DocumentChange values representing the differences
 * between two EditorDocument snapshots. Runtime animation fields
 * (visibility, activeState, modifiers) are excluded.
 */
export function diffDocuments(prev: EditorDocument, next: EditorDocument): readonly DocumentChange[] {
  if (prev === next) return [];

  const changes: DocumentChange[] = [];

  // --- Canvas settings diff ---
  const canvasKeys: ReadonlyArray<keyof EditorDocument['canvas']> = ['width', 'height', 'padding'];

  for (const key of canvasKeys) {
    if (!deepEqual(prev.canvas[key], next.canvas[key])) {
      changes.push({
        type: 'settings:update',
        path: `canvas.${key}`,
        oldValue: prev.canvas[key],
        newValue: next.canvas[key],
      });
    }
  }

  // --- Page diff ---
  const prevPageCount = prev.pages.length;
  const nextPageCount = next.pages.length;

  // Detect page additions
  for (let i = prevPageCount; i < nextPageCount; i++) {
    changes.push({ type: 'page:add', pageIndex: i });
  }

  // Detect page removals
  for (let i = nextPageCount; i < prevPageCount; i++) {
    changes.push({ type: 'page:remove', pageIndex: i });
  }

  // --- Element diff (per shared page) ---
  const sharedPageCount = Math.min(prevPageCount, nextPageCount);

  for (let pageIndex = 0; pageIndex < sharedPageCount; pageIndex++) {
    const prevPage = prev.pages[pageIndex];
    const nextPage = next.pages[pageIndex];

    if (prevPage === undefined || nextPage === undefined) continue;

    const prevElementMap = new Map(prevPage.elements.map((el) => [el.id, el]));
    const nextElementMap = new Map(nextPage.elements.map((el) => [el.id, el]));

    // Removals
    for (const [id, element] of prevElementMap) {
      if (!nextElementMap.has(id)) {
        changes.push({
          type: 'element:remove',
          pageIndex,
          elementId: id,
          element: element as unknown as Record<string, unknown>,
        });
      }
    }

    // Additions
    for (const [id, element] of nextElementMap) {
      if (!prevElementMap.has(id)) {
        changes.push({
          type: 'element:add',
          pageIndex,
          elementId: id,
          element: element as unknown as Record<string, unknown>,
        });
      }
    }

    // Updates (existing elements)
    for (const [id, nextEl] of nextElementMap) {
      const prevEl = prevElementMap.get(id);

      if (!prevEl) continue;

      const changedPaths = diffElement(prevEl, nextEl);

      for (const path of changedPaths) {
        const prevValue = (prevEl as unknown as Record<string, unknown>)[path];
        const nextValue = (nextEl as unknown as Record<string, unknown>)[path];

        changes.push({
          type: 'element:update',
          pageIndex,
          elementId: id,
          path,
          oldValue: prevValue,
          newValue: nextValue,
        });
      }
    }

    // Reorder detection
    const prevIds = prevPage.elements.map((el) => el.id);
    const nextIds = nextPage.elements.map((el) => el.id);

    // Only detect reorder among elements present in both
    const commonPrevIds = prevIds.filter((id) => nextElementMap.has(id));
    const commonNextIds = nextIds.filter((id) => prevElementMap.has(id));

    if (commonPrevIds.length === commonNextIds.length && commonPrevIds.length > 0) {
      for (let i = 0; i < commonPrevIds.length; i++) {
        if (commonPrevIds[i] !== commonNextIds[i]) {
          const elementId = commonPrevIds[i];

          if (elementId === undefined) continue;

          const fromIndex = i;
          const toIndex = commonNextIds.indexOf(elementId);

          changes.push({
            type: 'element:reorder',
            pageIndex,
            elementId,
            fromIndex,
            toIndex,
          });
        }
      }
    }
  }

  // --- Animation registry diff ---
  const animChanges = diffAnimationRegistries(prev.animationRegistry, next.animationRegistry);

  changes.push(...animChanges);

  return changes;
}

// ---------------------------------------------------------------------------
// Animation Registry Diffing
// ---------------------------------------------------------------------------

/**
 * Compares two animation registries and returns a list of animation:update changes.
 */
export function diffAnimationRegistries(
  prev: readonly AnimationRegistryEntry[],
  next: readonly AnimationRegistryEntry[],
): readonly AnimationUpdateChange[] {
  if (prev === next) return [];

  const changes: AnimationUpdateChange[] = [];

  const prevMap = new Map(prev.map((entry) => [entry.elementId, entry.config]));
  const nextMap = new Map(next.map((entry) => [entry.elementId, entry.config]));

  // Additions and changes
  for (const [elementId, nextConfig] of nextMap) {
    const prevConfig = prevMap.get(elementId);

    if (!prevConfig) {
      // New config added
      changes.push({
        type: 'animation:update',
        elementId,
        path: 'config',
        oldValue: null,
        newValue: nextConfig,
      });
      continue;
    }

    // Check per-field changes
    const fields: ReadonlyArray<keyof ElementAnimationConfig> = [
      'timelines',
      'stateTimelineBindings',
      'modifierTimelineBindings',
    ];

    for (const field of fields) {
      if (!deepEqual(prevConfig[field], nextConfig[field])) {
        changes.push({
          type: 'animation:update',
          elementId,
          path: field,
          oldValue: prevConfig[field],
          newValue: nextConfig[field],
        });
      }
    }
  }

  // Removals
  for (const [elementId, prevConfig] of prevMap) {
    if (!nextMap.has(elementId)) {
      changes.push({
        type: 'animation:update',
        elementId,
        path: 'config',
        oldValue: prevConfig,
        newValue: null,
      });
    }
  }

  return changes;
}

// ---------------------------------------------------------------------------
// Change Stream Controller
// ---------------------------------------------------------------------------

export type ChangeListener = (changes: readonly DocumentChange[]) => void;

export interface ChangeStreamController {
  /** Subscribe to change batches. Returns an unsubscribe function. */
  readonly subscribe: (listener: ChangeListener) => () => void;
  /** Emit a batch of changes to all subscribers. Empty arrays are ignored. */
  readonly emit: (changes: readonly DocumentChange[]) => void;
  /** Suppress all emissions (for ephemeral operations like drag). */
  readonly suppress: () => void;
  /** Resume emissions after suppression. */
  readonly unsuppress: () => void;
}

/**
 * Creates a ChangeStreamController that manages subscription, emission,
 * and suppression of document change batches.
 */
export function createChangeStreamController(): ChangeStreamController {
  const listeners = new Set<ChangeListener>();
  let suppressed = false;

  return {
    subscribe(listener: ChangeListener): () => void {
      listeners.add(listener);

      return (): void => {
        listeners.delete(listener);
      };
    },

    emit(changes: readonly DocumentChange[]): void {
      if (changes.length === 0) return;
      if (suppressed) return;

      for (const listener of listeners) {
        listener(changes);
      }
    },

    suppress(): void {
      suppressed = true;
    },

    unsuppress(): void {
      suppressed = false;
    },
  };
}

// ---------------------------------------------------------------------------
// Remote Change Application
// ---------------------------------------------------------------------------

/**
 * Applies an array of remote DocumentChange values to an EditorDocument,
 * returning the updated document. Runtime animation fields (visibility,
 * activeState, modifiers) are ignored in element:update changes.
 */
export function applyRemoteChanges(doc: EditorDocument, changes: readonly DocumentChange[]): EditorDocument {
  let result = doc;

  for (const change of changes) {
    result = applySingleChange(result, change);
  }

  return result;
}

function applySingleChange(doc: EditorDocument, change: DocumentChange): EditorDocument {
  switch (change.type) {
    case 'element:add':
      return applyElementAdd(doc, change.pageIndex, change.element);

    case 'element:remove':
      return applyElementRemove(doc, change.pageIndex, change.elementId);

    case 'element:update':
      return applyElementUpdate(doc, change.pageIndex, change.elementId, change.path, change.newValue);

    case 'element:reorder':
      return applyElementReorder(doc, change.pageIndex, change.elementId, change.toIndex);

    case 'page:add':
      return applyPageAdd(doc, change.pageIndex);

    case 'page:remove':
      return applyPageRemove(doc, change.pageIndex);

    case 'settings:update':
      return applySettingsUpdate(doc, change.path, change.newValue);

    case 'animation:update':
      return applyAnimationUpdate(doc, change.elementId, change.path, change.newValue);
  }
}

function applyElementAdd(doc: EditorDocument, pageIndex: number, element: Record<string, unknown>): EditorDocument {
  const page = doc.pages[pageIndex];

  if (!page) return doc;

  return {
    ...doc,
    pages: doc.pages.map((p, i) => {
      if (i !== pageIndex) return p;

      return {
        ...p,
        elements: [...p.elements, element as unknown as EditorPage['elements'][number]],
      };
    }),
  };
}

function applyElementRemove(doc: EditorDocument, pageIndex: number, elementId: string): EditorDocument {
  const page = doc.pages[pageIndex];

  if (!page) return doc;

  return {
    ...doc,
    pages: doc.pages.map((p, i) => {
      if (i !== pageIndex) return p;

      return {
        ...p,
        elements: p.elements.filter((el) => el.id !== elementId),
      };
    }),
  };
}

/**
 * Checks whether a path targets a runtime animation field on screen props.
 * Paths like "screen.visibility", "screen.activeState", "screen.modifiers"
 * are runtime-only and should be skipped.
 */
function isRuntimeAnimationPath(path: string): boolean {
  const parts = path.split('.');

  if (parts[0] === 'screen' && parts.length >= 2) {
    const fieldName = parts[1];

    if (fieldName === undefined) return false;

    return RUNTIME_ANIMATION_FIELDS.has(fieldName);
  }

  return false;
}

function applyElementUpdate(
  doc: EditorDocument,
  pageIndex: number,
  elementId: string,
  path: string,
  newValue: unknown,
): EditorDocument {
  // Skip runtime animation fields
  if (isRuntimeAnimationPath(path)) return doc;

  const page = doc.pages[pageIndex];

  if (!page) return doc;

  return {
    ...doc,
    pages: doc.pages.map((p, i) => {
      if (i !== pageIndex) return p;

      return {
        ...p,
        elements: p.elements.map((el) => {
          if (el.id !== elementId) return el;

          const elObj = el as unknown as Record<string, unknown>;

          return setDeepValue(elObj, path, newValue) as unknown as EditorPage['elements'][number];
        }),
      };
    }),
  };
}

function applyElementReorder(
  doc: EditorDocument,
  pageIndex: number,
  elementId: string,
  toIndex: number,
): EditorDocument {
  const page = doc.pages[pageIndex];

  if (!page) return doc;

  const elements = [...page.elements];
  const fromIdx = elements.findIndex((el) => el.id === elementId);

  if (fromIdx === -1) return doc;

  const [moved] = elements.splice(fromIdx, 1);

  if (moved !== undefined) {
    elements.splice(toIndex, 0, moved);
  }

  return {
    ...doc,
    pages: doc.pages.map((p, i) => {
      if (i !== pageIndex) return p;

      return { ...p, elements };
    }),
  };
}

function applyPageAdd(doc: EditorDocument, pageIndex: number): EditorDocument {
  const newPage: EditorPage = {
    id: crypto.randomUUID(),
    elements: [],
  };

  const pages = [...doc.pages];

  pages.splice(pageIndex, 0, newPage);

  return { ...doc, pages };
}

function applyPageRemove(doc: EditorDocument, pageIndex: number): EditorDocument {
  return {
    ...doc,
    pages: doc.pages.filter((_, i) => i !== pageIndex),
  };
}

function applySettingsUpdate(doc: EditorDocument, path: string, newValue: unknown): EditorDocument {
  // Path starts with "canvas." — extract the canvas key
  const parts = path.split('.');

  if (parts[0] === 'canvas' && parts.length >= 2) {
    const canvasKey = parts[1];

    if (canvasKey === undefined) return doc;

    return {
      ...doc,
      canvas: { ...doc.canvas, [canvasKey]: newValue } as EditorDocument['canvas'],
    };
  }

  // Generic top-level setting
  return { ...doc, [path]: newValue } as EditorDocument;
}

function applyAnimationUpdate(doc: EditorDocument, elementId: string, path: string, newValue: unknown): EditorDocument {
  if (path === 'config') {
    if (newValue === null) {
      // Remove config
      return {
        ...doc,
        animationRegistry: doc.animationRegistry.filter((e) => e.elementId !== elementId),
      };
    }

    // Add new config
    const existingIndex = doc.animationRegistry.findIndex((e) => e.elementId === elementId);

    if (existingIndex === -1) {
      return {
        ...doc,
        animationRegistry: [...doc.animationRegistry, { elementId, config: newValue as ElementAnimationConfig }],
      };
    }

    // Replace existing config
    return {
      ...doc,
      animationRegistry: doc.animationRegistry.map((e) =>
        e.elementId === elementId ? { ...e, config: newValue as ElementAnimationConfig } : e,
      ),
    };
  }

  // Per-field update (timelines, stateTimelineBindings, modifierTimelineBindings)
  return {
    ...doc,
    animationRegistry: doc.animationRegistry.map((e) => {
      if (e.elementId !== elementId) return e;

      return {
        ...e,
        config: { ...e.config, [path]: newValue } as ElementAnimationConfig,
      };
    }),
  };
}
