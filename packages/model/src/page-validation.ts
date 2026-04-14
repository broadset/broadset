interface IdentifiedItem {
  readonly id: string;
}

interface ParentLinkedItem extends IdentifiedItem {
  readonly parentId: string | null;
}

interface PageElementRef {
  readonly elementId: string;
}

interface InstancePage {
  readonly elements: readonly PageElementRef[];
}

interface InstanceDocument {
  readonly elements: readonly ParentLinkedItem[];
  readonly pages: readonly InstancePage[];
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

/** Returns true when every page element reference points to a root-level element on the document. */
export function hasValidPageElementReferences(document: InstanceDocument): boolean {
  const rootElementIds = new Set(document.elements.filter((element) => element.parentId === null).map((el) => el.id));

  for (const page of document.pages) {
    for (const elementRef of page.elements) {
      if (!rootElementIds.has(elementRef.elementId)) {
        return false;
      }
    }
  }

  return true;
}
