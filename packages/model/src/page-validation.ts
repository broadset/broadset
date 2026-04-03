// ---------------------------------------------------------------------------
// Shared page integrity refinements for Zod schemas
// ---------------------------------------------------------------------------

interface PageLike {
  readonly elements: readonly { readonly id: string; readonly parentId: string | null }[];
}

/** Returns true when all element IDs within the page are unique. */
export function hasUniqueElementIds(page: PageLike): boolean {
  const ids = new Set<string>();

  for (const el of page.elements) {
    if (ids.has(el.id)) {
      return false;
    }

    ids.add(el.id);
  }

  return true;
}

/** Returns true when every non-null parentId references an element on the same page. */
export function hasValidParentIds(page: PageLike): boolean {
  const idSet = new Set(page.elements.map((el) => el.id));

  for (const el of page.elements) {
    if (el.parentId !== null && !idSet.has(el.parentId)) {
      return false;
    }
  }

  return true;
}

/** Returns true when no circular parentId chains exist. */
export function hasAcyclicParentIds(page: PageLike): boolean {
  const parentMap = new Map<string, string | null>();

  for (const el of page.elements) {
    parentMap.set(el.id, el.parentId);
  }

  for (const el of page.elements) {
    const visited = new Set<string>();
    let current: string | null = el.id;

    while (current !== null) {
      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      current = parentMap.get(current) ?? null;
    }
  }

  return true;
}
