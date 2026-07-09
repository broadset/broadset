import { BROADSET_FORMAT_IDS, type BroadsetElement } from '@broadset/model';

/**
 * Returns `element` with every present `extensions.<format>.dirty` flag
 * flipped to `true`. The per-format dirty flag is the single signal
 * exporters consult to decide between re-emitting the element from the
 * current Broadset state (dirty) and re-emitting the preserved original
 * blob byte-for-byte (clean). Any element-mutating editor action MUST
 * funnel its output through this helper; the store utilities in
 * `store-actions/transform.ts` apply it automatically to keep the rule
 * mechanical rather than per-call-site discipline.
 *
 * Behavior:
 *
 * - Only the four Broadset format ids (`psd`, `pdf`, `pptx`, `svg`) are
 *   considered. Unknown namespaces pass through unchanged — third-party
 *   extensions are not owned by this middleware.
 * - Non-object slots (a programmer error the load-time schema rejects)
 *   are skipped defensively rather than crashing the editor.
 * - When every present flag is already `true` the element reference is
 *   returned unchanged so Zustand's referential equality checks can
 *   skip spurious re-renders.
 * - The input is never mutated — the returned element is a shallow
 *   clone with a cloned `extensions` record and cloned format slots
 *   that actually changed.
 */
export function markElementExtensionsDirty(element: BroadsetElement): BroadsetElement {
  const { extensions } = element;

  let nextExtensions: Record<string, unknown> | null = null;

  for (const formatId of BROADSET_FORMAT_IDS) {
    const value = extensions[formatId];

    if (!isPlainObject(value)) {
      continue;
    }

    if (value['dirty'] === true) {
      continue;
    }

    nextExtensions ??= { ...extensions };
    nextExtensions[formatId] = { ...value, dirty: true };
  }

  if (nextExtensions === null) {
    return element;
  }

  return { ...element, extensions: nextExtensions };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
