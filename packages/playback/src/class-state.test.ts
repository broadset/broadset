// ---------------------------------------------------------------------------
// Class state parsing — tests
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from '@jest/globals';

import { parseClassState } from './class-state';

describe('parseClassState', () => {
  let el: HTMLElement;

  beforeEach(() => {
    el = document.createElement('div');
  });

  /**
   * @description data-visibility attribute takes precedence for visibility.
   */
  it('reads visibility from data-visibility attribute', () => {
    el.setAttribute('data-visibility', 'onscreen');

    const state = parseClassState(el, []);

    expect(state.visibility).toBe('onscreen');
  });

  /**
   * @description When data-visibility is not set, classes are parsed
   * for known state and modifier names.
   */
  it('parses class-based state: onscreen, active state, modifiers', () => {
    el.className = 'onscreen IN glow';

    const knownStates = ['IN', 'OUT', 'active'];
    const knownModifiers = ['glow', 'pulse'];

    const state = parseClassState(el, knownStates, knownModifiers);

    expect(state.visibility).toBe('onscreen');
    expect(state.activeState).toBe('IN');
    expect(state.modifiers).toContain('glow');
  });

  /**
   * @description When neither data-visibility nor class-based indicators
   * exist, defaults should be returned.
   */
  it('returns defaults for elements with no state indicators', () => {
    const state = parseClassState(el, []);

    expect(state.visibility).toBe('offscreen');
    expect(state.activeState).toBeNull();
    expect(state.modifiers).toEqual([]);
  });
});
