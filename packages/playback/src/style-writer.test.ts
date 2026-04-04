// ---------------------------------------------------------------------------
// Style writer — tests for style routing, target caching, and camelToKebab
// ---------------------------------------------------------------------------

import { describe, expect, it } from '@jest/globals';

import { applyStylesToElement, camelToKebab, invalidateStyleTargetCache } from './style-writer';

// ---------------------------------------------------------------------------
// applyStylesToElement
// ---------------------------------------------------------------------------

describe('applyStylesToElement', () => {
  /**
   * @description Opacity must be routed to the data-opacity-target
   * descendant to preserve 3D rendering contexts.
   */
  it('routes opacity to data-opacity-target descendant', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');

    content.setAttribute('data-element-content', '');

    const opacityTarget = document.createElement('div');

    opacityTarget.setAttribute('data-opacity-target', '');
    container.appendChild(content);
    container.appendChild(opacityTarget);

    applyStylesToElement(container, { opacity: 0.5 });
    expect(opacityTarget.style.opacity).toBe('0.5');
    expect(content.style.opacity).toBe('');
  });

  /**
   * @description Non-opacity properties go to the data-element-content target.
   */
  it('applies transform to data-element-content target', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');

    content.setAttribute('data-element-content', '');
    container.appendChild(content);

    applyStylesToElement(container, { transform: 'translateX(100px)' });
    expect(content.style.transform).toBe('translateX(100px)');
  });

  /**
   * @description When no data-element-content descendant exists,
   * styles fall back to the container element.
   */
  it('falls back to container when no data-element-content', () => {
    const container = document.createElement('div');

    applyStylesToElement(container, { transform: 'rotate(45deg)' });
    expect(container.style.transform).toBe('rotate(45deg)');
  });

  /**
   * @description Offscreen elements must have visibility:hidden and
   * pointer-events:none applied directly to the container (no sub-targets).
   */
  it('offscreen element gets visibility hidden and pointer-events none', () => {
    const container = document.createElement('div');

    container.className = 'offscreen';

    applyStylesToElement(container, {
      visibility: 'hidden',
      pointerEvents: 'none',
    });

    expect(container.style.visibility).toBe('hidden');
    expect(container.style.pointerEvents).toBe('none');
  });

  /**
   * @description When the DOM structure changes (e.g. a new content target is
   * inserted), the cached target references become stale. Calling
   * invalidateStyleTargetCache must cause the next applyStylesToElement call
   * to re-query and find the new targets.
   */
  it('invalidateStyleTargetCache causes re-query of targets', () => {
    const container = document.createElement('div');

    // First call routes transform to container (no content target)
    applyStylesToElement(container, { transform: 'translateX(0)' });
    expect(container.style.transform).toBe('translateX(0)');

    // Now add a content target
    const content = document.createElement('div');

    content.setAttribute('data-element-content', '');
    container.appendChild(content);

    // Without cache invalidation, stale cache still targets the container
    applyStylesToElement(container, { transform: 'translateX(50px)' });
    expect(container.style.transform).toBe('translateX(50px)');
    expect(content.style.transform).toBe('');

    // After invalidation, the new content target is found
    invalidateStyleTargetCache(container);
    applyStylesToElement(container, { transform: 'translateX(100px)' });
    expect(content.style.transform).toBe('translateX(100px)');
  });
});

// ---------------------------------------------------------------------------
// camelToKebab
// ---------------------------------------------------------------------------

describe('camelToKebab', () => {
  /**
   * @description camelCase CSS property names must be converted to
   * kebab-case for use with style.setProperty().
   */
  it('converts camelCase to kebab-case', () => {
    expect(camelToKebab('backgroundColor')).toBe('background-color');
    expect(camelToKebab('borderRadius')).toBe('border-radius');
    expect(camelToKebab('transform')).toBe('transform');
  });
});
