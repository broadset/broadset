/** Snapshot of element animation state captured before playback begins. */
export interface AnimationSnapshot {
  readonly elementId: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

/** Minimal playback controller interface consumed by the coordinator. */
export interface PlaybackControllerLike {
  seekTimeline(options: { readonly elementId: string; readonly timelineId: string; readonly timeMs: number }): unknown;
  stopTimeline(options: { readonly elementId: string; readonly timelineId: string }): void;
}

type RestoreCallback = (snapshot: AnimationSnapshot) => void;
type SuppressionCallback = (enabled: boolean) => void;

export interface TimelinePlaybackCoordinator {
  registerController(controller: PlaybackControllerLike): void;
  setSnapshot(snapshot: AnimationSnapshot): void;
  setEditingTarget(elementId: string, timelineId: string): void;
  onRestore(callback: RestoreCallback): void;
  onSuppression(callback: SuppressionCallback): void;
  play(elementId: string, timelineId: string): void;
  seek(elementId: string, timelineId: string, timeMs: number): void;
  stop(elementId: string, timelineId: string): void;
  closeEditing(): void;
}

export function createTimelinePlaybackCoordinator(): TimelinePlaybackCoordinator {
  let controller: PlaybackControllerLike | null = null;
  let snapshot: AnimationSnapshot | null = null;
  let editingElementId: string | null = null;
  let editingTimelineId: string | null = null;
  let restoreCallback: RestoreCallback | null = null;
  let suppressionCallback: SuppressionCallback | null = null;

  function restoreIfAvailable(): void {
    if (snapshot !== null && restoreCallback !== null) {
      restoreCallback(snapshot);
    }
  }

  function withSuppression(fn: () => void): void {
    suppressionCallback?.(true);
    fn();
    suppressionCallback?.(false);
  }

  return {
    registerController(ctrl: PlaybackControllerLike): void {
      controller = ctrl;
    },

    setSnapshot(snap: AnimationSnapshot): void {
      snapshot = snap;
    },

    setEditingTarget(elementId: string, timelineId: string): void {
      editingElementId = elementId;
      editingTimelineId = timelineId;
    },

    onRestore(callback: RestoreCallback): void {
      restoreCallback = callback;
    },

    onSuppression(callback: SuppressionCallback): void {
      suppressionCallback = callback;
    },

    play(elementId: string, timelineId: string): void {
      if (controller === null) {
        return;
      }

      withSuppression(() => {
        restoreIfAvailable();
      });

      controller.seekTimeline({ elementId, timelineId, timeMs: 0 });
    },

    seek(elementId: string, timelineId: string, timeMs: number): void {
      if (controller === null) {
        return;
      }

      withSuppression(() => {
        restoreIfAvailable();
      });

      controller.seekTimeline({ elementId, timelineId, timeMs });
    },

    stop(elementId: string, timelineId: string): void {
      if (controller === null) {
        return;
      }

      controller.stopTimeline({ elementId, timelineId });
    },

    closeEditing(): void {
      if (editingElementId === null || editingTimelineId === null) {
        return;
      }

      if (controller !== null) {
        controller.stopTimeline({ elementId: editingElementId, timelineId: editingTimelineId });
      }

      restoreIfAvailable();

      editingElementId = null;
      editingTimelineId = null;
      snapshot = null;
    },
  };
}
