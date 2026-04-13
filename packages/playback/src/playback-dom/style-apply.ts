import type { BroadsetGradient } from '@broadset/model';

import {
  applyGradientPropertyUpdates,
  type GradientPropertyUpdate,
  isGradientAnimationTarget,
  parseGradientTarget,
  serializeGradientToCss,
} from '../gradient-targets';
import { findContentTarget, findOpacityTarget } from './runtime-guards';

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

interface MutableTransformState {
  x?: number | undefined;
  y?: number | undefined;
  translateX?: number | undefined;
  translateY?: number | undefined;
  rotation?: number | undefined;
  scale?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
}

interface MutableTrimPathState {
  trimStart?: number;
  trimEnd?: number;
  trimOffset?: number;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

function composeTransformValue(state: MutableTransformState): string {
  const translateX = (state.x ?? 0) + (state.translateX ?? 0);
  const translateY = (state.y ?? 0) + (state.translateY ?? 0);
  const scaleX = state.scaleX ?? state.scale ?? 1;
  const scaleY = state.scaleY ?? state.scale ?? 1;
  const rotation = state.rotation ?? 0;
  const parts: string[] = [];

  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${String(translateX)}px, ${String(translateY)}px)`);
  }

  if (rotation !== 0) {
    parts.push(`rotate(${String(rotation)}deg)`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${String(scaleX)}, ${String(scaleY)})`);
  }

  return parts.join(' ');
}

function isTransformProperty(propertyName: string): boolean {
  return ['x', 'y', 'translateX', 'translateY', 'rotation', 'scale', 'scaleX', 'scaleY'].includes(propertyName);
}

function isTrimPathProperty(propertyName: string): boolean {
  return propertyName === 'trimStart' || propertyName === 'trimEnd' || propertyName === 'trimOffset';
}

function hasTransformState(state: MutableTransformState): boolean {
  return (
    state.x !== undefined ||
    state.y !== undefined ||
    state.translateX !== undefined ||
    state.translateY !== undefined ||
    state.rotation !== undefined ||
    state.scale !== undefined ||
    state.scaleX !== undefined ||
    state.scaleY !== undefined
  );
}

function findPathElement(target: HTMLElement): Element | null {
  if (target instanceof SVGElement && target.tagName.toLowerCase() === 'path') {
    return target;
  }

  return target.querySelector('path');
}

function applyPathValue(target: HTMLElement, value: string): void {
  const pathElement = findPathElement(target);

  if (pathElement !== null) {
    pathElement.setAttribute('d', value);
  }
}

/** Read total path length via duck-typing — returns 0 if the element lacks getTotalLength. */
function getPathTotalLength(element: Element): number {
  const geo = element as unknown as { getTotalLength?: () => number };

  if (typeof geo.getTotalLength === 'function') {
    return geo.getTotalLength();
  }

  return 0;
}

