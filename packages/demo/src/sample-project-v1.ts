import { projectFormatV1 } from '@broadset/model';

import sampleFixture from './sampleDocument.v1.json' with { type: 'json' };

const SAMPLE_PROJECT_V1: projectFormatV1.BroadsetProjectV1 = projectFormatV1.broadsetProjectV1Schema.parse(
  sampleFixture.sampleProject,
);
const sampleDocument = SAMPLE_PROJECT_V1.documents[0];

if (sampleDocument === undefined) {
  throw new Error('Demo v1 sample project must include at least one document.');
}

const DEMO_DOCUMENT_V1: projectFormatV1.BroadsetDocumentV1 = sampleDocument;

export { DEMO_DOCUMENT_V1, SAMPLE_PROJECT_V1 };
