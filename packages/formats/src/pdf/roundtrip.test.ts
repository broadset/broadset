import { describe, expect, it } from 'vitest';

import { dirtyElementIds, reconcilePdf } from './roundtrip';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 6 unit P6.5 — PDF reconciliation wraps `_shared/reconcile` so
 * the PDF track doesn't duplicate the four-bucket diff logic. Unit
 * tests confirm the reconciliation buckets (modifications, additions,
 * deletions, recoveredByHash) emerge correctly and that
 * `dirtyElementIds` surfaces edits the exporter must re-synthesise.
 */

describe('reconcilePdf', () => {
  /**
   * @description A document round-tripped with no edits produces no
   * buckets — reconciliation's "clean round-trip" floor.
   */
  it('emits empty buckets for an identical round-trip', () => {
    const a = makeElement('rectangle', { id: 'a' });
    const doc = makeDocument({ elements: [a] });
    const fingerprints = new Map<string, string>([['a', 'fp-a']]);

    const result = reconcilePdf({ preserved: doc, current: doc, fingerprintsByElementId: fingerprints });

    expect(result.modifications).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.recoveredByHash).toHaveLength(0);
  });

  /**
   * @description An element in the current visual stream but missing
   * from preserved metadata lands in `additions` — e.g. a user drew a
   * new rectangle in Illustrator after the round-trip export.
   */
  it('reports a new element as an addition', () => {
    const a = makeElement('rectangle', { id: 'a' });
    const b = makeElement('rectangle', { id: 'b' });
    const preserved = makeDocument({ elements: [a] });
    const current = makeDocument({ elements: [a, b] });
    const fingerprints = new Map<string, string>([
      ['a', 'fp-a'],
      ['b', 'fp-b'],
    ]);

    const result = reconcilePdf({ preserved, current, fingerprintsByElementId: fingerprints });

    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]?.id).toBe('b');
  });

  /**
   * @description An element present only in preserved metadata lands
   * in `deletions` — the external tool removed it.
   */
  it('reports a removed element as a deletion', () => {
    const a = makeElement('rectangle', { id: 'a' });
    const b = makeElement('rectangle', { id: 'b' });
    const preserved = makeDocument({ elements: [a, b] });
    const current = makeDocument({ elements: [a] });
    const fingerprints = new Map<string, string>([
      ['a', 'fp-a'],
      ['b', 'fp-b'],
    ]);

    const result = reconcilePdf({ preserved, current, fingerprintsByElementId: fingerprints });

    expect(result.deletions).toHaveLength(1);
    expect(result.deletions[0]?.id).toBe('b');
  });

  /**
   * @description When an external tool strips the `/BSET` tag and the
   * element is re-imported under a new id, a matching fingerprint
   * pairs the deleted + added ids so reconciliation reports a
   * `recoveredByHash` entry rather than a spurious delete + add.
   */
  it('recovers identity by fingerprint when marked-content tags are stripped', () => {
    const preservedEl = makeElement('rectangle', { id: 'original' });
    const reimportedEl = makeElement('rectangle', { id: 'stripped' });
    const preserved = makeDocument({ elements: [preservedEl] });
    const current = makeDocument({ elements: [reimportedEl] });
    const fingerprints = new Map<string, string>([
      ['original', 'shared-fingerprint'],
      ['stripped', 'shared-fingerprint'],
    ]);

    const result = reconcilePdf({ preserved, current, fingerprintsByElementId: fingerprints });

    expect(result.recoveredByHash).toHaveLength(1);
    expect(result.deletions).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
  });
});

describe('dirtyElementIds', () => {
  /**
   * @description Elements with `extensions.pdf.dirty === true` are
   * the ones the exporter must re-synthesise from current Broadset
   * state; everything else re-emits the preserved original blob.
   */
  it('returns only elements whose extensions.pdf.dirty === true', () => {
    const clean = makeElement('rectangle', {
      id: 'clean',
      extensions: { pdf: { dirty: false } },
    });
    const dirty = makeElement('rectangle', {
      id: 'dirty',
      extensions: { pdf: { dirty: true } },
    });
    const nobodyElse = makeElement('rectangle', { id: 'untagged' });
    const doc = makeDocument({ elements: [clean, dirty, nobodyElse] });

    expect(dirtyElementIds(doc)).toEqual(['dirty']);
  });

  /**
   * @description Absent or malformed `extensions.pdf` blocks are
   * treated as clean — the exporter emits the preserved original blob
   * rather than re-synthesising the element from scratch.
   */
  it('treats missing or malformed extensions.pdf as clean', () => {
    const noExt = makeElement('rectangle', { id: 'no-extensions' });
    const emptyExt = makeElement('rectangle', { id: 'empty-extensions', extensions: {} });
    const nonObject = makeElement('rectangle', { id: 'non-object', extensions: { pdf: 'unexpected-string' } });
    const doc = makeDocument({ elements: [noExt, emptyExt, nonObject] });

    expect(dirtyElementIds(doc)).toEqual([]);
  });
});
