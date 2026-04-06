import type { BroadsetElement } from '@broadset/model';

export interface SceneTreeNode {
  readonly element: BroadsetElement;
  readonly children: readonly SceneTreeNode[];
}

interface MutableSceneTreeNode {
  readonly element: BroadsetElement;
  readonly children: MutableSceneTreeNode[];
}

export function buildSceneTree(elements: readonly BroadsetElement[]): readonly SceneTreeNode[] {
  const nodesById = new Map<string, MutableSceneTreeNode>();

  for (const element of elements) {
    nodesById.set(element.id, {
      element,
      children: [],
    });
  }

  const roots: MutableSceneTreeNode[] = [];

  for (const element of elements) {
    const currentNode = nodesById.get(element.id);

    if (currentNode === undefined) {
      continue;
    }

    if (element.parentId === null) {
      roots.push(currentNode);
      continue;
    }

    const parentNode = nodesById.get(element.parentId);

    if (parentNode === undefined) {
      roots.push(currentNode);
      continue;
    }

    parentNode.children.push(currentNode);
  }

  return roots;
}
