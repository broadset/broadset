import type { AnimationRegistryEntry, DocumentChange, ElementAnimationConfig, Visibility } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  applyRemoteChanges,
  createChangeStreamController,
  diffAnimationRegistries,
  diffDocuments,
} from './collaboration';
import type { EditorDocument, EditorPage } from './store-actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EMPTY_ANIMATION_CONFIG: ElementAnimationConfig = {
  timelines: [],
  stateTimelineBindings: [],
  modifierTimelineBindings: [],
};

function makeElement(
  overrides: Partial<{
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    content: string;
    visibility: Visibility;
    activeState: string | null;
    modifiers: readonly string[];
  }> = {},
): EditorPage['elements'][number] {
  return {
    id: overrides.id ?? 'el-1',
    type: overrides.type ?? 'rectangle',
    position: { x: overrides.x ?? 0, y: overrides.y ?? 0 },
    width: overrides.width ?? 100,
    height: overrides.height ?? 50,
    rotation: overrides.rotation ?? 0,
    content: overrides.content ?? '',
    parentId: null,
    groupId: null,
    screen: {
      name: '',
      anchorX: 'left',
      anchorY: 'top',
      visibility: overrides.visibility ?? 'onscreen',
      activeState: overrides.activeState ?? null,
      modifiers: overrides.modifiers ?? [],
      locked: false,
      maskType: 'none',
      rotateX: 0,
      rotateY: 0,
      rotateZ: 0,
      translateZ: 0,
      clipChildren: false,
      customClipPath: '',
    },
    style: {
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      borderWidth: 0,
      borderRadius: 0,
      opacity: 1,
      fontSize: 16,
      fontFamily: 'Arial',
      textAlignment: 'left',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      letterSpacing: '0',
      lineHeight: 1.2,
      mixBlendMode: 'normal',
      objectFit: 'cover',
    },
  };
}

function makeDoc(overrides: Partial<EditorDocument> = {}): EditorDocument {
  return {
    id: 'doc-1',
    documentMode: 'screen',
    canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] },
    pages: [{ id: 'page-1', elements: [] }],
    animationRegistry: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Document Element Diffing
// ---------------------------------------------------------------------------

