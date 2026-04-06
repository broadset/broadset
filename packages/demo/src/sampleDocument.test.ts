import { broadsetDocumentSchema, broadsetProjectSchema, BUILT_IN_ELEMENT_TYPES } from '@broadset/model';

import { SAMPLE_DOCUMENT, SAMPLE_PROJECT } from './sampleDocument';

describe('sample document fixture', () => {
  it('passes the Broadset document and project schemas', () => {
    expect(() => broadsetDocumentSchema.parse(SAMPLE_DOCUMENT)).not.toThrow();
    expect(() => broadsetProjectSchema.parse(SAMPLE_PROJECT)).not.toThrow();
  });

  it('covers all 11 built-in element types across at least two pages', () => {
    const parsedProject = broadsetProjectSchema.parse(SAMPLE_PROJECT);
    const renderedTypes = new Set(
      parsedProject.documents.flatMap((document) => document.elements.map((element) => element.type)),
    );

    expect(parsedProject.documents[0]?.pages.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(parsedProject.documents[0]?.canvas.width ?? 0).toBeGreaterThan(0);
    expect(parsedProject.documents[0]?.canvas.height ?? 0).toBeGreaterThan(0);

    expect(renderedTypes).toEqual(new Set(BUILT_IN_ELEMENT_TYPES));
  });
});
