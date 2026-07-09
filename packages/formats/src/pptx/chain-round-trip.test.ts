import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { assertReImportableBy, runChainRoundTrip } from '../_shared/test-infrastructure';
import { exportPptxBytes, importPptx } from './index';
import { readOoxmlPackage, readTextPart } from './ooxml/zip';
import { readPreservedPptxDocument, reconcilePptx } from './reconcile';

/**
 * Phase 8 P8.G1 — chain-round-trip test for PPTX. Exercises the
 * dedicated `source → export → import` unit-test path to match PDF,
 * PSD, and SVG coverage.
 */
describe('PPTX chain round-trip', () => {
  /**
   * @description Every exported PPTX MUST re-import as a valid OOXML
   * ZIP package with the presentation and Broadset custom XML parts.
   */
  it('re-imports via the OOXML package reader without errors', () => {
    const source = createEmptyBroadsetDocument();
    const bytes = exportPptxBytes(source);
    const pkg = assertReImportableBy(bytes, readOoxmlPackage, { formatLabel: 'pptx' });

    expect(readTextPart(pkg, 'ppt/presentation.xml')).not.toBeNull();
    expect(readTextPart(pkg, 'customXml/broadset-project.xml')).not.toBeNull();
  });

  /**
   * @description The shared chain harness covers the full loop:
   * source doc → exported bytes → imported Broadset doc. The imported
   * document MUST carry the same document id and element ids via the
   * P8.4a custom-XML fast path.
   */
  it('round-trips document and element identity via the shared chain harness', () => {
    const source = {
      ...createEmptyBroadsetDocument(),
      id: 'pptx-chain-doc',
      elements: [
        createDefaultElement('rectangle', { id: 'pptx-chain-rect', content: '' }),
        createDefaultElement('text', { id: 'pptx-chain-text', content: 'PPTX chain' }),
        createDefaultElement('ellipse', { id: 'pptx-chain-ellipse' }),
      ],
    };

    const result = runChainRoundTrip({
      source,
      exportBytes: exportPptxBytes,
      importDocument: importPptx,
    });
    const importedIds = result.imported.elements.map((el) => el.id);

    expect(result.imported.id).toBe('pptx-chain-doc');
    expect(importedIds).toContain('pptx-chain-rect');
    expect(importedIds).toContain('pptx-chain-text');
    expect(importedIds).toContain('pptx-chain-ellipse');
  });

  /**
   * @description Reconciliation against an untouched Broadset-exported
   * PPTX MUST be zero drift: no modifications, additions, deletions,
   * or hash recoveries.
   */
  it('reconciles an untouched export with zero drift', async () => {
    const source = {
      ...createEmptyBroadsetDocument(),
      id: 'pptx-chain-zero-drift',
      elements: [
        createDefaultElement('rectangle', { id: 'pptx-drift-rect', content: '' }),
        createDefaultElement('text', { id: 'pptx-drift-text', content: 'Zero drift' }),
      ],
    };
    const bytes = exportPptxBytes(source);
    const result = await reconcilePptx(bytes);

    expect(result.modifications).toEqual([]);
    expect(result.additions).toEqual([]);
    expect(result.deletions).toEqual([]);
    expect(result.recoveredByHash).toEqual([]);
  });

  /**
   * @description The Broadset custom XML part MUST preserve the
   * source document payload that reconciliation and editor merge UI
   * read from after a PPTX leaves Broadset and comes back.
   */
  it('preserves the source document in custom XML metadata', () => {
    const source = {
      ...createEmptyBroadsetDocument(),
      id: 'pptx-chain-preserved',
      elements: [createDefaultElement('rectangle', { id: 'pptx-preserved-rect' })],
    };
    const bytes = exportPptxBytes(source);
    const preserved = readPreservedPptxDocument(bytes);

    expect(preserved?.id).toBe('pptx-chain-preserved');
    expect(preserved?.elements.map((el) => el.id)).toContain('pptx-preserved-rect');
  });
});
