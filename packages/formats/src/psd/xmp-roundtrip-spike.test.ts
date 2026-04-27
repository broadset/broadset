import './runtime-canvas';

import { initializeCanvas, type Psd, readPsd, writePsdUint8Array } from 'ag-psd';
import { describe, expect, it } from 'vitest';

import { BROADSET_XMP_NAMESPACE, readBroadsetXmp, writeBroadsetXmp } from '../_shared/xmp';

/**
 * Phase 5 unit P5.1 — de-risking spike for the standards-only PSD
 * round-trip strategy. Verifies in-process that:
 *
 * 1. `ag-psd`'s `xmpMetadata` field is preserved byte-exact across a
 *    `writePsd → readPsd` cycle, so the shared `broadset:` XMP packet
 *    (IO-D-08) can ride in every Broadset-exported PSD and be
 *    recovered on re-import.
 * 2. A `broadset:`-namespaced packet produced by `writeBroadsetXmp()`
 *    round-trips through the same `ag-psd` cycle with the namespace
 *    identifier intact.
 *
 * This spike does NOT cover the manual verification that Photoshop
 * macOS preserves the XMP packet across Save (that part of the Phase
 * 1 spike requires a human with Photoshop). The Photoshop-side
 * verification is tracked as a manual spike in
 * `project/implementation/decisions.md` under `P5.1 PSD metadata
 * channel`.
 */

// Touch the initializer so ag-psd has a canvas factory available in
// Node's jsdom environment. ag-psd falls back to raw image data when
// no canvas is registered but `initializeCanvas()` is a no-op in
// browsers and keeps the runtime consistent.
initializeCanvas((): HTMLCanvasElement => {
  throw new Error('canvas not required for metadata-only spike');
});

function buildMinimalPsd(xmpMetadata: string): Psd {
  return {
    width: 16,
    height: 16,
    children: [
      {
        name: 'Background',
        top: 0,
        left: 0,
        bottom: 16,
        right: 16,
      },
    ],
    imageResources: { xmpMetadata },
  };
}

describe('ag-psd xmpMetadata round-trip (spike)', () => {
  /**
   * @description ag-psd MUST preserve the `xmpMetadata` string byte-
   * exact across a write → read cycle. This is the baseline that
   * lets the shared Broadset XMP packet survive export and be
   * recovered on re-import.
   */
  it('preserves xmpMetadata byte-exact across write → read', () => {
    const marker = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>TEST<?xpacket end="w"?>';
    const bytes = writePsdUint8Array(buildMinimalPsd(marker), { generateThumbnail: false });

    const readBack = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    expect(readBack.imageResources?.xmpMetadata).toBe(marker);
  });

  /**
   * @description A real `writeBroadsetXmp(packet)` output round-trips
   * through ag-psd with the `broadset:` namespace intact — so the
   * downstream `readBroadsetXmp()` can parse it back. Confirms the
   * full export → re-import chain for metadata, without any manual
   * fix-up.
   */
  it('round-trips a BroadsetXmp packet through ag-psd', () => {
    const packet = {
      documentId: 'doc-1',
      version: '1.0',
      exportedAt: '2026-04-24T00:00:00Z',
      elements: [{ id: 'el-1', fingerprint: '0123456789abcdef' }],
    };
    const xmpString = writeBroadsetXmp(packet);

    const bytes = writePsdUint8Array(buildMinimalPsd(xmpString), { generateThumbnail: false });
    const readBack = readPsd(bytes, {
      skipLayerImageData: true,
      skipCompositeImageData: true,
      skipThumbnail: true,
    });

    const recoveredXmp = readBack.imageResources?.xmpMetadata ?? '';

    expect(recoveredXmp).toContain(BROADSET_XMP_NAMESPACE);

    const recovered = readBroadsetXmp(recoveredXmp);

    expect(recovered).not.toBeNull();
    expect(recovered?.documentId).toBe('doc-1');
    expect(recovered?.elements[0]?.id).toBe('el-1');
  });
});
