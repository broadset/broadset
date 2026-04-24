import './runtime-canvas';

import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { importPsd } from './import';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 5 unit P5.4a — a Broadset-exported PSD re-imports with its
 * document id and element ids restored from the XMP packet. This is
 * the headline fast-path round-trip behaviour: identity is preserved
 * even when layer names / positions / content are unchanged.
 */

describe('PSD import — XMP fast path', () => {
  /**
   * @description Re-importing an exported PSD restores the original
   * `document.id` from the XMP packet. Importer-synthesised ids do
   * not leak through the round-trip.
   */
  it('restores documentId from the XMP packet', () => {
    const el = makeElement('rectangle', { id: 'el-round', name: 'Rect' });
    const doc = makeDocument({ id: 'doc-round', elements: [el] });
    const bytes = exportPsdBytes(doc);

    const imported = importPsd(bytes);

    expect(imported.id).toBe('doc-round');
  });

  /**
   * @description The first imported element's id matches the first
   * XMP packet entry's id — no synthesized `psd-import-N` fallback
   * when the packet is present.
   */
  it('restores element ids from the XMP packet', () => {
    const a = makeElement('rectangle', { id: 'alpha', name: 'Alpha' });
    const doc = makeDocument({ id: 'doc-x', elements: [a] });
    const bytes = exportPsdBytes(doc);

    const imported = importPsd(bytes);

    expect(imported.elements[0]?.id).toBe('alpha');
  });

  /**
   * @description Imported elements whose ids matched the XMP packet
   * carry `extensions.psd.roundTrip.elementId` so downstream
   * reconciliation (P5.5) can trust the identity.
   */
  it('populates extensions.psd.roundTrip on reconciled elements', () => {
    const a = makeElement('rectangle', { id: 'alpha', name: 'Alpha' });
    const doc = makeDocument({ id: 'doc-x', elements: [a] });
    const bytes = exportPsdBytes(doc);

    const imported = importPsd(bytes);
    const extensions = imported.elements[0]?.extensions as
      | { readonly psd?: { readonly roundTrip?: { readonly elementId?: string; readonly signature?: string } } }
      | undefined;
    const roundTrip = extensions?.psd?.roundTrip;

    expect(roundTrip?.elementId).toBe('alpha');
    expect(roundTrip?.signature).toBe('BsPs');
  });
});
