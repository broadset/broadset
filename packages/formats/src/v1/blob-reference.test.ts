import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { computeSha256DigestV1, packageBlobReferenceV1 } from './blob-reference';

const EMPTY_SHA256 = 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('computeSha256DigestV1', () => {
  it('matches the SHA-256 empty-input vector', async () => {
    await expect(computeSha256DigestV1(new TextEncoder().encode(''))).resolves.toBe(EMPTY_SHA256);
  });

  it('returns a stable digest for non-empty bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);

    await expect(computeSha256DigestV1(bytes)).resolves.toBe(await computeSha256DigestV1(bytes));
  });

  it('hashes bytes backed by shared memory through a safe snapshot', async () => {
    const bytes = new Uint8Array(new SharedArrayBuffer(4));

    bytes.set([1, 2, 3, 4]);

    const expected = await computeSha256DigestV1(new Uint8Array([1, 2, 3, 4]));

    await expect(computeSha256DigestV1(bytes)).resolves.toBe(expected);
  });
});

describe('packageBlobReferenceV1', () => {
  it('describes bytes at the model-required content-addressed package path', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const reference = await packageBlobReferenceV1(bytes, 'image/png');
    const hexadecimal = reference.digest.slice('sha256:'.length);

    expect(reference).toEqual({
      digest: await computeSha256DigestV1(bytes),
      byteLength: bytes.byteLength,
      mediaType: 'image/png',
      source: { kind: 'package', path: `blobs/sha256/${hexadecimal}` },
    });
  });

  it('falls back to a schema-valid media type for malformed input', async () => {
    const reference = await packageBlobReferenceV1(new Uint8Array(), 'not a media type');

    expect(reference.mediaType).toBe('application/octet-stream');
    expect(projectFormatV1.blobReferenceSchema.safeParse(reference).success).toBe(true);
  });
});
