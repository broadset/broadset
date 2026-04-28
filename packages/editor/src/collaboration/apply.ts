import type {
  AnimationDefinition,
  AnimationUpdateChange,
  BroadsetDocument,
  BroadsetElement,
  DataSchemaUpdateChange,
  DocumentChange,
  ElementAddChange,
  ElementRemoveChange,
  ElementReorderChange,
  ElementUpdateChange,
  PageAddChange,
  PageElementInstance,
  PageOverrideUpdateChange,
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
    case 'page:override:update':
      return applyPageOverrideUpdate(doc, change);
    case 'animation:update':
      return applyAnimationUpdate(doc, change);
    case 'dataSchema:update':
      return applyDataSchemaUpdate(doc, change);
    case 'asset:add':
    case 'asset:remove':
    case 'asset:update':
    case 'project:settings:update':
      // Project-scope changes (assets, project settings) are intentionally not
      // applied here: `applyRemoteChanges` operates on a single
      // `BroadsetDocument` and has no handle to the enclosing
      // `BroadsetProject`. Hosts that need project-level collaboration must
      // route these via a project-level applier.
      return doc;
    default:
      return doc;
  }
}

function createRootPageInstance(element: BroadsetElement): PageElementInstance {
  return {
    elementId: element.id,
    transform: {
      position: { x: element.position.x, y: element.position.y, z: 0 },
      rotation: { x: 0, y: 0, z: element.rotation },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible: true,
  };
}

function applyElementAdd(doc: BroadsetDocument, change: ElementAddChange): BroadsetDocument {
  const element = change.element as unknown as BroadsetElement;

  if (doc.elements.some((el) => el.id === element.id)) {
    return doc;
  }

  const nextElements = [...doc.elements, element];

  if (element.parentId !== null) {
    return { ...doc, elements: nextElements };
  }

  const instance = createRootPageInstance(element);

  return {
    ...doc,
    elements: nextElements,
    pages: doc.pages.map((page) => ({
      ...page,
      elements: [...page.elements, instance],
    })),
  };
}

function collectSubtreeIds(elements: readonly BroadsetElement[], rootId: string): ReadonlySet<string> {
  const removed = new Set<string>([rootId]);
  let grew = true;

  while (grew) {
    grew = false;

    for (const el of elements) {
      if (el.parentId !== null && removed.has(el.parentId) && !removed.has(el.id)) {
        removed.add(el.id);
        grew = true;
      }
    }
  }

  return removed;
}

function applyElementRemove(doc: BroadsetDocument, change: ElementRemoveChange): BroadsetDocument {
  const removedIds = collectSubtreeIds(doc.elements, change.elementId);

  return {
    ...doc,
    elements: doc.elements.filter((el) => !removedIds.has(el.id)),
    pages: doc.pages.map((page) => ({
      ...page,
      elements: page.elements.filter((instance) => !removedIds.has(instance.elementId)),
    })),
    animations: doc.animations.filter((animation) => !removedIds.has(animation.elementId)),
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
    const removeKey = parts[1];
    const canvasRecord = Object.fromEntries(
      Object.entries(doc.canvas as unknown as Record<string, unknown>).filter(([entryKey]) =>
        change.newValue === undefined ? entryKey !== removeKey : true,
      ),
    );

    if (change.newValue !== undefined) {
      canvasRecord[removeKey] = change.newValue;
    }

    return {
      ...doc,
      canvas: canvasRecord as unknown as BroadsetDocument['canvas'],
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

function computeNextInstancesForInstanceChange(
  existing: readonly PageElementInstance[],
  instanceIndex: number,
  newValue: unknown,
): readonly PageElementInstance[] {
  if (newValue === undefined) {
    return existing.filter((_, index) => index !== instanceIndex);
  }

  if (instanceIndex === -1) {
    return [...existing, newValue as PageElementInstance];
  }

  return existing.map((instance, index) => (index === instanceIndex ? (newValue as PageElementInstance) : instance));
}

/**
 * Applies a page override update to a single page-element instance.
 *
 * The `field` path is interpreted as a dotted path into the
 * `PageElementInstance` object (e.g. `visible`, `transform.position.x`).
 * When the instance does not yet exist and `field === 'instance'`, the
 * newValue is treated as a full `PageElementInstance` to insert (used by
 * instance-level adds). When `newValue === undefined` and
 * `field === 'instance'`, the instance is removed.
 */
function applyPageOverrideUpdate(doc: BroadsetDocument, change: PageOverrideUpdateChange): BroadsetDocument {
  const pageIndex = doc.pages.findIndex((page) => page.id === change.pageId);

  if (pageIndex === -1) return doc;

  const page = doc.pages[pageIndex];

  if (page === undefined) return doc;

  const instanceIndex = page.elements.findIndex((instance) => instance.elementId === change.elementId);

  if (change.field === 'instance') {
    const nextInstances = computeNextInstancesForInstanceChange(page.elements, instanceIndex, change.newValue);

    return {
      ...doc,
      pages: doc.pages.map((candidate, index) =>
        index === pageIndex ? { ...candidate, elements: nextInstances } : candidate,
      ),
    };
  }

  if (instanceIndex === -1) return doc;

  const instance = page.elements[instanceIndex];

  if (instance === undefined) return doc;

  const nextInstance = setNestedValue(instance, change.field, change.newValue);

  return {
    ...doc,
    pages: doc.pages.map((candidate, index) =>
      index === pageIndex ?
        {
          ...candidate,
          elements: candidate.elements.map((entry, entryIndex) => (entryIndex === instanceIndex ? nextInstance : entry)),
        }
      : candidate,
    ),
  };
}

function applyDataSchemaUpdate(doc: BroadsetDocument, change: DataSchemaUpdateChange): BroadsetDocument {
  return {
    ...doc,
    dataSchema: setNestedValue(doc.dataSchema, change.path, change.newValue),
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
     
    return { ...obj, [parts[0] as string]: value };
  }

  const [head, ...rest] = parts;

  if (head === undefined) return obj;

  const current = (obj as Record<string, unknown>)[head];
  const nested = setNestedValue(current ?? {}, rest.join('.'), value);

   
  return { ...obj, [head]: nested };
}
