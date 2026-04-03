// ---------------------------------------------------------------------------
// Background style application
// ---------------------------------------------------------------------------

export interface BackgroundStyleInput {
  readonly backgroundColor?: string | undefined;
  readonly backgroundGradient?: string | undefined;
}

/**
 * Applies background styling to a DOM element.
 *
 * Gradient and solid backgrounds are mutually exclusive:
 * - Gradient is applied via `backgroundImage` and clears `backgroundColor`.
 * - Solid is applied via `backgroundColor` and clears `backgroundImage`.
 * - When both are provided, gradient takes precedence.
 * - When neither is provided, both are cleared.
 */
export function applyBackgroundStyle(element: HTMLElement, input: BackgroundStyleInput): void {
  if (input.backgroundGradient !== undefined) {
    // Gradient takes precedence — clear solid color, set gradient image
    element.style.backgroundColor = '';
    element.style.backgroundImage = input.backgroundGradient;
  } else if (input.backgroundColor !== undefined) {
    // Solid color — clear gradient image, set solid
    element.style.backgroundImage = '';
    element.style.backgroundColor = input.backgroundColor;
  } else {
    // Neither — clear both
    element.style.backgroundColor = '';
    element.style.backgroundImage = '';
  }
}
