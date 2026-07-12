import type { projectFormatV1 as ProjectFormatV1 } from '@broadset/model';

const SHA256_PREFIX = 'sha256:';
const PACKAGE_BLOB_PREFIX = 'blobs/sha256/';
const DEFAULT_MEDIA_TYPE = 'application/octet-stream';
const MEDIA_TYPE_PATTERN = /^[^\s/]+\/[^\s/]+$/u;

function normalizeMediaType(mediaType: string): string {
  return MEDIA_TYPE_PATTERN.test(mediaType) ? mediaType : DEFAULT_MEDIA_TYPE;
}

export async function computeSha256DigestV1(bytes: Uint8Array): Promise<ProjectFormatV1.Sha256Digest> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `${SHA256_PREFIX}${hexadecimal}`;
}

export async function packageBlobReferenceV1(
  bytes: Uint8Array,
  mediaType: string,
): Promise<ProjectFormatV1.BlobReference> {
  const digest = await computeSha256DigestV1(bytes);

  return {
    digest,
    byteLength: bytes.byteLength,
    mediaType: normalizeMediaType(mediaType),
    source: { kind: 'package', path: `${PACKAGE_BLOB_PREFIX}${digest.slice(SHA256_PREFIX.length)}` },
  };
}
