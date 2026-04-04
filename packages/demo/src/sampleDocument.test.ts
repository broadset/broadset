import { broadsetDocumentSchema, BUILT_IN_ELEMENT_TYPES, fullDocumentSchema } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { SAMPLE_DOCUMENT } from './sampleDocument';

describe('Sample Document Fixture', () => {
  /**
   * @description The sample document must pass the basic BroadsetDocument Zod
   * schema, ensuring structural validity (canvas, pages, elements).
   */
  it('passes broadsetDocumentSchema validation', () => {
    const result = broadsetDocumentSchema.safeParse(SAMPLE_DOCUMENT);

    expect(result.success).toBe(true);
  });

  /**
   * @description The sample document must pass the full document schema which
   * includes strict style and screen property validation.
   */
  it('passes fullDocumentSchema validation', () => {
    const result = fullDocumentSchema.safeParse(SAMPLE_DOCUMENT);

    expect(result.success).toBe(true);
  });

  /**
   * @description The sample document must contain at least 2 pages to exercise
   * multi-page rendering in the demo.
   */
  it('contains at least 2 pages', () => {
    expect(SAMPLE_DOCUMENT.pages.length).toBeGreaterThanOrEqual(2);
  });

  /**
   * @description The sample document must include all 8 built-in element types
   * to exercise every renderer path.
   */
  it('exercises all 8 built-in element types', () => {
    const allElements = SAMPLE_DOCUMENT.pages.flatMap((p) => p.elements);
    const typesPresent = new Set(allElements.map((el) => el.type));

    for (const builtInType of BUILT_IN_ELEMENT_TYPES) {
      expect(typesPresent.has(builtInType)).toBe(true);
    }
  });

  /**
   * @description All element IDs must be unique across the entire document
   * to prevent rendering conflicts.
   */
  it('has unique element IDs across all pages', () => {
    const allIds = SAMPLE_DOCUMENT.pages.flatMap((p) => p.elements.map((el) => el.id));
    const uniqueIds = new Set(allIds);

    expect(uniqueIds.size).toBe(allIds.length);
  });

  /**
   * @description Canvas dimensions must be positive and represent valid
   * rendering dimensions.
   */
  it('has valid canvas dimensions', () => {
    expect(SAMPLE_DOCUMENT.canvas.width).toBeGreaterThan(0);
    expect(SAMPLE_DOCUMENT.canvas.height).toBeGreaterThan(0);
  });

  /**
   * @description The fixture must include at least one group element with
   * children to exercise the scene tree construction.
   */
  it('includes a group with children', () => {
    const allElements = SAMPLE_DOCUMENT.pages.flatMap((p) => p.elements);
    const groups = allElements.filter((el) => el.type === 'group');

    expect(groups.length).toBeGreaterThan(0);

    const groupId = groups[0]?.id;
    const children = allElements.filter((el) => el.parentId === groupId);

    expect(children.length).toBeGreaterThan(0);
  });

  /**
   * @description Animation registry must contain entries with timelines
   * to exercise playback in the demo.
   */
  it('has animation registry entries with timelines', () => {
    expect(SAMPLE_DOCUMENT.animationRegistry.length).toBeGreaterThanOrEqual(1);

    const firstEntry = SAMPLE_DOCUMENT.animationRegistry[0];

    expect(firstEntry?.config.timelines.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * @description At least one animation entry must have an IN state
   * timeline binding to exercise state-based playback.
   */
  it('has at least one IN state timeline binding', () => {
    const hasInBinding = SAMPLE_DOCUMENT.animationRegistry.some((entry) =>
      entry.config.stateTimelineBindings.some((b) => b.stateName === 'IN'),
    );

    expect(hasInBinding).toBe(true);
  });

  /**
   * @description At least one animation entry must have an OUT state
   * timeline binding to exercise exit transitions.
   */
  it('has at least one OUT state timeline binding', () => {
    const hasOutBinding = SAMPLE_DOCUMENT.animationRegistry.some((entry) =>
      entry.config.stateTimelineBindings.some((b) => b.stateName === 'OUT'),
    );

    expect(hasOutBinding).toBe(true);
  });

  /**
   * @description At least one animation entry must have a timeline with
   * transform keyframes (e.g. translateX) to exercise position animation.
   */
  it('has at least one animation with transform keyframes', () => {
    const hasTransform = SAMPLE_DOCUMENT.animationRegistry.some((entry) =>
      entry.config.timelines.some((tl) => tl.entries.some((kf) => 'transform' in kf.properties)),
    );

    expect(hasTransform).toBe(true);
  });
});
