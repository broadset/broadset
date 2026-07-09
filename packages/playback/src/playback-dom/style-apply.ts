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
  parseTransformValue,
  toKebabCase,
} from './style-apply-helpers';

export interface AnimationTargetsResolver {
  applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void;
  clearStyles(container: HTMLElement, propertyNames: readonly string[]): void;
  invalidate(container: HTMLElement): void;
  clear(): void;
}

interface ResolvedAnimationTargets {
  readonly container: HTMLElement;
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
      container,
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

  function readTransformBaseline(target: HTMLElement): string {
    return target.dataset['baseTransform'] ?? readBaseline(target, 'transform');
  }

  function restoreCssProperty(target: HTMLElement, propertyName: string): void {
    const baselineValue = readBaseline(target, propertyName);

    if (baselineValue === '') {
      if (propertyName === 'background') {
        target.style.background = '';

        return;
      }

      target.style.removeProperty(propertyName);

      return;
    }

    target.style.setProperty(propertyName, baselineValue);
  }

  function composeTransformState(
    target: HTMLElement,
    current: MutableTransformState,
    composeWithBaseline: boolean,
  ): string {
    if (!composeWithBaseline) {
      return composeTransformValue(current);
    }

    return composeTransformValue({ ...parseTransformValue(readTransformBaseline(target)), ...current });
  }

  function updateTransform(
    target: HTMLElement,
    propertyName: string,
    value: unknown,
    composeWithBaseline: boolean,
  ): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    const current = transforms.get(target) ?? {};

    switch (propertyName) {
      case 'translateX':
        current.translateX = value;
        break;
      case 'translateY':
        current.translateY = value;
        break;
      case 'translateZ':
        current.translateZ = value;
        break;
      case 'rotation':
        current.rotation = value;
        break;
      case 'rotateX':
        current.rotateX = value;
        break;
      case 'rotateY':
        current.rotateY = value;
        break;
      case 'rotateZ':
        current.rotateZ = value;
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
    target.style.transform = composeTransformState(target, current, composeWithBaseline);
  }

  function shouldComposeTransformWithBaseline(propertyName: string): boolean {
    switch (propertyName) {
      case 'rotation':
      case 'rotateX':
      case 'rotateY':
      case 'rotateZ':
      case 'translateZ':
        return true;

      default:
        return false;
    }
  }

  function getTransformPropertyTarget(
    propertyName: string,
    targets: ResolvedAnimationTargets,
  ): HTMLElement {
    switch (propertyName) {
      case 'rotation':
      case 'rotateX':
      case 'rotateY':
      case 'rotateZ':
      case 'translateZ':
        return targets.container;

      default:
        return targets.contentTarget;
    }
  }

  function clearTransformProperty(
    target: HTMLElement,
    propertyName: string,
    composeWithBaseline: boolean,
  ): void {
    if (propertyName === 'transform') {
      transforms.delete(target);
      target.style.transform = readBaseline(target, 'transform');

      return;
    }

    const current = { ...(transforms.get(target) ?? {}) };

    switch (propertyName) {
      case 'translateX':
        delete current.translateX;
        break;
      case 'translateY':
        delete current.translateY;
        break;
      case 'translateZ':
        delete current.translateZ;
        break;
      case 'rotation':
        delete current.rotation;
        break;
      case 'rotateX':
        delete current.rotateX;
        break;
      case 'rotateY':
        delete current.rotateY;
        break;
      case 'rotateZ':
        delete current.rotateZ;
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
      target.style.transform = composeTransformState(target, current, composeWithBaseline);

      return;
    }

    transforms.delete(target);
    target.style.transform = composeWithBaseline ? readTransformBaseline(target) : readBaseline(target, 'transform');
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

  function applyGradientTargetStyle(
    propertyName: string,
    value: unknown,
    gradientUpdates: GradientPropertyUpdate[],
  ): boolean {
    if (!isGradientAnimationTarget(propertyName)) {
      return false;
    }

    const parsed = parseGradientTarget(propertyName);

    if (parsed !== null) {
      gradientUpdates.push({ target: parsed, value });
    }

    return true;
  }

  function applyOpacityStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): boolean {
    if (propertyName !== 'opacity') {
      return false;
    }

    rememberBaseline(targets.opacityTarget, 'opacity', targets.opacityTarget.style.opacity);
    targets.opacityTarget.style.opacity = String(value);

    return true;
  }

