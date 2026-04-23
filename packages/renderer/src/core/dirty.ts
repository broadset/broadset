import type { BroadsetElement } from '@broadset/model';

/**
 * Classification of how the renderer must respond to an element change
 * between document snapshots. Used by the DOM controller to decide
 * whether to mount, remount, update, or leave a node alone.
 */
export type ElementChangeKind = 'mount' | 'remount' | 'dirty' | 'clean';

const COMPARE_FIELDS: readonly (keyof BroadsetElement)[] = [
  'name',
  'parentId',
  'position',
  'width',
  'height',
  'rotation',
  'locked',
  'style',
  'content',
  'typeConfig',
  'dataField',
  'visibleWhen',
  'repeater',
  'booleanOperation',
];

/**
 * Classifies the change between a previous and next element snapshot.
 *
 * - `mount` — the element is being rendered for the first time.
 * - `remount` — the element exists but its `type` changed, so the
 *   current renderer must be destroyed and a fresh one mounted.
 * - `dirty` — a tracked field differs and the renderer must update.
 * - `clean` — no tracked field changed and the renderer can be skipped.
 *
 * Uses structural deep equality via `JSON.stringify` on a narrow slice
 * of tracked fields. This is deliberately explicit (not a serialization
 * of the whole element) so spurious fields or internal metadata cannot
 * accidentally trigger updates, and so the classification is stable
 * against property-order variance in normal editor/producer code
 * paths.
 */
export function classifyElementChange(
  previous: BroadsetElement | undefined,
  next: BroadsetElement,
): ElementChangeKind {
  if (previous === undefined) {
    return 'mount';
  }

  if (previous.type !== next.type) {
    return 'remount';
  }

  for (const field of COMPARE_FIELDS) {
    if (!isFieldEqual(previous[field], next[field])) {
      return 'dirty';
    }
  }

  return 'clean';
}

function isFieldEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  return JSON.stringify(a) === JSON.stringify(b);
}
