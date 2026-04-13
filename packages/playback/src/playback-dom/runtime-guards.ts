import type { ElementAnimationConfig } from '@broadset/model';

export type VisibilityState = 'onscreen' | 'offscreen';

export interface ParsedElementRuntimeState {
  readonly visibility: VisibilityState;
  readonly activeState: string | null;
  readonly modifiers: ReadonlySet<string>;
}

function isKnownVisibility(value: string | undefined): value is VisibilityState {
  return value === 'onscreen' || value === 'offscreen';
}

export function findContentTarget(container: HTMLElement): HTMLElement {
  const target = container.querySelector<HTMLElement>('[data-element-content]');

  return target ?? container;
}

export function findOpacityTarget(container: HTMLElement, contentTarget: HTMLElement): HTMLElement {
  const target = container.querySelector<HTMLElement>('[data-opacity-target]');

  return target ?? contentTarget;
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
