import { createEditorStore, type EditorStore } from '@broadset/editor';
import {
  createDefaultAnimationConfig,
  type ElementAnimationConfig,
  type Keyframe,
  type KeyframeValue,
  type Timeline,
} from '@broadset/model';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createKeyframeAdapter } from './keyframe-adapter';

const ELEMENT_ID = 'el-test';

function makeTimeline(keyframes: readonly Keyframe[]): Timeline {
  return {
    id: 'tl-1',
    name: 'Test',
    keyframes,
    loop: 'none',
    loopCount: null,
    durationMs: 1000,
    childTimelines: [],
    audioCues: [],
  };
}

function makeKeyframe(offsetMs: number, properties: Readonly<Record<string, KeyframeValue>> = {}): Keyframe {
  return { name: `kf-${String(offsetMs)}`, action: 'none', offsetMs, properties };
}

function makeConfig(timelines: readonly Timeline[]): ElementAnimationConfig {
  return { ...createDefaultAnimationConfig(), timelines };
}

describe('createKeyframeAdapter', () => {
  let store: EditorStore;
  let onTimelineUpdated: Mock<(timeline: Timeline) => void>;

  beforeEach(() => {
    store = createEditorStore();

    const doc = store.getState().document;

    store.setState({
      document: {
        ...doc,
        animations: [
          {
            elementId: ELEMENT_ID,
            config: makeConfig([
              makeTimeline([
                makeKeyframe(0, {
                  x: { type: 'number', value: 10, easing: 'linear' },
                  opacity: { type: 'number', value: 0.5, easing: 'ease-in' },
                  backgroundColor: { type: 'color', value: '#ff0000', easing: 'linear' },
                  borderRadius: { type: 'tuple', value: [2, 4, 6, 8], easing: 'linear' },
                }),
                makeKeyframe(500, {
                  x: { type: 'number', value: 200, easing: 'linear' },
                }),
              ]),
            ]),
          },
        ],
      },
    });

    onTimelineUpdated = vi.fn<(timeline: Timeline) => void>();
  });

  /** @description isIncluded must return true for properties that exist in the selected keyframe. */
  it('reports included properties correctly', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    expect(adapter.isIncluded('x')).toBe(true);
    expect(adapter.isIncluded('opacity')).toBe(true);
    expect(adapter.isIncluded('y')).toBe(false);
  });

  /** @description getValue must return the keyframe property value for numeric and color types. */
  it('returns numeric and color values from keyframe properties', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    expect(adapter.getValue('x')).toBe(10);
    expect(adapter.getValue('opacity')).toBe(0.5);
    expect(adapter.getValue('backgroundColor')).toBe('#ff0000');
  });

  /** @description getValue must return the full tuple value for tuple-typed keyframe properties. */
  it('returns tuple values from keyframe properties', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    expect(adapter.getValue('borderRadius')).toEqual([2, 4, 6, 8]);
  });

  /** @description getValue must return 0 for properties not in the keyframe. */
  it('returns default 0 for missing properties', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    expect(adapter.getValue('nonExistent')).toBe(0);
  });

  /** @description toggleProperty(key, true, defaultValue) must add a new property to the keyframe. */
  it('adds a property when toggled on', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.toggleProperty('y', true, 42);

    expect(adapter.isIncluded('y')).toBe(true);
    expect(adapter.getValue('y')).toBe(42);
    expect(onTimelineUpdated).toHaveBeenCalledTimes(1);
  });

  /** @description toggleProperty(key, false, ...) must remove an existing property from the keyframe. */
  it('removes a property when toggled off', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.toggleProperty('x', false, 0);

    expect(adapter.isIncluded('x')).toBe(false);
    expect(onTimelineUpdated).toHaveBeenCalledTimes(1);
  });

  /** @description updateValue must update an existing numeric property value. */
  it('updates an existing numeric property', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.updateValue('x', 999);

    expect(adapter.getValue('x')).toBe(999);
    expect(onTimelineUpdated).toHaveBeenCalledTimes(1);
  });

  /** @description updateValue must update an existing color property value. */
  it('updates an existing color property', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.updateValue('backgroundColor', '#00ff00');

    expect(adapter.getValue('backgroundColor')).toBe('#00ff00');
  });

  /** @description updateValue must preserve all tuple components when updating tuple properties. */
  it('updates an existing tuple property', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.updateValue('borderRadius', [10, 12, 14, 16]);

    expect(adapter.getValue('borderRadius')).toEqual([10, 12, 14, 16]);
  });

  /** @description updateValue must not add new properties if the key is not already included. */
  it('does not add a property via updateValue if not included', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.updateValue('nonExistent', 100);

    expect(adapter.isIncluded('nonExistent')).toBe(false);
    expect(onTimelineUpdated).not.toHaveBeenCalled();
  });

  /** @description The adapter for keyframe index 1 must read from the second keyframe independently. */
  it('reads from the correct keyframe index', () => {
    const adapter0 = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);
    const adapter1 = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 1, onTimelineUpdated);

    expect(adapter0.getValue('x')).toBe(10);
    expect(adapter1.getValue('x')).toBe(200);
  });

  /** @description Adding a string default via toggleProperty must create a color-typed keyframe value. */
  it('creates color-typed value for string defaults', () => {
    const adapter = createKeyframeAdapter(store, ELEMENT_ID, 'tl-1', 0, onTimelineUpdated);

    adapter.toggleProperty('borderColor', true, '#0000ff');

    expect(adapter.getValue('borderColor')).toBe('#0000ff');
  });

  /** @description Operations on a non-existent element must not throw. */
  it('handles non-existent element gracefully', () => {
    const adapter = createKeyframeAdapter(store, 'missing-el', 'tl-1', 0, onTimelineUpdated);

    expect(adapter.isIncluded('x')).toBe(false);
    expect(adapter.getValue('x')).toBe(0);
    expect(() => {
      adapter.toggleProperty('x', true, 0);
    }).not.toThrow();
    expect(() => {
      adapter.updateValue('x', 0);
    }).not.toThrow();
  });
});
