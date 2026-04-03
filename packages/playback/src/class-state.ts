// ---------------------------------------------------------------------------
// Class state parsing — reads visibility, activeState, modifiers from DOM
// ---------------------------------------------------------------------------

const VISIBILITY_VALUES = new Set(['onscreen', 'offscreen']);

/** Parsed element state from CSS classes and data attributes. */
export interface ClassState {
  readonly visibility: 'onscreen' | 'offscreen';
  readonly activeState: string | null;
  readonly modifiers: readonly string[];
}

/**
 * Parse element visibility, active state, and modifiers from both
 * CSS classes and data attributes.
 *
 * Data-attribute `data-visibility` takes precedence when set.
 * Classes are matched against known state and modifier names from
 * the animation registry bindings.
 */
export function parseClassState(
  element: Element,
  knownStates: readonly string[],
  knownModifiers?: readonly string[],
): ClassState {
  // Data attribute takes precedence
  const dataVisibility = element.getAttribute('data-visibility');

  if (dataVisibility === 'onscreen' || dataVisibility === 'offscreen') {
    return {
      visibility: dataVisibility,
      activeState: element.getAttribute('data-active-state') ?? null,
      modifiers: parseModifiersFromData(element),
    };
  }

  // Fall back to class-based detection
  const classes = element.className.split(/\s+/).filter((c) => c.length > 0);

  let visibility: 'onscreen' | 'offscreen' = 'offscreen';
  let activeState: string | null = null;
  const modifiers: string[] = [];
  const stateSet = new Set(knownStates);
  const modifierSet = new Set(knownModifiers ?? []);

  for (const cls of classes) {
    if (VISIBILITY_VALUES.has(cls)) {
      visibility = cls as 'onscreen' | 'offscreen';
    } else if (stateSet.has(cls)) {
      activeState = cls;
    } else if (modifierSet.has(cls)) {
      modifiers.push(cls);
    }
  }

  return { visibility, activeState, modifiers };
}

/** Parse modifiers from a data-modifiers attribute (comma-separated). */
function parseModifiersFromData(element: Element): readonly string[] {
  const attr = element.getAttribute('data-modifiers');

  if (!attr) return [];

  return attr
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}
