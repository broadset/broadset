import type { ElementAnimationConfig } from '@broadset/model';

import { findContentTarget, type VisibilityState } from './runtime-guards';

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
