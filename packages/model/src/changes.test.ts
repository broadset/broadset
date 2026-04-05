import { describe, expect, it } from '@jest/globals';

import { CHANGE_TYPES, changeSchema } from './changes';

const EXAMPLE_CHANGES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  [
    'element:add',
    {
      type: 'element:add',
      documentId: 'doc-1',
      elementId: 'e1',
      element: { id: 'e1', type: 'text' },
    },
  ],
  [
    'element:remove',
    {
      type: 'element:remove',
      documentId: 'doc-1',
      elementId: 'e1',
      element: { id: 'e1', type: 'text' },
    },
  ],
  [
    'element:update',
    {
      type: 'element:update',
      documentId: 'doc-1',
      elementId: 'e1',
      path: 'position.x',
      oldValue: 10,
      newValue: 50,
    },
  ],
  [
    'element:reorder',
    {
      type: 'element:reorder',
      documentId: 'doc-1',
      elementId: 'e1',
      fromIndex: 0,
      toIndex: 2,
    },
  ],
  [
    'animation:update',
    {
      type: 'animation:update',
      documentId: 'doc-1',
      elementId: 'e1',
      path: 'timelines.0.loop',
      oldValue: 'none',
      newValue: 'loop',
    },
  ],
  [
    'page:add',
    {
      type: 'page:add',
      documentId: 'doc-1',
      pageId: 'page-2',
      page: { id: 'page-2', name: 'Page 2' },
    },
  ],
  [
    'page:remove',
    {
      type: 'page:remove',
      documentId: 'doc-1',
      pageId: 'page-1',
      page: { id: 'page-1', name: 'Page 1' },
    },
  ],
  [
    'page:override:update',
    {
      type: 'page:override:update',
      documentId: 'doc-1',
      pageId: 'page-1',
      elementId: 'el-title',
      field: 'content',
      oldValue: 'Hello',
      newValue: 'Goodbye',
    },
  ],
  [
    'settings:update',
    {
      type: 'settings:update',
      documentId: 'doc-1',
      path: 'canvas.width',
      oldValue: 1920,
      newValue: 1280,
    },
  ],
  [
    'dataSchema:update',
    {
      type: 'dataSchema:update',
      documentId: 'doc-1',
      path: 'fields.0.name',
      oldValue: 'title',
      newValue: 'headline',
    },
  ],
  [
    'asset:add',
    {
      type: 'asset:add',
      assetId: 'asset-1',
      asset: { id: 'asset-1', kind: 'image' },
    },
  ],
  [
    'asset:remove',
    {
      type: 'asset:remove',
      assetId: 'asset-1',
      asset: { id: 'asset-1', kind: 'image' },
    },
  ],
  [
    'asset:update',
    {
      type: 'asset:update',
      assetId: 'asset-1',
      path: 'label',
      oldValue: 'Old',
      newValue: 'New',
    },
  ],
  [
    'project:settings:update',
    {
      type: 'project:settings:update',
      path: 'palette.primary',
      oldValue: '#111111',
      newValue: '#222222',
    },
  ],
];

/** @description The model exposes the full spec-defined vocabulary of document and project change events. */
describe('Change variant vocabulary', () => {
  /** @description The change stream must define exactly the documented fourteen change type literals. */
  it('defines exactly 14 change type literals', () => {
    expect(CHANGE_TYPES).toHaveLength(14);
    expect(CHANGE_TYPES).toEqual(
      expect.arrayContaining([
        'element:add',
        'element:remove',
        'element:update',
        'element:reorder',
        'animation:update',
        'page:add',
        'page:remove',
        'page:override:update',
        'settings:update',
        'dataSchema:update',
        'asset:add',
        'asset:remove',
        'asset:update',
        'project:settings:update',
      ]),
    );
  });

  /** @description Every spec-defined change variant must validate through the discriminated union schema. */
  it.each(EXAMPLE_CHANGES)('accepts %s change', (_label, change) => {
    const result = changeSchema.safeParse(change);

    expect(result.success).toBe(true);
  });

  /** @description Unknown change types must be rejected to preserve the event contract. */
  it('rejects unknown change type', () => {
    const result = changeSchema.safeParse({
      type: 'element:clone',
      documentId: 'doc-1',
    });

    expect(result.success).toBe(false);
  });
});

