/**
 * Immutable array helpers shared by the transition guard and actions editors. Both editors mutate
 * a readonly draft array (clauses, actions) at a single index and must never mutate the source
 * array in place, per the Zustand-adjacent immutability rule these presentational editors follow.
 */

export function replaceAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

export function removeAt<T>(items: readonly T[], index: number): readonly T[] {
  return items.filter((_, i) => i !== index);
}
