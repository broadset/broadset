// ---------------------------------------------------------------------------
// Style writer — applies computed styles to DOM elements
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAMEL_RE = /[A-Z]/g;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a camelCase CSS property name to kebab-case.
 *
 * @example camelToKebab('backgroundColor') → 'background-color'
 */
export function camelToKebab(prop: string): string {
  return prop.replace(CAMEL_RE, (ch) => '-' + ch.toLowerCase());
}

/**
 * Apply computed styles to the correct sub-targets within a container element.
 *
 * Routing rules:
 * - opacity → `[data-opacity-target]` descendant (preserves 3D context)
 * - all other properties → `[data-element-content]` descendant
 * - fallback → container element when no matching descendant exists
 *
 * @param container The root element (element wrapper in the DOM)
 * @param styles    Map of camelCase CSS property names to values
 */
export function applyStylesToElement(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void {
  const contentTarget = container.querySelector<HTMLElement>('[data-element-content]');
  const opacityTarget = container.querySelector<HTMLElement>('[data-opacity-target]');

  for (const key of Object.keys(styles)) {
    const value = styles[key];

    if (value === undefined || value === null) continue;

    const cssValue =
      typeof value === 'string' ? value
      : typeof value === 'number' ? String(value)
      : null;

    if (cssValue === null) continue;

    if (key === 'opacity' && opacityTarget) {
      opacityTarget.style.setProperty(camelToKebab(key), cssValue);
    } else {
      const target = contentTarget ?? container;

      target.style.setProperty(camelToKebab(key), cssValue);
    }
  }
}
