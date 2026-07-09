import { describe, expect, it } from 'vitest';

import { dirtyElementIds, reconcilePsd } from './reconcile';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 5 unit P5.5 — PSD reconciliation wraps `_shared/reconcile` so
 * the PSD track doesn't duplicate the four-bucket diff logic. Unit
 * tests confirm the four reconciliation buckets (modifications,
 * additions, deletions, recoveredByHash) emerge correctly and that
 * `dirtyElementIds` surfaces edits the exporter must re-synthesise.
 */

describe('reconcilePsd', () => {
  /**
   * @description A document round-tripped with no edits produces no
   * buckets — reconciliation's "clean round-trip" floor.
   */
  it('emits empty buckets for an identical round-trip', () => {
    const a = makeElement('rectangle', { id: 'a' });
    const doc = makeDocument({ elements: [a] });
    const fingerprints = new Map<string, string>([['a', 'fp-a']]);

    const result = reconcilePsd({ preserved: doc, current: doc, fingerprintsByElementId: fingerprints });

    expect(result.modifications).toHaveLength(0);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
    expect(result.recoveredByHash).toHaveLength(0);
  });

  /**
   * @description An element present only in the current visual stream
   * lands in `additions` — Photoshop added a layer the Broadset
   * metadata knew nothing about.
   */
  it('reports a new layer as an addition', () => {
    const a = makeElement('rectangle', { id: 'a' });
    const b = makeElement('rectangle', { id: 'b' });
    const preserved = makeDocument({ elements: [a] });
    const current = makeDocument({ elements: [a, b] });
    const fingerprints = new Map<string, string>([
      ['a', 'fp-a'],
      ['b', 'fp-b'],
    ]);

    const result = reconcilePsd({ preserved, current, fingerprintsByElementId: fingerprints });

    expect(result.additions).toHaveLength(1);
    expect(result.additions[0]?.id).toBe('b');
  });

  /**
   * @description An element present only in the preserved metadata
   * lands in `deletions` — Photoshop removed the layer.
   */
  it('reports a removed layer as a deletion', () => {
    const a = makeElement('rectangle', { id: 'a' });
    const b = makeElement('rectangle', { id: 'b' });
    const preserved = makeDocument({ elements: [a, b] });
    const current = makeDocument({ elements: [a] });
    const fingerprints = new Map<string, string>([
      ['a', 'fp-a'],
      ['b', 'fp-b'],
    ]);

    const result = reconcilePsd({ preserved, current, fingerprintsByElementId: fingerprints });

    expect(result.deletions).toHaveLength(1);
    expect(result.deletions[0]?.id).toBe('b');
  });

  /**
   * @description When an external tool strips the `BsPs` tag and
   * the layer is re-imported under a new id, a matching fingerprint
   * pairs the deleted + added ids so reconciliation reports a
   * `recoveredByHash` entry rather than a spurious delete+add.
   */
  it('recovers identity by fingerprint when tags are stripped', () => {
    const preservedEl = makeElement('rectangle', { id: 'original' });
    const currentEl = makeElement('rectangle', { id: 'new-id-post-photoshop' });
    const preserved = makeDocument({ elements: [preservedEl] });
    const current = makeDocument({ elements: [currentEl] });
    const fingerprints = new Map<string, string>([
      ['original', 'fp-shared'],
      ['new-id-post-photoshop', 'fp-shared'],
    ]);

    const result = reconcilePsd({ preserved, current, fingerprintsByElementId: fingerprints });

    expect(result.recoveredByHash).toHaveLength(1);
    expect(result.additions).toHaveLength(0);
    expect(result.deletions).toHaveLength(0);
  });
});

describe('dirtyElementIds', () => {
  /**
   * @description An imported document (all elements `dirty: false`)
   * produces no dirty ids — exporter is free to emit preserved blobs
   * byte-identical.
   */
  it('returns empty for a document of clean elements', () => {
    const a = makeElement('rectangle', {
      id: 'a',
      extensions: { psd: { dirty: false } },
    });
    const doc = makeDocument({ elements: [a] });

    expect(dirtyElementIds(doc)).toEqual([]);
  });

  /**
   * @description Only the dirty elements are returned — the exporter
   * re-synthesises these from current Broadset state.
   */
  it('returns ids of elements with extensions.psd.dirty = true', () => {
    const clean = makeElement('rectangle', {
      id: 'clean',
      extensions: { psd: { dirty: false } },
    });
    const dirty = makeElement('rectangle', {
      id: 'dirty',
      extensions: { psd: { dirty: true } },
    });
    const doc = makeDocument({ elements: [clean, dirty] });

    expect(dirtyElementIds(doc)).toEqual(['dirty']);
  });

  /**
   * @description Elements without a PSD extensions namespace are
   * considered clean (the namespace was never populated — e.g.
   * purely Broadset-native elements the user created in the editor).
   */
  it('treats missing psd extension as clean', () => {
    const el = makeElement('rectangle', { id: 'a', extensions: {} });
    const doc = makeDocument({ elements: [el] });

    expect(dirtyElementIds(doc)).toEqual([]);
  });
});
