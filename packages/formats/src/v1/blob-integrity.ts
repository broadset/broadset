import type { projectFormatV1 as ProjectFormatV1 } from '@broadset/model';

import { computeSha256DigestV1 } from './blob-reference';

interface BlobIntegrityFailureV1 {
  readonly code: 'size-limit' | 'byte-length-mismatch' | 'digest-mismatch';
  readonly message: string;
}

type BlobIntegrityResultV1 =
  | { readonly status: 'verified'; readonly bytes: Uint8Array }
  | { readonly status: 'rejected'; readonly failure: BlobIntegrityFailureV1 };

export async function verifyBlobBytesV1(input: {
  readonly reference: ProjectFormatV1.BlobReference;
  readonly bytes: Uint8Array;
  readonly maxBytes?: number;
}): Promise<BlobIntegrityResultV1> {
  if (input.maxBytes !== undefined && input.bytes.byteLength > input.maxBytes) {
    return failure('size-limit', `Blob exceeded the ${String(input.maxBytes)} byte verification limit.`);
  }

  if (input.bytes.byteLength !== input.reference.byteLength) {
    return failure(
      'byte-length-mismatch',
      `Blob length ${String(input.bytes.byteLength)} did not match declared length ${String(input.reference.byteLength)}.`,
    );
  }

  const digest = await computeSha256DigestV1(input.bytes);

  if (digest !== input.reference.digest) {
    return failure('digest-mismatch', `Blob digest ${digest} did not match declared digest ${input.reference.digest}.`);
  }

  return { status: 'verified', bytes: input.bytes };
}

function failure(code: BlobIntegrityFailureV1['code'], message: string): BlobIntegrityResultV1 {
  return { status: 'rejected', failure: { code, message } };
}
