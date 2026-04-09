import type {
  AnimationDefinition,
  ElementAnimationConfig,
  ModifierTimelineBinding,
  StateTimelineBinding,
  Timeline,
} from '@broadset/model';
import { createDefaultElement, createEmptyBroadsetDocument } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  addModifier,
  applyEntryState,
  applyExitState,
  removeModifier,
  removeModifierBinding,
  removeStateBinding,
  removeTimeline,
  reorderCustomStateBindings,
  setModifierBinding,
  setStateBinding,
  toggleModifier,
  updateClipPath,
  upsertTimeline,
} from './animation-state';

function createTimeline(overrides: Partial<Timeline> = {}): Timeline {
  return {
    id: 'tl-1',
    name: 'default',
    keyframes: [],
    ...overrides,
  };
}

function createConfig(overrides: Partial<ElementAnimationConfig> = {}): ElementAnimationConfig {
  return {
    timelines: [],
    stateTimelineBindings: [],
    modifierTimelineBindings: [],
    textAnimator: null,
    ...overrides,
  };
}

function createAnimDef(elementId: string, config: ElementAnimationConfig): AnimationDefinition {
  return { elementId, config };
}

function createDoc(animations: readonly AnimationDefinition[]) {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    elements: [
      createDefaultElement('rectangle', { id: 'el-1', name: 'Rect' }),
      createDefaultElement('rectangle', { id: 'el-2', name: 'Child', parentId: 'el-1' }),
      createDefaultElement('rectangle', { id: 'el-3', name: 'Other', parentId: 'el-1' }),
    ],
    animations,
  };
}

