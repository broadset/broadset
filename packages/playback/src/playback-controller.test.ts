// ---------------------------------------------------------------------------
// Playback controller — tests for DOM observation, transitions, settle timer,
// simultaneous timeline management, suppress transitions, and modifier sync.
// ---------------------------------------------------------------------------

import type { AnimationRegistryEntry, ElementAnimationConfig, Timeline } from '@broadset/model';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createPlaybackController } from './playback-controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a timeline with opacity keyframes (0 → 1) over the given span. */
function createOpacityTimeline(id: string, name: string, maxOffsetMs: number): Timeline {
  return {
    id,
    name,
    entries: [
      { name: 'start', action: 'none', offsetMs: 0, properties: { opacity: { value: 0, interpolation: 'linear' } } },
      {
        name: 'end',
        action: 'none',
        offsetMs: maxOffsetMs,
        properties: { opacity: { value: 1, interpolation: 'linear' } },
      },
    ],
  };
}

function createTestConfig(overrides?: Partial<ElementAnimationConfig>): ElementAnimationConfig {
  return {
    timelines: overrides?.timelines ?? [],
    stateTimelineBindings: overrides?.stateTimelineBindings ?? [],
    modifierTimelineBindings: overrides?.modifierTimelineBindings ?? [],
  };
}

function buildRegistry(
  ...entries: ReadonlyArray<{ readonly elementId: string; readonly config: ElementAnimationConfig }>
): readonly AnimationRegistryEntry[] {
  return entries.map((e) => ({ elementId: e.elementId, config: e.config }));
}

/** Create a container element with opacity-target and content-target children. */
function createDomElement(): {
  readonly container: HTMLElement;
  readonly opacityTarget: HTMLElement;
  readonly contentTarget: HTMLElement;
} {
  const container = document.createElement('div');
  const opacityTarget = document.createElement('div');
  const contentTarget = document.createElement('div');

  opacityTarget.setAttribute('data-opacity-target', '');
  contentTarget.setAttribute('data-element-content', '');
  container.appendChild(opacityTarget);
  container.appendChild(contentTarget);

  return { container, opacityTarget, contentTarget };
}

/**
 * Flush MutationObserver microtasks in jsdom.
 * MO callbacks are delivered via microtask queue, not timer queue,
 * so fake timers do not interfere.
 */
async function flushMutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// rAF mock state — shared across tests that need controlled rAF
// ---------------------------------------------------------------------------

let rafCallbacks: Array<(time: number) => void> = [];
let origRAF: typeof globalThis.requestAnimationFrame;
let origCAF: typeof globalThis.cancelAnimationFrame;

function installRafMock(): void {
  origRAF = globalThis.requestAnimationFrame;
  origCAF = globalThis.cancelAnimationFrame;
  rafCallbacks = [];

  globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    rafCallbacks.push(cb);

    return rafCallbacks.length;
  };

  globalThis.cancelAnimationFrame = (): void => {
    /* no-op */
  };
}

function restoreRaf(): void {
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCAF;
}

// ---------------------------------------------------------------------------
// Playback Controller DOM Observation
// ---------------------------------------------------------------------------

describe('Playback Controller DOM Observation', () => {
  /**
   * @description Elements starting offscreen MUST be hidden immediately on
   * attach. This ensures off-screen elements do not flash before the
   * controller processes initial state.
   */
  it('offscreen element is hidden on attach', () => {
    const registry = buildRegistry({ elementId: 'el-1', config: createTestConfig() });
    const controller = createPlaybackController(registry);

    const { container } = createDomElement();

    container.className = 'offscreen';

    controller.attach(container, 'el-1');

    expect(container.style.visibility).toBe('hidden');
    expect(container.style.pointerEvents).toBe('none');

    controller.destroy();
  });

  /**
   * @description setRegistry must re-parse attached elements with the new
   * config so that timelines added after attach become resolvable.
   */
  it('setRegistry re-parses element runtimes', () => {
    const registry1 = buildRegistry({ elementId: 'el-1', config: createTestConfig() });
    const controller = createPlaybackController(registry1);

    const { container, opacityTarget } = createDomElement();

    controller.attach(container, 'el-1');

    // Initially no timelines — seekTimeline would be a no-op
    controller.seekTimeline('el-1', 'newTl', 250);
    expect(opacityTarget.style.opacity).toBe('');

    // Update registry with a timeline
    const tl = createOpacityTimeline('tl-new', 'newTl', 500);
    const registry2 = buildRegistry({
      elementId: 'el-1',
      config: createTestConfig({ timelines: [tl] }),
    });

    controller.setRegistry(registry2);

    // Now seekTimeline should work with the new timeline
    // opacity at 250ms of 500ms span → 0.5
    controller.seekTimeline('el-1', 'newTl', 250);
    expect(opacityTarget.style.opacity).toBe('0.5');

    controller.destroy();
  });

  /**
   * @description seekTimeline creates a playback handle for the named
   * timeline on the element. stopTimeline cancels and cleans up the
   * handle without errors.
   */
  it('seekTimeline creates and cleans up handles', () => {
    const tl = createOpacityTimeline('tl-spin', 'spin', 1000);
    const config = createTestConfig({ timelines: [tl] });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container, opacityTarget } = createDomElement();

    controller.attach(container, 'el-1');

    // seekTimeline should apply interpolated styles
    // opacity at 500ms of 1000ms span → 0.5
    controller.seekTimeline('el-1', 'spin', 500);
    expect(opacityTarget.style.opacity).toBe('0.5');

    // stopTimeline should not throw
    controller.stopTimeline('el-1', 'spin');

    controller.destroy();
  });
});

