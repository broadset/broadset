import { type AnimationDefinition, createEmptyBroadsetDocument, type DocumentChange } from '@broadset/model';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { type ChangeStream, createChangeStream, diffDocuments } from './collaboration';
import { makeDocument, makeElement } from './collaboration-test-helpers';

describe('diffDocuments - element diffing', () => {
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

describe('diffDocuments - page and settings diffing', () => {
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

describe('diffDocuments - animation diffing', () => {
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

describe('createChangeStream - ephemeral vs committed', () => {
  /** @description Ephemeral updates MUST be suppressed and not emitted to the listener. */
  it('suppressed (ephemeral) updates are not emitted', () => {
    const stream = createChangeStream();
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.suppress();

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

  /** @description After unsuppression, the committed diff MUST be emitted - the change stream itself just gates emission. The diffing of committed state is the caller's responsibility. */
  it('unsuppress allows the commit emission to reach listeners', () => {
    const stream = createChangeStream();
    const listener = jest.fn<(changes: readonly DocumentChange[]) => void>();

    stream.subscribe(listener);
    stream.suppress();

    stream.emit([
      { type: 'element:update', documentId: 'doc-1', elementId: 'el-1', path: 'position.x', oldValue: 0, newValue: 50 },
    ]);

    expect(listener).not.toHaveBeenCalled();

    stream.unsuppress();

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
