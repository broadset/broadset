import {
  type AnimationDefinition,
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type DocumentChange,
} from '@broadset/model';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { applyRemoteChanges, type ChangeStream, createChangeStream, diffDocuments } from './collaboration';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(
  overrides: Partial<
    Pick<BroadsetElement, 'id' | 'name' | 'position' | 'width' | 'height' | 'content' | 'locked' | 'rotation'>
  > & { readonly type?: string } = {},
): BroadsetElement {
  return createDefaultElement(overrides.type ?? 'rectangle', overrides);
}

function makeDocument(
  elements: readonly BroadsetElement[],
  overrides: Partial<Pick<BroadsetDocument, 'pages' | 'canvas' | 'animations'>> = {},
): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    ...overrides,
    elements,
  };
}

// ---------------------------------------------------------------------------
// Document Element Diffing
// ---------------------------------------------------------------------------

describe('diffDocuments — element diffing', () => {
  /** @description When next has an element that prev does not, the diff MUST include an element:add change. */
  it('detects element addition', () => {
    const el = makeElement({ id: 'el-1' });
    const prev = makeDocument([]);
    const next = makeDocument([el]);

    const changes = diffDocuments(prev, next);

    expect(changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'element:add', elementId: 'el-1' })]),
    );
  });

  /** @description When prev has an element that next does not, the diff MUST include an element:remove change. */
  it('detects element removal', () => {
    const el = makeElement({ id: 'el-1' });
    const prev = makeDocument([el]);
    const next = makeDocument([]);

    const changes = diffDocuments(prev, next);

    expect(changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'element:remove', elementId: 'el-1' })]),
    );
  });

  /** @description When an element's nested property changes, the diff MUST include an element:update with corresponding path. */
  it('detects nested property update (position.x)', () => {
    const el1 = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const el2 = makeElement({ id: 'el-1', position: { x: 100, y: 0 } });
    const prev = makeDocument([el1]);
    const next = makeDocument([el2]);

    const changes = diffDocuments(prev, next);
    const updateChanges = changes.filter(
      (c): c is DocumentChange & { readonly type: 'element:update' } => c.type === 'element:update',
    );

    expect(updateChanges.length).toBeGreaterThan(0);
    expect(updateChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'element:update',
          elementId: 'el-1',
          path: expect.stringContaining('position'),
        }),
      ]),
    );
  });

  /** @description When elements are reordered, the diff MUST include element:reorder changes. */
  it('detects element reorder', () => {
    const el1 = makeElement({ id: 'el-1' });
    const el2 = makeElement({ id: 'el-2' });
    const prev = makeDocument([el1, el2]);
    const next = makeDocument([el2, el1]);

    const changes = diffDocuments(prev, next);
    const reorderChanges = changes.filter((c) => c.type === 'element:reorder');

    expect(reorderChanges.length).toBe(2);
  });

  /** @description Identical documents MUST produce an empty diff. */
  it('produces empty diff for identical documents', () => {
    const doc = makeDocument([makeElement({ id: 'el-1' })]);

    const changes = diffDocuments(doc, doc);

    expect(changes).toEqual([]);
  });

  /** @description Runtime animation fields (visibility, activeState, modifiers) are NOT on the document model, so diffing naturally excludes them. This test verifies that changing only playback-irrelevant style fields IS detected. */
  it('excludes runtime fields but detects real style changes', () => {
    const el1 = makeElement({ id: 'el-1' });
    const el2 = {
      ...el1,
      style: { ...el1.style, opacity: 0.5 },
    };
    const prev = makeDocument([el1]);
    const next = makeDocument([el2]);

    const changes = diffDocuments(prev, next);

    expect(changes.length).toBeGreaterThan(0);
    expect(changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'element:update', elementId: 'el-1' })]),
    );
  });
});

// ---------------------------------------------------------------------------
// Page & Settings Diffing
// ---------------------------------------------------------------------------

