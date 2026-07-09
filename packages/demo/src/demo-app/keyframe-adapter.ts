import type { EditorStore } from '@broadset/editor';
import type { Keyframe, KeyframeValue, Timeline } from '@broadset/model';
import type { PropertyFieldAdapter, PropertyValue } from '@broadset/ui';

function isTupleValue(value: PropertyValue): value is readonly [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) {
    return false;
  }

  const entries: readonly unknown[] = value;

  return entries.every((entry: unknown) => typeof entry === 'number');
}

const COLOR_PROPERTY_KEYS = new Set(['backgroundColor', 'borderColor', 'fontColor', 'strokeColor', 'fillColor']);

function toDefaultKeyframeValue(key: string, defaultValue: PropertyValue): KeyframeValue {
  if (isTupleValue(defaultValue)) {
    return {
      type: 'tuple',
      value: [defaultValue[0], defaultValue[1], defaultValue[2], defaultValue[3]],
      easing: 'linear',
    };
  }

  if (typeof defaultValue === 'string') {
    return {
      type: COLOR_PROPERTY_KEYS.has(key) ? 'color' : 'string',
      value: defaultValue,
      easing: 'linear',
    };
  }

  if (typeof defaultValue === 'number') {
    return { type: 'number', value: defaultValue, easing: 'linear' };
  }

  return { type: 'number', value: defaultValue ? 1 : 0, easing: 'linear' };
}

/**
 * Create a PropertyFieldAdapter that reads and writes keyframe properties
 * for the currently selected keyframe within a timeline.
 *
 * The adapter bridges the properties panel (which uses string/number property keys)
 * to the animation keyframe data model (which stores typed KeyframeValue objects).
 */
export function createKeyframeAdapter(
  editorStore: EditorStore,
  elementId: string,
  timelineId: string,
  keyframeIndex: number,
  onTimelineUpdated: (timeline: Timeline) => void,
): PropertyFieldAdapter {
  function getKeyframe(): Keyframe | undefined {
    const animation = editorStore.getState().document.animations.find((entry) => entry.elementId === elementId);
    const timeline = animation?.config.timelines.find((entry) => entry.id === timelineId);

    return timeline?.keyframes[keyframeIndex];
  }

  function updateKeyframeProperties(
    updater: (properties: Readonly<Record<string, KeyframeValue>>) => Readonly<Record<string, KeyframeValue>>,
  ): void {
    const currentConfig = editorStore.getState().getElementAnimationConfig(elementId);
    const currentTimeline = currentConfig?.timelines.find((entry) => entry.id === timelineId);

    if (currentTimeline?.keyframes[keyframeIndex] === undefined) {
      return;
    }

    const nextConfig = editorStore.getState().updateElementAnimationConfig(elementId, (config) => {
      const nextTimelines = config.timelines.map((timeline) => {
        if (timeline.id !== timelineId) {
          return timeline;
        }

        const keyframe = timeline.keyframes[keyframeIndex];

        if (keyframe === undefined) {
          return timeline;
        }

        const nextProperties = updater(keyframe.properties);
        const nextKeyframe: Keyframe = { ...keyframe, properties: nextProperties };
        const nextKeyframes = timeline.keyframes.map((entry, index) =>
          index === keyframeIndex ? nextKeyframe : entry,
        );

        return { ...timeline, keyframes: nextKeyframes };
      });

      return { ...config, timelines: nextTimelines };
    });
    const nextTimeline = nextConfig.timelines.find((timeline) => timeline.id === timelineId);

    if (nextTimeline !== undefined) {
      onTimelineUpdated(nextTimeline);
    }
  }

  return {
    isIncluded(key: string): boolean {
      return getKeyframe()?.properties[key] !== undefined;
    },

    getValue(key: string): PropertyValue {
      const property = getKeyframe()?.properties[key];

      if (property === undefined) {
        return 0;
      }

      if (property.type === 'color' || property.type === 'string') {
        return property.value;
      }

      if (property.type === 'number') {
        return property.value;
      }

      return [property.value[0] ?? 0, property.value[1] ?? 0, property.value[2] ?? 0, property.value[3] ?? 0];
    },

    toggleProperty(key: string, include: boolean, defaultValue: PropertyValue): void {
      updateKeyframeProperties((properties) => {
        if (!include) {
          const { [key]: _, ...rest } = properties;

          return rest;
        }

        return { ...properties, [key]: toDefaultKeyframeValue(key, defaultValue) };
      });
    },

    updateValue(key: string, value: PropertyValue): void {
      const keyframe = getKeyframe();

      if (keyframe?.properties[key] === undefined) {
        return;
      }

      updateKeyframeProperties((properties) => {
        const existing = properties[key];

        if (existing === undefined) {
          return properties;
        }

        if (isTupleValue(value)) {
          return {
            ...properties,
            [key]: {
              ...existing,
              type: 'tuple',
              value: [value[0], value[1], value[2], value[3]],
            } satisfies KeyframeValue,
          };
        }

        if (typeof value === 'boolean') {
          return {
            ...properties,
            [key]: { ...existing, type: 'number', value: value ? 1 : 0 } satisfies KeyframeValue,
          };
        }

        if (typeof value === 'string') {
          return {
            ...properties,
            [key]: {
              ...existing,
              type: existing.type === 'string' ? 'string' : 'color',
              value,
            } satisfies KeyframeValue,
          };
        }

        return {
          ...properties,
          [key]: { ...existing, type: 'number', value } satisfies KeyframeValue,
        };
      });
    },
  };
}
