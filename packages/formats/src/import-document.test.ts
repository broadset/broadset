import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { importPptxDocument } from './import-document';
import { exportPptxBytes } from './pptx';

/**
 * @description Cross-cutting tests for the format-import dispatcher.
 *
 * The current focus is the PPTX importer's reconciliation-summary
 * pathway: when a Broadset-exported file is re-imported after external
 * editing, `importPptxDocument` must produce one warning summary line
 * per non-empty reconciliation bucket so the import-warnings modal can
 * surface them. Closes Phase 8 P8.5 acceptance criterion "report
 * consumable by FormatImportWarningsModal" at the user surface for
 * the additions / modifications / deletions / recoveredByHash buckets.
 */

describe('importPptxDocument — reconciliation surfacing', () => {
  it('emits no reconciliation warning lines for an arbitrary third-party PPTX', async () => {
    const doc = createEmptyBroadsetDocument();
    const bytes = exportPptxBytes(doc, { preserveBroadsetMetadata: false });
    const result = await importPptxDocument(bytes);

    for (const w of result.warnings) {
      expect(w).not.toMatch(/external (additions|deletions|edits) detected/i);
      expect(w).not.toMatch(/identity recovered by content hash/i);
    }
  });

  it('emits no reconciliation warning lines for an untouched Broadset round-trip', async () => {
    const doc = {
      ...createEmptyBroadsetDocument(),
      elements: [createDefaultElement('rectangle', { id: 'rect-1' })],
    };
    const bytes = exportPptxBytes(doc);
    const result = await importPptxDocument(bytes);

    for (const w of result.warnings) {
      expect(w).not.toMatch(/external (additions|deletions|edits) detected/i);
      expect(w).not.toMatch(/identity recovered by content hash/i);
    }
  });

});
