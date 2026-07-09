import './runtime-canvas';

import { readPsd } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { BROADSET_XMP_NAMESPACE, readBroadsetXmp } from '../_shared/xmp';
import { exportPsdBytes } from './export';
import { makeDocument, makeElement } from './test-helpers';

/**
 * Phase 5 unit P5.2a — every PSD Broadset writes carries a
 * document-level XMP packet under the shared `broadset:` namespace
 * (IO-D-08). The packet lists each element's id and fingerprint so
 * re-import can reconcile identity against the layer tree.
 */

describe('PSD export — XMP metadata packet', () => {
  /**
   * @description Every exported PSD MUST carry a `broadset:`-
   * namespaced XMP packet at `imageResources.xmpMetadata`. The
   * packet round-trips through `readBroadsetXmp()` cleanly.
   */
  it('writes a broadset-namespaced XMP packet on every export', () => {
    const el = makeElement('rectangle', { id: 'rect-1', name: 'Rect' });
    const doc = makeDocument({ id: 'doc-xyz', elements: [el] });

    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    const xmp = psd.imageResources?.xmpMetadata;

    expect(xmp).toBeDefined();
    expect(xmp).toContain(BROADSET_XMP_NAMESPACE);

    const packet = readBroadsetXmp(xmp ?? '');

    expect(packet).not.toBeNull();
    expect(packet?.documentId).toBe('doc-xyz');
  });

  /**
   * @description The XMP packet MUST list every element with its
   * fingerprint so re-import can reconcile identity even when layer
   * names or positions change.
   */
  it('lists every element id in the XMP packet', () => {
    const a = makeElement('rectangle', { id: 'el-a', name: 'A' });
    const b = makeElement('ellipse', { id: 'el-b', name: 'B' });

    const doc = makeDocument({ elements: [a, b] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    const packet = readBroadsetXmp(psd.imageResources?.xmpMetadata ?? '');

    expect(packet).not.toBeNull();

    const ids = packet?.elements.map((e) => e.id) ?? [];

    expect(ids).toContain('el-a');
    expect(ids).toContain('el-b');
  });

  /**
   * @description Group elements appear in the XMP packet alongside
   * their children so reconciliation can recover the parent/child
   * link if the PSD layer group is flattened.
   */
  it('includes group elements in the XMP packet', () => {
    const group = makeElement('group', { id: 'grp-1', name: 'Group' });
    const child = makeElement('rectangle', { id: 'child-1', name: 'Child', parentId: 'grp-1' });

    const doc = makeDocument({ elements: [group, child] });
    const bytes = exportPsdBytes(doc);
    const psd = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });
    const packet = readBroadsetXmp(psd.imageResources?.xmpMetadata ?? '');

    const ids = packet?.elements.map((e) => e.id) ?? [];

    expect(ids).toContain('grp-1');
    expect(ids).toContain('child-1');
  });
});
