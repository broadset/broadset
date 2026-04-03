import { describe, expect, it } from '@jest/globals';

import {
  CHANGE_TYPES,
  changeSchema,
  type ElementAddChange,
  type ElementRemoveChange,
  type ElementReorderChange,
  type ElementUpdateChange,
} from './changes';

/** @description Verifies all 8 discriminated change variants exist and are recognised */
describe('Change variant vocabulary', () => {
  /** @description The system must define exactly 8 change type literals */
  it('defines exactly 8 change type literals', () => {
    expect(CHANGE_TYPES).toHaveLength(8);
    expect(CHANGE_TYPES).toEqual(
      expect.arrayContaining([
        'element:add',
        'element:remove',
        'element:update',
        'element:reorder',
        'animation:update',
        'page:add',
        'page:remove',
        'settings:update',
      ]),
    );
  });

  /** @description Each defined change type must be parseable by the discriminated union schema */
  it.each([
    [
      'element:add',
      {
        type: 'element:add' as const,
        pageIndex: 0,
        elementId: 'e1',
        element: { id: 'e1', type: 'text' },
      },
    ],
    [
      'element:remove',
      {
        type: 'element:remove' as const,
        pageIndex: 0,
        elementId: 'e1',
        element: { id: 'e1', type: 'text' },
      },
    ],
    [
      'element:update',
      {
        type: 'element:update' as const,
        pageIndex: 0,
        elementId: 'e1',
        path: 'position.x',
        oldValue: 10,
        newValue: 50,
      },
    ],
    [
      'element:reorder',
      {
        type: 'element:reorder' as const,
        pageIndex: 0,
        elementId: 'e1',
        fromIndex: 0,
        toIndex: 2,
      },
    ],
    [
      'animation:update',
      {
        type: 'animation:update' as const,
        elementId: 'e1',
        path: 'config.loop',
        oldValue: false,
        newValue: true,
      },
    ],
    ['page:add', { type: 'page:add' as const, pageIndex: 1 }],
    ['page:remove', { type: 'page:remove' as const, pageIndex: 1 }],
    [
      'settings:update',
      {
        type: 'settings:update' as const,
        path: 'canvas.width',
        oldValue: 1920,
        newValue: 1280,
      },
    ],
  ] as const)('accepts %s change', (_label, change) => {
    const result = changeSchema.safeParse(change);

    expect(result.success).toBe(true);
  });

  /** @description An unknown change type must be rejected by the schema */
  it('rejects unknown change type', () => {
    const result = changeSchema.safeParse({
      type: 'element:clone',
      pageIndex: 0,
    });

    expect(result.success).toBe(false);
  });
});

/** @description Verifies payload contracts for each change variant */
describe('Change payload contracts', () => {
  /** @description element:add must carry pageIndex, elementId, and full element data */
  it('element:add carries pageIndex, elementId, and full element', () => {
    const change: ElementAddChange = {
      type: 'element:add',
      pageIndex: 0,
      elementId: 'e1',
      element: { id: 'e1', type: 'rectangle' },
    };

    expect(change.pageIndex).toBe(0);
    expect(change.elementId).toBe('e1');
    expect(change.element).toEqual({ id: 'e1', type: 'rectangle' });

    const result = changeSchema.safeParse(change);

    expect(result.success).toBe(true);
  });

  /** @description element:update must carry path, oldValue, and newValue */
  it('element:update carries path, oldValue, and newValue', () => {
    const change: ElementUpdateChange = {
      type: 'element:update',
      pageIndex: 0,
      elementId: 'e1',
      path: 'position.x',
      oldValue: 10,
      newValue: 50,
    };

    expect(change.path).toBe('position.x');
    expect(change.oldValue).toBe(10);
    expect(change.newValue).toBe(50);

    const result = changeSchema.safeParse(change);

    expect(result.success).toBe(true);
  });

  /** @description element:reorder must carry fromIndex and toIndex */
  it('element:reorder carries fromIndex and toIndex', () => {
    const change: ElementReorderChange = {
      type: 'element:reorder',
      pageIndex: 0,
      elementId: 'e1',
      fromIndex: 0,
      toIndex: 2,
    };

    expect(change.fromIndex).toBe(0);
    expect(change.toIndex).toBe(2);

    const result = changeSchema.safeParse(change);

    expect(result.success).toBe(true);
  });

  /** @description element:remove must carry full element data for undo support */
  it('element:remove carries full element data for undo', () => {
    const fullElement = {
      id: 'e1',
      type: 'text',
      content: 'Hello',
      position: { x: 10, y: 20 },
    };

    const change: ElementRemoveChange = {
      type: 'element:remove',
      pageIndex: 0,
      elementId: 'e1',
      element: fullElement,
    };

    expect(change.element).toEqual(fullElement);

    const result = changeSchema.safeParse(change);

    expect(result.success).toBe(true);
  });

  /** @description element:add without element data must be rejected */
  it('rejects element:add without element data', () => {
    const result = changeSchema.safeParse({
      type: 'element:add',
      pageIndex: 0,
      elementId: 'e1',
    });

    expect(result.success).toBe(false);
  });

  /** @description element:reorder without toIndex must be rejected */
  it('rejects element:reorder without toIndex', () => {
    const result = changeSchema.safeParse({
      type: 'element:reorder',
      pageIndex: 0,
      elementId: 'e1',
      fromIndex: 0,
    });

    expect(result.success).toBe(false);
  });
});