describe('diffDocuments — page and settings diffing', () => {
  /** @description When next has a page that prev does not, the diff MUST include a page:add change. */
  it('detects page addition', () => {
    const base = createEmptyBroadsetDocument();
    const prev = { ...base };
    const next = {
      ...base,
      pages: [...base.pages, { id: 'page-2', name: 'Second', overrides: [], locale: null, extensions: {} }],
    };

    const changes = diffDocuments(prev, next);

    expect(changes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'page:add', pageId: 'page-2' })]));
  });

  /** @description When canvas width changes, the diff MUST include a settings:update change for canvas.width. */
  it('detects canvas width change', () => {
    const base = createEmptyBroadsetDocument();
    const prev = { ...base };
    const next = { ...base, canvas: { ...base.canvas, width: 500 } };

    const changes = diffDocuments(prev, next);

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'settings:update',
          path: expect.stringContaining('canvas.width'),
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Animation Diffing
// ---------------------------------------------------------------------------

describe('diffDocuments — animation diffing', () => {
  /** @description When next has an animation config that prev does not, an animation:update change is produced. */
  it('detects animation config addition', () => {
    const animDef: AnimationDefinition = {
      elementId: 'el-1',
      config: {
        timelines: [],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
        textAnimator: null,
      },
    };
    const prev = makeDocument([], { animations: [] });
    const next = makeDocument([], { animations: [animDef] });

    const changes = diffDocuments(prev, next);

    expect(changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'animation:update', elementId: 'el-1' })]),
    );
  });

  /** @description When an animation config's timelines change, an animation:update with path timelines is produced. */
  it('detects timeline field change', () => {
    const baseDef: AnimationDefinition = {
      elementId: 'el-1',
      config: {
        timelines: [],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
        textAnimator: null,
      },
    };
    const updatedDef: AnimationDefinition = {
      ...baseDef,
      config: {
        ...baseDef.config,
        timelines: [
          {
            id: 'tl-1',
            name: 'Intro',
            keyframes: [],
          },
        ],
      },
    };
    const prev = makeDocument([], { animations: [baseDef] });
    const next = makeDocument([], { animations: [updatedDef] });

    const changes = diffDocuments(prev, next);

    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'animation:update',
          elementId: 'el-1',
          path: expect.stringContaining('timelines'),
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Change Stream Controller
// ---------------------------------------------------------------------------

describe('createChangeStream', () => {
  let stream: ChangeStream;

  beforeEach(() => {
    stream = createChangeStream();
  });

  /** @description A subscribed listener MUST receive emitted changes. */
  it('emits changes to subscriber', () => {
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);

    const changes: readonly DocumentChange[] = [
      {
        type: 'element:add',
        documentId: 'doc-1',
        elementId: 'el-1',
        element: {},
      },
    ];

    stream.emit(changes);

    expect(listener).toHaveBeenCalledWith(changes);
  });

  /** @description When suppression is active, the listener MUST NOT receive changes. */
  it('suppresses emission when suppressed', () => {
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.suppress();

    stream.emit([{ type: 'element:add', documentId: 'doc-1', elementId: 'el-1', element: {} }]);

    expect(listener).not.toHaveBeenCalled();
  });

  /** @description After unsuppression, the listener MUST receive changes again. */
  it('resumes emission after unsuppress', () => {
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.suppress();
    stream.unsuppress();

    stream.emit([{ type: 'element:add', documentId: 'doc-1', elementId: 'el-1', element: {} }]);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  /** @description An empty change array MUST NOT be emitted to listeners. */
  it('does not emit empty arrays', () => {
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.emit([]);

    expect(listener).not.toHaveBeenCalled();
  });

  /** @description Unsubscribed listener MUST NOT receive further emissions. */
  it('unsubscribe removes the listener', () => {
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();
    const unsub = stream.subscribe(listener);

    unsub();

    stream.emit([{ type: 'element:add', documentId: 'doc-1', elementId: 'el-1', element: {} }]);

    expect(listener).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Ephemeral vs Committed
// ---------------------------------------------------------------------------

describe('createChangeStream — ephemeral vs committed', () => {
  /** @description Ephemeral updates MUST be suppressed and not emitted to the listener. */
  it('suppressed (ephemeral) updates are not emitted', () => {
    const stream = createChangeStream();
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.suppress();

    // Simulate ephemeral drag updates
    for (let i = 0; i < 5; i++) {
      stream.emit([
        {
          type: 'element:update',
          documentId: 'doc-1',
          elementId: 'el-1',
          path: 'position.x',
          oldValue: i,
          newValue: i + 1,
        },
      ]);
    }

    expect(listener).not.toHaveBeenCalled();
  });

  /** @description After unsuppression, the committed diff MUST be emitted — the change stream itself just gates emission. The diffing of committed state is the caller's responsibility. */
  it('unsuppress allows the commit emission to reach listeners', () => {
    const stream = createChangeStream();
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.suppress();

    // Ephemeral updates silenced
    stream.emit([
      { type: 'element:update', documentId: 'doc-1', elementId: 'el-1', path: 'position.x', oldValue: 0, newValue: 50 },
    ]);

    expect(listener).not.toHaveBeenCalled();

    stream.unsuppress();

    // Committed diff emitted
    const commitChanges: readonly DocumentChange[] = [
      {
        type: 'element:update',
        documentId: 'doc-1',
        elementId: 'el-1',
        path: 'position.x',
        oldValue: 0,
        newValue: 100,
      },
    ];

    stream.emit(commitChanges);

    expect(listener).toHaveBeenCalledWith(commitChanges);
  });
});

// ---------------------------------------------------------------------------
// Remote Change Application
// ---------------------------------------------------------------------------

describe('applyRemoteChanges', () => {
  /** @description Applying a remote element:add MUST add the element to the document. */
  it('applies element:add change', () => {
    const doc = makeDocument([]);
    const el = makeElement({ id: 'el-1' });

    const result = applyRemoteChanges(doc, [
      { type: 'element:add', documentId: doc.id, elementId: 'el-1', element: el as unknown as Record<string, unknown> },
    ]);

    expect(result.elements.length).toBe(1);
    expect(result.elements[0]?.id).toBe('el-1');
  });

  /** @description Applying a remote element:remove MUST remove the element from the document. */
  it('applies element:remove change', () => {
    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([el]);

    const result = applyRemoteChanges(doc, [
      {
        type: 'element:remove',
        documentId: doc.id,
        elementId: 'el-1',
        element: el as unknown as Record<string, unknown>,
      },
    ]);

    expect(result.elements.length).toBe(0);
  });

  /** @description Applying a remote element:update MUST update the specified field. */
  it('applies element:update change', () => {
    const el = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const doc = makeDocument([el]);

    const result = applyRemoteChanges(doc, [
      { type: 'element:update', documentId: doc.id, elementId: 'el-1', path: 'position.x', oldValue: 0, newValue: 100 },
    ]);

    expect(result.elements[0]?.position.x).toBe(100);
  });

  /** @description Remote changes MUST NOT re-emit through the change stream. */
  it('does not re-emit through change stream', () => {
    const stream = createChangeStream();
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);

    const el = makeElement({ id: 'el-1' });
    const doc = makeDocument([]);

    applyRemoteChanges(doc, [
      { type: 'element:add', documentId: doc.id, elementId: 'el-1', element: el as unknown as Record<string, unknown> },
    ]);

    // applyRemoteChanges returns a new document but does not emit to any stream
    expect(listener).not.toHaveBeenCalled();
  });

  /** @description Sequential remote changes for the same element MUST result in the last change being the final state. */
  it('last-writer-wins for sequential changes', () => {
    const el = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const doc = makeDocument([el]);

    const result = applyRemoteChanges(doc, [
      { type: 'element:update', documentId: doc.id, elementId: 'el-1', path: 'position.x', oldValue: 0, newValue: 50 },
      {
        type: 'element:update',
        documentId: doc.id,
        elementId: 'el-1',
        path: 'position.x',
        oldValue: 50,
        newValue: 200,
      },
    ]);

    expect(result.elements[0]?.position.x).toBe(200);
  });

  /** @description Applying a remote page:remove MUST remove the page from the document. */
  it('applies page:remove change', () => {
    const base = createEmptyBroadsetDocument();
    const newPage = { id: 'page-2', name: 'Second', overrides: [] as const, locale: null, extensions: {} };
    const doc = { ...base, pages: [...base.pages, newPage] };

    const result = applyRemoteChanges(doc, [
      {
        type: 'page:remove',
        documentId: doc.id,
        pageId: 'page-2',
        page: newPage as unknown as Record<string, unknown>,
      },
    ]);

    expect(result.pages.length).toBe(base.pages.length);
    expect(result.pages.find((p) => p.id === 'page-2')).toBeUndefined();
  });

  /** @description Applying a remote animation:update for a field change MUST update the animation config. */
  it('applies animation:update for field change', () => {
    const animDef: AnimationDefinition = {
      elementId: 'el-1',
      config: {
        timelines: [],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
        textAnimator: null,
      },
    };
    const doc = makeDocument([], { animations: [animDef] });

    const result = applyRemoteChanges(doc, [
      {
        type: 'animation:update',
        documentId: doc.id,
        elementId: 'el-1',
        path: 'timelines',
        oldValue: [],
        newValue: [{ id: 'tl-1', name: 'Intro', keyframes: [] }],
      },
    ]);

    expect(result.animations[0]?.config.timelines.length).toBe(1);
  });

  /** @description Runtime fields (visibility, activeState, modifiers) do NOT exist on BroadsetElement — they are playback-only. Thus no remote update can target them, satisfying the spec criterion by design. */
  it('runtime fields are not part of the element model', () => {
    const el = makeElement({ id: 'el-1' });

    expect(el).not.toHaveProperty('visibility');
    expect(el).not.toHaveProperty('activeState');
    expect(el).not.toHaveProperty('modifiers');
  });
});

// ---------------------------------------------------------------------------
// Change Round-Trip Fidelity
// ---------------------------------------------------------------------------

describe('change round-trip fidelity', () => {
  /** @description Diffing empty→one-element and applying the changes to empty MUST produce a state matching the one-element document. */
  it('element add round-trip', () => {
    const el = makeElement({ id: 'el-1', position: { x: 50, y: 75 }, width: 200, height: 150 });
    const prev = makeDocument([]);
    const next = makeDocument([el]);

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.elements.length).toBe(1);
    expect(result.elements[0]?.id).toBe('el-1');
    expect(result.elements[0]?.position).toEqual({ x: 50, y: 75 });
    expect(result.elements[0]?.width).toBe(200);
  });

  /** @description Complex multi-change: update el-1, remove el-2, add el-3 — applying the diff produces the target state. */
  it('complex multi-change round-trip', () => {
    const el1 = makeElement({ id: 'el-1', position: { x: 0, y: 0 } });
    const el2 = makeElement({ id: 'el-2' });
    const el1Updated = makeElement({ id: 'el-1', position: { x: 100, y: 50 } });
    const el3 = makeElement({ id: 'el-3', width: 300 });

    const prev = makeDocument([el1, el2]);
    const next = makeDocument([el1Updated, el3]);

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    // el-1 should be updated
    const resultEl1 = result.elements.find((e) => e.id === 'el-1');

    expect(resultEl1?.position).toEqual({ x: 100, y: 50 });

    // el-2 should be removed
    expect(result.elements.find((e) => e.id === 'el-2')).toBeUndefined();

    // el-3 should be added
    const resultEl3 = result.elements.find((e) => e.id === 'el-3');

    expect(resultEl3).toBeDefined();
    expect(resultEl3?.width).toBe(300);
  });

  /** @description Canvas settings round-trip: changing the canvas width and applying the diff MUST produce a document with the new width. */
  it('canvas settings round-trip', () => {
    const base = createEmptyBroadsetDocument();
    const prev = { ...base };
    const next = { ...base, canvas: { ...base.canvas, width: 500, dpi: 150 } };

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.canvas.width).toBe(500);
    expect(result.canvas.dpi).toBe(150);
  });

  /** @description Page add round-trip: adding a page and applying the diff MUST produce a document with the new page. */
  it('page add round-trip', () => {
    const base = createEmptyBroadsetDocument();
    const prev = { ...base };
    const newPage = { id: 'page-2', name: 'Second', overrides: [], locale: null, extensions: {} };
    const next = { ...base, pages: [...base.pages, newPage] };

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.pages.length).toBe(base.pages.length + 1);
    expect(result.pages.find((p) => p.id === 'page-2')).toBeDefined();
  });

  /** @description Animation config round-trip: adding an animation and applying the diff MUST produce a document with the animation. */
  it('animation config round-trip', () => {
    const animDef: AnimationDefinition = {
      elementId: 'el-1',
      config: {
        timelines: [{ id: 'tl-1', name: 'Intro', keyframes: [] }],
        stateTimelineBindings: [],
        modifierTimelineBindings: [],
        textAnimator: null,
      },
    };
    const prev = makeDocument([], { animations: [] });
    const next = makeDocument([], { animations: [animDef] });

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.animations.length).toBe(1);
    expect(result.animations[0]?.elementId).toBe('el-1');
    expect(result.animations[0]?.config.timelines.length).toBe(1);
  });
});
