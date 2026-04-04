// ---------------------------------------------------------------------------
// Playback controller types — shared interfaces for the controller module
// ---------------------------------------------------------------------------

import type { AnimationRegistryEntry, ElementAnimationConfig, Timeline } from '@broadset/model';

import type { ClassState } from './class-state';
import type { PlaybackHandle } from './playback-handle';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlaybackControllerOptions {
  readonly suppressTransitions?: boolean | undefined;
  readonly settleDelayMs?: number | undefined;
}

export interface PlaybackController {
  readonly attach: (element: HTMLElement, elementId: string) => void;
  readonly detach: (element: HTMLElement) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly seek: (timeMs: number) => void;
  readonly setSpeed: (multiplier: number) => void;
  readonly setRegistry: (registry: readonly AnimationRegistryEntry[]) => void;
  readonly seekTimeline: (elementId: string, timelineName: string, timeMs: number) => void;
  readonly stopTimeline: (elementId: string, timelineName: string) => void;
  readonly destroy: () => void;
}

// ---------------------------------------------------------------------------
// Internal types (shared within the controller module)
// ---------------------------------------------------------------------------

export interface ActiveHandle {
  readonly handle: PlaybackHandle;
  readonly timeline: Timeline;
  /** Pre-computed CSS property names touched by this timeline. */
  readonly properties: readonly string[];
}

/**
 * Per-element mutable runtime state.
 * Fields are mutable because they change during the attach/detach lifecycle,
 * registry updates, settle timer processing, and handle creation/cancellation.
 */
export interface ElementRuntime {
  readonly elementId: string;
  readonly element: HTMLElement;
  readonly observer: MutationObserver;
  /** Mutable — updated when setRegistry provides a new config. */
  config: ElementAnimationConfig | null;
  /** Mutable — updated after each settled class mutation. */
  previousState: ClassState;
  /** Mutable — cleared/set during settle timer lifecycle. */
  settleTimer: ReturnType<typeof setTimeout> | null;
  /** Mutable — set/cleared when timeline handles are created/cancelled. */
  activeHandle: ActiveHandle | null;
  /** Mutable map — entries modified when modifier timelines are created/cancelled. */
  readonly modifierHandles: Map<string, ActiveHandle>;
}
