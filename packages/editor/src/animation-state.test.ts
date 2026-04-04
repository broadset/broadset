import type { ElementAnimationConfig, ModifierTimelineBinding, StateTimelineBinding, Timeline } from '@broadset/model';
import { createDefaultScreenProps } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import {
  applyElementState,
  disableModifier,
  enableModifier,
  removeModifierBinding,
  removeStateBinding,
  removeTimeline,
  reorderStateBindings,
  setModifierBinding,
  setStateBinding,
  toggleModifier,
  updateScreenClipPath,
  upsertTimeline,
} from './animation-state';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeTimeline(id: string, name: string): Timeline {
  return { id, name, entries: [] };
}

function makeConfig(
  timelines: readonly Timeline[] = [],
  stateBindings: readonly StateTimelineBinding[] = [],
  modifierBindings: readonly ModifierTimelineBinding[] = [],
): ElementAnimationConfig {
  return { timelines, stateTimelineBindings: stateBindings, modifierTimelineBindings: modifierBindings };
}

// ---------------------------------------------------------------------------
// Timeline Upsert and Removal
// ---------------------------------------------------------------------------

describe('Timeline Upsert and Removal', () => {
  /** @description Upserting a timeline with a matching id should replace that timeline's content. */
  it('replaces targeted timeline on upsert by id', () => {
    const existing = makeTimeline('tl-1', 'fadeIn');
    const config = makeConfig([existing]);
    const updated = makeTimeline('tl-1', 'fadeOut');

    const result = upsertTimeline(config, updated);

    expect(result.timelines).toHaveLength(1);
    expect(result.timelines[0]?.name).toBe('fadeOut');
    expect(result.timelines[0]?.id).toBe('tl-1');
  });

  /** @description Upserting a timeline should not modify unrelated timelines. */
  it('preserves unrelated timelines on upsert', () => {
    const tl1 = makeTimeline('tl-1', 'fadeIn');
    const tl2 = makeTimeline('tl-2', 'slideUp');
    const config = makeConfig([tl1, tl2]);
    const updated = makeTimeline('tl-1', 'fadeOut');

    const result = upsertTimeline(config, updated);

    expect(result.timelines).toHaveLength(2);
    expect(result.timelines[1]?.name).toBe('slideUp');
  });

  /** @description Upserting a new timeline (no match) should append it. */
  it('appends new timeline when no match exists', () => {
    const tl1 = makeTimeline('tl-1', 'fadeIn');
    const config = makeConfig([tl1]);
    const newTl = makeTimeline('tl-2', 'slideUp');

    const result = upsertTimeline(config, newTl);

    expect(result.timelines).toHaveLength(2);
    expect(result.timelines[1]?.id).toBe('tl-2');
  });

  /** @description Removing a timeline should only affect the targeted timeline. */
  it('removes only the targeted timeline', () => {
    const tl1 = makeTimeline('tl-1', 'fadeIn');
    const tl2 = makeTimeline('tl-2', 'slideUp');
    const config = makeConfig([tl1, tl2]);

    const result = removeTimeline(config, 'tl-1');

    expect(result.timelines).toHaveLength(1);
    expect(result.timelines[0]?.id).toBe('tl-2');
  });
});

// ---------------------------------------------------------------------------
// State Timeline Binding Integrity
// ---------------------------------------------------------------------------

describe('State Timeline Binding Integrity', () => {
  /** @description Setting a state binding for an existing state name should replace it (idempotent). */
  it('replaces state binding for same state name', () => {
    const binding: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-1' };
    const config = makeConfig([], [binding]);
    const newBinding: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-2' };

    const result = setStateBinding(config, newBinding);

    expect(result.stateTimelineBindings).toHaveLength(1);
    expect(result.stateTimelineBindings[0]?.timelineId).toBe('tl-2');
  });

  /** @description Reserved entry/exit state bindings must not be removable. */
  it('protects reserved entry/exit state bindings from removal', () => {
    const entryBinding: StateTimelineBinding = { stateName: 'IN', timelineId: 'tl-entry' };
    const exitBinding: StateTimelineBinding = { stateName: 'OUT', timelineId: 'tl-exit' };
    const customBinding: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-hover' };
    const config = makeConfig([], [entryBinding, exitBinding, customBinding]);

    const afterRemoveIN = removeStateBinding(config, 'IN');

    expect(afterRemoveIN.stateTimelineBindings).toHaveLength(3);

    const afterRemoveOUT = removeStateBinding(config, 'OUT');

    expect(afterRemoveOUT.stateTimelineBindings).toHaveLength(3);
  });

  /** @description Custom state bindings can be removed. */
  it('removes custom state bindings', () => {
    const entryBinding: StateTimelineBinding = { stateName: 'IN', timelineId: 'tl-entry' };
    const customBinding: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-hover' };
    const config = makeConfig([], [entryBinding, customBinding]);

    const result = removeStateBinding(config, 'hover');

    expect(result.stateTimelineBindings).toHaveLength(1);
    expect(result.stateTimelineBindings[0]?.stateName).toBe('IN');
  });

  /** @description Reordering custom states changes their order while reserved state order is preserved. */
  it('reorders custom states while preserving reserved state ordering', () => {
    const entryBinding: StateTimelineBinding = { stateName: 'IN', timelineId: 'tl-entry' };
    const exitBinding: StateTimelineBinding = { stateName: 'OUT', timelineId: 'tl-exit' };
    const custom1: StateTimelineBinding = { stateName: 'hover', timelineId: 'tl-hover' };
    const custom2: StateTimelineBinding = { stateName: 'active', timelineId: 'tl-active' };
    const config = makeConfig([], [entryBinding, exitBinding, custom1, custom2]);

    // Reorder: active before hover
    const result = reorderStateBindings(config, ['active', 'hover']);

    // Reserved states at their original positions
    expect(result.stateTimelineBindings[0]?.stateName).toBe('IN');
    expect(result.stateTimelineBindings[1]?.stateName).toBe('OUT');
    // Custom states in new order
    expect(result.stateTimelineBindings[2]?.stateName).toBe('active');
    expect(result.stateTimelineBindings[3]?.stateName).toBe('hover');
  });
});

