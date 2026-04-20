import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { buildLayerInfoList, buildRenderableDocumentForActivePage, reorderDocumentLayers } from './demo-utils';

function createRootPageInstances(elements: readonly BroadsetElement[]) {
  return elements
    .filter((element) => element.parentId === null)
    .map((element) => ({
      elementId: element.id,
      transform: {
        position: { x: element.position.x, y: element.position.y, z: 0 },
        rotation: { x: 0, y: 0, z: element.rotation },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
    }));
}

function createReorderFixtureDocument(): BroadsetDocument {
  const base = createEmptyBroadsetDocument();
  const elements = [
    createDefaultElement('group', {
      id: 'el-group',
      name: 'Group',
    }),
    createDefaultElement('text', {
      id: 'el-child',
      name: 'Child',
      parentId: 'el-group',
    }),
    createDefaultElement('rectangle', {
      id: 'el-standalone',
      name: 'Standalone',
    }),
    createDefaultElement('image', {
      id: 'el-target',
      name: 'Target',
    }),
  ];

  return {
    ...base,
    elements,
    pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
  };
}

function toLayerOrder(document: BroadsetDocument): readonly string[] {
  return [...document.elements].reverse().map((element) => element.id);
}

describe('reorderDocumentLayers', () => {
  /** @description Dropping inside a target layer must assign the dragged layer parent so layer drag-drop can reparent content. */
  it('reparents dragged element on inside drop', () => {
    const document = createReorderFixtureDocument();

    const reordered = reorderDocumentLayers(document, 'el-standalone', 'el-group', 'inside');
    const moved = reordered.elements.find((element) => element.id === 'el-standalone');

    expect(moved?.parentId).toBe('el-group');
  });

  /** @description Dropping above a target layer must parent the dragged layer under that target to support fast hierarchy edits from the list. */
  it('reparents dragged layer when dropped above target', () => {
    const document = createReorderFixtureDocument();

    const reordered = reorderDocumentLayers(document, 'el-target', 'el-group', 'before');
    const layerOrder = toLayerOrder(reordered);
    const moved = reordered.elements.find((element) => element.id === 'el-target');

    expect(moved?.parentId).toBe('el-group');
    expect(layerOrder.indexOf('el-target')).toBeGreaterThan(layerOrder.indexOf('el-group'));
  });

  /** @description Dragging onto a descendant must be ignored to prevent parent cycles that would corrupt hierarchy traversal. */
  it('rejects drops that would create a parent cycle', () => {
    const document = createReorderFixtureDocument();

    const reordered = reorderDocumentLayers(document, 'el-group', 'el-child', 'inside');

    expect(reordered).toBe(document);
  });

  /** @description Inside drops on non-group targets must not reparent, preventing accidental parenting when dragging over regular layers. */
  it('ignores inside drops on non-group targets', () => {
    const document = createReorderFixtureDocument();

    const reordered = reorderDocumentLayers(document, 'el-standalone', 'el-target', 'inside');

    expect(reordered).toBe(document);
  });
});

describe('buildLayerInfoList', () => {
  /** @description Layer hierarchy must always display children below their parent even when source element order would place children above. */
  it('orders children after their parent in the visible layer list', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('group', { id: 'el-parent', name: 'Parent' }),
      createDefaultElement('rectangle', { id: 'el-sibling', name: 'Sibling' }),
      createDefaultElement('text', { id: 'el-child', name: 'Child', parentId: 'el-parent' }),
    ];
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    };

    const layers = buildLayerInfoList(document, 0);
    const parentIndex = layers.findIndex((layer) => layer.id === 'el-parent');
    const childIndex = layers.findIndex((layer) => layer.id === 'el-child');

    expect(parentIndex).toBeGreaterThanOrEqual(0);
    expect(childIndex).toBeGreaterThan(parentIndex);
  });

  /** @description Nested chains must preserve parent-before-child ordering at every depth so indentation also reflects correct structural order. */
  it('keeps nested descendants directly after their ancestors', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('group', { id: 'el-root', name: 'Root' }),
      createDefaultElement('ellipse', { id: 'el-unrelated', name: 'Unrelated' }),
      createDefaultElement('group', { id: 'el-child-group', name: 'Child Group', parentId: 'el-root' }),
      createDefaultElement('text', { id: 'el-grandchild', name: 'Grandchild', parentId: 'el-child-group' }),
    ];
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    };

    const layers = buildLayerInfoList(document, 0);
    const rootIndex = layers.findIndex((layer) => layer.id === 'el-root');
    const childGroupIndex = layers.findIndex((layer) => layer.id === 'el-child-group');
    const grandchildIndex = layers.findIndex((layer) => layer.id === 'el-grandchild');

    expect(childGroupIndex).toBeGreaterThan(rootIndex);
    expect(grandchildIndex).toBeGreaterThan(childGroupIndex);
  });

  /** @description Layer panel must include all active page instances even when an instance is hidden; visibility state should come from the page instance. */
  it('keeps hidden page instances in the layer list and marks them hidden', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('rectangle', { id: 'el-hidden', name: 'Hidden Root' }),
      createDefaultElement('text', { id: 'el-visible', name: 'Visible Root' }),
    ];
    const instances = createRootPageInstances(elements).map((instance) =>
      instance.elementId === 'el-hidden' ? { ...instance, visible: false } : instance,
    );
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: instances })),
    };

    const layers = buildLayerInfoList(document, 0);
    const hiddenLayer = layers.find((layer) => layer.id === 'el-hidden');
    const visibleLayer = layers.find((layer) => layer.id === 'el-visible');

    expect(hiddenLayer).toBeDefined();
    expect(hiddenLayer?.visible).toBe(false);
    expect(visibleLayer?.visible).toBe(true);
  });
});

