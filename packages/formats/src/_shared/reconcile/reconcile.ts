import type { BroadsetElement } from '@broadset/model';
import diff, { type Difference } from 'microdiff';

/**
 * Phase 2 `_shared/reconcile/` — unifies the re-import diff every
 * format importer produces. Given the last-known Broadset document
 * (from preserved XMP / `extensions.<format>` metadata) and the current
 * visual document (what the external tool currently shows), plus a
 * fingerprint map indexed by element id, produces the canonical
 * `ReconcileResult` used to stage an import-warnings UI and apply
 * per-element conflict markers.
 *
 * Wraps `microdiff` for the field-level delta computation so the
 * caller never has to walk style / content trees by hand.
 */

/**
 * A per-element modification: the id matches on both sides, but one
 * or more fields have diverged. `differences` is the flat microdiff
 * list so callers can render per-field conflict markers.
 */
interface ElementModification {
  readonly elementId: string;
  readonly before: BroadsetElement;
  readonly after: BroadsetElement;
  readonly differences: readonly Difference[];
}

/**
 * An element whose id disappeared between `preservedMetadata` and
 * `currentVisual` but whose fingerprint matched an id in the other
 * side — reconciliation re-links them so a stripped `data-bs-*` tag
 * doesn't look like a delete + add.
 */
interface RecoveredByHashEntry {
  readonly fingerprint: string;
  readonly preservedElement: BroadsetElement;
  readonly currentElement: BroadsetElement;
  readonly differences: readonly Difference[];
}

export interface ReconcileResult {
  readonly modifications: readonly ElementModification[];
  readonly additions: readonly BroadsetElement[];
  readonly deletions: readonly BroadsetElement[];
  readonly recoveredByHash: readonly RecoveredByHashEntry[];
}

interface ReconcileInput {
  readonly preservedMetadata: { readonly elements: readonly BroadsetElement[] };
  readonly currentVisual: { readonly elements: readonly BroadsetElement[] };
  /**
   * Fingerprint map keyed by element id — covers both the preserved
   * and current element populations. Callers compute fingerprints via
   * `_shared/fingerprint` before invoking `reconcile`.
   */
  readonly fingerprintsByElementId: ReadonlyMap<string, string>;
}

function indexByFingerprint(
  elements: readonly BroadsetElement[],
  fingerprints: ReadonlyMap<string, string>,
): Map<string, BroadsetElement> {
  const index = new Map<string, BroadsetElement>();

  for (const element of elements) {
    const fingerprint = fingerprints.get(element.id);

    if (fingerprint === undefined) continue;
    if (index.has(fingerprint)) continue;

    index.set(fingerprint, element);
  }

  return index;
}

function diffElement(before: BroadsetElement, after: BroadsetElement): readonly Difference[] {
  return diff(before, after);
}

/**
 * Reconciles the preserved-metadata document against the current
 * visual document. Walk order:
 *
 *  1. Group elements by id on both sides.
 *  2. For ids on both sides: diff them. Non-empty differences →
 *     `modifications`; empty differences → omitted (no change).
 *  3. For ids only in `preservedMetadata`: mark as `deletions`.
 *  4. For ids only in `currentVisual`: try to re-link via fingerprint
 *     match against any deletion. A hit moves the pair into
 *     `recoveredByHash`; no hit → `additions`.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const preservedById = new Map(input.preservedMetadata.elements.map((element) => [element.id, element]));
  const currentById = new Map(input.currentVisual.elements.map((element) => [element.id, element]));

  const modifications: ElementModification[] = [];
  const pendingDeletions: BroadsetElement[] = [];
  const pendingAdditions: BroadsetElement[] = [];

  for (const [id, before] of preservedById) {
    const after = currentById.get(id);

    if (after === undefined) {
      pendingDeletions.push(before);
      continue;
    }

    const differences = diffElement(before, after);

    if (differences.length > 0) {
      modifications.push({ elementId: id, before, after, differences });
    }
  }

  for (const [id, after] of currentById) {
    if (!preservedById.has(id)) {
      pendingAdditions.push(after);
    }
  }

  const deletionByFingerprint = indexByFingerprint(pendingDeletions, input.fingerprintsByElementId);
  const recoveredByHash: RecoveredByHashEntry[] = [];
  const recoveredDeletionIds = new Set<string>();
  const additions: BroadsetElement[] = [];

  for (const addition of pendingAdditions) {
    const fingerprint = input.fingerprintsByElementId.get(addition.id);
    const matchedDeletion = fingerprint === undefined ? undefined : deletionByFingerprint.get(fingerprint);

    if (matchedDeletion !== undefined && !recoveredDeletionIds.has(matchedDeletion.id)) {
      recoveredByHash.push({
        fingerprint: fingerprint ?? '',
        preservedElement: matchedDeletion,
        currentElement: addition,
        differences: diffElement(matchedDeletion, addition),
      });
      recoveredDeletionIds.add(matchedDeletion.id);
      continue;
    }

    additions.push(addition);
  }

  const deletions = pendingDeletions.filter((element) => !recoveredDeletionIds.has(element.id));

  return { modifications, additions, deletions, recoveredByHash };
}
