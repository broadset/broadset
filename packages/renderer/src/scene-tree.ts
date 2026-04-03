import type { PageElement } from '@broadset/model';

// ---------------------------------------------------------------------------
// Scene tree types
// ---------------------------------------------------------------------------

/** A node in the hierarchical scene tree built from the flat element array. */
export interface SceneNode {
  readonly element: PageElement;
  readonly children: readonly SceneNode[];
}

// ---------------------------------------------------------------------------
// Scene tree construction
// ---------------------------------------------------------------------------

/**
 * Builds a hierarchical scene tree from a flat element array.
 *
 * - Elements with null or unresolved parentId become root nodes.
 * - Sibling order matches the original document order.
 * - Supports arbitrary nesting depth.
 */
export function buildSceneTree(elements: readonly PageElement[]): readonly SceneNode[] {
  // Build a lookup map for all element IDs
  const elementIds = new Set(elements.map((el) => el.id));

  // Collect children for each parent
  const childrenByParent = new Map<string, PageElement[]>();

  const roots: PageElement[] = [];

  for (const element of elements) {
    if (element.parentId === null || !elementIds.has(element.parentId)) {
      // Root node: null parent or unresolved parent (orphan promotion)
      roots.push(element);
    } else {
      // Child node: valid parent reference
      const siblings = childrenByParent.get(element.parentId);

      if (siblings !== undefined) {
        siblings.push(element);
      } else {
        childrenByParent.set(element.parentId, [element]);
      }
    }
  }

  // Recursively build nodes
  function buildNode(element: PageElement): SceneNode {
    const childElements = childrenByParent.get(element.id) ?? [];

    return {
      element,
      children: childElements.map(buildNode),
    };
  }

  return roots.map(buildNode);
}
