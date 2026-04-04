import type { BroadsetScreenProps } from '@broadset/model';

// ---------------------------------------------------------------------------
// Subset of PlaybackController methods needed by the coordinator
// ---------------------------------------------------------------------------

export interface PlaybackControllerRef {
  readonly seekTimeline: (elementId: string, timelineName: string, timeMs: number) => void;
  readonly stopTimeline: (elementId: string, timelineName: string) => void;
}

// ---------------------------------------------------------------------------
// Applicator interface — bridges coordinator to store/DOM
// ---------------------------------------------------------------------------

export interface ScreenStateApplicator {
  /** Applies a screen state snapshot back to an element. */
  apply(elementId: string, screen: BroadsetScreenProps): void;
  /** Returns the current elements with their screen state. */
  getElements(): ReadonlyArray<{ readonly id: string; readonly screen: BroadsetScreenProps }>;
}

// ---------------------------------------------------------------------------
// Editing target
// ---------------------------------------------------------------------------

interface EditingTarget {
  readonly elementId: string;
  readonly timelineName: string;
}

// ---------------------------------------------------------------------------
// TimelinePlaybackCoordinator
// ---------------------------------------------------------------------------

/**
 * Coordinates editor-side timeline playback by managing controller references,
 * screen state snapshots, and transition suppression timing.
 */
export class TimelinePlaybackCoordinator {
  private controller: PlaybackControllerRef | null = null;
  private target: EditingTarget | null = null;
  private snapshot: ReadonlyMap<string, BroadsetScreenProps> | null = null;
  private suppressListener: ((suppressed: boolean) => void) | null = null;

  /**
   * Stores the playback controller reference when reported as ready.
   */
  onReady(controller: PlaybackControllerRef): void {
    this.controller = controller;
  }

  /**
   * Registers a listener for transition suppression changes.
   */
  onSuppressChange(listener: (suppressed: boolean) => void): void {
    this.suppressListener = listener;
  }

  /**
   * Opens timeline editing: sets the target and captures a screen snapshot.
   */
  openEditing(elementId: string, timelineName: string, applicator: ScreenStateApplicator): void {
    this.target = { elementId, timelineName };
    this.snapshot = captureSnapshot(applicator.getElements());
  }

  /**
   * Restores the captured snapshot and delegates play to the controller.
   * No-ops if no controller is registered.
   */
  play(applicator: ScreenStateApplicator): void {
    if (this.controller === null || this.target === null) {
      return;
    }

    this.suppressAndRestore(applicator);
    this.controller.seekTimeline(this.target.elementId, this.target.timelineName, 0);
  }

  /**
   * Restores the captured snapshot and delegates seek to the controller.
   * No-ops if no controller is registered.
   */
  seek(timeMs: number, applicator: ScreenStateApplicator): void {
    if (this.controller === null || this.target === null) {
      return;
    }

    this.suppressAndRestore(applicator);
    this.controller.seekTimeline(this.target.elementId, this.target.timelineName, timeMs);
  }

  /**
   * Delegates stop to the controller for the current editing target.
   */
  stop(): void {
    if (this.controller === null || this.target === null) {
      return;
    }

    this.controller.stopTimeline(this.target.elementId, this.target.timelineName);
  }

  /**
   * Closes editing: stops the timeline and restores the captured snapshot.
   */
  closeEditing(applicator: ScreenStateApplicator): void {
    if (this.target !== null && this.controller !== null) {
      this.controller.stopTimeline(this.target.elementId, this.target.timelineName);
    }

    this.restoreSnapshot(applicator);
    this.target = null;
    this.snapshot = null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private suppressAndRestore(applicator: ScreenStateApplicator): void {
    this.suppressListener?.(true);
    this.restoreSnapshot(applicator);
    this.suppressListener?.(false);
  }

  private restoreSnapshot(applicator: ScreenStateApplicator): void {
    if (this.snapshot === null) {
      return;
    }

    for (const [elementId, screen] of this.snapshot) {
      applicator.apply(elementId, screen);
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot capture utility
// ---------------------------------------------------------------------------

function captureSnapshot(
  elements: ReadonlyArray<{ readonly id: string; readonly screen: BroadsetScreenProps }>,
): ReadonlyMap<string, BroadsetScreenProps> {
  const snapshot = new Map<string, BroadsetScreenProps>();

  for (const el of elements) {
    snapshot.set(el.id, el.screen);
  }

  return snapshot;
}
