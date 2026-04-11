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

  /**
   * @description Keeps the live demo shell polished by preventing placeholder example.com media URLs that render as broken assets in the browser preview.
   */
  it('does not rely on unresolved placeholder CDN assets', () => {
    expect(JSON.stringify(SAMPLE_PROJECT)).not.toContain('https://cdn.example.com/');
  });

  /**
   * @description At least one animation MUST include `translateX` keyframes to exercise the transform animation path in the sample document.
   */
  it('includes at least one animation with transform keyframes (translateX)', () => {
    const hasTranslateX = SAMPLE_DOCUMENT.animations.some((anim) =>
      anim.config.timelines.some((tl) => tl.keyframes.some((kf) => 'translateX' in kf.properties)),
    );

    expect(hasTranslateX).toBe(true);
  });

  /**
   * @description At least one animation MUST bind both IN and OUT states so the demo exercises state-based animation transitions.
   */
  it('includes at least one animation with both IN and OUT state bindings', () => {
    const hasInOut = SAMPLE_DOCUMENT.animations.some((anim) => {
      const stateNames = anim.config.stateTimelineBindings.map((b) => b.stateName);

      return stateNames.includes('IN') && stateNames.includes('OUT');
    });

    expect(hasInOut).toBe(true);
  });

  /**
   * @description The sample document MUST include elements with data field bindings so the live data integration path is exercised on load.
   */
  it('includes elements with data field bindings', () => {
    const elementsWithDataField = SAMPLE_DOCUMENT.elements.filter((el) => el.dataField !== null);

    expect(elementsWithDataField.length).toBeGreaterThanOrEqual(3);
  });
});
