import type { BroadsetElement } from '@broadset/model';
import { createDefaultElement } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { reconcile } from './reconcile';

/**
 * Phase 2 `_shared/reconcile/` — the reconciliation stage runs after
 * every importer to classify re-imported elements into modifications,
 * additions, deletions, or hash-recovered pairs. Tests pin the
 * semantics every format importer depends on.
 */

function elementAt(id: string, overrides: Partial<BroadsetElement> = {}): BroadsetElement {
  return createDefaultElement('rectangle', {
    id,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    content: '',
    ...overrides,
  });
}

describe('reconcile', () => {
  /**
   * @description Pure no-op: identical documents produce zero
   * modifications / additions / deletions / recoveries. This pins the
   * happy path for re-importing a document that hasn't been edited.
   */
  it('returns empty lists when the two documents are identical', () => {
    const element = elementAt('el-1');
    const result = reconcile({
      preservedMetadata: { elements: [element] },
      currentVisual: { elements: [element] },
      fingerprintsByElementId: new Map([['el-1', 'abc123']]),
    });

    expect(result.modifications).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.recoveredByHash).toHaveLength(0);
  });

  /**
   * @description An id-matched pair with a field difference produces a
   * single `modifications` entry containing the before/after elements
   * and the microdiff details — consumers render per-field conflicts.
   */
  it('reports a modification when an id matches but fields differ', () => {
    const before = elementAt('el-1', { width: 100 });
    const after = elementAt('el-1', { width: 150 });
    const result = reconcile({
      preservedMetadata: { elements: [before] },
      currentVisual: { elements: [after] },
      fingerprintsByElementId: new Map(),
    });

    expect(result.modifications).toHaveLength(1);

    const modification = result.modifications[0];

    expect(modification?.elementId).toBe('el-1');
    expect(modification?.before).toBe(before);
    expect(modification?.after).toBe(after);
    expect(modification?.differences.length).toBeGreaterThan(0);
  });

  /**
   * @description An id present in preserved but not current with no
   * fingerprint match produces a `deletions` entry.
   */
  it('reports a deletion when an id disappears with no fingerprint match', () => {
    const element = elementAt('el-1');
    const result = reconcile({
      preservedMetadata: { elements: [element] },
      currentVisual: { elements: [] },
      fingerprintsByElementId: new Map(),
    });

    expect(result.deletions).toHaveLength(1);
    expect(result.deletions[0]).toBe(element);
    expect(result.recoveredByHash).toHaveLength(0);
  });

  /**
   * @description An id present only in current with no fingerprint
   * match produces an `additions` entry.
   */
  it('reports an addition when a new id appears with no fingerprint match', () => {
    const element = elementAt('el-new');
    const result = reconcile({
      preservedMetadata: { elements: [] },
      currentVisual: { elements: [element] },
      fingerprintsByElementId: new Map(),
    });

    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]).toBe(element);
  });

  /**
   * @description When a deleted id and an added id share the same
   * fingerprint (the external tool stripped the `data-bs-*` tag but
   * the visible content is unchanged), reconciliation moves them into
   * `recoveredByHash` instead of reporting a delete + add.
   */
  it('recovers a renamed element via fingerprint match', () => {
    const preserved = elementAt('el-old');
    const current = elementAt('el-new');
    const fingerprint = 'fp-shared';
    const result = reconcile({
      preservedMetadata: { elements: [preserved] },
      currentVisual: { elements: [current] },
      fingerprintsByElementId: new Map([
        ['el-old', fingerprint],
        ['el-new', fingerprint],
      ]),
    });

    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.recoveredByHash).toHaveLength(1);

    const recovered = result.recoveredByHash[0];

    expect(recovered?.fingerprint).toBe(fingerprint);
    expect(recovered?.preservedElement).toBe(preserved);
    expect(recovered?.currentElement).toBe(current);
  });

  /**
   * @description When the hash-recovered pair's preserved and current
   * elements differ in some fields, the recovery entry carries the
   * microdiff so downstream UI can merge the cosmetic differences
   * into the recovered element.
   */
  it('includes microdiff differences in the recovery entry when fields differ', () => {
    const preserved = elementAt('el-old', { width: 100 });
    const current = elementAt('el-new', { width: 150 });
    const result = reconcile({
      preservedMetadata: { elements: [preserved] },
      currentVisual: { elements: [current] },
      fingerprintsByElementId: new Map([
        ['el-old', 'fp'],
        ['el-new', 'fp'],
      ]),
    });

    expect(result.recoveredByHash).toHaveLength(1);
    expect(result.recoveredByHash[0]?.differences.length).toBeGreaterThan(0);
  });

  /**
   * @description When two added elements share a fingerprint with a
   * single deletion, only the first is recovered; the second stays in
   * `additions` so we never silently collapse distinct elements.
   */
  it('only recovers the first matching deletion when multiple additions share a fingerprint', () => {
    const preserved = elementAt('el-old');
    const currentA = elementAt('el-a');
    const currentB = elementAt('el-b');
    const result = reconcile({
      preservedMetadata: { elements: [preserved] },
      currentVisual: { elements: [currentA, currentB] },
      fingerprintsByElementId: new Map([
        ['el-old', 'fp'],
        ['el-a', 'fp'],
        ['el-b', 'fp'],
      ]),
    });

    expect(result.recoveredByHash).toHaveLength(1);
    expect(result.additions).toHaveLength(1);
    expect(result.deletions).toHaveLength(0);
  });

  /**
   * @description Mixed scenario: one unchanged pair, one modified,
   * one added, one deleted, one hash-recovered. Ensures the four
   * output buckets partition the input correctly.
   */
  it('partitions a mixed-change document into the four output buckets', () => {
    const preservedIdentical = elementAt('el-same');
    const preservedModified = elementAt('el-mod', { width: 100 });
    const preservedDeleted = elementAt('el-gone');
    const preservedRecovered = elementAt('el-old-id');
    const currentIdentical = preservedIdentical;
    const currentModified = elementAt('el-mod', { width: 200 });
    const currentAdded = elementAt('el-added');
    const currentRecovered = elementAt('el-new-id');
    const result = reconcile({
      preservedMetadata: {
        elements: [preservedIdentical, preservedModified, preservedDeleted, preservedRecovered],
      },
      currentVisual: {
        elements: [currentIdentical, currentModified, currentAdded, currentRecovered],
      },
      fingerprintsByElementId: new Map([
        ['el-old-id', 'recovered-fp'],
        ['el-new-id', 'recovered-fp'],
      ]),
    });

    expect(result.modifications).toHaveLength(1);
    expect(result.modifications[0]?.elementId).toBe('el-mod');
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]?.id).toBe('el-added');
    expect(result.deletions).toHaveLength(1);
    expect(result.deletions[0]?.id).toBe('el-gone');
    expect(result.recoveredByHash).toHaveLength(1);
    expect(result.recoveredByHash[0]?.preservedElement.id).toBe('el-old-id');
    expect(result.recoveredByHash[0]?.currentElement.id).toBe('el-new-id');
  });
});
