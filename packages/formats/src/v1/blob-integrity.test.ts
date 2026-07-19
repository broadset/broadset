import type { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { verifyBlobBytesV1 } from './blob-integrity';
import { computeSha256DigestV1 } from './blob-reference';

async function reference(bytes: Uint8Array): Promise<projectFormatV1.BlobReference> {
  const digest = await computeSha256DigestV1(bytes);

  return {
    digest,
    byteLength: bytes.byteLength,
    mediaType: 'application/octet-stream',
    source: { kind: 'package', path: `blobs/sha256/${digest.slice('sha256:'.length)}` },
  };
}

describe('v1 blob integrity boundary', () => {
  it('verifies matching bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);

    await expect(verifyBlobBytesV1({ reference: await reference(bytes), bytes })).resolves.toEqual({
      status: 'verified',
      bytes,
    });
  });

  it('rejects size, declared length, and digest mismatches without returning bytes', async () => {
    const expected = new Uint8Array([1, 2, 3]);
    const blob = await reference(expected);
    const wrongLength = { ...blob, byteLength: 4 };

    await expect(verifyBlobBytesV1({ reference: blob, bytes: expected, maxBytes: 2 })).resolves.toMatchObject({
      status: 'rejected',
      failure: { code: 'size-limit' },
    });
    await expect(verifyBlobBytesV1({ reference: wrongLength, bytes: expected })).resolves.toMatchObject({
      status: 'rejected',
      failure: { code: 'byte-length-mismatch' },
    });
    await expect(verifyBlobBytesV1({ reference: blob, bytes: new Uint8Array([3, 2, 1]) })).resolves.toMatchObject({
      status: 'rejected',
      failure: { code: 'digest-mismatch' },
    });
  });
});
