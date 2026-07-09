import type {
  AnimationDefinition,
  BroadsetDocument,
  BroadsetElement,
  DocumentChange,
  ElementAddChange,
  ElementRemoveChange,
  ElementReorderChange,
  ElementUpdateChange,
  PageAddChange,
  SettingsUpdateChange,
} from '@broadset/model';

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

export function diffDocuments(prev: BroadsetDocument, next: BroadsetDocument): readonly DocumentChange[] {
  if (prev === next) return [];

  const changes: DocumentChange[] = [];

  diffElements(prev, next, changes);
  diffPages(prev, next, changes);
  diffSettings(prev, next, changes);
  diffAnimations(prev, next, changes);

  return changes;
}

function diffElements(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  const prevMap = new Map(prev.elements.map((el) => [el.id, el]));
  const nextMap = new Map(next.elements.map((el) => [el.id, el]));

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

  for (const nextEl of next.elements) {
    const prevEl = prevMap.get(nextEl.id);

    if (prevEl === undefined) continue;

    diffElementProperties(prev.id, prevEl, nextEl, out);
  }

  diffElementOrder(prev, next, out);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function emitObjectDiff(
  documentId: string,
  elementId: string,
  key: string,
  prevObj: Record<string, unknown>,
  nextObj: Record<string, unknown>,
  out: DocumentChange[],
): void {
  for (const subKey of Object.keys(nextObj)) {
    if (!deepEqual(prevObj[subKey], nextObj[subKey])) {
      out.push({
        type: 'element:update',
        documentId,
        elementId,
        path: `${key}.${subKey}`,
        oldValue: prevObj[subKey],
        newValue: nextObj[subKey],
      } satisfies ElementUpdateChange);
    }
  }

  for (const subKey of Object.keys(prevObj)) {
    if (!(subKey in nextObj)) {
      out.push({
        type: 'element:update',
        documentId,
        elementId,
        path: `${key}.${subKey}`,
        oldValue: prevObj[subKey],
        newValue: undefined,
      } satisfies ElementUpdateChange);
    }
  }
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

    if (isPlainObject(prevVal) && isPlainObject(nextVal)) {
      emitObjectDiff(documentId, nextEl.id, key, prevVal, nextVal, out);
      continue;
    }

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

function diffElementOrder(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  const prevIds = prev.elements.map((el) => el.id);
  const nextIds = next.elements.map((el) => el.id);
  const prevSet = new Set(prevIds);
  const nextSet = new Set(nextIds);

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

  // Emit removals for keys present on the previous canvas but missing on the
  // next canvas. Without this, clearing an optional field (e.g.
  // backgroundColor, safeAreas, backgroundPdf) would fail to propagate and
  // peers would keep a stale value.
  for (const key of Object.keys(prevCanvas)) {
    if (key in nextCanvas) continue;

    out.push({
      type: 'settings:update',
      documentId: next.id,
      path: `canvas.${key}`,
      oldValue: prevCanvas[key],
      newValue: undefined,
    } satisfies SettingsUpdateChange);
  }
}

function diffAnimations(prev: BroadsetDocument, next: BroadsetDocument, out: DocumentChange[]): void {
  if (prev.animations === next.animations) return;

  const prevMap = new Map(prev.animations.map((a) => [a.elementId, a]));
  const nextMap = new Map(next.animations.map((a) => [a.elementId, a]));

  for (const def of next.animations) {
    const prevDef = prevMap.get(def.elementId);

    if (prevDef === undefined) {
      out.push({
        type: 'animation:update',
        documentId: next.id,
        elementId: def.elementId,
        path: 'config',
        oldValue: undefined,
        newValue: def.config,
      });
      continue;
    }

    diffAnimationConfig(next.id, def.elementId, prevDef, def, out);
  }

  for (const def of prev.animations) {
    if (!nextMap.has(def.elementId)) {
      out.push({
        type: 'animation:update',
        documentId: prev.id,
        elementId: def.elementId,
        path: 'config',
        oldValue: def.config,
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