/** @description Each change variant must carry the minimum payload needed for replay and undo behavior. */
describe('Change payload contracts', () => {
  /** @description `element:add` must include documentId, elementId, and the full inserted element payload. */
  it('element:add carries documentId, elementId, and full element data', () => {
    const change = {
      type: 'element:add',
      documentId: 'doc-1',
      elementId: 'e1',
      element: { id: 'e1', type: 'rectangle' },
    };
    const result = changeSchema.safeParse(change);

    expect(change.documentId).toBe('doc-1');
    expect(change.elementId).toBe('e1');
    expect(change.element).toEqual({ id: 'e1', type: 'rectangle' });
    expect(result.success).toBe(true);
  });

  /** @description `element:update` must capture a path plus old/new values for deterministic patches. */
  it('element:update carries path, oldValue, and newValue', () => {
    const change = {
      type: 'element:update',
      documentId: 'doc-1',
      elementId: 'e1',
      path: 'position.x',
      oldValue: 10,
      newValue: 50,
    };
    const result = changeSchema.safeParse(change);

    expect(change.path).toBe('position.x');
    expect(change.oldValue).toBe(10);
    expect(change.newValue).toBe(50);
    expect(result.success).toBe(true);
  });

  /** @description `element:reorder` must carry both source and destination indices so z-order changes are reversible. */
  it('element:reorder carries fromIndex and toIndex', () => {
    const change = {
      type: 'element:reorder',
      documentId: 'doc-1',
      elementId: 'e1',
      fromIndex: 0,
      toIndex: 2,
    };
    const result = changeSchema.safeParse(change);

    expect(change.fromIndex).toBe(0);
    expect(change.toIndex).toBe(2);
    expect(result.success).toBe(true);
  });

  /** @description `element:remove` must carry the removed element so undo can restore it exactly. */
  it('element:remove carries full element data for undo', () => {
    const fullElement = {
      id: 'e1',
      type: 'text',
      content: 'Hello',
      position: { x: 10, y: 20 },
    };
    const change = {
      type: 'element:remove',
      documentId: 'doc-1',
      elementId: 'e1',
      element: fullElement,
    };
    const result = changeSchema.safeParse(change);

    expect(change.element).toEqual(fullElement);
    expect(result.success).toBe(true);
  });

  /** @description `page:override:update` must identify which override field changed and its before/after values. */
  it('page:override:update carries pageId, elementId, field, and delta values', () => {
    const change = {
      type: 'page:override:update',
      documentId: 'doc-1',
      pageId: 'page-1',
      elementId: 'el-title',
      field: 'content',
      oldValue: 'Hello',
      newValue: 'Goodbye',
    };
    const result = changeSchema.safeParse(change);

    expect(change.pageId).toBe('page-1');
    expect(change.elementId).toBe('el-title');
    expect(change.field).toBe('content');
    expect(result.success).toBe(true);
  });

  /** @description `asset:add` must carry the asset id and the full asset payload for project-level undo/replay. */
  it('asset:add carries assetId and full asset data', () => {
    const change = {
      type: 'asset:add',
      assetId: 'asset-1',
      asset: { id: 'asset-1', kind: 'image' },
    };
    const result = changeSchema.safeParse(change);

    expect(change.assetId).toBe('asset-1');
    expect(change.asset).toEqual({ id: 'asset-1', kind: 'image' });
    expect(result.success).toBe(true);
  });

  /** @description Missing required payload fields must fail validation instead of slipping through silently. */
  it('rejects incomplete payloads', () => {
    expect(
      changeSchema.safeParse({
        type: 'element:add',
        elementId: 'e1',
      }).success,
    ).toBe(false);

    expect(
      changeSchema.safeParse({
        type: 'page:add',
        documentId: 'doc-1',
        pageId: 'page-2',
      }).success,
    ).toBe(false);

    expect(
      changeSchema.safeParse({
        type: 'element:reorder',
        documentId: 'doc-1',
        elementId: 'e1',
        fromIndex: 0,
      }).success,
    ).toBe(false);
  });
});
