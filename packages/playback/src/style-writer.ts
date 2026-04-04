// ---------------------------------------------------------------------------
// Style writer — applies computed styles to DOM elements
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CAMEL_RE = /[A-Z]/g;

// ---------------------------------------------------------------------------
// Target cache
// ---------------------------------------------------------------------------

/**
 * WeakMap cache of resolved sub-targets per container element.
 * Using WeakMap so that entries are garbage-collected when the container
 * is removed from the DOM. Call `invalidateStyleTargetCache` to clear
 * a container's cached targets (e.g. after a MutationObserver fires).
 */
const targetCache = new WeakMap<
  HTMLElement,
  { readonly content: HTMLElement | null; readonly opacity: HTMLElement | null }
>();

/** Invalidate the cached style targets for a container element. */
export function invalidateStyleTargetCache(container: HTMLElement): void {
  targetCache.delete(container);
}

/** Resolve and cache the content and opacity sub-targets for a container. */
function resolveTargets(container: HTMLElement): {
  readonly content: HTMLElement | null;
  readonly opacity: HTMLElement | null;
} {
  const cached = targetCache.get(container);

  if (cached) return cached;

  const entry = {
    content: container.querySelector<HTMLElement>('[data-element-content]'),
    opacity: container.querySelector<HTMLElement>('[data-opacity-target]'),
  };

  targetCache.set(container, entry);

  return entry;
}

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
  const { content: contentTarget, opacity: opacityTarget } = resolveTargets(container);

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
