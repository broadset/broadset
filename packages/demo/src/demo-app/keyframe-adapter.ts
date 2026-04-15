import type { EditorStore } from '@broadset/editor';
import type { Keyframe, KeyframeValue, Timeline } from '@broadset/model';
import type { PropertyFieldAdapter } from '@broadset/ui';

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
    editorStore.setState((state) => {
      const animationIndex = state.document.animations.findIndex((entry) => entry.elementId === elementId);

      if (animationIndex === -1) {
        return {};
      }

      const animation = state.document.animations[animationIndex];

      if (animation === undefined) {
        return {};
      }

      const timelineIndex = animation.config.timelines.findIndex((entry) => entry.id === timelineId);

      if (timelineIndex === -1) {
        return {};
      }

      const timeline = animation.config.timelines[timelineIndex];

      if (timeline === undefined) {
        return {};
      }

      const keyframe = timeline.keyframes[keyframeIndex];

      if (keyframe === undefined) {
        return {};
      }

      const nextProperties = updater(keyframe.properties);
      const nextKeyframe: Keyframe = { ...keyframe, properties: nextProperties };
      const nextKeyframes = timeline.keyframes.map((entry, index) => (index === keyframeIndex ? nextKeyframe : entry));
      const nextTimeline: Timeline = { ...timeline, keyframes: nextKeyframes };
      const nextTimelines = animation.config.timelines.map((entry, index) =>
        index === timelineIndex ? nextTimeline : entry,
      );
      const nextConfig = { ...animation.config, timelines: nextTimelines };
      const nextAnimation = { ...animation, config: nextConfig };
      const nextAnimations = state.document.animations.map((entry, index) =>
        index === animationIndex ? nextAnimation : entry,
      );

      onTimelineUpdated(nextTimeline);

      return { document: { ...state.document, animations: nextAnimations } };
    });
  }

  return {
    isIncluded(key: string): boolean {
      return getKeyframe()?.properties[key] !== undefined;
    },

    getValue(key: string): number | string {
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

      // Tuple — return first value as a reasonable numeric fallback
      return property.value[0] ?? 0;
    },

    toggleProperty(key: string, include: boolean, defaultValue: number | string): void {
      updateKeyframeProperties((properties) => {
        if (!include) {
          const { [key]: _, ...rest } = properties;

          return rest;
        }

        const value: KeyframeValue =
          typeof defaultValue === 'string' ?
            { type: 'color', value: defaultValue, easing: 'linear' }
          : { type: 'number', value: defaultValue, easing: 'linear' };

        return { ...properties, [key]: value };
      });
    },

    updateValue(key: string, value: number | string): void {
      const keyframe = getKeyframe();

      if (keyframe === undefined || keyframe.properties[key] === undefined) {
        return;
      }

      updateKeyframeProperties((properties) => {
        const existing = properties[key];

        if (existing === undefined) {
          return properties;
        }

        if (typeof value === 'string') {
          return {
            ...properties,
            [key]: { ...existing, type: existing.type === 'string' ? 'string' : 'color', value } as KeyframeValue,
          };
        }

        return {
          ...properties,
          [key]: { ...existing, type: 'number', value } as KeyframeValue,
        };
      });
    },
  };
}
