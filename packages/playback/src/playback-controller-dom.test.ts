// ---------------------------------------------------------------------------
// Playback controller — DOM observation, suppress transitions, settle timer
// ---------------------------------------------------------------------------

import type { AnimationRegistryEntry, ElementAnimationConfig, Timeline } from '@broadset/model';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { createPlaybackController } from './playback-controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

async function flushMutations(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// DOM Observation
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

  /**
   * @description stopTimeline MUST only cancel the active handle when its
   * timeline name/id matches the requested timelineName. Calling
   * stopTimeline with a non-matching name must leave the active handle
   * intact. This prevents silently killing the wrong timeline.
   */
  it('stopTimeline ignores non-matching timeline name', () => {
    const tl = createOpacityTimeline('tl-spin', 'spin', 1000);
    const config = createTestConfig({ timelines: [tl] });
    const registry = buildRegistry({ elementId: 'el-1', config });
    const controller = createPlaybackController(registry);

    const { container, opacityTarget } = createDomElement();

    controller.attach(container, 'el-1');

    // Seek to apply styles
    controller.seekTimeline('el-1', 'spin', 500);
    expect(opacityTarget.style.opacity).toBe('0.5');

    // Stop a DIFFERENT timeline name — should NOT cancel the active handle
    controller.stopTimeline('el-1', 'alpha');

    // Styles from 'spin' should still be applied (not cleaned up)
    expect(opacityTarget.style.opacity).toBe('0.5');

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