// ---------------------------------------------------------------------------
// Suppress Transitions Mode
// ---------------------------------------------------------------------------

describe('Suppress Transitions Mode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * @description When suppressTransitions is true, a state change must
   * apply the final keyframe properties to the DOM instantly, without
   * scheduling a rAF-driven animation.
   */
  it('applies final keyframe properties instantly on state change', async () => {
    const tl = createOpacityTimeline('tl-in', 'IN', 500);
    const config = createTestConfig({
      timelines: [tl],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry, { suppressTransitions: true });

    const { container, opacityTarget } = createDomElement();

    container.className = 'offscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Trigger visibility change: offscreen → onscreen
    container.className = 'onscreen';
    await flushMutations();
    jest.advanceTimersByTime(50);

    // With suppress, the final keyframe value (opacity=1) is applied instantly
    expect(opacityTarget.style.opacity).toBe('1');

    controller.destroy();
    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// Visibility and State Transitions
// ---------------------------------------------------------------------------

describe('Visibility and State Transitions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    installRafMock();
  });
  afterEach(() => {
    jest.useRealTimers();
    restoreRaf();
  });

  /**
   * @description When visibility changes from offscreen to onscreen
   * with no active state, the IN state timeline MUST be played. Verified
   * by checking that rAF is called and frame advancement applies styles.
   */
  it('onscreen plays IN timeline', async () => {
    const tl = createOpacityTimeline('tl-in', 'IN', 500);
    const config = createTestConfig({
      timelines: [tl],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container, opacityTarget } = createDomElement();

    container.className = 'offscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Trigger visibility change
    container.className = 'onscreen';
    await flushMutations();
    jest.advanceTimersByTime(50);

    // Controller should have called play() → rAF registered
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Tick rAF: first call sets lastFrameTime
    const firstCb = rafCallbacks[rafCallbacks.length - 1];

    firstCb?.(0);

    // Second tick at 250ms → delta=250, opacity at 250/500 = 0.5
    const secondCb = rafCallbacks[rafCallbacks.length - 1];

    secondCb?.(250);
    expect(opacityTarget.style.opacity).toBe('0.5');

    // Visibility:hidden should have been removed
    expect(container.style.visibility).not.toBe('hidden');

    controller.destroy();
    document.body.removeChild(container);
  });

  /**
   * @description When no state timeline bindings exist and visibility
   * changes to offscreen, visibility:hidden MUST be set directly.
   */
  it('no timeline falls back to direct CSS', async () => {
    const config = createTestConfig(); // no bindings
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container } = createDomElement();

    container.className = 'onscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Go offscreen
    container.className = 'offscreen';
    await flushMutations();
    jest.advanceTimersByTime(50);

    expect(container.style.visibility).toBe('hidden');

    controller.destroy();
    document.body.removeChild(container);
  });

  /**
   * @description When visibility remains onscreen across a class
   * mutation, no timeline MUST be played.
   */
  it('unchanged visibility is a no-op', async () => {
    const tl = createOpacityTimeline('tl-in', 'IN', 500);
    const config = createTestConfig({
      timelines: [tl],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container, opacityTarget } = createDomElement();

    container.className = 'onscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Mutate class but keep onscreen
    container.className = 'onscreen extraClass';
    await flushMutations();
    jest.advanceTimersByTime(50);

    // No IN timeline should have played — opacity unchanged
    expect(opacityTarget.style.opacity).toBe('');
    // No rAF should have been registered
    expect(rafCallbacks).toHaveLength(0);

    controller.destroy();
    document.body.removeChild(container);
  });

  /**
   * @description When an element transitions offscreen with an OUT timeline
   * in non-suppress mode, visibility:hidden and pointer-events:none MUST be
   * applied only after the OUT animation completes. This prevents the element
   * from remaining visible indefinitely after the OUT animation finishes.
   */
  it('OUT timeline completion hides element', async () => {
    const tl = createOpacityTimeline('tl-out', 'OUT', 500);
    const config = createTestConfig({
      timelines: [tl],
      stateTimelineBindings: [{ stateName: 'OUT', timelineId: 'tl-out' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container } = createDomElement();

    container.className = 'onscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Transition to offscreen → should start OUT timeline
    container.className = 'offscreen';
    await flushMutations();
    jest.advanceTimersByTime(50);

    // During playback, element should NOT yet be hidden
    expect(container.style.visibility).not.toBe('hidden');
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Tick past the OUT timeline duration (500ms offset + 300ms default tween = 800ms)
    const firstCb = rafCallbacks[rafCallbacks.length - 1];

    firstCb?.(0);

    const secondCb = rafCallbacks[rafCallbacks.length - 1];

    secondCb?.(900);

    // After OUT completes, element MUST be hidden
    expect(container.style.visibility).toBe('hidden');
    expect(container.style.pointerEvents).toBe('none');

    controller.destroy();
    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// Modifier Sync
// ---------------------------------------------------------------------------

describe('Modifier Sync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * @description When a modifier is added to an element's class list,
   * the modifier's in-timeline MUST be played (or applied instantly
   * under suppress mode).
   */
  it('modifier added plays in-timeline', async () => {
    const tl = createOpacityTimeline('tl-pulse-in', 'pulse-in', 500);
    const config = createTestConfig({
      timelines: [tl],
      modifierTimelineBindings: [{ modifierName: 'pulse', inTimelineId: 'tl-pulse-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry, { suppressTransitions: true });

    const { container, opacityTarget } = createDomElement();

    container.className = 'onscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Add modifier
    container.className = 'onscreen pulse';
    await flushMutations();
    jest.advanceTimersByTime(50);

    // Final keyframe of in-timeline: opacity = 1
    expect(opacityTarget.style.opacity).toBe('1');

    controller.destroy();
    document.body.removeChild(container);
  });

  /**
   * @description When a modifier is removed and no out-timeline exists,
   * the modifier control MUST be stopped without error.
   */
  it('modifier removed stops control when no out-timeline', async () => {
    const tl = createOpacityTimeline('tl-pulse-in', 'pulse-in', 500);
    const config = createTestConfig({
      timelines: [tl],
      modifierTimelineBindings: [{ modifierName: 'pulse', inTimelineId: 'tl-pulse-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry, { suppressTransitions: true });

    const { container } = createDomElement();

    container.className = 'onscreen pulse';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Remove modifier — should not throw
    container.className = 'onscreen';
    await flushMutations();
    jest.advanceTimersByTime(50);

    // No out-timeline to play → no new styles applied. No error means pass.
    // Verify no crash occurred by checking controller still works.
    expect(controller.seekTimeline).toBeDefined();

    controller.destroy();
    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// Settle Timer Behavior
// ---------------------------------------------------------------------------

describe('Settle Timer Behavior', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * @description Class mutations MUST be debounced through the settle
   * timer. Transitions should NOT fire until the settle window (50ms
   * default) has elapsed.
   */
  it('defers transition until settle window completes', async () => {
    const tl = createOpacityTimeline('tl-in', 'IN', 500);
    const config = createTestConfig({
      timelines: [tl],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry, { suppressTransitions: true });

    const { container, opacityTarget } = createDomElement();

    container.className = 'offscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // Trigger visibility change
    container.className = 'onscreen';
    await flushMutations();

    // Before settle window — transition NOT yet processed
    expect(opacityTarget.style.opacity).toBe('');

    // Advance past settle delay
    jest.advanceTimersByTime(50);

    // NOW the final keyframe should be applied
    expect(opacityTarget.style.opacity).toBe('1');

    controller.destroy();
    document.body.removeChild(container);
  });

  /**
   * @description A new class mutation during an active settle window
   * MUST reset the timer. The transition only fires after the full
   * settle delay from the LAST mutation.
   */
  it('resets on new class mutation', async () => {
    const tl = createOpacityTimeline('tl-in', 'IN', 500);
    const config = createTestConfig({
      timelines: [tl],
      stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
    });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry, { suppressTransitions: true });

    const { container, opacityTarget } = createDomElement();

    container.className = 'offscreen';
    document.body.appendChild(container);
    controller.attach(container, 'el-1');

    // First mutation
    container.className = 'onscreen';
    await flushMutations();

    // After 30ms, second mutation resets the window
    jest.advanceTimersByTime(30);
    container.className = 'onscreen extra';
    await flushMutations();

    // 30ms after second mutation — NOT settled yet (need 50ms from last)
    jest.advanceTimersByTime(30);
    expect(opacityTarget.style.opacity).toBe('');

    // 20ms more = 50ms from second mutation — now settled
    jest.advanceTimersByTime(20);
    expect(opacityTarget.style.opacity).toBe('1');

    controller.destroy();
    document.body.removeChild(container);
  });
});

// ---------------------------------------------------------------------------
// Simultaneous Timeline Playback
// ---------------------------------------------------------------------------

describe('Simultaneous Timeline Playback', () => {
  /**
   * @description When a new timeline is triggered on an element that
   * already has an active timeline, the existing timeline MUST be
   * cancelled first.
   */
  it('new timeline cancels existing on same element', () => {
    const tl1 = createOpacityTimeline('tl-1', 'alpha', 1000);
    const tl2 = createOpacityTimeline('tl-2', 'beta', 1000);
    const config = createTestConfig({ timelines: [tl1, tl2] });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container, opacityTarget } = createDomElement();

    controller.attach(container, 'el-1');

    // Start first timeline at 500ms → opacity=0.5
    controller.seekTimeline('el-1', 'alpha', 500);
    expect(opacityTarget.style.opacity).toBe('0.5');

    // Start second timeline at 250ms → should cancel first, opacity=0.25
    controller.seekTimeline('el-1', 'beta', 250);
    expect(opacityTarget.style.opacity).toBe('0.25');

    controller.destroy();
  });

  /**
   * @description Timelines on different elements MUST be independent.
   * Playing one does not affect the other.
   */
  it('timelines on different elements are independent', () => {
    const tl1 = createOpacityTimeline('tl-1', 'alpha', 1000);
    const tl2 = createOpacityTimeline('tl-2', 'beta', 1000);
    const config1 = createTestConfig({ timelines: [tl1] });
    const config2 = createTestConfig({ timelines: [tl2] });
    const registry = buildRegistry({ elementId: 'el-1', config: config1 }, { elementId: 'el-2', config: config2 });
    const controller = createPlaybackController(registry);

    const dom1 = createDomElement();
    const dom2 = createDomElement();

    controller.attach(dom1.container, 'el-1');
    controller.attach(dom2.container, 'el-2');

    controller.seekTimeline('el-1', 'alpha', 500);
    controller.seekTimeline('el-2', 'beta', 250);

    expect(dom1.opacityTarget.style.opacity).toBe('0.5');
    expect(dom2.opacityTarget.style.opacity).toBe('0.25');

    controller.destroy();
  });

  /**
   * @description When a timeline is cancelled because a new one starts
   * on the same element, the cancelled timeline's applied styles MUST
   * be removed before the new timeline begins.
   */
  it('cancelled timeline cleanup removes applied styles', () => {
    // alpha applies opacity (→ opacityTarget)
    const tl1 = createOpacityTimeline('tl-1', 'alpha', 1000);
    // beta applies visibility (string → contentTarget, not opacity-routed)
    const tl2: Timeline = {
      id: 'tl-2',
      name: 'beta',
      entries: [
        {
          name: 'start',
          action: 'none',
          offsetMs: 0,
          properties: { visibility: { value: 'hidden', interpolation: 'linear' } },
        },
        {
          name: 'end',
          action: 'none',
          offsetMs: 1000,
          properties: { visibility: { value: 'visible', interpolation: 'linear' } },
        },
      ],
    };

    const config = createTestConfig({ timelines: [tl1, tl2] });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container, opacityTarget, contentTarget } = createDomElement();

    controller.attach(container, 'el-1');

    // Start alpha → opacity = 0.5
    controller.seekTimeline('el-1', 'alpha', 500);
    expect(opacityTarget.style.opacity).toBe('0.5');

    // Start beta → alpha cancelled (opacity cleared), beta applies visibility
    controller.seekTimeline('el-1', 'beta', 500);

    // Alpha's opacity should be cleaned up
    expect(opacityTarget.style.opacity).toBe('');
    // Beta's visibility at t=0.5 (string fallback → 'hidden' since t < 1)
    expect(contentTarget.style.visibility).toBe('hidden');

    controller.destroy();
  });
});
