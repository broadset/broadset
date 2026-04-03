import type { PageElement } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import type { SceneNode } from './scene-tree';
import { buildSceneTree } from './scene-tree';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeElement(overrides: Partial<PageElement> & { id: string }): PageElement {
  return {
    type: 'rectangle',
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    content: '',
    parentId: null,
    groupId: null,
    ...overrides,
  };
}

describe('Scene Tree Construction', () => {
  /**
   * @description Elements with null parentId must appear as root-level nodes.
   * This verifies the most basic tree-building behavior.
   */
  it('promotes elements with null parentId to root nodes', () => {
    const elements: readonly PageElement[] = [makeElement({ id: 'a' }), makeElement({ id: 'b' })];
    const roots = buildSceneTree(elements);

    expect(roots).toHaveLength(2);
    expect(roots[0]?.element.id).toBe('a');
    expect(roots[1]?.element.id).toBe('b');
  });

  /**
   * @description Elements referencing a non-existent parent must be promoted to
   * root-level nodes (orphan promotion), ensuring no elements are silently lost.
   */
  it('promotes elements with unresolved parentId to root nodes', () => {
    const elements: readonly PageElement[] = [makeElement({ id: 'a', parentId: 'nonexistent' })];
    const roots = buildSceneTree(elements);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.element.id).toBe('a');
    expect(roots[0]?.children).toHaveLength(0);
  });

  /**
   * @description Children with valid parentId must be nested under their parent
   * in the scene tree, not at the root level.
   */
  it('nests children under their parent', () => {
    const elements: readonly PageElement[] = [
      makeElement({ id: 'parent', type: 'group' }),
      makeElement({ id: 'child1', parentId: 'parent' }),
      makeElement({ id: 'child2', parentId: 'parent' }),
    ];
    const roots = buildSceneTree(elements);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.element.id).toBe('parent');
    expect(roots[0]?.children).toHaveLength(2);
    expect(roots[0]?.children[0]?.element.id).toBe('child1');
    expect(roots[0]?.children[1]?.element.id).toBe('child2');
  });

  /**
   * @description Sibling order in the scene tree must match the original document
   * order (position in the elements array). This ensures correct z-layering since
   * z-order is determined by array order.
   */
  it('preserves sibling order from document order', () => {
    const elements: readonly PageElement[] = [
      makeElement({ id: 'parent', type: 'group' }),
      makeElement({ id: 'first', parentId: 'parent' }),
      makeElement({ id: 'second', parentId: 'parent' }),
      makeElement({ id: 'third', parentId: 'parent' }),
    ];
    const roots = buildSceneTree(elements);
    const children = roots[0]?.children ?? [];

    expect(children.map((c: SceneNode) => c.element.id)).toEqual(['first', 'second', 'third']);
  });

  /**
   * @description An empty elements array must produce an empty root array,
   * not an error or undefined.
   */
  it('returns empty array for empty input', () => {
    const roots = buildSceneTree([]);

    expect(roots).toEqual([]);
  });

  /**
   * @description Deeply nested hierarchies (grandchildren) must be correctly
   * represented in the scene tree.
   */
  it('supports multi-level nesting', () => {
    const elements: readonly PageElement[] = [
      makeElement({ id: 'root', type: 'group' }),
      makeElement({ id: 'child', parentId: 'root', type: 'group' }),
      makeElement({ id: 'grandchild', parentId: 'child' }),
    ];
    const roots = buildSceneTree(elements);

    expect(roots).toHaveLength(1);
    expect(roots[0]?.children).toHaveLength(1);
    expect(roots[0]?.children[0]?.children).toHaveLength(1);
    expect(roots[0]?.children[0]?.children[0]?.element.id).toBe('grandchild');
  });
});
