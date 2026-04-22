import type { BroadsetGradient } from '@broadset/model';

import {
  applyGradientPropertyUpdates,
  type GradientPropertyUpdate,
  isGradientAnimationTarget,
  parseGradientTarget,
  serializeGradientToCss,
} from '../gradient-targets';
import { findContentTarget, findOpacityTarget } from './runtime-guards';
import {
  applyPathValue,
  applyTrimPathToElement,
  composeTransformValue,
  findPathElement,
  hasTransformState,
  hasTrimPathState,
  isTransformProperty,
  isTrimPathProperty,
  type MutableTransformState,
  type MutableTrimPathState,
  toKebabCase,
} from './style-apply-helpers';

export interface AnimationTargetsResolver {
  applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void;
  clearStyles(container: HTMLElement, propertyNames: readonly string[]): void;
  invalidate(container: HTMLElement): void;
  clear(): void;
}

interface ResolvedAnimationTargets {
  readonly contentTarget: HTMLElement;
  readonly opacityTarget: HTMLElement;
}

export function resolveAnimationTargets(): AnimationTargetsResolver {
  const cache = new WeakMap<HTMLElement, ResolvedAnimationTargets>();
  const transforms = new WeakMap<HTMLElement, MutableTransformState>();
  const trimStates = new WeakMap<HTMLElement, MutableTrimPathState>();
  const baselines = new WeakMap<Element, Map<string, string>>();

  function getTargets(container: HTMLElement): ResolvedAnimationTargets {
    const cached = cache.get(container);

    if (cached !== undefined) {
      return cached;
    }

    const contentTarget = findContentTarget(container);
    const opacityTarget = findOpacityTarget(container, contentTarget);
    const resolvedTargets: ResolvedAnimationTargets = {
      contentTarget,
      opacityTarget,
    };

    cache.set(container, resolvedTargets);

    return resolvedTargets;
  }

  function getBaselineStore(target: Element): Map<string, string> {
    const existingStore = baselines.get(target);

    if (existingStore !== undefined) {
      return existingStore;
    }

    const nextStore = new Map<string, string>();

    baselines.set(target, nextStore);

    return nextStore;
  }

  function rememberBaseline(target: Element, propertyName: string, value: string | null): void {
    const store = getBaselineStore(target);

    if (!store.has(propertyName)) {
      store.set(propertyName, value ?? '');
    }
  }

  function readBaseline(target: Element, propertyName: string): string {
    return baselines.get(target)?.get(propertyName) ?? '';
  }

  function restoreCssProperty(target: HTMLElement, propertyName: string): void {
    const baselineValue = readBaseline(target, propertyName);

    if (baselineValue === '') {
      target.style.removeProperty(propertyName);

      return;
    }

    target.style.setProperty(propertyName, baselineValue);
  }

  function updateTransform(target: HTMLElement, propertyName: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    const current = transforms.get(target) ?? {};

    switch (propertyName) {
      case 'x':
        current.x = value;
        break;
      case 'y':
        current.y = value;
        break;
      case 'translateX':
        current.translateX = value;
        break;
      case 'translateY':
        current.translateY = value;
        break;
      case 'rotation':
        current.rotation = value;
        break;
      case 'scale':
        current.scale = value;
        break;
      case 'scaleX':
        current.scaleX = value;
        break;
      case 'scaleY':
        current.scaleY = value;
        break;
      default:
        break;
    }

    transforms.set(target, current);
    target.style.transform = composeTransformValue(current);
  }

  function clearTransformProperty(target: HTMLElement, propertyName: string): void {
    if (propertyName === 'transform') {
      transforms.delete(target);
      target.style.transform = readBaseline(target, 'transform');

      return;
    }

    const current = { ...(transforms.get(target) ?? {}) };

    switch (propertyName) {
      case 'x':
        delete current.x;
        break;
      case 'y':
        delete current.y;
        break;
      case 'translateX':
        delete current.translateX;
        break;
      case 'translateY':
        delete current.translateY;
        break;
      case 'rotation':
        delete current.rotation;
        break;
      case 'scale':
        delete current.scale;
        break;
      case 'scaleX':
        delete current.scaleX;
        break;
      case 'scaleY':
        delete current.scaleY;
        break;
      default:
        break;
    }

    if (hasTransformState(current)) {
      transforms.set(target, current);
      target.style.transform = composeTransformValue(current);

      return;
    }

    transforms.delete(target);
    target.style.transform = readBaseline(target, 'transform');
  }

  function updateTrimPath(target: HTMLElement, propertyName: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    const current = trimStates.get(target) ?? {};

    if (propertyName === 'trimStart') {
      current.trimStart = value;
    } else if (propertyName === 'trimEnd') {
      current.trimEnd = value;
    } else if (propertyName === 'trimOffset') {
      current.trimOffset = value;
    }

    trimStates.set(target, current);
    applyTrimPathToElement(target, current, readBaseline);
  }

  function clearTrimPathProperty(target: HTMLElement, propertyName: string): void {
    const current = { ...(trimStates.get(target) ?? {}) };

    if (propertyName === 'trimStart') {
      delete current.trimStart;
    } else if (propertyName === 'trimEnd') {
      delete current.trimEnd;
    } else if (propertyName === 'trimOffset') {
      delete current.trimOffset;
    }

    if (hasTrimPathState(current)) {
      trimStates.set(target, current);
      applyTrimPathToElement(target, current, readBaseline);

      return;
    }

    trimStates.delete(target);

    const pathElement = findPathElement(target);

    if (pathElement !== null) {
      const baselineDasharray = readBaseline(pathElement, 'stroke-dasharray');
      const baselineDashoffset = readBaseline(pathElement, 'stroke-dashoffset');

      if (baselineDasharray === '') {
        pathElement.removeAttribute('stroke-dasharray');
      } else {
        pathElement.setAttribute('stroke-dasharray', baselineDasharray);
      }

      if (baselineDashoffset === '') {
        pathElement.removeAttribute('stroke-dashoffset');
      } else {
        pathElement.setAttribute('stroke-dashoffset', baselineDashoffset);
      }
    }
  }

  function readBaselineGradient(target: HTMLElement): BroadsetGradient | null {
    // Always read the baseline fresh from `data-gradient` so edits to the
    // element's base gradient are reflected on the next animation frame. The
    // prior implementation cached the first-parsed baseline and never
    // invalidated it, so mid-animation edits (or chained animation segments
    // that expected to see the current base gradient) interpolated against a
    // stale reference. `data-gradient` is kept in sync by the renderer on
    // element updates and JSON.parse on a short stringified gradient object
    // is cheap enough to run per frame without measurable overhead.
    const gradientJson = target.dataset['gradient'];

    if (gradientJson === undefined) {
      return null;
    }

    try {
      return JSON.parse(gradientJson) as BroadsetGradient;
    } catch {
      return null;
    }
  }

  function applyOneStyle(
    propertyName: string,
    value: unknown,
    targets: ResolvedAnimationTargets,
    gradientUpdates: GradientPropertyUpdate[],
  ): void {
    if (isGradientAnimationTarget(propertyName)) {
      const parsed = parseGradientTarget(propertyName);

      if (parsed !== null) {
        gradientUpdates.push({ target: parsed, value });
      }

      return;
    }

    if (propertyName === 'opacity') {
      rememberBaseline(targets.opacityTarget, 'opacity', targets.opacityTarget.style.opacity);
      targets.opacityTarget.style.opacity = String(value);

      return;
    }

    if (propertyName === 'content' || propertyName === 'textContent') {
      rememberBaseline(targets.contentTarget, 'textContent', targets.contentTarget.textContent);
      targets.contentTarget.textContent = String(value);

      return;
    }

    if (propertyName === 'transform') {
      rememberBaseline(targets.contentTarget, 'transform', targets.contentTarget.style.transform);
      transforms.delete(targets.contentTarget);
      targets.contentTarget.style.transform = String(value);

      return;
    }

    if (propertyName === 'd') {
      const pathElement = findPathElement(targets.contentTarget);

      if (pathElement !== null) {
        rememberBaseline(pathElement, 'd', pathElement.getAttribute('d'));
      }

      applyPathValue(targets.contentTarget, String(value));

      return;
    }

    if (isTransformProperty(propertyName)) {
      rememberBaseline(targets.contentTarget, 'transform', targets.contentTarget.style.transform);
      updateTransform(targets.contentTarget, propertyName, value);

      return;
    }

    if (isTrimPathProperty(propertyName)) {
      const pathEl = findPathElement(targets.contentTarget);

      if (pathEl !== null) {
        rememberBaseline(pathEl, 'stroke-dasharray', pathEl.getAttribute('stroke-dasharray'));
        rememberBaseline(pathEl, 'stroke-dashoffset', pathEl.getAttribute('stroke-dashoffset'));
      }

      updateTrimPath(targets.contentTarget, propertyName, value);

      return;
    }

    const cssPropertyName = toKebabCase(propertyName);

    rememberBaseline(
      targets.contentTarget,
      cssPropertyName,
      targets.contentTarget.style.getPropertyValue(cssPropertyName),
    );
    targets.contentTarget.style.setProperty(cssPropertyName, String(value));
  }

  function restorePathDBaseline(target: HTMLElement): void {
    const pathElement = findPathElement(target);

    if (pathElement === null) return;

    const baselineValue = readBaseline(pathElement, 'd');

    if (baselineValue === '') {
      pathElement.removeAttribute('d');
    } else {
      pathElement.setAttribute('d', baselineValue);
    }
  }

  function clearOneStyle(propertyName: string, targets: ResolvedAnimationTargets): void {
    if (isGradientAnimationTarget(propertyName)) {
      restoreCssProperty(targets.contentTarget, 'background');

      return;
    }

    if (propertyName === 'opacity') {
      targets.opacityTarget.style.opacity = readBaseline(targets.opacityTarget, 'opacity');

      return;
    }

    if (propertyName === 'content' || propertyName === 'textContent') {
      targets.contentTarget.textContent = readBaseline(targets.contentTarget, 'textContent');

      return;
    }

    if (propertyName === 'd') {
      restorePathDBaseline(targets.contentTarget);

      return;
    }

    if (propertyName === 'transform' || isTransformProperty(propertyName)) {
      clearTransformProperty(targets.contentTarget, propertyName);

      return;
    }

    if (isTrimPathProperty(propertyName)) {
      clearTrimPathProperty(targets.contentTarget, propertyName);

      return;
    }

    restoreCssProperty(targets.contentTarget, toKebabCase(propertyName));
  }

  return {
    applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void {
      const targets = getTargets(container);
      const gradientUpdates: GradientPropertyUpdate[] = [];

      for (const [propertyName, value] of Object.entries(styles)) {
        applyOneStyle(propertyName, value, targets, gradientUpdates);
      }

      if (gradientUpdates.length > 0) {
        rememberBaseline(
          targets.contentTarget,
          'background',
          targets.contentTarget.style.getPropertyValue('background'),
        );

        const baseline = readBaselineGradient(targets.contentTarget);

        if (baseline !== null) {
          const updated = applyGradientPropertyUpdates(baseline, gradientUpdates);

          targets.contentTarget.style.background = serializeGradientToCss(updated);
        }
      }
    },
    clearStyles(container: HTMLElement, propertyNames: readonly string[]): void {
      const targets = getTargets(container);

      for (const propertyName of new Set(propertyNames)) {
        clearOneStyle(propertyName, targets);
      }
    },
    invalidate(container: HTMLElement): void {
      cache.delete(container);
    },
    clear(): void {
      /* WeakMap storage clears naturally; no explicit action required. */
    },
  };
}