describe('buildRenderableDocumentForActivePage', () => {
  /** @description Image elements with assetId and empty content must resolve renderable URL content from project assets. */
  it('hydrates image content from assets when content is empty', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('image', {
        id: 'el-image',
        assetId: 'asset-image',
        content: '',
      }),
    ];
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    };

    const renderable = buildRenderableDocumentForActivePage(document, 0, [
      {
        id: 'asset-image',
        name: 'Fixture Image',
        kind: 'image',
        mimeType: 'image/jpeg',
        source: {
          type: 'url',
          url: 'https://picsum.photos/id/206/150/150',
        },
      },
    ]);

    expect(renderable.elements[0]?.content).toBe('https://picsum.photos/id/206/150/150');
  });

  /** @description Explicit image content must not be overwritten by asset resolution. */
  it('keeps explicit image content when already provided', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('image', {
        id: 'el-image',
        assetId: 'asset-image',
        content: 'https://picsum.photos/id/103/150/150',
      }),
    ];
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    };

    const renderable = buildRenderableDocumentForActivePage(document, 0, [
      {
        id: 'asset-image',
        name: 'Fixture Image',
        kind: 'image',
        mimeType: 'image/jpeg',
        source: {
          type: 'url',
          url: 'https://picsum.photos/id/206/150/150',
        },
      },
    ]);

    expect(renderable.elements[0]?.content).toBe('https://picsum.photos/id/103/150/150');
  });
});

/* ------------------------------------------------------------------ */
/*  C4 — Nested DnD Guardrails and Edge Cases                         */
/* ------------------------------------------------------------------ */

function createDeepHierarchyFixture(): BroadsetDocument {
  const base = createEmptyBroadsetDocument();
  const elements = [
    createDefaultElement('group', { id: 'el-groupA', name: 'GroupA' }),
    createDefaultElement('text', { id: 'el-childA1', name: 'ChildA1', parentId: 'el-groupA' }),
    createDefaultElement('group', { id: 'el-childA2', name: 'ChildGroupA2', parentId: 'el-groupA' }),
    createDefaultElement('rectangle', { id: 'el-grandchild', name: 'Grandchild', parentId: 'el-childA2' }),
    createDefaultElement('group', { id: 'el-groupB', name: 'GroupB' }),
    createDefaultElement('ellipse', { id: 'el-childB1', name: 'ChildB1', parentId: 'el-groupB' }),
    createDefaultElement('image', { id: 'el-standalone', name: 'Standalone' }),
  ];

  return {
    ...base,
    elements,
    pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
  };
}