  function applyPositionStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): boolean {
    if (propertyName !== 'x' && propertyName !== 'y') {
      return false;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return true;
    }

    const cssPropertyName = propertyName === 'x' ? 'left' : 'top';

    rememberBaseline(targets.container, cssPropertyName, targets.container.style.getPropertyValue(cssPropertyName));
    targets.container.style.setProperty(cssPropertyName, `${String(value)}px`);

    return true;
  }

  function applyTextContentStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): boolean {
    if (propertyName !== 'content' && propertyName !== 'textContent') {
      return false;
    }

    rememberBaseline(targets.contentTarget, 'textContent', targets.contentTarget.textContent);
    targets.contentTarget.textContent = String(value);

    return true;
  }

  function applyWholeGradientStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): boolean {
    if (propertyName !== 'backgroundGradient') {
      return false;
    }

    rememberBaseline(
      targets.contentTarget,
      'background',
      targets.contentTarget.style.getPropertyValue('background'),
    );
    targets.contentTarget.style.background = String(value).trim();

    return true;
  }

  function applyTransformOverrideStyle(
    propertyName: string,
    value: unknown,
    targets: ResolvedAnimationTargets,
  ): boolean {
    if (propertyName !== 'transform') {
      return false;
    }

    rememberBaseline(targets.contentTarget, 'transform', targets.contentTarget.style.transform);
    transforms.delete(targets.contentTarget);
    targets.contentTarget.style.transform = String(value);

    return true;
  }

  function applyPathStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): boolean {
    if (propertyName !== 'd') {
      return false;
    }

    const pathElement = findPathElement(targets.contentTarget);

    if (pathElement !== null) {
      rememberBaseline(pathElement, 'd', pathElement.getAttribute('d'));
    }

    applyPathValue(targets.contentTarget, String(value));

    return true;
  }

  function applyTransformPropertyStyle(
    propertyName: string,
    value: unknown,
    targets: ResolvedAnimationTargets,
  ): boolean {
    if (!isTransformProperty(propertyName)) {
      return false;
    }

    const target = getTransformPropertyTarget(propertyName, targets);

    rememberBaseline(target, 'transform', target.style.transform);
    updateTransform(target, propertyName, value, shouldComposeTransformWithBaseline(propertyName));

    return true;
  }

  function applyTrimPathStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): boolean {
    if (!isTrimPathProperty(propertyName)) {
      return false;
    }

    const pathEl = findPathElement(targets.contentTarget);

    if (pathEl !== null) {
      rememberBaseline(pathEl, 'stroke-dasharray', pathEl.getAttribute('stroke-dasharray'));
      rememberBaseline(pathEl, 'stroke-dashoffset', pathEl.getAttribute('stroke-dashoffset'));
    }

    updateTrimPath(targets.contentTarget, propertyName, value);

    return true;
  }

  function applyGenericCssStyle(propertyName: string, value: unknown, targets: ResolvedAnimationTargets): void {
    const cssPropertyName = toKebabCase(propertyName);

    rememberBaseline(
      targets.contentTarget,
      cssPropertyName,
      targets.contentTarget.style.getPropertyValue(cssPropertyName),
    );
    targets.contentTarget.style.setProperty(cssPropertyName, String(value));
  }

  function applyOneStyle(
    propertyName: string,
    value: unknown,
    targets: ResolvedAnimationTargets,
    gradientUpdates: GradientPropertyUpdate[],
  ): void {
    if (applyGradientTargetStyle(propertyName, value, gradientUpdates)) return;
    if (applyOpacityStyle(propertyName, value, targets)) return;
    if (applyPositionStyle(propertyName, value, targets)) return;
    if (applyTextContentStyle(propertyName, value, targets)) return;
    if (applyWholeGradientStyle(propertyName, value, targets)) return;
    if (applyTransformOverrideStyle(propertyName, value, targets)) return;
    if (applyPathStyle(propertyName, value, targets)) return;
    if (applyTransformPropertyStyle(propertyName, value, targets)) return;
    if (applyTrimPathStyle(propertyName, value, targets)) return;

    applyGenericCssStyle(propertyName, value, targets);
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

    if (propertyName === 'x' || propertyName === 'y') {
      restoreCssProperty(targets.container, propertyName === 'x' ? 'left' : 'top');

      return;
    }

    if (propertyName === 'backgroundGradient') {
      restoreCssProperty(targets.contentTarget, 'background');

      return;
    }

    if (propertyName === 'd') {
      restorePathDBaseline(targets.contentTarget);

      return;
    }

    if (propertyName === 'transform' || isTransformProperty(propertyName)) {
      clearTransformProperty(
        getTransformPropertyTarget(propertyName, targets),
        propertyName,
        shouldComposeTransformWithBaseline(propertyName),
      );

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
