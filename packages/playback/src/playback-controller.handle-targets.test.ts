/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPlaybackHandle, resolveAnimationTargets } from './playback-controller';
import { createHostElement } from './playback-controller-test-helpers';

describe('createPlaybackHandle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse('2026-04-06T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clamps seeks, respects cancel, and fires onComplete exactly once', () => {
    const onFrame = vi.fn();
    const onComplete = vi.fn();
    const handle = createPlaybackHandle({ durationMs: 800, onFrame, onComplete });

    handle.seek(-100);
    expect(handle.currentTimeMs).toBe(0);

    handle.seek(99999);
    expect(handle.currentTimeMs).toBe(800);

    handle.seek(0);
    handle.play();
    vi.advanceTimersByTime(850);

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(handle.isActive).toBe(false);
    expect(onFrame).toHaveBeenCalledWith(800);

    handle.cancel();
    handle.play();

    expect(handle.isActive).toBe(false);
  });
});

describe('resolveAnimationTargets', () => {
  it('routes opacity to the opacity target, other styles to the content target, and invalidates cache', () => {
    const { contentTarget, host, opacityTarget } = createHostElement('hero');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { opacity: 0.5, transform: 'translateX(20px)' });

    expect(opacityTarget.style.opacity).toBe('0.5');
    expect(contentTarget.style.transform).toBe('translateX(20px)');

    contentTarget.removeAttribute('data-element-content');

    const replacement = document.createElement('div');

    replacement.dataset['elementContent'] = '';
    opacityTarget.appendChild(replacement);

    targets.invalidate(host);
    targets.applyStyles(host, { backgroundColor: 'red' });

    expect(replacement.style.backgroundColor).toBe('red');
  });

  it('falls back to the container when no content target is present', () => {
    const host = document.createElement('div');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { color: 'rgb(255, 255, 255)' });

    expect(host.style.color).toBe('rgb(255, 255, 255)');
  });

  /** @description Trim path properties must be handled specially (not set as generic CSS) to avoid polluting the style attribute. */
  it('does not set trim path properties as generic CSS', () => {
    const { contentTarget, host } = createHostElement('path-el');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, {
      trimStart: 0.25,
      trimEnd: 0.75,
      trimOffset: 0.1,
    });

    expect(contentTarget.style.getPropertyValue('trim-start')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-end')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-offset')).toBe('');
  });

  /** @description Clearing trim path properties must not leave residual CSS. */
  it('clears trim path properties without residual CSS', () => {
    const { contentTarget, host } = createHostElement('path-el2');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { trimStart: 0.5 });
    targets.clearStyles(host, ['trimStart', 'trimEnd', 'trimOffset']);

    expect(contentTarget.style.getPropertyValue('trim-start')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-end')).toBe('');
    expect(contentTarget.style.getPropertyValue('trim-offset')).toBe('');
  });
});
