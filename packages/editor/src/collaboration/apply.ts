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

import { normalizeChangePath, normalizeRemoteChanges } from './patch-normalize';

export function applyRemoteChanges(doc: BroadsetDocument, changes: readonly DocumentChange[]): BroadsetDocument {
  let result = doc;

  for (const change of normalizeRemoteChanges(changes)) {
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
  const parts = normalizeChangePath(change.path);

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
    pages: doc.pages.filter((page) => page.id !== change.pageId),
  };
}

function applyAnimationUpdate(doc: BroadsetDocument, change: AnimationUpdateChange): BroadsetDocument {
  const existingIdx = doc.animations.findIndex((animation) => animation.elementId === change.elementId);

  if (change.newValue === undefined) {
    if (existingIdx === -1) return doc;

    return {
      ...doc,
      animations: doc.animations.filter((animation) => animation.elementId !== change.elementId),
    };
  }

  if (existingIdx === -1) {
    if (change.path === 'config') {
      const newDef: AnimationDefinition = {
        elementId: change.elementId,
        config: change.newValue as AnimationDefinition['config'],
      };

      return { ...doc, animations: [...doc.animations, newDef] };
    }

    return doc;
  }

  const validFields = new Set(['timelines', 'stateTimelineBindings', 'modifierTimelineBindings', 'textAnimator']);

  if (!validFields.has(change.path)) return doc;

  const existing = doc.animations[existingIdx];

  if (existing === undefined) return doc;

  const updatedConfig = { ...existing.config, [change.path]: change.newValue };
  const updatedDef: AnimationDefinition = { ...existing, config: updatedConfig };

  return {
    ...doc,
    animations: doc.animations.map((animation, index) => (index === existingIdx ? updatedDef : animation)),
  };
}

function setNestedValue<T>(obj: T, path: string, value: unknown): T {
  const parts = normalizeChangePath(path);

  if (parts.length === 1) {
    return { ...obj, [parts[0] as string]: value } as T;
  }

  const [head, ...rest] = parts;

  if (head === undefined) return obj;

  const current = (obj as Record<string, unknown>)[head];
  const nested = setNestedValue(current ?? {}, rest.join('.'), value);

  return { ...obj, [head]: nested } as T;
}
