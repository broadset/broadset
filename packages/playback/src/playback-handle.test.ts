// ---------------------------------------------------------------------------
// Playback handle — tests for seek, cancel, actions, speed, loop, onComplete
// ---------------------------------------------------------------------------

import type { Timeline } from '@broadset/model';
import { describe, expect, it } from '@jest/globals';

import { createPlaybackHandle } from './playback-handle';

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------

const simpleTl: Timeline = {
  id: 'tl-1',
  name: 'simple',
  entries: [
    {
      name: 'start',
      action: 'none',
      offsetMs: 0,
      properties: { opacity: { value: 0, interpolation: 'linear' } },
    },
    {
      name: 'end',
      action: 'none',
      offsetMs: 800,
      properties: { opacity: { value: 1, interpolation: 'linear' } },
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createPlaybackHandle', () => {
  /**
   * @description Seek must clamp to [0, durationMs]. Negative values
   * become 0, values above duration become durationMs.
   */
  it('clamps seek to [0, durationMs]', () => {
    const container = document.createElement('div');
    const handle = createPlaybackHandle(simpleTl, container);

    handle.seek(-100);
    expect(handle.currentTimeMs).toBe(0);

    handle.seek(99999);
    // Duration = 800 + 300 = 1100
    expect(handle.currentTimeMs).toBe(1100);
  });

  /**
   * @description After cancel, play must be a no-op. The handle
   * must remain inactive.
   */
  it('cancel makes play a no-op', () => {
    const container = document.createElement('div');
    const handle = createPlaybackHandle(simpleTl, container);

    handle.cancel();
    handle.play();
    expect(handle.isActive).toBe(false);
  });

  /**
   * @description Seek must evaluate all keyframe actions from t=0
   * to the seek point, firing them in chronological order.
   */
  it('seek fires cumulative actions in order', () => {
    const actionTl: Timeline = {
      id: 'tl-action',
      name: 'action',
      entries: [
        {
          name: 'a1',
          action: 'setState',
          offsetMs: 100,
          properties: {},
          payload: 'active',
        },
        {
          name: 'a2',
          action: 'addModifier',
          offsetMs: 300,
          properties: {},
          payload: 'pulse',
        },
      ],
    };

    const container = document.createElement('div');
    const firedActions: Array<{ readonly action: string; readonly payload: string }> = [];

    const handle = createPlaybackHandle(actionTl, container, {
      onAction: (action, payload) => {
        firedActions.push({ action, payload: payload ?? '' });
      },
    });

    handle.seek(400);
    expect(firedActions).toHaveLength(2);
    expect(firedActions[0]?.action).toBe('setState');
    expect(firedActions[1]?.action).toBe('addModifier');
  });

  /**
   * @description Forward seeks must not re-fire actions already triggered
   * in previous seek calls. Only actions between the previous and new
   * seek points should be fired, preventing unbounded growth.
   */
  it('forward seeks do not re-fire previously triggered actions', () => {
    const actionTl: Timeline = {
      id: 'tl-action-inc',
      name: 'action-inc',
      entries: [
        {
          name: 'a1',
          action: 'setState',
          offsetMs: 100,
          properties: {},
          payload: 'active',
        },
        {
          name: 'a2',
          action: 'addModifier',
          offsetMs: 300,
          properties: {},
          payload: 'pulse',
        },
      ],
    };

    const container = document.createElement('div');
    const firedActions: Array<{ readonly action: string; readonly payload: string }> = [];

    const handle = createPlaybackHandle(actionTl, container, {
      onAction: (action, payload) => {
        firedActions.push({ action, payload: payload ?? '' });
      },
    });

    // First seek fires the first action
    handle.seek(200);
    expect(firedActions).toHaveLength(1);
    expect(firedActions[0]?.action).toBe('setState');

    // Second seek fires only the second action (not the first again)
    handle.seek(400);
    expect(firedActions).toHaveLength(2);
    expect(firedActions[1]?.action).toBe('addModifier');
  });

  /**
   * @description Backward seeks must reset action tracking so that a
   * subsequent forward seek replays actions from the beginning.
   */
  it('backward seek resets action tracking', () => {
    const actionTl: Timeline = {
      id: 'tl-action-bw',
      name: 'action-bw',
      entries: [
        {
          name: 'a1',
          action: 'setState',
          offsetMs: 100,
          properties: {},
          payload: 'active',
        },
      ],
    };

    const container = document.createElement('div');
    const firedActions: string[] = [];

    const handle = createPlaybackHandle(actionTl, container, {
      onAction: (action) => {
        firedActions.push(action);
      },
    });

    handle.seek(200);
    expect(firedActions).toHaveLength(1);

    // Seek backward past the action
    handle.seek(50);
    // No new action fired on backward seek
    expect(firedActions).toHaveLength(1);

    // Forward seek replays the action
    handle.seek(200);
    expect(firedActions).toHaveLength(2);
  });

  /**
   * @description Seek to end must apply final opacity styles to
   * the element's animation target. Verifies that the style writer
   * is actually invoked and CSS values appear on the DOM element.
   */
  it('seek applies styles to DOM', () => {
    const container = document.createElement('div');
    const content = document.createElement('div');
    const opacityTarget = document.createElement('div');

    content.setAttribute('data-element-content', '');
    opacityTarget.setAttribute('data-opacity-target', '');
    container.appendChild(content);
    container.appendChild(opacityTarget);

    const handle = createPlaybackHandle(simpleTl, container);

    // Seek to duration (opacity timeline: 0 → 1 over 800ms)
    handle.seek(1100);
    expect(handle.currentTimeMs).toBe(1100);
    // After the last keyframe offset, opacity is held at the final value (1)
    expect(opacityTarget.style.opacity).toBe('1');
  });

  /**
   * @description setSpeed must scale playback progression rate. At 2x speed,
   * the delta applied per frame should be doubled, causing the timeline to
   * advance twice as fast over the same wall-clock interval.
   */
  it('setSpeed scales playback progression', () => {
    const container = document.createElement('div');

    // Mock requestAnimationFrame to control timing
    const callbacks: Array<(time: number) => void> = [];
    const origRAF = globalThis.requestAnimationFrame;
    const origCAF = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      callbacks.push(cb);

      return callbacks.length;
    };

    globalThis.cancelAnimationFrame = (): void => {
      // no-op for this test
    };

    try {
      const handle = createPlaybackHandle(simpleTl, container);

      // Play at 1x speed
      handle.play();
      expect(callbacks).toHaveLength(1);

      // First rAF call at t=0 — sets lastFrameTime
      callbacks[0]?.(0);
      expect(callbacks).toHaveLength(2);

      // Second call at t=100ms — advances 100ms at 1x speed
      callbacks[1]?.(100);

      const timeAt1x = handle.currentTimeMs;

      expect(timeAt1x).toBe(100);

      // Now set speed to 2x
      handle.setSpeed(2);

      // Third call at t=200ms — delta = 100ms wall-clock × 2x = 200ms
      callbacks[2]?.(200);

      const timeAt2x = handle.currentTimeMs;

      // Should have advanced 200ms (not 100ms)
      expect(timeAt2x).toBe(300);
    } finally {
      globalThis.requestAnimationFrame = origRAF;
      globalThis.cancelAnimationFrame = origCAF;
    }
  });

  /**
   * @description When loop is enabled, playback MUST wrap to the
   * beginning when it reaches the end, instead of stopping. The handle
   * MUST remain active after wrapping.
   */
  it('wraps at end when loop is enabled', () => {
    const container = document.createElement('div');
    const callbacks: Array<(time: number) => void> = [];
    const origRaf = globalThis.requestAnimationFrame;
    const origCaf = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      callbacks.push(cb);

      return callbacks.length;
    };

    globalThis.cancelAnimationFrame = (): void => {
      /* no-op */
    };

    try {
      // Short timeline: max offset 100ms → duration = 100 + 300 = 400ms
      const shortTl: Timeline = {
        id: 'tl-loop',
        name: 'loop',
        entries: [
          {
            name: 'start',
            action: 'none',
            offsetMs: 0,
            properties: { opacity: { value: 0, interpolation: 'linear' } },
          },
          {
            name: 'end',
            action: 'none',
            offsetMs: 100,
            properties: { opacity: { value: 1, interpolation: 'linear' } },
          },
        ],
      };

      const handle = createPlaybackHandle(shortTl, container, { loop: true });

      handle.play();

      // First tick sets lastFrameTime
      callbacks[0]?.(0);

      // Second tick at 500ms — delta = 500ms, past 400ms duration
      callbacks[1]?.(500);

      // Should have wrapped and still be active
      expect(handle.isActive).toBe(true);
      // Wrapped: 500 % 400 = 100
      expect(handle.currentTimeMs).toBe(100);
    } finally {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCaf;
    }
  });

  /**
   * @description When non-looping playback naturally reaches durationMs,
   * the handle MUST invoke the onComplete callback exactly once before
   * becoming inactive. This enables callers (e.g. the controller) to
   * run post-animation cleanup such as hiding elements.
   */
  it('fires onComplete when playback reaches end', () => {
    const container = document.createElement('div');
    const callbacks: Array<(time: number) => void> = [];
    const origRaf = globalThis.requestAnimationFrame;
    const origCaf = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      callbacks.push(cb);

      return callbacks.length;
    };

    globalThis.cancelAnimationFrame = (): void => {
      /* no-op */
    };

    try {
      let completed = false;

      const handle = createPlaybackHandle(simpleTl, container, {
        onComplete: () => {
          completed = true;
        },
      });

      handle.play();

      // First tick sets lastFrameTime
      callbacks[0]?.(0);

      // Second tick at 2000ms — past 1100ms duration
      callbacks[1]?.(2000);

      expect(completed).toBe(true);
      expect(handle.isActive).toBe(false);
    } finally {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCaf;
    }
  });

  /**
   * @description onComplete MUST NOT fire when the handle is cancelled
   * before reaching durationMs. Cancel is an explicit abort, not a
   * natural ending.
   */
  it('does not fire onComplete on cancel', () => {
    const container = document.createElement('div');
    const callbacks: Array<(time: number) => void> = [];
    const origRaf = globalThis.requestAnimationFrame;
    const origCaf = globalThis.cancelAnimationFrame;

    globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
      callbacks.push(cb);

      return callbacks.length;
    };

    globalThis.cancelAnimationFrame = (): void => {
      /* no-op */
    };

    try {
      let completed = false;

      const handle = createPlaybackHandle(simpleTl, container, {
        onComplete: () => {
          completed = true;
        },
      });

      handle.play();

      // First tick
      callbacks[0]?.(0);

      // Cancel before reaching end
      handle.cancel();

      expect(completed).toBe(false);
    } finally {
      globalThis.requestAnimationFrame = origRaf;
      globalThis.cancelAnimationFrame = origCaf;
    }
  });
});