describe('reorderDocumentLayers — nested DnD guardrails (C4)', () => {
  /** @description Deep indirect cycle detection: dragging an ancestor (GroupA) into a grandchild must be rejected. */
  it('rejects indirect cycle through grandchild', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-groupA', 'el-grandchild', 'inside');

    expect(result).toBe(document);
  });

  /** @description Moving a grandchild from GroupA subtree into GroupB via inside-drop must reparent it correctly. */
  it('cross-parent reparent: grandchild from GroupA into GroupB', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-grandchild', 'el-groupB', 'inside');
    const moved = result.elements.find((el) => el.id === 'el-grandchild');

    expect(moved?.parentId).toBe('el-groupB');
  });

  /** @description Moving a child group (with its own child) between groups must move the entire subtree together. */
  it('subtree follows parent on cross-group move', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-childA2', 'el-groupB', 'inside');

    const movedGroup = result.elements.find((el) => el.id === 'el-childA2');
    const grandchild = result.elements.find((el) => el.id === 'el-grandchild');

    expect(movedGroup?.parentId).toBe('el-groupB');
    // Grandchild stays parented to its original parent (the moved group)
    expect(grandchild?.parentId).toBe('el-childA2');
  });

  /** @description Sibling reorder within the same group must change order but not parentId. */
  it('sibling reorder within same parent preserves parentId', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-childA1', 'el-childA2', 'after');

    const moved = result.elements.find((el) => el.id === 'el-childA1');

    // parentId stays the same (still under GroupA, not under ChildGroupA2)
    expect(moved?.parentId).toBe('el-groupA');
  });

  /** @description After-drop must position the drag source after the target's subtree, not between target and its children. */
  it('after-drop positions source after target subtree', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-standalone', 'el-groupA', 'after');

    // In layer order (reversed elements), standalone should appear after GroupA's entire subtree
    const layerOrder = [...result.elements].reverse().map((el) => el.id);
    const groupAIdx = layerOrder.indexOf('el-groupA');
    const grandchildIdx = layerOrder.indexOf('el-grandchild');
    const standaloneIdx = layerOrder.indexOf('el-standalone');

    // Standalone must come after all of GroupA's children
    expect(standaloneIdx).toBeGreaterThan(groupAIdx);
    expect(standaloneIdx).toBeGreaterThan(grandchildIdx);
  });

  /** @description Before-drop on a root group must reparent the dragged element into that group. */
  it('before-drop on root group reparents into target', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-standalone', 'el-groupA', 'before');

    const moved = result.elements.find((el) => el.id === 'el-standalone');

    expect(moved?.parentId).toBe('el-groupA');
  });

  /** @description Dropping a non-group element into another non-group must be rejected (only groups accept children). */
  it('rejects inside drop on non-group element at any depth', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-standalone', 'el-childA1', 'inside');

    expect(result).toBe(document);
  });

  /** @description Moving a group with children from root into another group must preserve the entire hierarchy. */
  it('preserves deep hierarchy when moving group with children into another group', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-groupA', 'el-groupB', 'inside');

    const groupA = result.elements.find((el) => el.id === 'el-groupA');
    const childA1 = result.elements.find((el) => el.id === 'el-childA1');
    const childA2 = result.elements.find((el) => el.id === 'el-childA2');
    const grandchild = result.elements.find((el) => el.id === 'el-grandchild');

    // GroupA now nested into GroupB
    expect(groupA?.parentId).toBe('el-groupB');
    // Internal hierarchy unchanged
    expect(childA1?.parentId).toBe('el-groupA');
    expect(childA2?.parentId).toBe('el-groupA');
    expect(grandchild?.parentId).toBe('el-childA2');
  });

  /** @description Self-drop must be a no-op, returning the same document reference. */
  it('self-drop is a no-op', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-groupA', 'el-groupA', 'inside');

    expect(result).toBe(document);
  });

  /** @description Dropping on a nonexistent target must be a no-op. */
  it('nonexistent target is a no-op', () => {
    const document = createDeepHierarchyFixture();
    const result = reorderDocumentLayers(document, 'el-standalone', 'el-nonexistent', 'before');

    expect(result).toBe(document);
  });
});

describe('buildLayerInfoList — depth and hierarchy (C4)', () => {
  /** @description Deep nesting must produce correct depth values at every level (0, 1, 2, …). */
  it('assigns correct depth for three levels of nesting', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('group', { id: 'el-root', name: 'Root' }),
      createDefaultElement('group', { id: 'el-mid', name: 'Mid', parentId: 'el-root' }),
      createDefaultElement('text', { id: 'el-deep', name: 'Deep', parentId: 'el-mid' }),
      createDefaultElement('rectangle', { id: 'el-toplevel', name: 'TopLevel' }),
    ];
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    };

    const layers = buildLayerInfoList(document, 0);
    const rootLayer = layers.find((l) => l.id === 'el-root');
    const midLayer = layers.find((l) => l.id === 'el-mid');
    const deepLayer = layers.find((l) => l.id === 'el-deep');
    const topLayer = layers.find((l) => l.id === 'el-toplevel');

    expect(rootLayer?.depth).toBe(0);
    expect(midLayer?.depth).toBe(1);
    expect(deepLayer?.depth).toBe(2);
    expect(topLayer?.depth).toBe(0);
  });

  /** @description A group with children must report hasChildren=true even when collapsed. */
  it('sets hasChildren on groups with children', () => {
    const base = createEmptyBroadsetDocument();
    const elements = [
      createDefaultElement('group', { id: 'el-parent', name: 'Parent' }),
      createDefaultElement('text', { id: 'el-child', name: 'Child', parentId: 'el-parent' }),
      createDefaultElement('group', { id: 'el-empty-group', name: 'EmptyGroup' }),
    ];
    const document: BroadsetDocument = {
      ...base,
      elements,
      pages: base.pages.map((page) => ({ ...page, elements: createRootPageInstances(elements) })),
    };

    const layers = buildLayerInfoList(document, 0);
    const parentLayer = layers.find((l) => l.id === 'el-parent');
    const emptyGroupLayer = layers.find((l) => l.id === 'el-empty-group');

    expect(parentLayer?.hasChildren).toBe(true);
    expect(emptyGroupLayer?.hasChildren).toBeFalsy();
  });
});