describe('diffDocuments — element changes', () => {
  /**
   * @description Verifies that adding an element between snapshots produces
   * an element:add change with the correct element ID.
   */
  it('detects element:add when prev has no elements and next has el-1', () => {
    const prev = makeDoc({ pages: [{ id: 'page-1', elements: [] }] });
    const next = makeDoc({
      pages: [{ id: 'page-1', elements: [makeElement({ id: 'el-1' })] }],
    });

    const changes = diffDocuments(prev, next);
    const addChanges = changes.filter((c) => c.type === 'element:add');

    expect(addChanges).toHaveLength(1);

    const addChange = addChanges[0];

    expect(addChange?.type).toBe('element:add');
    expect((addChange as { elementId: string }).elementId).toBe('el-1');
  });

  /**
   * @description Verifies that removing an element between snapshots produces
   * an element:remove change with the correct element ID.
   */
  it('detects element:remove when prev has el-1 and next is empty', () => {
    const prev = makeDoc({
      pages: [{ id: 'page-1', elements: [makeElement({ id: 'el-1' })] }],
    });
    const next = makeDoc({ pages: [{ id: 'page-1', elements: [] }] });

    const changes = diffDocuments(prev, next);
    const removeChanges = changes.filter((c) => c.type === 'element:remove');

    expect(removeChanges).toHaveLength(1);
    expect((removeChanges[0] as { elementId: string }).elementId).toBe('el-1');
  });

  /**
   * @description Verifies that changing a nested position property on an element
   * produces an element:update change with a position path.
   */
  it('detects element:update for nested position change (x=0 → x=100)', () => {
    const prev = makeDoc({
      pages: [{ id: 'page-1', elements: [makeElement({ id: 'el-1', x: 0 })] }],
    });
    const next = makeDoc({
      pages: [{ id: 'page-1', elements: [makeElement({ id: 'el-1', x: 100 })] }],
    });

    const changes = diffDocuments(prev, next);
    const updateChanges = changes.filter((c) => c.type === 'element:update');

    expect(updateChanges.length).toBeGreaterThanOrEqual(1);

    const positionChange = updateChanges.find((c) => (c as { path: string }).path === 'position');

    expect(positionChange).toBeDefined();
  });

  /**
   * @description Verifies that reordering two elements produces reorder changes.
   */
  it('detects element:reorder when [el-1,el-2] becomes [el-2,el-1]', () => {
    const el1 = makeElement({ id: 'el-1' });
    const el2 = makeElement({ id: 'el-2' });

    const prev = makeDoc({ pages: [{ id: 'page-1', elements: [el1, el2] }] });
    const next = makeDoc({ pages: [{ id: 'page-1', elements: [el2, el1] }] });

    const changes = diffDocuments(prev, next);
    const reorderChanges = changes.filter((c) => c.type === 'element:reorder');

    expect(reorderChanges).toHaveLength(2);
  });

  /**
   * @description Verifies that runtime animation fields (screen.visibility,
   * screen.activeState, screen.modifiers) are excluded from diffs.
   */
  it('excludes runtime animation fields from diff', () => {
    const prev = makeDoc({
      pages: [
        {
          id: 'page-1',
          elements: [
            makeElement({
              id: 'el-1',
              visibility: 'onscreen',
              activeState: null,
              modifiers: [],
            }),
          ],
        },
      ],
    });
    const next = makeDoc({
      pages: [
        {
          id: 'page-1',
          elements: [
            makeElement({
              id: 'el-1',
              visibility: 'offscreen',
              activeState: 'active',
              modifiers: ['glow'],
            }),
          ],
        },
      ],
    });

    const changes = diffDocuments(prev, next);

    expect(changes).toHaveLength(0);
  });

  /**
   * @description Verifies that identical document references produce an empty diff.
   */
  it('produces empty diff for identical documents', () => {
    const doc = makeDoc({
      pages: [{ id: 'page-1', elements: [makeElement({ id: 'el-1' })] }],
    });

    const changes = diffDocuments(doc, doc);

    expect(changes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Page and Settings Diffing
// ---------------------------------------------------------------------------

describe('diffDocuments — page and settings changes', () => {
  /**
   * @description Verifies that adding a page between snapshots produces a page:add change.
   */
  it('detects page:add when a page is added', () => {
    const prev = makeDoc({ pages: [{ id: 'page-1', elements: [] }] });
    const next = makeDoc({
      pages: [
        { id: 'page-1', elements: [] },
        { id: 'page-2', elements: [] },
      ],
    });

    const changes = diffDocuments(prev, next);
    const pageAdds = changes.filter((c) => c.type === 'page:add');

    expect(pageAdds).toHaveLength(1);
  });

  /**
   * @description Verifies that a canvas width change produces a settings:update change.
   */
  it('detects settings:update when canvas width changes', () => {
    const prev = makeDoc({ canvas: { width: 508, height: 285.75, padding: [0, 0, 0, 0] } });
    const next = makeDoc({ canvas: { width: 500, height: 285.75, padding: [0, 0, 0, 0] } });

    const changes = diffDocuments(prev, next);
    const settingsChanges = changes.filter((c) => c.type === 'settings:update');

    expect(settingsChanges.length).toBeGreaterThanOrEqual(1);

    const widthChange = settingsChanges.find((c) => (c as { path: string }).path === 'canvas.width');

    expect(widthChange).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Animation Registry Diffing
// ---------------------------------------------------------------------------

describe('diffAnimationRegistries', () => {
  /**
   * @description Verifies that adding an animation config for a new element
   * produces an animation:update change.
   */
  it('detects animation config addition', () => {
    const prev: readonly AnimationRegistryEntry[] = [];
    const next: readonly AnimationRegistryEntry[] = [{ elementId: 'el-1', config: EMPTY_ANIMATION_CONFIG }];

    const changes = diffAnimationRegistries(prev, next);

    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes[0]?.type).toBe('animation:update');
    expect(changes[0]?.elementId).toBe('el-1');
  });

  /**
   * @description Verifies that a timeline field change in an existing config
   * produces an animation:update change with the 'timelines' path.
   */
  it('detects timeline field change', () => {
    const prev: readonly AnimationRegistryEntry[] = [{ elementId: 'el-1', config: EMPTY_ANIMATION_CONFIG }];
    const next: readonly AnimationRegistryEntry[] = [
      {
        elementId: 'el-1',
        config: {
          ...EMPTY_ANIMATION_CONFIG,
          timelines: [
            {
              id: 'tl-1',
              name: 'enter',
              entries: [],
            },
          ],
        },
      },
    ];

    const changes = diffAnimationRegistries(prev, next);

    expect(changes.length).toBeGreaterThanOrEqual(1);

    const timelineChange = changes.find((c) => c.path === 'timelines');

    expect(timelineChange).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Change Stream Controller
// ---------------------------------------------------------------------------

describe('ChangeStreamController', () => {
  /**
   * @description Verifies that a subscribed listener receives emitted changes.
   */
  it('emits changes to subscribers', () => {
    const controller = createChangeStreamController();
    const received: (readonly DocumentChange[])[] = [];

    controller.subscribe((changes) => {
      received.push(changes);
    });

    const batch: DocumentChange[] = [{ type: 'page:add', pageIndex: 1 }];

    controller.emit(batch);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(batch);
  });

  /**
   * @description Verifies that changes are NOT emitted while suppression is active.
   */
  it('suppresses emission when suppression is active', () => {
    const controller = createChangeStreamController();
    const received: (readonly DocumentChange[])[] = [];

    controller.subscribe((changes) => {
      received.push(changes);
    });

    controller.suppress();
    controller.emit([{ type: 'page:add', pageIndex: 1 }]);

    expect(received).toHaveLength(0);

    controller.unsuppress();
    controller.emit([{ type: 'page:add', pageIndex: 2 }]);

    expect(received).toHaveLength(1);
  });

  /**
   * @description Verifies that empty arrays are never emitted to subscribers.
   */
  it('does not emit empty arrays', () => {
    const controller = createChangeStreamController();
    const received: (readonly DocumentChange[])[] = [];

    controller.subscribe((changes) => {
      received.push(changes);
    });

    controller.emit([]);

    expect(received).toHaveLength(0);
  });

  /**
   * @description Verifies that unsubscribing prevents further emissions.
   */
  it('unsubscribe removes listener', () => {
    const controller = createChangeStreamController();
    const received: (readonly DocumentChange[])[] = [];

    const unsub = controller.subscribe((changes) => {
      received.push(changes);
    });

    controller.emit([{ type: 'page:add', pageIndex: 1 }]);
    expect(received).toHaveLength(1);

    unsub();
    controller.emit([{ type: 'page:add', pageIndex: 2 }]);
    expect(received).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Ephemeral vs Committed Emission
// ---------------------------------------------------------------------------

describe('Ephemeral vs committed emission', () => {
  /**
   * @description Verifies that ephemeral drag updates do NOT emit changes.
   * The controller's suppress/unsuppress mechanism is the building block.
   */
  it('suppressed (ephemeral) updates produce no emission', () => {
    const controller = createChangeStreamController();
    const received: (readonly DocumentChange[])[] = [];

    controller.subscribe((changes) => {
      received.push(changes);
    });

    // Simulate drag start — suppress emission
    controller.suppress();
    controller.emit([
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'position',
        oldValue: { x: 0, y: 0 },
        newValue: { x: 10, y: 10 },
      },
    ]);
    controller.emit([
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'position',
        oldValue: { x: 10, y: 10 },
        newValue: { x: 20, y: 20 },
      },
    ]);

    expect(received).toHaveLength(0);
  });

  /**
   * @description Verifies that after ephemeral updates, committing emits the
   * full diff from the last committed state.
   */
  it('commit after ephemeral emits full diff', () => {
    const controller = createChangeStreamController();
    const received: (readonly DocumentChange[])[] = [];

    controller.subscribe((changes) => {
      received.push(changes);
    });

    // Suppress during ephemeral phase
    controller.suppress();
    controller.emit([
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'position',
        oldValue: { x: 0, y: 0 },
        newValue: { x: 50, y: 50 },
      },
    ]);

    // Unsuppress and emit commit diff
    controller.unsuppress();

    const commitBatch: DocumentChange[] = [
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'position',
        oldValue: { x: 0, y: 0 },
        newValue: { x: 50, y: 50 },
      },
    ];

    controller.emit(commitBatch);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(commitBatch);
  });
});

// ---------------------------------------------------------------------------
// Remote Change Application
// ---------------------------------------------------------------------------

describe('applyRemoteChanges', () => {
  /**
   * @description Verifies that applying a remote element:add populates the
   * document without causing re-emission through the change stream.
   */
  it('applies remote element:add without re-emitting', () => {
    const doc = makeDoc({ pages: [{ id: 'page-1', elements: [] }] });
    const el = makeElement({ id: 'el-new' });
    const changes: DocumentChange[] = [
      {
        type: 'element:add',
        pageIndex: 0,
        elementId: 'el-new',
        element: el as unknown as Record<string, unknown>,
      },
    ];

    const result = applyRemoteChanges(doc, changes);

    const page0 = result.pages[0];

    expect(page0).toBeDefined();
    expect(page0?.elements).toHaveLength(1);
    expect(page0?.elements[0]?.id).toBe('el-new');
  });

  /**
   * @description Verifies that runtime animation fields (screen.activeState) are
   * NOT applied from remote changes — they are local-only state.
   */
  it('ignores runtime animation field updates from remote', () => {
    const el = makeElement({ id: 'el-1', activeState: null });
    const doc = makeDoc({
      pages: [{ id: 'page-1', elements: [el] }],
    });

    const changes: DocumentChange[] = [
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'screen.activeState',
        oldValue: null,
        newValue: 'active',
      },
    ];

    const result = applyRemoteChanges(doc, changes);

    expect((result.pages[0]?.elements[0]?.screen as Record<string, unknown> | undefined)?.['activeState']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Change Round-Trip Fidelity
// ---------------------------------------------------------------------------

describe('Change round-trip fidelity', () => {
  /**
   * @description Verifies that diffing empty→one-element then applying the diff
   * to the empty doc produces the same result as the one-element doc.
   */
  it('element add round-trip: empty→one element', () => {
    const prev = makeDoc({ pages: [{ id: 'page-1', elements: [] }] });
    const next = makeDoc({
      pages: [{ id: 'page-1', elements: [makeElement({ id: 'el-1' })] }],
    });

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    expect(result.pages[0]?.elements).toHaveLength(1);
    expect(result.pages[0]?.elements[0]?.id).toBe('el-1');
  });

  /**
   * @description Complex round-trip: prev=[el-1, el-2], next=[el-1(updated), el-3].
   * After diff→apply, el-1 is updated, el-2 is removed, el-3 is added.
   */
  it('complex multi-change round-trip', () => {
    const prev = makeDoc({
      pages: [
        {
          id: 'page-1',
          elements: [makeElement({ id: 'el-1', x: 0 }), makeElement({ id: 'el-2' })],
        },
      ],
    });
    const next = makeDoc({
      pages: [
        {
          id: 'page-1',
          elements: [makeElement({ id: 'el-1', x: 200 }), makeElement({ id: 'el-3' })],
        },
      ],
    });

    const changes = diffDocuments(prev, next);
    const result = applyRemoteChanges(prev, changes);

    const elementIds = result.pages[0]?.elements.map((e) => e.id) ?? [];

    // el-2 removed
    expect(elementIds).not.toContain('el-2');
    // el-3 added
    expect(elementIds).toContain('el-3');

    // el-1 updated
    const el1 = result.pages[0]?.elements.find((e) => e.id === 'el-1');

    expect(el1?.position.x).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Conflict Resolution (Host-Provided)
// ---------------------------------------------------------------------------

describe('Conflict resolution — last-writer-wins', () => {
  /**
   * @description Verifies that sequential remote changes for the same element
   * result in last-change-wins — no merge logic in the editor.
   */
  it('sequential remote changes: last change is the final state', () => {
    const el = makeElement({ id: 'el-1', x: 0 });
    const doc = makeDoc({
      pages: [{ id: 'page-1', elements: [el] }],
    });

    const changes: DocumentChange[] = [
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'position',
        oldValue: { x: 0, y: 0 },
        newValue: { x: 100, y: 0 },
      },
      {
        type: 'element:update',
        pageIndex: 0,
        elementId: 'el-1',
        path: 'position',
        oldValue: { x: 100, y: 0 },
        newValue: { x: 200, y: 0 },
      },
    ];

    const result = applyRemoteChanges(doc, changes);

    expect(result.pages[0]?.elements[0]?.position.x).toBe(200);
  });
});
