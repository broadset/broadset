import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { broadsetDocumentV1Schema } from './index';

describe('broadsetDocumentV1Schema', () => {
  it('requires at least one page', () => {
    const document = createMinimalProjectV1().documents[0];

    expect(broadsetDocumentV1Schema.safeParse({ ...document, pages: [] }).success).toBe(false);
  });

  it('rejects motion documents without a timebase', () => {
    const document = createMinimalProjectV1().documents[0];

    expect(broadsetDocumentV1Schema.safeParse({ ...document, kind: 'motion' }).success).toBe(false);
  });
});
