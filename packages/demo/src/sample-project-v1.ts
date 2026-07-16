import { projectFormatV1 } from '@broadset/model';

import sampleFixture from './sampleDocument.v1.json' with { type: 'json' };

const SAMPLE_IMAGE_DIGEST = projectFormatV1.sha256DigestSchema.parse(
  'sha256:fb2315504b5d11dcedce1df1635bdd3b8a8231bbd2e474cac6c012eb6f51389c',
);
const SAMPLE_VIDEO_DIGEST = projectFormatV1.sha256DigestSchema.parse(
  'sha256:754ed2f212d495ae30ef2f68f8ab18b0ab162ce669f768373d79f72f1ba3c3bd',
);
const SAMPLE_IMAGE_BYTES = Uint8Array.of(
  137,
  80,
  78,
  71,
  13,
  10,
  26,
  10,
  0,
  0,
  0,
  13,
  73,
  72,
  68,
  82,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  1,
  8,
  6,
  0,
  0,
  0,
  31,
  21,
  196,
  137,
  0,
  0,
  0,
  13,
  73,
  68,
  65,
  84,
  120,
  218,
  99,
  100,
  248,
  207,
  240,
  31,
  0,
  5,
  254,
  2,
  254,
  95,
  106,
  139,
  229,
  0,
  0,
  0,
  0,
  73,
  69,
  78,
  68,
  174,
  66,
  96,
  130,
);
const SAMPLE_VIDEO_BYTES = Uint8Array.of(
  0,
  0,
  0,
  24,
  102,
  116,
  121,
  112,
  105,
  115,
  111,
  109,
  0,
  0,
  0,
  0,
  105,
  115,
  111,
  109,
  109,
  112,
  52,
  50,
);

const SAMPLE_PROJECT_V1: projectFormatV1.BroadsetProjectV1 = projectFormatV1.broadsetProjectV1Schema.parse(
  sampleFixture.sampleProject,
);
const sampleDocument = SAMPLE_PROJECT_V1.documents[0];

if (sampleDocument === undefined) {
  throw new Error('Demo v1 sample project must include at least one document.');
}

const DEMO_DOCUMENT_V1: projectFormatV1.BroadsetDocumentV1 = sampleDocument;
const SAMPLE_PROJECT_BLOBS_V1: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> = new Map([
  [SAMPLE_IMAGE_DIGEST, SAMPLE_IMAGE_BYTES],
  [SAMPLE_VIDEO_DIGEST, SAMPLE_VIDEO_BYTES],
]);

export { DEMO_DOCUMENT_V1, SAMPLE_PROJECT_BLOBS_V1, SAMPLE_PROJECT_V1 };
