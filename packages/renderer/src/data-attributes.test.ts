import { describe, expect, it } from '@jest/globals';

import { DATA_ELEMENT_CONTENT, DATA_ELEMENT_ID, DATA_OPACITY_TARGET, DATA_VISIBILITY } from './data-attributes';

describe('Data-Attribute Contract Registry', () => {
  /**
   * @description Ensures the data-element-id attribute constant matches the cross-package contract
   * used by Editor and Playback to identify elements by document ID.
   */
  it('exports data-element-id attribute name', () => {
    expect(DATA_ELEMENT_ID).toBe('data-element-id');
  });

  /**
   * @description Ensures the data-element-content attribute constant matches the contract
   * used by Playback (style writer) to mark the animation style target.
   */
  it('exports data-element-content attribute name', () => {
    expect(DATA_ELEMENT_CONTENT).toBe('data-element-content');
  });

  /**
   * @description Ensures the data-opacity-target attribute constant matches the contract
   * used by Playback (style writer) for opacity animation targets.
   */
  it('exports data-opacity-target attribute name', () => {
    expect(DATA_OPACITY_TARGET).toBe('data-opacity-target');
  });

  /**
   * @description Ensures the data-visibility attribute constant matches the contract
   * used by Playback (state transitions) for visibility state.
   */
  it('exports data-visibility attribute name', () => {
    expect(DATA_VISIBILITY).toBe('data-visibility');
  });
});
