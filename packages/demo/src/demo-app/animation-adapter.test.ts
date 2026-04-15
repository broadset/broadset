import { createEditorStore, type EditorStore, upsertTimeline } from '@broadset/editor';
import {
  createDefaultAnimationConfig,
  type ElementAnimationConfig,
  type Keyframe,
  type Timeline,
} from '@broadset/model';
import { beforeEach, describe, expect, it } from '@jest/globals';

import { applyAnimationConfigUpdate, getElementAnimationConfig } from './animation-adapter';

const ELEMENT_ID = 'el-adapter';
const OTHER_ELEMENT_ID = 'el-other';

function makeKeyframe(offsetMs: number, name: string): Keyframe {
  return { name, action: 'none', offsetMs, properties: {} };
}

function makeTimeline(name: string, overrides: Partial<Timeline> = {}): Timeline {
  return {
    id: `tl-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    keyframes: [makeKeyframe(0, 'start'), makeKeyframe(1000, 'end')],
    loop: 'none',
    loopCount: null,
    durationMs: 1000,
    childTimelines: [],
    audioCues: [],
    ...overrides,
  };
}

function seedAnimationConfig(store: EditorStore, elementId: string, config: ElementAnimationConfig): void {
  const doc = store.getState().document;

  store.setState({
    document: {
      ...doc,
      animations: [...doc.animations, { elementId, config }],
    },
  });
}

describe('applyAnimationConfigUpdate', () => {
  let store: EditorStore;

  beforeEach(() => {
    store = createEditorStore();
  });

  /** @description Applying an update on a null elementId must return null without modifying the store, so unguarded calls from a deselected state are safe. */
  it('returns null when elementId is null', () => {
    const result = applyAnimationConfigUpdate(store, null, (config) => config);

    expect(result).toBeNull();
    expect(store.getState().document.animations).toHaveLength(0);
  });

  /** @description When no animation entry exists for an element, the adapter must create one with defaults plus the updater result. */
  it('creates animation entry when element has no prior config', () => {
    const timeline = makeTimeline('New');
    const result = applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => upsertTimeline(config, timeline));

    expect(result).not.toBeNull();
    expect(result?.timelines).toHaveLength(1);
    expect(result?.timelines[0]?.name).toBe('New');

    const storeAnimations = store.getState().document.animations;

    expect(storeAnimations).toHaveLength(1);
    expect(storeAnimations[0]?.elementId).toBe(ELEMENT_ID);
    expect(storeAnimations[0]?.config.timelines).toHaveLength(1);
  });

  /** @description When an animation entry already exists, the adapter must update it in place without creating duplicates. */
  it('updates existing animation entry in place', () => {
    const initialConfig: ElementAnimationConfig = {
      ...createDefaultAnimationConfig(),
      timelines: [makeTimeline('Existing')],
    };

    seedAnimationConfig(store, ELEMENT_ID, initialConfig);

    const newTimeline = makeTimeline('Added');
    const result = applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => upsertTimeline(config, newTimeline));

    expect(result?.timelines).toHaveLength(2);

    const storeAnimations = store.getState().document.animations;

    expect(storeAnimations).toHaveLength(1);
    expect(storeAnimations[0]?.config.timelines).toHaveLength(2);
  });

  /** @description The adapter must not affect animation configs belonging to other elements. */
  it('does not touch other element animations', () => {
    const otherConfig: ElementAnimationConfig = {
      ...createDefaultAnimationConfig(),
      timelines: [makeTimeline('Other')],
    };

    seedAnimationConfig(store, OTHER_ELEMENT_ID, otherConfig);

    const timeline = makeTimeline('Mine');

    applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => upsertTimeline(config, timeline));

    const storeAnimations = store.getState().document.animations;

    expect(storeAnimations).toHaveLength(2);

    const otherEntry = storeAnimations.find((a) => a.elementId === OTHER_ELEMENT_ID);

    expect(otherEntry?.config.timelines).toHaveLength(1);
    expect(otherEntry?.config.timelines[0]?.name).toBe('Other');
  });

  /** @description The updater must receive the current config as input so it can build on existing state rather than overwriting it. */
  it('passes current config to the updater', () => {
    const initialConfig: ElementAnimationConfig = {
      ...createDefaultAnimationConfig(),
      timelines: [makeTimeline('First')],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-first' }],
    };

    seedAnimationConfig(store, ELEMENT_ID, initialConfig);

    applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => {
      expect(config.timelines).toHaveLength(1);
      expect(config.stateTimelineBindings).toHaveLength(1);

      return config;
    });
  });

  /** @description When the updater returns a config that removes all timelines, the store must reflect an empty timelines array. */
  it('handles updater that clears all timelines', () => {
    const config: ElementAnimationConfig = {
      ...createDefaultAnimationConfig(),
      timelines: [makeTimeline('Gone')],
    };

    seedAnimationConfig(store, ELEMENT_ID, config);

    const result = applyAnimationConfigUpdate(store, ELEMENT_ID, (cfg) => ({
      ...cfg,
      timelines: [],
    }));

    expect(result?.timelines).toHaveLength(0);
    expect(store.getState().document.animations[0]?.config.timelines).toHaveLength(0);
  });

  /** @description Multiple sequential updates to the same element must compose correctly, each building on the previous result. */
  it('composes multiple sequential updates', () => {
    applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => upsertTimeline(config, makeTimeline('First')));
    applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => upsertTimeline(config, makeTimeline('Second')));
    applyAnimationConfigUpdate(store, ELEMENT_ID, (config) => upsertTimeline(config, makeTimeline('Third')));

    const storeConfig = store.getState().document.animations.find((a) => a.elementId === ELEMENT_ID)?.config;

    expect(storeConfig?.timelines).toHaveLength(3);
    expect(storeConfig?.timelines.map((tl) => tl.name)).toEqual(['First', 'Second', 'Third']);
  });

  /** @description The adapter must preserve all non-timeline config fields (bindings, textAnimator, etc.) when only updating timelines. */
  it('preserves non-modified config fields', () => {
    const config: ElementAnimationConfig = {
      ...createDefaultAnimationConfig(),
      timelines: [makeTimeline('Keep')],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-keep' }],
      modifierTimelineBindings: [{ modifierName: 'hover', inTimelineId: 'tl-keep' }],
    };

    seedAnimationConfig(store, ELEMENT_ID, config);

    applyAnimationConfigUpdate(store, ELEMENT_ID, (cfg) => upsertTimeline(cfg, makeTimeline('Extra')));

    const result = store.getState().document.animations.find((a) => a.elementId === ELEMENT_ID)?.config;

    expect(result?.stateTimelineBindings).toHaveLength(1);
    expect(result?.modifierTimelineBindings).toHaveLength(1);
    expect(result?.timelines).toHaveLength(2);
  });
});

describe('getElementAnimationConfig', () => {
  let store: EditorStore;

  beforeEach(() => {
    store = createEditorStore();
  });

  /** @description Querying for a null elementId must return null without exception. */
  it('returns null for null elementId', () => {
    expect(getElementAnimationConfig(store, null)).toBeNull();
  });

  /** @description Querying for an element with no animation entry must return null. */
  it('returns null when no animation entry exists', () => {
    expect(getElementAnimationConfig(store, ELEMENT_ID)).toBeNull();
  });

  /** @description Querying for an element with an animation entry must return its config. */
  it('returns the config for an element with an animation entry', () => {
    const config: ElementAnimationConfig = {
      ...createDefaultAnimationConfig(),
      timelines: [makeTimeline('Found')],
    };

    seedAnimationConfig(store, ELEMENT_ID, config);

    const result = getElementAnimationConfig(store, ELEMENT_ID);

    expect(result?.timelines).toHaveLength(1);
    expect(result?.timelines[0]?.name).toBe('Found');
  });
});
