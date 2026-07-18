import { type ProjectEditorState, resolvePreviewSequenceId, selectActiveDocumentV1 } from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';

export function parseTimelineId(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

/**
 * Seed a newly appended keyframe from the target track's own last keyframe value so the seed is
 * always type-correct for that track's `valueType` (color/tuple/length/etc. tracks, not just
 * opacity). Falls back to the element's opacity only for the degenerate case of a track with no
 * keyframes yet, which should not occur in practice since every authored track carries at least one.
 */
export function resolveAddedKeyframeSeedValue(options: {
  readonly track: projectFormatV1.Track | undefined;
  readonly document: projectFormatV1.BroadsetDocumentV1;
}): projectFormatV1.TypedValue {
  const lastTrackKeyframeValue = options.track?.keyframes[options.track.keyframes.length - 1]?.value;

  if (lastTrackKeyframeValue !== undefined) return lastTrackKeyframeValue;

  const seededElement = options.document.elements.find(({ id }) => id === options.track?.target.entity.entityId);

  return { type: 'number', value: seededElement?.appearance.opacity ?? 1 };
}

/** Scrubbing the ruler takes precedence over the underlying playback-playing flag for the preview label. */
export function resolveTimelinePreviewState(options: {
  readonly scrubbing: boolean;
  readonly playing: boolean;
}): 'playing' | 'paused' | 'scrubbing' {
  if (options.scrubbing) return 'scrubbing';

  return options.playing ? 'playing' : 'paused';
}

/** The sequence currently being previewed: an explicit playback pin, else the active page's default. */
export function resolveActiveSequenceId(state: ProjectEditorState): projectFormatV1.Id | null {
  if (state.playbackSequenceId !== null) return state.playbackSequenceId;

  const document = selectActiveDocumentV1(state);

  if (document === undefined) return null;

  return resolvePreviewSequenceId({
    project: state.project,
    documentId: state.activeDocumentId,
    pageId: state.activePageId,
  });
}