describe('animation-state', () => {
  describe('Timeline Upsert and Removal', () => {
    /** @description Upserting a timeline by id replaces the existing timeline content while keeping the same identity. */
    it('replaces an existing timeline by id on upsert', () => {
      const original = createTimeline({ id: 'tl-1', name: 'Original', keyframes: [] });
      const replacement = createTimeline({ id: 'tl-1', name: 'Replaced', keyframes: [] });
      const config = createConfig({ timelines: [original] });

      const result = upsertTimeline(config, replacement);

      expect(result.timelines).toHaveLength(1);
      expect(result.timelines[0]?.name).toBe('Replaced');
    });

    /** @description Upserting a new timeline adds it to the config without affecting existing timelines. */
    it('adds a new timeline if no matching id exists', () => {
      const existing = createTimeline({ id: 'tl-1', name: 'First' });
      const newTl = createTimeline({ id: 'tl-2', name: 'Second' });
      const config = createConfig({ timelines: [existing] });

      const result = upsertTimeline(config, newTl);

      expect(result.timelines).toHaveLength(2);
      expect(result.timelines[0]?.name).toBe('First');
      expect(result.timelines[1]?.name).toBe('Second');
    });

    /** @description Upsert preserves unrelated timelines — only the targeted timeline is changed. */
    it('preserves unrelated timelines on upsert', () => {
      const tl1 = createTimeline({ id: 'tl-1', name: 'Keep' });
      const tl2 = createTimeline({ id: 'tl-2', name: 'Also Keep' });
      const replacement = createTimeline({ id: 'tl-1', name: 'Changed' });
      const config = createConfig({ timelines: [tl1, tl2] });

      const result = upsertTimeline(config, replacement);

      expect(result.timelines).toHaveLength(2);
      expect(result.timelines[1]?.name).toBe('Also Keep');
    });

    /** @description Removing a timeline only affects the targeted timeline, leaving others intact. */
    it('removes only the targeted timeline', () => {
      const tl1 = createTimeline({ id: 'tl-1', name: 'Keep' });
      const tl2 = createTimeline({ id: 'tl-2', name: 'Remove' });
      const config = createConfig({ timelines: [tl1, tl2] });

      const result = removeTimeline(config, 'tl-2');

      expect(result.timelines).toHaveLength(1);
      expect(result.timelines[0]?.id).toBe('tl-1');
    });

    /** @description Removing a non-existent timeline returns config unchanged. */
    it('is a no-op when the targeted timeline does not exist', () => {
      const config = createConfig({ timelines: [createTimeline()] });

      const result = removeTimeline(config, 'nonexistent');

      expect(result.timelines).toHaveLength(1);
    });
  });

  describe('State Timeline Binding Integrity', () => {
    /** @description Setting a state binding with an existing state name replaces the binding for that name. */
    it('replaces a state binding for the same state name (idempotent)', () => {
      const existing: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-old' };
      const config = createConfig({ stateTimelineBindings: [existing] });

      const result = setStateBinding(config, { stateName: 'hover', timelineId: 'tl-new' });

      expect(result.stateTimelineBindings).toHaveLength(1);
      expect(result.stateTimelineBindings[0]?.timelineId).toBe('tl-new');
    });

    /** @description Adding a state binding with a new state name appends it. */
    it('adds a new state binding for an unseen state name', () => {
      const existing: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-1' };
      const config = createConfig({ stateTimelineBindings: [existing] });

      const result = setStateBinding(config, { stateName: 'active', timelineId: 'tl-2' });

      expect(result.stateTimelineBindings).toHaveLength(2);
    });

    /** @description Reserved entry/exit state bindings are protected from removal. */
    it('does not remove reserved IN state binding', () => {
      const bindings: readonly StateTimelineBinding[] = [
        { stateName: 'IN', timelineId: 'tl-in' },
        { stateName: 'OUT', timelineId: 'tl-out' },
        { stateName: 'custom', timelineId: 'tl-custom' },
      ];
      const config = createConfig({ stateTimelineBindings: bindings });

      const result = removeStateBinding(config, 'IN');

      expect(result).toBe(config);
      expect(result.stateTimelineBindings.find((b) => b.stateName === 'IN')).toBeDefined();
    });

    /** @description Reserved OUT state binding is protected from removal. */
    it('does not remove reserved OUT state binding', () => {
      const bindings: readonly StateTimelineBinding[] = [
        { stateName: 'IN', timelineId: 'tl-in' },
        { stateName: 'OUT', timelineId: 'tl-out' },
      ];
      const config = createConfig({ stateTimelineBindings: bindings });

      const result = removeStateBinding(config, 'OUT');

      expect(result).toBe(config);
      expect(result.stateTimelineBindings.find((b) => b.stateName === 'OUT')).toBeDefined();
    });

    /** @description Removing a custom state binding works normally. */
    it('removes a custom state binding', () => {
      const bindings: readonly StateTimelineBinding[] = [
        { stateName: 'IN', timelineId: 'tl-in' },
        { stateName: 'hover', timelineId: 'tl-hover' },
        { stateName: 'OUT', timelineId: 'tl-out' },
      ];
      const config = createConfig({ stateTimelineBindings: bindings });

      const result = removeStateBinding(config, 'hover');

      expect(result.stateTimelineBindings).toHaveLength(2);
      expect(result.stateTimelineBindings.find((b) => b.stateName === 'hover')).toBeUndefined();
    });

    /** @description Reordering custom state bindings changes custom ordering while preserving reserved state ordering. */
    it('reorders custom states while preserving reserved state positions', () => {
      const bindings: readonly StateTimelineBinding[] = [
        { stateName: 'IN', timelineId: 'tl-in' },
        { stateName: 'hover', timelineId: 'tl-hover' },
        { stateName: 'active', timelineId: 'tl-active' },
        { stateName: 'OUT', timelineId: 'tl-out' },
      ];
      const config = createConfig({ stateTimelineBindings: bindings });

      const result = reorderCustomStateBindings(config, ['active', 'hover']);

      const names = result.stateTimelineBindings.map((b) => b.stateName);

      expect(names[0]).toBe('IN');
      expect(names[names.length - 1]).toBe('OUT');

      // Custom states are now reordered
      const customNames = names.filter((n) => n !== 'IN' && n !== 'OUT');

      expect(customNames).toEqual(['active', 'hover']);
    });

    /** @description Incomplete reorder list preserves omitted custom states after listed ones. */
    it('preserves omitted custom states when reorder list is incomplete', () => {
      const bindings: readonly StateTimelineBinding[] = [
        { stateName: 'IN', timelineId: 'tl-in' },
        { stateName: 'hover', timelineId: 'tl-hover' },
        { stateName: 'active', timelineId: 'tl-active' },
        { stateName: 'focus', timelineId: 'tl-focus' },
        { stateName: 'OUT', timelineId: 'tl-out' },
      ];
      const config = createConfig({ stateTimelineBindings: bindings });

      // Only mention 'active' — hover and focus should be preserved
      const result = reorderCustomStateBindings(config, ['active']);

      const names = result.stateTimelineBindings.map((b) => b.stateName);

      expect(names[0]).toBe('IN');
      expect(names[names.length - 1]).toBe('OUT');

      const customNames = names.filter((n) => n !== 'IN' && n !== 'OUT');

      expect(customNames).toEqual(['active', 'hover', 'focus']);
    });
  });

  describe('Modifier Timeline Binding Integrity', () => {
    /** @description Setting a modifier binding replaces the existing binding for the same modifier name. */
    it('replaces a same-name modifier binding', () => {
      const existing: ModifierTimelineBinding = { modifierName: 'flash', inTimelineId: 'tl-old' };
      const config = createConfig({ modifierTimelineBindings: [existing] });

      const result = setModifierBinding(config, { modifierName: 'flash', inTimelineId: 'tl-new' });

      expect(result.modifierTimelineBindings).toHaveLength(1);
      expect(result.modifierTimelineBindings[0]?.inTimelineId).toBe('tl-new');
    });

    /** @description Removing a modifier binding only affects the targeted binding. */
    it('removes only the targeted modifier binding', () => {
      const bindings: readonly ModifierTimelineBinding[] = [
        { modifierName: 'flash', inTimelineId: 'tl-flash' },
        { modifierName: 'glow', inTimelineId: 'tl-glow' },
      ];
      const config = createConfig({ modifierTimelineBindings: bindings });

      const result = removeModifierBinding(config, 'flash');

      expect(result.modifierTimelineBindings).toHaveLength(1);
      expect(result.modifierTimelineBindings[0]?.modifierName).toBe('glow');
    });
  });

  describe('Element State Visibility Mapping', () => {
    /** @description Entry state sets element visibility to onscreen, exit sets to offscreen. */
    it('sets visibility onscreen for entry and offscreen for exit', () => {
      const config = createConfig({
        stateTimelineBindings: [
          { stateName: 'IN', timelineId: 'tl-in' },
          { stateName: 'OUT', timelineId: 'tl-out' },
        ],
      });
      const doc = createDoc([createAnimDef('el-1', config)]);

      const entryMap = applyEntryState(doc, 'el-1');

      expect(entryMap.get('el-1')).toBe(true);

      const exitMap = applyExitState(doc, 'el-1');

      expect(exitMap.get('el-1')).toBe(false);
    });

    /** @description Descendant propagation only applies to descendants with their own animation state definitions. */
    it('propagates exit visibility only to descendants with animation state definitions', () => {
      const parentConfig = createConfig({
        stateTimelineBindings: [{ stateName: 'OUT', timelineId: 'tl-out' }],
      });
      const childConfig = createConfig({
        stateTimelineBindings: [{ stateName: 'OUT', timelineId: 'tl-child-out' }],
      });
      // el-2 has animation config, el-3 does not
      const doc = createDoc([createAnimDef('el-1', parentConfig), createAnimDef('el-2', childConfig)]);

      const exitMap = applyExitState(doc, 'el-1');

      // el-1 itself is set to offscreen
      expect(exitMap.get('el-1')).toBe(false);
      // el-2 has animation config → propagated
      expect(exitMap.get('el-2')).toBe(false);
      // el-3 has no animation config → not in the map
      expect(exitMap.has('el-3')).toBe(false);
    });
  });

  describe('Modifier and Screen Class Updates', () => {
    /** @description Modifier toggle is deterministic and deduplicated. */
    it('adds, removes, and toggles modifiers without duplicates', () => {
      let modifiers: readonly string[] = [];

      modifiers = addModifier(modifiers, 'flash');

      expect(modifiers).toEqual(['flash']);

      // Adding the same modifier again should not duplicate
      modifiers = addModifier(modifiers, 'flash');

      expect(modifiers).toEqual(['flash']);

      // Remove
      modifiers = removeModifier(modifiers, 'flash');

      expect(modifiers).toEqual([]);

      // Toggle on
      modifiers = toggleModifier(modifiers, 'flash');

      expect(modifiers).toEqual(['flash']);

      // Toggle off
      modifiers = toggleModifier(modifiers, 'flash');

      expect(modifiers).toEqual([]);
    });

    /** @description Custom clip-path update persists mask mode and clip-path in element style. */
    it('persists custom clip-path in element style', () => {
      const element = createDefaultElement('rectangle', { id: 'el-1', name: 'Rect' });

      const result = updateClipPath(element, 'alpha', 'circle(50%)');

      expect(result.style.maskType).toBe('alpha');
      expect(result.style.customClipPath).toBe('circle(50%)');
    });

    /** @description Updating clip-path preserves other style properties. */
    it('preserves other style properties when updating clip-path', () => {
      const base = createDefaultElement('rectangle', { id: 'el-1', name: 'Rect', style: { opacity: 0.5 } });

      const result = updateClipPath(base, 'luminance', 'polygon(0% 0%, 100% 0%, 50% 100%)');

      expect(result.style.maskType).toBe('luminance');
      expect(result.style.customClipPath).toBe('polygon(0% 0%, 100% 0%, 50% 100%)');
      expect(result.style.opacity).toBe(0.5);
    });
  });
});
