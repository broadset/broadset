import type { ElementAnimationConfig } from '@broadset/model';

import { findContentTarget, type VisibilityState } from './runtime-guards';

const RUNTIME_STATE_CLASSES_DATA_KEY = 'broadsetRuntimeStateClasses';
const RUNTIME_STATE_CLASSES_ATTRIBUTE = 'data-broadset-runtime-state-classes';

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

function parseRuntimeStateClasses(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === '') {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (Array.isArray(parsed)) {
      const parsedEntries: readonly unknown[] = parsed;

      if (parsedEntries.every((entry: unknown) => typeof entry === 'string')) {
        return parsedEntries;
      }
    }
  } catch {
    return value.split(/\s+/u).filter((entry) => entry.length > 0);
  }

  return [];
}

function isValidClassToken(value: string): boolean {
  return value.trim().length > 0 && !/\s/u.test(value);
}

function removeClassToken(target: HTMLElement, value: string): void {
  if (isValidClassToken(value)) {
    target.classList.remove(value);
  }
}

function addClassToken(target: HTMLElement, value: string): boolean {
  if (!isValidClassToken(value)) {
    return false;
  }

  target.classList.add(value);

  return true;
}

function clearTrackedStateClasses(target: HTMLElement): void {
  for (const className of parseRuntimeStateClasses(target.dataset[RUNTIME_STATE_CLASSES_DATA_KEY])) {
    removeClassToken(target, className);
  }
}

function clearConfiguredStateClasses(
  target: HTMLElement,
  stateNames: readonly string[],
  modifierNames: readonly string[],
): void {
  for (const stateName of stateNames) {
    removeClassToken(target, stateName);
  }

  for (const modifierName of modifierNames) {
    removeClassToken(target, modifierName);
  }
}

function collectAppliedStateClasses(
  target: HTMLElement,
  activeState: string | null,
  modifiers: ReadonlySet<string>,
): readonly string[] {
  const appliedClassNames: string[] = [];

  if (activeState !== null && addClassToken(target, activeState)) {
    appliedClassNames.push(activeState);
  }

  for (const modifierName of modifiers) {
    if (addClassToken(target, modifierName)) {
      appliedClassNames.push(modifierName);
    }
  }

  return appliedClassNames;
}

function writeRuntimeStateClassMarker(target: HTMLElement, appliedClassNames: readonly string[]): void {
  if (appliedClassNames.length > 0) {
    target.dataset[RUNTIME_STATE_CLASSES_DATA_KEY] = JSON.stringify(appliedClassNames);

    return;
  }

  target.removeAttribute(RUNTIME_STATE_CLASSES_ATTRIBUTE);
}

function syncStateClassesForTarget(
  target: HTMLElement,
  stateNames: readonly string[],
  modifierNames: readonly string[],
  activeState: string | null,
  modifiers: ReadonlySet<string>,
): void {
  clearTrackedStateClasses(target);
  clearConfiguredStateClasses(target, stateNames, modifierNames);
  writeRuntimeStateClassMarker(target, collectAppliedStateClasses(target, activeState, modifiers));
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
    syncStateClassesForTarget(target, stateNames, modifierNames, activeState, modifiers);
  }
}