// ---------------------------------------------------------------------------
// Modifier Timeline Binding Integrity
// ---------------------------------------------------------------------------

describe('Modifier Timeline Binding Integrity', () => {
  /** @description Setting a modifier binding replaces an existing one with the same name. */
  it('replaces modifier binding for same modifier name', () => {
    const existing: ModifierTimelineBinding = { modifierName: 'glow', inTimelineId: 'tl-in-1' };
    const config = makeConfig([], [], [existing]);
    const updated: ModifierTimelineBinding = {
      modifierName: 'glow',
      inTimelineId: 'tl-in-2',
      outTimelineId: 'tl-out-2',
    };

    const result = setModifierBinding(config, updated);

    expect(result.modifierTimelineBindings).toHaveLength(1);
    expect(result.modifierTimelineBindings[0]?.inTimelineId).toBe('tl-in-2');
    expect(result.modifierTimelineBindings[0]?.outTimelineId).toBe('tl-out-2');
  });

  /** @description Removing a modifier binding only affects the targeted one. */
  it('removes only the requested modifier binding', () => {
    const bind1: ModifierTimelineBinding = { modifierName: 'glow', inTimelineId: 'tl-in-1' };
    const bind2: ModifierTimelineBinding = { modifierName: 'shake', inTimelineId: 'tl-in-2' };
    const config = makeConfig([], [], [bind1, bind2]);

    const result = removeModifierBinding(config, 'glow');

    expect(result.modifierTimelineBindings).toHaveLength(1);
    expect(result.modifierTimelineBindings[0]?.modifierName).toBe('shake');
  });
});

// ---------------------------------------------------------------------------
// Element State Visibility Mapping
// ---------------------------------------------------------------------------

describe('Element State Visibility Mapping', () => {
  /** @description Applying IN state sets visibility to onscreen, OUT sets visibility to offscreen. */
  it('maps entry/exit states to onscreen/offscreen visibility', () => {
    const screen = createDefaultScreenProps();

    const afterIN = applyElementState(screen, 'IN');

    expect(afterIN.visibility).toBe('onscreen');
    expect(afterIN.activeState).toBe('IN');

    const afterOUT = applyElementState(screen, 'OUT');

    expect(afterOUT.visibility).toBe('offscreen');
    expect(afterOUT.activeState).toBe('OUT');
  });

  /** @description Custom state application updates activeState without changing visibility. */
  it('applies custom state without changing visibility', () => {
    const screen = { ...createDefaultScreenProps(), visibility: 'offscreen' as const };

    const result = applyElementState(screen, 'hover');

    expect(result.activeState).toBe('hover');
    expect(result.visibility).toBe('offscreen');
  });
});

// ---------------------------------------------------------------------------
// Modifier and Screen Class Updates
// ---------------------------------------------------------------------------

describe('Modifier and Screen Class Updates', () => {
  /** @description Enable/disable/toggle modifier operations keep the modifier list deduplicated. */
  it('enables, disables, and toggles modifiers without duplicates', () => {
    const screen = createDefaultScreenProps();

    // Enable
    const s1 = enableModifier(screen, 'glow');

    expect(s1.modifiers).toEqual(['glow']);

    // Enable again (no duplicate)
    const s2 = enableModifier(s1, 'glow');

    expect(s2.modifiers).toEqual(['glow']);

    // Add a second modifier
    const s3 = enableModifier(s2, 'shake');

    expect(s3.modifiers).toEqual(['glow', 'shake']);

    // Disable
    const s4 = disableModifier(s3, 'glow');

    expect(s4.modifiers).toEqual(['shake']);

    // Toggle on
    const s5 = toggleModifier(s4, 'pulse');

    expect(s5.modifiers).toEqual(['shake', 'pulse']);

    // Toggle off
    const s6 = toggleModifier(s5, 'shake');

    expect(s6.modifiers).toEqual(['pulse']);
  });

  /** @description Custom clip-path and mask mode updates persist in screen properties. */
  it('persists custom mask mode and clip-path in screen properties', () => {
    const screen = createDefaultScreenProps();

    const result = updateScreenClipPath(screen, 'custom', 'polygon(50% 0%, 0% 100%, 100% 100%)');

    expect(result.maskType).toBe('custom');
    expect(result.customClipPath).toBe('polygon(50% 0%, 0% 100%, 100% 100%)');
  });
});
