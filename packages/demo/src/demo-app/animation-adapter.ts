import type { EditorStore } from '@broadset/editor';
import { createDefaultAnimationConfig, type ElementAnimationConfig } from '@broadset/model';

/**
 * Apply an animation config update to the editor store for a specific element.
 *
 * If the element has no animation entry yet, one is created with defaults.
 * Returns the resulting config, or null if `elementId` is null (no selection).
 *
 * This is the canonical adapter between per-element animation-editing helpers
 * (which return updated configs) and the Zustand store shape (which stores
 * an `animations` array on the document).
 */
export function applyAnimationConfigUpdate(
  editorStore: EditorStore,
  elementId: string | null,
  updater: (config: ElementAnimationConfig) => ElementAnimationConfig,
): ElementAnimationConfig | null {
  if (elementId === null) {
    return null;
  }

  let nextConfig: ElementAnimationConfig = createDefaultAnimationConfig();

  editorStore.setState((state) => {
    const existingAnimation = state.document.animations.find((animation) => animation.elementId === elementId);
    const baseConfig = existingAnimation?.config ?? createDefaultAnimationConfig();

    nextConfig = updater(baseConfig);

    const nextAnimations =
      existingAnimation === undefined ?
        [...state.document.animations, { elementId, config: nextConfig }]
      : state.document.animations.map((animation) =>
          animation.elementId === elementId ? { ...animation, config: nextConfig } : animation,
        );

    return {
      document: {
        ...state.document,
        animations: nextAnimations,
      },
    };
  });

  return nextConfig;
}

/**
 * Retrieve the animation config for a given element from a document's animations array.
 * Returns null if the element has no animation entry.
 */
export function getElementAnimationConfig(
  editorStore: EditorStore,
  elementId: string | null,
): ElementAnimationConfig | null {
  if (elementId === null) {
    return null;
  }

  return (
    editorStore.getState().document.animations.find((animation) => animation.elementId === elementId)?.config ?? null
  );
}
