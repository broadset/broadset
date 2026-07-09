import type {
  AnimationDefinition,
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyle,
  ElementAnimationConfig,
  MaskStyleType,
  ModifierTimelineBinding,
  StateTimelineBinding,
  Timeline,
} from '@broadset/model';

/** Runtime visibility map: elementId → visible (true = onscreen, false = offscreen). */
export type VisibilityMap = ReadonlyMap<string, boolean>;

const RESERVED_STATE_NAMES: ReadonlySet<string> = new Set(['IN', 'OUT']);

export function upsertTimeline(config: ElementAnimationConfig, timeline: Timeline): ElementAnimationConfig {
  const existingIndex = config.timelines.findIndex((tl) => tl.id === timeline.id);

  if (existingIndex >= 0) {
    const timelines = config.timelines.map((tl, i) => (i === existingIndex ? timeline : tl));

    return { ...config, timelines };
  }

  return { ...config, timelines: [...config.timelines, timeline] };
}

export function removeTimeline(config: ElementAnimationConfig, timelineId: string): ElementAnimationConfig {
  const timelines = config.timelines.filter((tl) => tl.id !== timelineId);

  if (timelines.length === config.timelines.length) {
    return config;
  }

  return { ...config, timelines };
}

export function setStateBinding(config: ElementAnimationConfig, binding: StateTimelineBinding): ElementAnimationConfig {
  const existingIndex = config.stateTimelineBindings.findIndex((b) => b.stateName === binding.stateName);

  if (existingIndex >= 0) {
    const stateTimelineBindings = config.stateTimelineBindings.map((b, i) => (i === existingIndex ? binding : b));

    return { ...config, stateTimelineBindings };
  }

  return { ...config, stateTimelineBindings: [...config.stateTimelineBindings, binding] };
}

export function removeStateBinding(config: ElementAnimationConfig, stateName: string): ElementAnimationConfig {
  if (RESERVED_STATE_NAMES.has(stateName)) {
    return config;
  }

  const stateTimelineBindings = config.stateTimelineBindings.filter((b) => b.stateName !== stateName);

  if (stateTimelineBindings.length === config.stateTimelineBindings.length) {
    return config;
  }

  return { ...config, stateTimelineBindings };
}

export function reorderCustomStateBindings(
  config: ElementAnimationConfig,
  customOrder: readonly string[],
): ElementAnimationConfig {
  const reserved = config.stateTimelineBindings.filter((b) => RESERVED_STATE_NAMES.has(b.stateName));
  const customBindings = config.stateTimelineBindings.filter((b) => !RESERVED_STATE_NAMES.has(b.stateName));
  const bindingsByName = new Map(customBindings.map((b) => [b.stateName, b]));

  const reordered: StateTimelineBinding[] = [];
  const includedNames = new Set(customOrder);

  for (const name of customOrder) {
    const binding = bindingsByName.get(name);

    if (binding !== undefined) {
      reordered.push(binding);
    }
  }

  // Preserve any custom states not mentioned in the reorder list
  const omitted = customBindings.filter((b) => !includedNames.has(b.stateName));

  const inBinding = reserved.find((b) => b.stateName === 'IN');
  const outBinding = reserved.find((b) => b.stateName === 'OUT');

  const result: StateTimelineBinding[] = [];

  if (inBinding !== undefined) {
    result.push(inBinding);
  }

  result.push(...reordered);
  result.push(...omitted);

  if (outBinding !== undefined) {
    result.push(outBinding);
  }

  return { ...config, stateTimelineBindings: result };
}

export function setModifierBinding(
  config: ElementAnimationConfig,
  binding: ModifierTimelineBinding,
): ElementAnimationConfig {
  const existingIndex = config.modifierTimelineBindings.findIndex((b) => b.modifierName === binding.modifierName);

  if (existingIndex >= 0) {
    const modifierTimelineBindings = config.modifierTimelineBindings.map((b, i) => (i === existingIndex ? binding : b));

    return { ...config, modifierTimelineBindings };
  }

  return { ...config, modifierTimelineBindings: [...config.modifierTimelineBindings, binding] };
}

export function removeModifierBinding(config: ElementAnimationConfig, modifierName: string): ElementAnimationConfig {
  const modifierTimelineBindings = config.modifierTimelineBindings.filter((b) => b.modifierName !== modifierName);

  if (modifierTimelineBindings.length === config.modifierTimelineBindings.length) {
    return config;
  }

  return { ...config, modifierTimelineBindings };
}

function findAnimationConfig(doc: BroadsetDocument, elementId: string): AnimationDefinition | undefined {
  return doc.animations.find((a) => a.elementId === elementId);
}

function getDescendantIds(doc: BroadsetDocument, parentId: string): readonly string[] {
  const result: string[] = [];
  const queue = [parentId];

  while (queue.length > 0) {
    const current = queue.shift();

    if (current === undefined) {
      break;
    }

    for (const element of doc.elements) {
      if (element.parentId === current && element.id !== parentId) {
        result.push(element.id);
        queue.push(element.id);
      }
    }
  }

  return result;
}

export function applyEntryState(doc: BroadsetDocument, elementId: string): VisibilityMap {
  const map = new Map<string, boolean>();

  map.set(elementId, true);

  const descendantIds = getDescendantIds(doc, elementId);

  for (const descendantId of descendantIds) {
    const descendantAnim = findAnimationConfig(doc, descendantId);

    if (descendantAnim !== undefined) {
      const hasEntryBinding = descendantAnim.config.stateTimelineBindings.some((b) => b.stateName === 'IN');

      if (hasEntryBinding) {
        map.set(descendantId, true);
      }
    }
  }

  return map;
}

export function applyExitState(doc: BroadsetDocument, elementId: string): VisibilityMap {
  const map = new Map<string, boolean>();

  map.set(elementId, false);

  const descendantIds = getDescendantIds(doc, elementId);

  for (const descendantId of descendantIds) {
    const descendantAnim = findAnimationConfig(doc, descendantId);

    if (descendantAnim !== undefined) {
      const hasExitBinding = descendantAnim.config.stateTimelineBindings.some((b) => b.stateName === 'OUT');

      if (hasExitBinding) {
        map.set(descendantId, false);
      }
    }
  }

  return map;
}

export function addModifier(modifiers: readonly string[], name: string): readonly string[] {
  if (modifiers.includes(name)) {
    return modifiers;
  }

  return [...modifiers, name];
}

export function removeModifier(modifiers: readonly string[], name: string): readonly string[] {
  return modifiers.filter((m) => m !== name);
}

export function toggleModifier(modifiers: readonly string[], name: string): readonly string[] {
  if (modifiers.includes(name)) {
    return removeModifier(modifiers, name);
  }

  return addModifier(modifiers, name);
}

export function updateClipPath(
  element: BroadsetElement,
  maskType: MaskStyleType,
  customClipPath: string,
): BroadsetElement {
  const style: BroadsetElementStyle = {
    ...element.style,
    maskType,
    customClipPath,
  };

  return { ...element, style };
}
