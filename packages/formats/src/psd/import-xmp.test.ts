import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { exportPsdBytes } from './export';
import { readDocumentXmpPacket } from './import-xmp';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 5 unit P5.4a — the fast-path import reads the Broadset XMP
 * packet written by P5.2a and uses it as the authoritative source of
 * element identity. A Broadset-exported PSD re-imports with every
 * element id intact, which is the floor every downstream
 * reconciliation step depends on.
 */

describe('readDocumentXmpPacket', () => {
  /**
   * @description A PSD produced by `exportPsdBytes` carries a
   * `broadset:` XMP packet; `readDocumentXmpPacket` parses it back
   * without touching any other PSD parts.
   */
  it('reads the broadset packet from an exported PSD', () => {
    const el = makeElement('rectangle', { id: 'el-1', name: 'Rect' });
    const doc = makeDocument({ id: 'doc-1', elements: [el] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    const packet = readDocumentXmpPacket(psd);

    expect(packet).not.toBeNull();
    expect(packet?.documentId).toBe('doc-1');
    expect(packet?.elements.map((e) => e.id)).toContain('el-1');
  });

  /**
   * @description A PSD with no `broadset:` XMP returns `null` so the
   * importer knows to fall back to layer-tree extraction (P5.4b) or
   * surface a warning.
   */
  it('returns null when the PSD carries no broadset packet', () => {
    expect(readDocumentXmpPacket({})).toBeNull();
    expect(readDocumentXmpPacket({ imageResources: {} })).toBeNull();
    expect(
      readDocumentXmpPacket({
        imageResources: { xmpMetadata: '<x:xmpmeta xmlns:x="adobe:ns:meta/"/>' },
      }),
    ).toBeNull();
  });

  /**
   * @description Malformed XMP (valid XML but missing required fields)
   * returns `null` — the importer degrades to layer-tree extraction
   * rather than throwing.
   */
  it('returns null for malformed XMP', () => {
    expect(
      readDocumentXmpPacket({
        imageResources: { xmpMetadata: 'not-valid-xml <<<<<<' },
      }),
    ).toBeNull();
  });
});
