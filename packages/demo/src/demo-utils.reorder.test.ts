import { type BroadsetDocument, createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';

import { buildLayerInfoList, buildRenderableDocumentForActivePage, reorderDocumentLayers } from './demo-utils';

function createReorderFixtureDocument(): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    elements: [
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
    ],
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
    const document: BroadsetDocument = {
      ...base,
      elements: [
        createDefaultElement('group', { id: 'el-parent', name: 'Parent' }),
        createDefaultElement('rectangle', { id: 'el-sibling', name: 'Sibling' }),
        createDefaultElement('text', { id: 'el-child', name: 'Child', parentId: 'el-parent' }),
      ],
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
    const document: BroadsetDocument = {
      ...base,
      elements: [
        createDefaultElement('group', { id: 'el-root', name: 'Root' }),
        createDefaultElement('ellipse', { id: 'el-unrelated', name: 'Unrelated' }),
        createDefaultElement('group', { id: 'el-child-group', name: 'Child Group', parentId: 'el-root' }),
        createDefaultElement('text', { id: 'el-grandchild', name: 'Grandchild', parentId: 'el-child-group' }),
      ],
    };

    const layers = buildLayerInfoList(document, 0);
    const rootIndex = layers.findIndex((layer) => layer.id === 'el-root');
    const childGroupIndex = layers.findIndex((layer) => layer.id === 'el-child-group');
    const grandchildIndex = layers.findIndex((layer) => layer.id === 'el-grandchild');

    expect(childGroupIndex).toBeGreaterThan(rootIndex);
    expect(grandchildIndex).toBeGreaterThan(childGroupIndex);
  });
});

describe('buildRenderableDocumentForActivePage', () => {
  /** @description Image elements with assetId and empty content must resolve renderable URL content from project assets. */
  it('hydrates image content from assets when content is empty', () => {
    const base = createEmptyBroadsetDocument();
    const document: BroadsetDocument = {
      ...base,
      elements: [
        createDefaultElement('image', {
          id: 'el-image',
          assetId: 'asset-image',
          content: '',
        }),
      ],
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
    const document: BroadsetDocument = {
      ...base,
      elements: [
        createDefaultElement('image', {
          id: 'el-image',
          assetId: 'asset-image',
          content: 'https://picsum.photos/id/103/150/150',
        }),
      ],
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
