import type {
  AnimationDefinition,
  AnimationUpdateChange,
  BroadsetDocument,
  BroadsetElement,
  DocumentChange,
  ElementAddChange,
  ElementRemoveChange,
  ElementReorderChange,
  ElementUpdateChange,
  PageAddChange,
  PageRemoveChange,
  SettingsUpdateChange,
} from '@broadset/model';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A function that receives an array of document changes. */
export type ChangeListener = (changes: readonly DocumentChange[]) => void;

/** Controller returned by {@link createChangeStream}. */
export interface ChangeStream {
  /** Register a listener. Returns an unsubscribe function. */
  readonly subscribe: (listener: ChangeListener) => () => void;
  /** Emit changes to all listeners (no-op when suppressed or array is empty). */
  readonly emit: (changes: readonly DocumentChange[]) => void;
  /** Suppress emission (e.g. during ephemeral drag). */
  readonly suppress: () => void;
  /** Resume emission. */
  readonly unsuppress: () => void;
}

// ---------------------------------------------------------------------------
// Change Stream
// ---------------------------------------------------------------------------

/**
 * Create a change stream controller that broadcasts document change arrays
 * to subscribers. Supports suppression for ephemeral updates.
 */
export function createChangeStream(): ChangeStream {
  const listeners = new Set<ChangeListener>();
  let suppressed = false;

  return {
    subscribe(listener: ChangeListener): () => void {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    emit(changes: readonly DocumentChange[]): void {
      if (suppressed || changes.length === 0) {
        return;
      }

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
// Deep-equal helper (structural comparison)
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;

    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every((key) => key in bObj && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

// ---------------------------------------------------------------------------
// Document Diffing
// ---------------------------------------------------------------------------

/**
 * Diff two document snapshots and produce a list of {@link DocumentChange}
 * entries describing the delta.
 *
 * Same-reference documents produce an empty diff (fast path).
 */
export function diffDocuments(prev: BroadsetDocument, next: BroadsetDocument): readonly DocumentChange[] {
  if (prev === next) return [];

  const changes: DocumentChange[] = [];

  diffElements(prev, next, changes);
  diffPages(prev, next, changes);
  diffSettings(prev, next, changes);
  diffAnimations(prev, next, changes);

  return changes;
}

// ---------------------------------------------------------------------------
// Element diffing
// ---------------------------------------------------------------------------

function diffElements(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  const prevMap = new Map(prev.elements.map((el) => [el.id, el]));
  const nextMap = new Map(next.elements.map((el) => [el.id, el]));

  // Additions
  for (const el of next.elements) {
    if (!prevMap.has(el.id)) {
      out.push({
        type: 'element:add',
        documentId: next.id,
        elementId: el.id,
        element: el as unknown as Record<string, unknown>,
      } satisfies ElementAddChange);
    }
  }

  // Removals
  for (const el of prev.elements) {
    if (!nextMap.has(el.id)) {
      out.push({
        type: 'element:remove',
        documentId: prev.id,
        elementId: el.id,
        element: el as unknown as Record<string, unknown>,
      } satisfies ElementRemoveChange);
    }
  }

  // Updates (property changes for elements that exist in both)
  for (const nextEl of next.elements) {
    const prevEl = prevMap.get(nextEl.id);

    if (prevEl === undefined) continue;

    diffElementProperties(prev.id, prevEl, nextEl, out);
  }

  // Reorders
  diffElementOrder(prev, next, out);
}

function diffElementProperties(
  documentId: string,
  prevEl: BroadsetElement,
  nextEl: BroadsetElement,
  out: DocumentChange[],
): void {
  const prevRecord = prevEl as unknown as Record<string, unknown>;
  const nextRecord = nextEl as unknown as Record<string, unknown>;

  for (const key of Object.keys(nextRecord)) {
    if (key === 'id') continue;

    const prevVal = prevRecord[key];
    const nextVal = nextRecord[key];

    if (deepEqual(prevVal, nextVal)) continue;

    if (
      typeof nextVal === 'object' &&
      nextVal !== null &&
      !Array.isArray(nextVal) &&
      typeof prevVal === 'object' &&
      prevVal !== null &&
      !Array.isArray(prevVal)
    ) {
      // Both are plain objects — emit per-nested-field changes
      const prevObj = prevVal as Record<string, unknown>;
      const nextObj = nextVal as Record<string, unknown>;

      for (const subKey of Object.keys(nextObj)) {
        if (!deepEqual(prevObj[subKey], nextObj[subKey])) {
          out.push({
            type: 'element:update',
            documentId,
            elementId: nextEl.id,
            path: `${key}.${subKey}`,
            oldValue: prevObj[subKey],
            newValue: nextObj[subKey],
          } satisfies ElementUpdateChange);
        }
      }

      // Check for removed sub-keys
      for (const subKey of Object.keys(prevObj)) {
        if (!(subKey in nextObj)) {
          out.push({
            type: 'element:update',
            documentId,
            elementId: nextEl.id,
            path: `${key}.${subKey}`,
            oldValue: prevObj[subKey],
            newValue: undefined,
          } satisfies ElementUpdateChange);
        }
      }
    } else {
      out.push({
        type: 'element:update',
        documentId,
        elementId: nextEl.id,
        path: key,
        oldValue: prevVal,
        newValue: nextVal,
      } satisfies ElementUpdateChange);
    }
  }
}

function diffElementOrder(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  // Build index maps for elements that exist in both
  const prevIds = prev.elements.map((el) => el.id);
  const nextIds = next.elements.map((el) => el.id);
  const prevSet = new Set(prevIds);
  const nextSet = new Set(nextIds);

  // Only consider elements present in both for reorder detection
  const commonPrev = prevIds.filter((id) => nextSet.has(id));
  const commonNext = nextIds.filter((id) => prevSet.has(id));

  if (commonPrev.length < 2) return;

  const prevIndexMap = new Map(commonPrev.map((id, i) => [id, i]));

  for (let nextIdx = 0; nextIdx < commonNext.length; nextIdx++) {
    const id = commonNext[nextIdx];

    if (id === undefined) continue;

    const prevIdx = prevIndexMap.get(id);

    if (prevIdx !== undefined && prevIdx !== nextIdx) {
      out.push({
        type: 'element:reorder',
        documentId: next.id,
        elementId: id,
        fromIndex: prevIdx,
        toIndex: nextIdx,
      } satisfies ElementReorderChange);
    }
  }
}

// ---------------------------------------------------------------------------
// Page diffing
// ---------------------------------------------------------------------------

function diffPages(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  const prevIds = new Set(prev.pages.map((p) => p.id));
  const nextIds = new Set(next.pages.map((p) => p.id));

  for (const page of next.pages) {
    if (!prevIds.has(page.id)) {
      out.push({
        type: 'page:add',
        documentId: next.id,
        pageId: page.id,
        page: page as unknown as Record<string, unknown>,
      } satisfies PageAddChange);
    }
  }

  for (const page of prev.pages) {
    if (!nextIds.has(page.id)) {
      out.push({
        type: 'page:remove',
        documentId: prev.id,
        pageId: page.id,
        page: page as unknown as Record<string, unknown>,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Settings (canvas) diffing
// ---------------------------------------------------------------------------

function diffSettings(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  if (prev.canvas === next.canvas) return;

  const prevCanvas = prev.canvas as unknown as Record<string, unknown>;
  const nextCanvas = next.canvas as unknown as Record<string, unknown>;

  for (const key of Object.keys(nextCanvas)) {
    if (!deepEqual(prevCanvas[key], nextCanvas[key])) {
      out.push({
        type: 'settings:update',
        documentId: next.id,
        path: `canvas.${key}`,
        oldValue: prevCanvas[key],
        newValue: nextCanvas[key],
      } satisfies SettingsUpdateChange);
    }
  }
}

// ---------------------------------------------------------------------------
// Animation diffing
// ---------------------------------------------------------------------------

function diffAnimations(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  if (prev.animations === next.animations) return;

  const prevMap = new Map(prev.animations.map((a) => [a.elementId, a]));
  const nextMap = new Map(next.animations.map((a) => [a.elementId, a]));

  // Added or changed
  for (const def of next.animations) {
    const prevDef = prevMap.get(def.elementId);

    if (prevDef === undefined) {
      // New animation config
      out.push({
        type: 'animation:update',
        documentId: next.id,
        elementId: def.elementId,
        path: 'config',
        oldValue: undefined,
        newValue: def.config as unknown,
      });
      continue;
    }

    diffAnimationConfig(next.id, def.elementId, prevDef, def, out);
  }

  // Removed (animation config deleted)
  for (const def of prev.animations) {
    if (!nextMap.has(def.elementId)) {
      out.push({
        type: 'animation:update',
        documentId: prev.id,
        elementId: def.elementId,
        path: 'config',
        oldValue: def.config as unknown,
        newValue: undefined,
      });
    }
  }
}

function diffAnimationConfig(
  documentId: string,
  elementId: string,
  prevDef: AnimationDefinition,
  nextDef: AnimationDefinition,
  out: DocumentChange[],
): void {
  const fields = ['timelines', 'stateTimelineBindings', 'modifierTimelineBindings', 'textAnimator'] as const;

  for (const field of fields) {
    const prevVal = prevDef.config[field];
    const nextVal = nextDef.config[field];

    if (!deepEqual(prevVal, nextVal)) {
      out.push({
        type: 'animation:update',
        documentId,
        elementId,
        path: field,
        oldValue: prevVal as unknown,
        newValue: nextVal as unknown,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Remote Change Application
// ---------------------------------------------------------------------------

/**
 * Apply remote document changes to a document immutably.
 * Returns a new document with the changes applied.
 *
 * This function is pure — it does NOT emit to any change stream.
 * The caller is responsible for suppressing the change stream if needed.
 */
export function applyRemoteChanges(doc: BroadsetDocument, changes: readonly DocumentChange[]): BroadsetDocument {
  let result = doc;

  for (const change of changes) {
    result = applySingleChange(result, change);
  }

  return result;
}

function applySingleChange(doc: BroadsetDocument, change: DocumentChange): BroadsetDocument {
  switch (change.type) {
    case 'element:add':
      return applyElementAdd(doc, change);
    case 'element:remove':
      return applyElementRemove(doc, change);
    case 'element:update':
      return applyElementUpdate(doc, change);
    case 'element:reorder':
      return applyElementReorder(doc, change);
    case 'settings:update':
      return applySettingsUpdate(doc, change);
    case 'page:add':
      return applyPageAdd(doc, change);
    case 'page:remove':
      return applyPageRemove(doc, change);
    case 'animation:update':
      return applyAnimationUpdate(doc, change);
    default:
      // Other change types pass through unchanged
      return doc;
  }
}

function applyElementAdd(doc: BroadsetDocument, change: ElementAddChange): BroadsetDocument {
  const element = change.element as unknown as BroadsetElement;

  return { ...doc, elements: [...doc.elements, element] };
}

function applyElementRemove(doc: BroadsetDocument, change: ElementRemoveChange): BroadsetDocument {
  return {
    ...doc,
    elements: doc.elements.filter((el) => el.id !== change.elementId),
  };
}

function applyElementUpdate(doc: BroadsetDocument, change: ElementUpdateChange): BroadsetDocument {
  return {
    ...doc,
    elements: doc.elements.map((el) => {
      if (el.id !== change.elementId) return el;

      return setNestedValue(el, change.path, change.newValue);
    }),
  };
}

function applyElementReorder(doc: BroadsetDocument, change: ElementReorderChange): BroadsetDocument {
  const elements = [...doc.elements];
  const currentIdx = elements.findIndex((el) => el.id === change.elementId);

  if (currentIdx === -1) return doc;

  const [moved] = elements.splice(currentIdx, 1);

  if (moved === undefined) return doc;

  elements.splice(change.toIndex, 0, moved);

  return { ...doc, elements };
}

function applySettingsUpdate(doc: BroadsetDocument, change: SettingsUpdateChange): BroadsetDocument {
  // Path format: "canvas.width", "canvas.dpi", etc.
  const parts = change.path.split('.');

  if (parts[0] === 'canvas' && parts[1] !== undefined) {
    return {
      ...doc,
      canvas: { ...doc.canvas, [parts[1]]: change.newValue },
    };
  }

  return doc;
}

function applyPageAdd(doc: BroadsetDocument, change: PageAddChange): BroadsetDocument {
  const page = change.page as unknown as BroadsetDocument['pages'][number];

  return { ...doc, pages: [...doc.pages, page] };
}

function applyPageRemove(doc: BroadsetDocument, change: PageRemoveChange): BroadsetDocument {
  return {
    ...doc,
    pages: doc.pages.filter((p) => p.id !== change.pageId),
  };
}

function applyAnimationUpdate(doc: BroadsetDocument, change: AnimationUpdateChange): BroadsetDocument {
  const existingIdx = doc.animations.findIndex((a) => a.elementId === change.elementId);

  if (change.newValue === undefined) {
    // Removal
    if (existingIdx === -1) return doc;

    return {
      ...doc,
      animations: doc.animations.filter((a) => a.elementId !== change.elementId),
    };
  }

  if (existingIdx === -1) {
    // Addition — rebuild from path
    if (change.path === 'config') {
      const newDef: AnimationDefinition = {
        elementId: change.elementId,
        config: change.newValue as AnimationDefinition['config'],
      };

      return { ...doc, animations: [...doc.animations, newDef] };
    }

    return doc;
  }

  // Field update — only allow known animation config fields
  const validFields = new Set(['timelines', 'stateTimelineBindings', 'modifierTimelineBindings', 'textAnimator']);

  if (!validFields.has(change.path)) return doc;

  const existing = doc.animations[existingIdx];

  if (existing === undefined) return doc;

  const updatedConfig = { ...existing.config, [change.path]: change.newValue };
  const updatedDef: AnimationDefinition = { ...existing, config: updatedConfig };

  return {
    ...doc,
    animations: doc.animations.map((a, i) => (i === existingIdx ? updatedDef : a)),
  };
}

// ---------------------------------------------------------------------------
// Nested value setter
// ---------------------------------------------------------------------------

function setNestedValue<T>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.');

  if (parts.length === 1) {
    return { ...obj, [parts[0] as string]: value } as T;
  }

  const [head, ...rest] = parts;

  if (head === undefined) return obj;

  const current = (obj as Record<string, unknown>)[head];
  const nested = setNestedValue(current ?? {}, rest.join('.'), value);

  return { ...obj, [head]: nested } as T;
}
