import { beforeEach, describe, expect, it } from '@jest/globals';

import { applyBackgroundStyle } from './background';

describe('Background Style Application', () => {
  let element: HTMLDivElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  /**
   * @description When a solid backgroundColor is applied, any prior gradient
   * must be cleared. The spec requires that solid and gradient backgrounds
   * are mutually exclusive via different CSS properties.
   */
  it('solid color clears prior gradient', () => {
    // Set a prior gradient via backgroundImage
    element.style.backgroundImage = 'linear-gradient(red, blue)';

    applyBackgroundStyle(element, {
      backgroundColor: '#ff0000',
      backgroundGradient: undefined,
    });

    expect(element.style.backgroundColor).not.toBe('');
    // Gradient must be cleared
    expect(element.style.backgroundImage).toBe('');
  });

  /**
   * @description When a gradient background is applied, any prior solid
   * backgroundColor must be cleared. This ensures the gradient is visible
   * without interference from a leftover solid color underneath.
   */
  it('gradient clears prior solid color', () => {
    // Set a prior solid
    element.style.backgroundColor = '#ff0000';

    applyBackgroundStyle(element, {
      backgroundColor: undefined,
      backgroundGradient: 'linear-gradient(red, blue)',
    });

    expect(element.style.backgroundImage).toBe('linear-gradient(red, blue)');
    // Solid must be cleared
    expect(element.style.backgroundColor).toBe('');
  });

  /**
   * @description When neither backgroundColor nor backgroundGradient is set,
   * both properties must be cleared to prevent stale values.
   */
  it('clears both properties when neither is provided', () => {
    element.style.backgroundColor = '#ff0000';
    element.style.backgroundImage = 'linear-gradient(red, blue)';

    applyBackgroundStyle(element, {
      backgroundColor: undefined,
      backgroundGradient: undefined,
    });

    expect(element.style.backgroundColor).toBe('');
    expect(element.style.backgroundImage).toBe('');
  });

  /**
   * @description When both backgroundColor and backgroundGradient are set,
   * gradient takes precedence (it's the more specific intent).
   */
  it('gradient takes precedence when both are provided', () => {
    applyBackgroundStyle(element, {
      backgroundColor: '#ff0000',
      backgroundGradient: 'linear-gradient(red, blue)',
    });

    expect(element.style.backgroundImage).toBe('linear-gradient(red, blue)');
    expect(element.style.backgroundColor).toBe('');
  });
});