export function resolveAnimationTargets(): AnimationTargetsResolver {
  const cache = new WeakMap<HTMLElement, ResolvedAnimationTargets>();
  const transforms = new WeakMap<HTMLElement, MutableTransformState>();
  const trimStates = new WeakMap<HTMLElement, MutableTrimPathState>();
  const baselines = new WeakMap<Element, Map<string, string>>();
  const baselineGradients = new WeakMap<HTMLElement, BroadsetGradient>();

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
    applyTrimPathToElement(target, current);
  }

  function applyTrimPathToElement(target: HTMLElement, state: MutableTrimPathState): void {
    const pathElement = findPathElement(target);

    if (pathElement === null) {
      return;
    }

    const trimStart = state.trimStart ?? 0;
    const trimEnd = state.trimEnd ?? 1;
    const trimOffset = state.trimOffset ?? 0;
    const totalLength = getPathTotalLength(pathElement);

    if (totalLength <= 0) {
      return;
    }

    if (trimStart === 0 && trimEnd === 1 && trimOffset === 0) {
      const baselineDasharray = readBaseline(pathElement, 'stroke-dasharray');
      const baselineDashoffset = readBaseline(pathElement, 'stroke-dashoffset');

      if (baselineDasharray !== '') {
        pathElement.setAttribute('stroke-dasharray', baselineDasharray);
      } else {
        pathElement.removeAttribute('stroke-dasharray');
      }

      if (baselineDashoffset !== '') {
        pathElement.setAttribute('stroke-dashoffset', baselineDashoffset);
      } else {
        pathElement.removeAttribute('stroke-dashoffset');
      }

      return;
    }

    const visibleFraction = Math.max(0, trimEnd - trimStart);
    const visibleLength = visibleFraction * totalLength;

    if (visibleLength <= 0) {
      pathElement.setAttribute('stroke-dasharray', `0 ${String(totalLength)}`);
      pathElement.setAttribute('stroke-dashoffset', '0');

      return;
    }

    const gapLength = totalLength - visibleLength;
    const offsetLength = (trimStart + trimOffset) * totalLength;

    pathElement.setAttribute('stroke-dasharray', `${String(visibleLength)} ${String(gapLength)}`);
    pathElement.setAttribute('stroke-dashoffset', String(-offsetLength));
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

    const hasTrimState =
      current.trimStart !== undefined || current.trimEnd !== undefined || current.trimOffset !== undefined;

    if (hasTrimState) {
      trimStates.set(target, current);
      applyTrimPathToElement(target, current);

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
    const cached = baselineGradients.get(target);

    if (cached !== undefined) {
      return cached;
    }

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

  return {
    applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void {
      const targets = getTargets(container);
      const gradientUpdates: GradientPropertyUpdate[] = [];

      for (const [propertyName, value] of Object.entries(styles)) {
        if (isGradientAnimationTarget(propertyName)) {
          const parsed = parseGradientTarget(propertyName);

          if (parsed !== null) {
            gradientUpdates.push({ target: parsed, value });
          }

          continue;
        }

        if (propertyName === 'opacity') {
          rememberBaseline(targets.opacityTarget, 'opacity', targets.opacityTarget.style.opacity);
          targets.opacityTarget.style.opacity = String(value);
          continue;
        }

        if (propertyName === 'content' || propertyName === 'textContent') {
          rememberBaseline(targets.contentTarget, 'textContent', targets.contentTarget.textContent);
          targets.contentTarget.textContent = String(value);
          continue;
        }

        if (propertyName === 'transform') {
          rememberBaseline(targets.contentTarget, 'transform', targets.contentTarget.style.transform);
          transforms.delete(targets.contentTarget);
          targets.contentTarget.style.transform = String(value);
          continue;
        }

        if (propertyName === 'd') {
          const pathElement = findPathElement(targets.contentTarget);

          if (pathElement !== null) {
            rememberBaseline(pathElement, 'd', pathElement.getAttribute('d'));
          }

          applyPathValue(targets.contentTarget, String(value));
          continue;
        }

        if (isTransformProperty(propertyName)) {
          rememberBaseline(targets.contentTarget, 'transform', targets.contentTarget.style.transform);
          updateTransform(targets.contentTarget, propertyName, value);
          continue;
        }

        if (isTrimPathProperty(propertyName)) {
          const pathEl = findPathElement(targets.contentTarget);

          if (pathEl !== null) {
            rememberBaseline(pathEl, 'stroke-dasharray', pathEl.getAttribute('stroke-dasharray'));
            rememberBaseline(pathEl, 'stroke-dashoffset', pathEl.getAttribute('stroke-dashoffset'));
          }

          updateTrimPath(targets.contentTarget, propertyName, value);
          continue;
        }

        const cssPropertyName = toKebabCase(propertyName);

        rememberBaseline(
          targets.contentTarget,
          cssPropertyName,
          targets.contentTarget.style.getPropertyValue(cssPropertyName),
        );
        targets.contentTarget.style.setProperty(cssPropertyName, String(value));
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

          baselineGradients.set(targets.contentTarget, baseline);
          targets.contentTarget.style.background = serializeGradientToCss(updated);
        }
      }
    },
    clearStyles(container: HTMLElement, propertyNames: readonly string[]): void {
      const targets = getTargets(container);
      const uniquePropertyNames = new Set(propertyNames);

      for (const propertyName of uniquePropertyNames) {
        if (isGradientAnimationTarget(propertyName)) {
          baselineGradients.delete(targets.contentTarget);
          restoreCssProperty(targets.contentTarget, 'background');
          continue;
        }

        if (propertyName === 'opacity') {
          targets.opacityTarget.style.opacity = readBaseline(targets.opacityTarget, 'opacity');
          continue;
        }

        if (propertyName === 'content' || propertyName === 'textContent') {
          targets.contentTarget.textContent = readBaseline(targets.contentTarget, 'textContent');
          continue;
        }

        if (propertyName === 'd') {
          const pathElement = findPathElement(targets.contentTarget);

          if (pathElement !== null) {
            const baselineValue = readBaseline(pathElement, 'd');

            if (baselineValue === '') {
              pathElement.removeAttribute('d');
            } else {
              pathElement.setAttribute('d', baselineValue);
            }
          }

          continue;
        }

        if (propertyName === 'transform' || isTransformProperty(propertyName)) {
          clearTransformProperty(targets.contentTarget, propertyName);
          continue;
        }

        if (isTrimPathProperty(propertyName)) {
          clearTrimPathProperty(targets.contentTarget, propertyName);
          continue;
        }

        restoreCssProperty(targets.contentTarget, toKebabCase(propertyName));
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
