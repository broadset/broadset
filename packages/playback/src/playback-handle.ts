// ---------------------------------------------------------------------------
// Playback handle — single-timeline playback lifecycle
// ---------------------------------------------------------------------------

import type { Timeline } from '@broadset/model';

import { applyStylesToElement } from './style-writer';
import { computeTimelineDuration, computeTimelineFrame } from './timeline';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybackHandleOptions {
  readonly onAction?: (action: string, payload: string | undefined) => void;
}

export interface PlaybackHandle {
  /** Seek to a specific time in ms. Clamps to [0, durationMs]. */
  readonly seek: (timeMs: number) => void;
  /** Start rAF-driven playback. No-op after cancel. */
  readonly play: () => void;
  /** Pause playback. */
  readonly pause: () => void;
  /** Cancel playback. After cancel, play is a permanent no-op. */
  readonly cancel: () => void;
  /** Set playback speed multiplier. */
  readonly setSpeed: (multiplier: number) => void;
  /** Current seek position in milliseconds. */
  readonly currentTimeMs: number;
  /** Total duration in milliseconds. */
  readonly durationMs: number;
  /** Whether playback is actively running. */
  readonly isActive: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create a PlaybackHandle for a single timeline and container element.
 *
 * The handle provides imperative seek/play/pause/cancel control.
 * Seeking evaluates the timeline at the given time and applies
 * computed styles to the DOM. Actions are replayed from t=0 to the
 * seek point on every seek call.
 */
export function createPlaybackHandle(
  timeline: Timeline,
  container: HTMLElement,
  options?: PlaybackHandleOptions,
): PlaybackHandle {
  const durationMs = computeTimelineDuration(timeline);
  /* mutable — internal state for the handle */
  let currentTime = 0;
  let cancelled = false;
  let active = false;
  let speed = 1;
  let rafId: number | null = null;
  let lastFrameTime: number | null = null;

  function seek(timeMs: number): void {
    const clamped = Math.max(0, Math.min(durationMs, timeMs));

    currentTime = clamped;

    // Compute frame at seek point
    const frame = computeTimelineFrame(timeline, clamped);

    // Apply styles
    applyStylesToElement(container, frame.properties);

    // Replay actions from t=0 to clamped
    if (options?.onAction) {
      const sorted = [...timeline.entries].filter((kf) => kf.action !== 'none').sort((a, b) => a.offsetMs - b.offsetMs);

      for (const kf of sorted) {
        if (kf.offsetMs > clamped) break;

        options.onAction(kf.action, kf.payload);
      }
    }
  }

  function play(): void {
    if (cancelled) return;

    // Cancel any existing rAF loop before starting a new one
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    active = true;
    lastFrameTime = null;

    function tick(now: number): void {
      if (!active || cancelled) return;

      if (lastFrameTime !== null) {
        const delta = (now - lastFrameTime) * speed;
        const nextTime = currentTime + delta;

        seek(nextTime);

        if (currentTime >= durationMs) {
          active = false;

          return;
        }
      }

      lastFrameTime = now;
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }

  function pause(): void {
    active = false;
    lastFrameTime = null;

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function cancel(): void {
    cancelled = true;
    active = false;
    lastFrameTime = null;

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function setSpeed(multiplier: number): void {
    speed = multiplier;
  }

  return {
    seek,
    play,
    pause,
    cancel,
    setSpeed,
    get currentTimeMs(): number {
      return currentTime;
    },
    get durationMs(): number {
      return durationMs;
    },
    get isActive(): boolean {
      return active;
    },
  };
}
