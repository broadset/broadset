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

  /** @description Position keyframes target the element host's layout position, while translate keyframes remain content transforms. */
  it('applies x and y as absolute host layout values without mixing them into translate transforms', () => {
    const { contentTarget, host } = createHostElement('moving-card');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { x: 120, y: 34, translateX: 20 });

    expect(host.style.left).toBe('120px');
    expect(host.style.top).toBe('34px');
    expect(contentTarget.style.transform).toBe('translate(20px, 0px)');

    targets.clearStyles(host, ['x', 'y']);

    expect(host.style.left).toBe('');
    expect(host.style.top).toBe('');
    expect(contentTarget.style.transform).toBe('translate(20px, 0px)');
  });

  /** @description 3D transform keyframes must target the same transform stack as 2D motion so playback matches editor scrub. */
  it('applies and clears 3D transform properties through the transform stack', () => {
    const { contentTarget, host } = createHostElement('three-d-card');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { rotateX: 15, rotateY: 25, rotateZ: 35, translateZ: 45 });

    expect(host.style.transform).toContain('rotateX(15deg)');
    expect(host.style.transform).toContain('rotateY(25deg)');
    expect(host.style.transform).toContain('rotateZ(35deg)');
    expect(host.style.transform).toContain('translateZ(45px)');
    expect(contentTarget.style.transform).toBe('');

    targets.clearStyles(host, ['rotateX', 'rotateY', 'rotateZ', 'translateZ']);

    expect(host.style.transform).toBe('');
  });

  /** @description 3D transform playback must preserve renderer-owned base host transforms while overriding only animated channels. */
  it('composes host transform keyframes over the renderer baseline transform', () => {
    const { host } = createHostElement('three-d-card-with-base');
    const targets = resolveAnimationTargets();

    host.style.transform = 'rotate(10deg) rotateX(5deg) rotateY(20deg) translateZ(40px)';

    targets.applyStyles(host, { rotateX: 30 });

    expect(host.style.transform).toBe('rotate(10deg) rotateX(30deg) rotateY(20deg) translateZ(40px)');

    targets.applyStyles(host, { rotateY: 50 });

    expect(host.style.transform).toBe('rotate(10deg) rotateX(30deg) rotateY(50deg) translateZ(40px)');

    targets.clearStyles(host, ['rotateX']);

    expect(host.style.transform).toBe('rotate(10deg) rotateX(5deg) rotateY(50deg) translateZ(40px)');

    targets.clearStyles(host, ['rotateY']);

    expect(host.style.transform).toBe('rotate(10deg) rotateX(5deg) rotateY(20deg) translateZ(40px)');
  });

  /** @description Whole-gradient keyframes must apply to the canonical background style, not to a non-existent background-gradient CSS property. */
  it('applies and clears whole backgroundGradient values as background styles', () => {
    const { contentTarget, host } = createHostElement('gradient-card');
    const targets = resolveAnimationTargets();

    targets.applyStyles(host, { backgroundGradient: 'linear-gradient(90deg, #ff0000 0%, #0000ff 100%)' });

    expect(contentTarget.style.getPropertyValue('background-gradient')).toBe('');
    expect(contentTarget.style.backgroundImage).toContain('linear-gradient');

    targets.clearStyles(host, ['backgroundGradient']);

    expect(contentTarget.style.backgroundImage).toBe('');
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
