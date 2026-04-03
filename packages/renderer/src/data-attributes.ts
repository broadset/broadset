// ---------------------------------------------------------------------------
// Data-attribute contract constants
// ---------------------------------------------------------------------------
// These attributes form cross-package contracts between the renderer, editor,
// and playback packages. Other packages MUST NOT invent new data-* attributes
// without updating this registry.

/** Identifies the element by document ID. Consumer: Editor, Playback. */
export const DATA_ELEMENT_ID = 'data-element-id' as const;

/** Marks the inner content element as the animation style target. Consumer: Playback (style writer). */
export const DATA_ELEMENT_CONTENT = 'data-element-content' as const;

/** Target for opacity animation. Consumer: Playback (style writer). */
export const DATA_OPACITY_TARGET = 'data-opacity-target' as const;

/** Current visibility state. Consumer: Playback (state transitions). */
export const DATA_VISIBILITY = 'data-visibility' as const;
