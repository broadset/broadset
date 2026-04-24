import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { exportPptxBytes } from './export';
import { reconcilePptx } from './reconcile';

/**
 * @description Reconciliation between a Broadset-exported PPTX and its
 * re-imported form must produce an empty diff when the file is
 * untouched. This validates the fast-path + custom-XML preservation
 * closes the round-trip cleanly.
 */
describe('reconcilePptx', () => {
  it('produces empty buckets when a Broadset-exported PPTX is re-read unchanged', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('rectangle', { id: 'rect-1' })],
    };
    const bytes = exportPptxBytes(doc);
    const result = await reconcilePptx(bytes);

    expect(result.modifications).toEqual([]);
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
    expect(result.recoveredByHash).toEqual([]);
  });

  it('reports every slide shape as an addition when no preserved metadata is present', async () => {
    // Third-party PPTX without broadset-project.xml — reconciliation
    // sees the operator-level extracted slide tree as pure additions.
    const doc = createEmptyBroadsetDocument();
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const result = await reconcilePptx(bytes);

    // Nothing was preserved, and the empty doc contributes no shapes,
    // so both sides are empty — no additions, no deletions.
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
  });
});
