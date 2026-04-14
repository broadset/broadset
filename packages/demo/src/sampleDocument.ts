import {
  type BroadsetDocument,
  broadsetDocumentSchema,
  type BroadsetProject,
  broadsetProjectSchema,
} from '@broadset/model';

import sampleFixture from './sampleDocument.json' with { type: 'json' };

const SAMPLE_DOCUMENT: BroadsetDocument = broadsetDocumentSchema.parse(sampleFixture.sampleDocument);
const SAMPLE_SOCIAL_DOCUMENT: BroadsetDocument = broadsetDocumentSchema.parse(sampleFixture.sampleSocialDocument);

const SAMPLE_PROJECT: BroadsetProject = broadsetProjectSchema.parse({
  ...sampleFixture.sampleProject,
  documents: [SAMPLE_DOCUMENT, SAMPLE_SOCIAL_DOCUMENT],
});

const DEMO_DOCUMENT: BroadsetDocument = broadsetDocumentSchema.parse(SAMPLE_DOCUMENT);

export { DEMO_DOCUMENT, SAMPLE_DOCUMENT, SAMPLE_PROJECT, SAMPLE_SOCIAL_DOCUMENT };
