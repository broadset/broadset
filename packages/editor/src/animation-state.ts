import type {
  BroadsetScreenProps,
  ElementAnimationConfig,
  MaskType,
  ModifierTimelineBinding,
  StateTimelineBinding,
  Timeline,
  Visibility,
} from '@broadset/model';

// ---------------------------------------------------------------------------
// Reserved state names — IN/OUT cannot be removed from state bindings
// ---------------------------------------------------------------------------

const RESERVED_STATES = new Set(['IN', 'OUT']);

// ---------------------------------------------------------------------------
// Store-level action type (for future slice integration)
// ---------------------------------------------------------------------------

export interface AnimationStateActions {
  upsertTimeline: (elementId: string, timeline: Timeline) => void;
  removeTimeline: (elementId: string, timelineId: string) => void;
  setStateBinding: (elementId: string, binding: StateTimelineBinding) => void;
  removeStateBinding: (elementId: string, stateName: string) => void;
  setModifierBinding: (elementId: string, binding: ModifierTimelineBinding) => void;
  removeModifierBinding: (elementId: string, modifierName: string) => void;
}

// ---------------------------------------------------------------------------
// Timeline Upsert and Removal
// ---------------------------------------------------------------------------

/**
 * Upserts a timeline into the config. If a timeline with the same id exists,
 * it is replaced; otherwise the new timeline is appended.
 */
export function upsertTimeline(config: ElementAnimationConfig, timeline: Timeline): ElementAnimationConfig {
  const idx = config.timelines.findIndex((tl) => tl.id === timeline.id);

  if (idx >= 0) {
    const updated = [...config.timelines];

    updated[idx] = timeline;

    return { ...config, timelines: updated };
  }

  return { ...config, timelines: [...config.timelines, timeline] };
}

/**
 * Removes a timeline by id. Only the targeted timeline is affected.
 */
export function removeTimeline(config: ElementAnimationConfig, timelineId: string): ElementAnimationConfig {
  return {
    ...config,
    timelines: config.timelines.filter((tl) => tl.id !== timelineId),
  };
}

// ---------------------------------------------------------------------------
// State Timeline Binding Integrity
// ---------------------------------------------------------------------------

/**
 * Sets (upserts) a state timeline binding. If a binding for the same
 * stateName already exists, it is replaced.
 */
export function setStateBinding(config: ElementAnimationConfig, binding: StateTimelineBinding): ElementAnimationConfig {
  const filtered = config.stateTimelineBindings.filter((b) => b.stateName !== binding.stateName);

  return { ...config, stateTimelineBindings: [...filtered, binding] };
}

/**
 * Removes a state binding by name. Reserved states (IN, OUT) are protected
 * and cannot be removed.
 */
export function removeStateBinding(config: ElementAnimationConfig, stateName: string): ElementAnimationConfig {
  if (RESERVED_STATES.has(stateName)) {
    return config;
  }

  return {
    ...config,
    stateTimelineBindings: config.stateTimelineBindings.filter((b) => b.stateName !== stateName),
  };
}

/**
 * Reorders custom state bindings according to the provided order.
 * Reserved states (IN, OUT) keep their original positions; custom
 * states are placed after reserved states in the requested order.
 */
export function reorderStateBindings(
  config: ElementAnimationConfig,
  customOrder: readonly string[],
): ElementAnimationConfig {
  const reserved = config.stateTimelineBindings.filter((b) => RESERVED_STATES.has(b.stateName));
  const customMap = new Map(
    config.stateTimelineBindings.filter((b) => !RESERVED_STATES.has(b.stateName)).map((b) => [b.stateName, b]),
  );

  const orderedCustom: StateTimelineBinding[] = [];

  for (const name of customOrder) {
    const binding = customMap.get(name);

    if (binding !== undefined) {
      orderedCustom.push(binding);
    }
  }

  return { ...config, stateTimelineBindings: [...reserved, ...orderedCustom] };
}

// ---------------------------------------------------------------------------
// Modifier Timeline Binding Integrity
// ---------------------------------------------------------------------------

/**
 * Sets (upserts) a modifier binding. If a binding for the same modifierName
 * already exists, it is replaced.
 */
export function setModifierBinding(
  config: ElementAnimationConfig,
  binding: ModifierTimelineBinding,
): ElementAnimationConfig {
  const filtered = config.modifierTimelineBindings.filter((b) => b.modifierName !== binding.modifierName);

  return { ...config, modifierTimelineBindings: [...filtered, binding] };
}

/**
 * Removes a modifier binding by name.
 */
export function removeModifierBinding(config: ElementAnimationConfig, modifierName: string): ElementAnimationConfig {
  return {
    ...config,
    modifierTimelineBindings: config.modifierTimelineBindings.filter((b) => b.modifierName !== modifierName),
  };
}

// ---------------------------------------------------------------------------
// Element State Visibility Mapping
// ---------------------------------------------------------------------------

/**
 * Applies a named state to screen props. IN maps to 'onscreen',
 * OUT maps to 'offscreen'. Custom states update activeState only.
 */
export function applyElementState(screen: BroadsetScreenProps, stateName: string): BroadsetScreenProps {
  const visibilityMap: Record<string, Visibility> = {
    IN: 'onscreen',
    OUT: 'offscreen',
  };

  const visibility = visibilityMap[stateName];

  if (visibility !== undefined) {
    return { ...screen, activeState: stateName, visibility };
  }

  return { ...screen, activeState: stateName };
}

// ---------------------------------------------------------------------------
// Modifier and Screen Class Updates
// ---------------------------------------------------------------------------

/**
 * Enables a modifier on screen props. No-ops if already present (deduplication).
 */
export function enableModifier(screen: BroadsetScreenProps, modifierName: string): BroadsetScreenProps {
  if (screen.modifiers.includes(modifierName)) {
    return screen;
  }

  return { ...screen, modifiers: [...screen.modifiers, modifierName] };
}

/**
 * Disables (removes) a modifier from screen props.
 */
export function disableModifier(screen: BroadsetScreenProps, modifierName: string): BroadsetScreenProps {
  return { ...screen, modifiers: screen.modifiers.filter((m) => m !== modifierName) };
}

/**
 * Toggles a modifier: adds it if absent, removes it if present.
 */
export function toggleModifier(screen: BroadsetScreenProps, modifierName: string): BroadsetScreenProps {
  if (screen.modifiers.includes(modifierName)) {
    return disableModifier(screen, modifierName);
  }

  return enableModifier(screen, modifierName);
}

/**
 * Updates the mask type and custom clip-path on screen props.
 */
export function updateScreenClipPath(
  screen: BroadsetScreenProps,
  maskType: MaskType,
  clipPath: string,
): BroadsetScreenProps {
  return { ...screen, maskType, customClipPath: clipPath };
}
