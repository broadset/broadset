/**
 * Document-level text-on-path reference validation.
 *
 * Phase 1 unit #10 promotes `textPathElementId` to a first-class field.
 * The per-element schema can only validate the field in isolation, so
 * the document schema enforces cross-element invariants through this
 * helper: the target must exist, must be a `path` element, and the
 * source must be a `text` element. Self-references are rejected.
 *
 * Because text-on-path references can only terminate on a `path`
 * element (paths cannot themselves reference another element via this
 * field), the reference graph is acyclic by construction — an explicit
 * cycle walk is unnecessary once the target-type invariant is
 * enforced.
 */

interface TextPathReferenceItem {
  readonly id: string;
  readonly type: string;
  readonly textPathElementId: string | null;
}

/**
 * Returns true when every `textPathElementId` on the collection
 * satisfies the document-level invariants: only text elements carry
 * it, no element references itself, the target exists in the same
 * collection, and the target is a `path` element.
 */
export function hasValidTextPathReferences(items: readonly TextPathReferenceItem[]): boolean {
  const byId = new Map<string, TextPathReferenceItem>();

  for (const item of items) {
    byId.set(item.id, item);
  }

  for (const item of items) {
    if (item.textPathElementId === null) {
      continue;
    }

    if (item.type !== 'text') {
      return false;
    }

    if (item.textPathElementId === item.id) {
      return false;
    }

    const target = byId.get(item.textPathElementId);

    if (target === undefined) {
      return false;
    }

    if (target.type !== 'path') {
      return false;
    }
  }

  return true;
}
