interface IdentifiedItem {
  readonly id: string;
}

interface ParentLinkedItem extends IdentifiedItem {
  readonly parentId: string | null;
}

interface PageOverrideRef {
  readonly elementId: string;
}

interface OverridePage {
  readonly overrides: readonly PageOverrideRef[];
}

interface OverrideDocument {
  readonly elements: readonly IdentifiedItem[];
  readonly pages: readonly OverridePage[];
}

/** Returns true when all item IDs in the collection are unique. */
export function hasUniqueElementIds(items: readonly IdentifiedItem[]): boolean {
  const ids = new Set<string>();

  for (const item of items) {
    if (ids.has(item.id)) {
      return false;
    }

    ids.add(item.id);
  }

  return true;
}

/** Returns true when every non-null parentId references another item in the same collection. */
export function hasValidParentIds(items: readonly ParentLinkedItem[]): boolean {
  const idSet = new Set(items.map((item) => item.id));

  for (const item of items) {
    if (item.parentId !== null && !idSet.has(item.parentId)) {
      return false;
    }
  }

  return true;
}

/** Returns true when the parentId graph contains no cycles. */
export function hasAcyclicParentIds(items: readonly ParentLinkedItem[]): boolean {
  const parentMap = new Map<string, string | null>();

  for (const item of items) {
    parentMap.set(item.id, item.parentId);
  }

  for (const item of items) {
    const visited = new Set<string>();
    let currentId: string | null = item.id;

    while (currentId !== null) {
      if (visited.has(currentId)) {
        return false;
      }

      visited.add(currentId);
      currentId = parentMap.get(currentId) ?? null;
    }
  }

  return true;
}

/** Returns true when every page override references an element defined on the document. */
export function hasValidPageOverrideReferences(document: OverrideDocument): boolean {
  const elementIds = new Set(document.elements.map((element) => element.id));

  for (const page of document.pages) {
    for (const override of page.overrides) {
      if (!elementIds.has(override.elementId)) {
        return false;
      }
    }
  }

  return true;
}
