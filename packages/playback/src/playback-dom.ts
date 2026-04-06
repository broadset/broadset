import type { ElementAnimationConfig } from '@broadset/model';

import type { TimelineFrame } from './timeline';

export type VisibilityState = 'onscreen' | 'offscreen';

export interface ParsedElementRuntimeState {
  readonly visibility: VisibilityState;
  readonly activeState: string | null;
  readonly modifiers: ReadonlySet<string>;
}

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

function isKnownVisibility(value: string | undefined): value is VisibilityState {
  return value === 'onscreen' || value === 'offscreen';
}

function findContentTarget(container: HTMLElement): HTMLElement {
  const target = container.querySelector<HTMLElement>('[data-element-content]');

  return target ?? container;
}

function findOpacityTarget(container: HTMLElement, contentTarget: HTMLElement): HTMLElement {
  const target = container.querySelector<HTMLElement>('[data-opacity-target]');

  return target ?? contentTarget;
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

export function resolveAnimationTargets(): AnimationTargetsResolver {
  const cache = new WeakMap<HTMLElement, ResolvedAnimationTargets>();
  const transforms = new WeakMap<HTMLElement, MutableTransformState>();
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

  return {
    applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void {
      const targets = getTargets(container);

      for (const [propertyName, value] of Object.entries(styles)) {
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

        const cssPropertyName = toKebabCase(propertyName);

        rememberBaseline(
          targets.contentTarget,
          cssPropertyName,
          targets.contentTarget.style.getPropertyValue(cssPropertyName),
        );
        targets.contentTarget.style.setProperty(cssPropertyName, String(value));
      }
    },
    clearStyles(container: HTMLElement, propertyNames: readonly string[]): void {
      const targets = getTargets(container);
      const uniquePropertyNames = new Set(propertyNames);

      for (const propertyName of uniquePropertyNames) {
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

export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

export function parseElementRuntimeState(args: {
  readonly element: HTMLElement;
  readonly config: ElementAnimationConfig;
}): ParsedElementRuntimeState {
  const dataVisibility = args.element.dataset['visibility'];
  const visibility =
    isKnownVisibility(dataVisibility) ? dataVisibility
    : args.element.classList.contains('offscreen') ? 'offscreen'
    : 'onscreen';

  let activeState: string | null = null;

  for (const binding of args.config.stateTimelineBindings) {
    if (args.element.classList.contains(binding.stateName)) {
      activeState = binding.stateName;
      break;
    }
  }

  const modifiers = new Set<string>();

  for (const binding of args.config.modifierTimelineBindings) {
    args.element.classList.contains(binding.modifierName) && modifiers.add(binding.modifierName);
  }

  return {
    visibility,
    activeState,
    modifiers,
  };
}

export function applyVisibility(container: HTMLElement, visibility: VisibilityState): void {
  container.dataset['visibility'] = visibility;

  if (visibility === 'offscreen') {
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';

    return;
  }

  container.style.visibility = 'visible';
  container.style.pointerEvents = 'auto';
}

export function syncStateClasses(
  container: HTMLElement,
  config: ElementAnimationConfig,
  activeState: string | null,
  modifiers: ReadonlySet<string>,
): void {
  const contentTarget = findContentTarget(container);
  const stateNames = config.stateTimelineBindings.map((binding) => binding.stateName);
  const modifierNames = config.modifierTimelineBindings.map((binding) => binding.modifierName);
  const targets = container === contentTarget ? [container] : [container, contentTarget];

  for (const target of targets) {
    for (const stateName of stateNames) {
      target.classList.remove(stateName);
    }

    for (const modifierName of modifierNames) {
      target.classList.remove(modifierName);
    }

    activeState !== null && target.classList.add(activeState);

    for (const modifierName of modifiers) {
      target.classList.add(modifierName);
    }
  }
}

export function applyTimelineFrameToDom(args: {
  readonly root: HTMLElement;
  readonly targetsResolver: AnimationTargetsResolver;
  readonly container: HTMLElement;
  readonly config: ElementAnimationConfig;
  readonly frame: TimelineFrame;
}): void {
  args.targetsResolver.applyStyles(args.container, args.frame.properties);
  syncStateClasses(args.container, args.config, args.frame.activeState, args.frame.modifiers);

  for (const [targetId, properties] of Object.entries(args.frame.targetProperties)) {
    const targetContainer = args.root.querySelector<HTMLElement>(
      `[data-element-id="${escapeCssIdentifier(targetId)}"]`,
    );

    if (targetContainer !== null) {
      args.targetsResolver.applyStyles(targetContainer, properties);
    }
  }
}
