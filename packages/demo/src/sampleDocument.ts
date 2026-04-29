import { type BroadsetDocument, type BroadsetProject, broadsetProjectSchema } from '@broadset/model';

import sampleFixture from './sampleDocument.json' with { type: 'json' };

const SAMPLE_PROJECT: BroadsetProject = broadsetProjectSchema.parse(sampleFixture.sampleProject);
const sampleDocument = SAMPLE_PROJECT.documents[0];

if (sampleDocument === undefined) {
  throw new Error('Demo sample project must include at least one document.');
}

const DEMO_DOCUMENT: BroadsetDocument = sampleDocument;

export { DEMO_DOCUMENT, SAMPLE_PROJECT };
