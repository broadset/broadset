// ---------------------------------------------------------------------------
// Playback controller — DOM observation, state/visibility/modifier
// transitions, settle timer, and simultaneous timeline management.
// ---------------------------------------------------------------------------

import type { AnimationRegistryEntry, ElementAnimationConfig, Timeline } from '@broadset/model';

import type { ClassState } from './class-state';
import { parseClassState } from './class-state';
import type { PlaybackHandle } from './playback-handle';
import { createPlaybackHandle } from './playback-handle';
import { resolveModifierTimelines, resolveStateTimeline } from './resolve-timeline';
import { applyStylesToElement, clearStylesFromElement } from './style-writer';
import { computeTimelineDuration, computeTimelineFrame } from './timeline';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SETTLE_DELAY_MS = 50;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybackControllerOptions {
  readonly suppressTransitions?: boolean;
  readonly settleDelayMs?: number;
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
// Internal types
// ---------------------------------------------------------------------------

interface ActiveHandle {
  readonly handle: PlaybackHandle;
  readonly timeline: Timeline;
}

/**
 * Per-element mutable runtime state.
 * Fields are mutable because they change during the attach/detach lifecycle,
 * registry updates, settle timer processing, and handle creation/cancellation.
 */
interface ElementRuntime {
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

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a PlaybackController that manages DOM observation, state transitions,
 * modifier sync, and timeline playback for attached elements.
 */
export function createPlaybackController(
  initialRegistry: readonly AnimationRegistryEntry[],
  options?: PlaybackControllerOptions,
): PlaybackController {
  /* mutable — internal controller state */
  let registry = initialRegistry;
  const suppressTransitions = options?.suppressTransitions ?? false;
  const settleDelayMs = options?.settleDelayMs ?? DEFAULT_SETTLE_DELAY_MS;

  const runtimes = new Map<HTMLElement, ElementRuntime>();
  const elementMap = new Map<string, HTMLElement>();

  // -----------------------------------------------------------------------
  // Registry lookup helpers
  // -----------------------------------------------------------------------

  function findConfig(elementId: string): ElementAnimationConfig | null {
    const entry = registry.find((e) => e.elementId === elementId);

    return entry?.config ?? null;
  }

  function getKnownStates(config: ElementAnimationConfig | null): readonly string[] {
    if (!config) return [];

    return config.stateTimelineBindings.map((b) => b.stateName);
  }

  function getKnownModifiers(config: ElementAnimationConfig | null): readonly string[] {
    if (!config) return [];

    return config.modifierTimelineBindings.map((b) => b.modifierName);
  }

  // -----------------------------------------------------------------------
  // Timeline property helpers
  // -----------------------------------------------------------------------

  /** Collect all CSS property names that a timeline touches. */
  function collectProperties(timeline: Timeline): readonly string[] {
    const props = new Set<string>();

    for (const kf of timeline.entries) {
      for (const key of Object.keys(kf.properties)) {
        props.add(key);
      }
    }

    return [...props];
  }

  /** Cancel the active handle and remove its applied styles. */
  function cancelWithCleanup(runtime: ElementRuntime): void {
    if (!runtime.activeHandle) return;

    runtime.activeHandle.handle.cancel();
    clearStylesFromElement(runtime.element, collectProperties(runtime.activeHandle.timeline));
    runtime.activeHandle = null;
  }

  // -----------------------------------------------------------------------
  // Transition logic
  // -----------------------------------------------------------------------

  /** Apply the final keyframe of a timeline instantly (suppress mode). */
  function applyInstant(container: HTMLElement, timeline: Timeline): void {
    const duration = computeTimelineDuration(timeline);
    const frame = computeTimelineFrame(timeline, duration);

    applyStylesToElement(container, frame.properties);
  }

  /** Play (or suppress-apply) a timeline on an element runtime. */
  function playTimeline(runtime: ElementRuntime, timeline: Timeline): void {
    cancelWithCleanup(runtime);

    if (suppressTransitions) {
      applyInstant(runtime.element, timeline);

      return;
    }

    const handle = createPlaybackHandle(timeline, runtime.element);

    runtime.activeHandle = { handle, timeline };
    handle.play();
  }

  function handleVisibilityChange(
    runtime: ElementRuntime,
    oldVis: 'onscreen' | 'offscreen',
    newVis: 'onscreen' | 'offscreen',
  ): void {
    if (oldVis === 'offscreen' && newVis === 'onscreen') {
      // Show element
      runtime.element.style.removeProperty('visibility');
      runtime.element.style.removeProperty('pointer-events');

      // Play IN timeline if bound
      if (runtime.config) {
        const inTimeline = resolveStateTimeline(runtime.config, 'IN');

        if (inTimeline) {
          playTimeline(runtime, inTimeline);
        }
      }
    } else if (oldVis === 'onscreen' && newVis === 'offscreen') {
      if (runtime.config) {
        const outTimeline = resolveStateTimeline(runtime.config, 'OUT');

        if (outTimeline) {
          playTimeline(runtime, outTimeline);

          if (suppressTransitions) {
            runtime.element.style.setProperty('visibility', 'hidden');
            runtime.element.style.setProperty('pointer-events', 'none');
          }
        } else {
          // No OUT timeline — direct CSS
          runtime.element.style.setProperty('visibility', 'hidden');
          runtime.element.style.setProperty('pointer-events', 'none');
        }
      } else {
        runtime.element.style.setProperty('visibility', 'hidden');
        runtime.element.style.setProperty('pointer-events', 'none');
      }
    }
  }

  function handleStateChange(runtime: ElementRuntime, newState: string | null): void {
    if (!runtime.config || newState === null) return;

    const timeline = resolveStateTimeline(runtime.config, newState);

    if (timeline) {
      playTimeline(runtime, timeline);
    }
  }

  function handleModifierSync(
    runtime: ElementRuntime,
    oldModifiers: readonly string[],
    newModifiers: readonly string[],
  ): void {
    if (!runtime.config) return;

    const oldSet = new Set(oldModifiers);
    const newSet = new Set(newModifiers);

    // Added modifiers
    for (const mod of newModifiers) {
      if (oldSet.has(mod)) continue;

      const resolved = resolveModifierTimelines(runtime.config, mod);

      if (!resolved?.inTimeline) continue;

      if (suppressTransitions) {
        applyInstant(runtime.element, resolved.inTimeline);
      } else {
        const handle = createPlaybackHandle(resolved.inTimeline, runtime.element);

        runtime.modifierHandles.set(mod, { handle, timeline: resolved.inTimeline });
        handle.play();
      }
    }

    // Removed modifiers
    for (const mod of oldModifiers) {
      if (newSet.has(mod)) continue;

      const existing = runtime.modifierHandles.get(mod);

      if (existing) {
        existing.handle.cancel();
        clearStylesFromElement(runtime.element, collectProperties(existing.timeline));
        runtime.modifierHandles.delete(mod);
      }

      // Play out-timeline if available
      const resolved = resolveModifierTimelines(runtime.config, mod);

      if (resolved?.outTimeline) {
        if (suppressTransitions) {
          applyInstant(runtime.element, resolved.outTimeline);
        } else {
          const handle = createPlaybackHandle(resolved.outTimeline, runtime.element);

          runtime.modifierHandles.set(mod + ':out', { handle, timeline: resolved.outTimeline });
          handle.play();
        }
      }
    }
  }

  function processTransition(element: HTMLElement, runtime: ElementRuntime): void {
    const { config } = runtime;
    const newState = parseClassState(element, getKnownStates(config), getKnownModifiers(config));
    const oldState = runtime.previousState;

    // Visibility change
    if (newState.visibility !== oldState.visibility) {
      handleVisibilityChange(runtime, oldState.visibility, newState.visibility);
    }

    // State change
    if (newState.activeState !== oldState.activeState && newState.activeState !== null) {
      handleStateChange(runtime, newState.activeState);
    }

    // Modifier sync
    handleModifierSync(runtime, oldState.modifiers, newState.modifiers);

    runtime.previousState = newState;
  }

  function handleClassMutation(element: HTMLElement): void {
    const runtime = runtimes.get(element);

    if (!runtime) return;

    // Clear existing settle timer
    if (runtime.settleTimer !== null) {
      clearTimeout(runtime.settleTimer);
      runtime.settleTimer = null;
    }

    // Start new settle timer
    runtime.settleTimer = setTimeout(() => {
      runtime.settleTimer = null;
      processTransition(element, runtime);
    }, settleDelayMs);
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  function attach(element: HTMLElement, elementId: string): void {
    const config = findConfig(elementId);
    const classState = parseClassState(element, getKnownStates(config), getKnownModifiers(config));

    // Apply initial visibility
    if (classState.visibility === 'offscreen') {
      element.style.setProperty('visibility', 'hidden');
      element.style.setProperty('pointer-events', 'none');
    }

    // Set up MutationObserver for class attribute changes
    const observer = new MutationObserver(() => {
      handleClassMutation(element);
    });

    observer.observe(element, { attributes: true, attributeFilter: ['class'] });

    const runtime: ElementRuntime = {
      elementId,
      element,
      config,
      previousState: classState,
      observer,
      settleTimer: null,
      activeHandle: null,
      modifierHandles: new Map(),
    };

    runtimes.set(element, runtime);
    elementMap.set(elementId, element);
  }

  function detach(element: HTMLElement): void {
    const runtime = runtimes.get(element);

    if (!runtime) return;

    runtime.observer.disconnect();

    if (runtime.settleTimer !== null) {
      clearTimeout(runtime.settleTimer);
    }

    if (runtime.activeHandle) {
      runtime.activeHandle.handle.cancel();
    }

    for (const modHandle of runtime.modifierHandles.values()) {
      modHandle.handle.cancel();
    }

    runtimes.delete(element);
    elementMap.delete(runtime.elementId);
  }

  function play(): void {
    for (const runtime of runtimes.values()) {
      runtime.activeHandle?.handle.play();
    }
  }

  function pause(): void {
    for (const runtime of runtimes.values()) {
      runtime.activeHandle?.handle.pause();
    }
  }

  function seek(timeMs: number): void {
    for (const runtime of runtimes.values()) {
      runtime.activeHandle?.handle.seek(timeMs);
    }
  }

  function setSpeed(multiplier: number): void {
    for (const runtime of runtimes.values()) {
      runtime.activeHandle?.handle.setSpeed(multiplier);
    }
  }

  function setRegistry(newRegistry: readonly AnimationRegistryEntry[]): void {
    registry = newRegistry;

    for (const runtime of runtimes.values()) {
      const newConfig = findConfig(runtime.elementId);

      runtime.config = newConfig;
      runtime.previousState = parseClassState(runtime.element, getKnownStates(newConfig), getKnownModifiers(newConfig));
    }
  }

  function seekTimeline(elementId: string, timelineName: string, timeMs: number): void {
    const element = elementMap.get(elementId);

    if (!element) return;

    const runtime = runtimes.get(element);

    if (!runtime?.config) return;

    const timeline = runtime.config.timelines.find((tl) => tl.name === timelineName || tl.id === timelineName);

    if (!timeline) return;

    // Cancel existing handle (simultaneous timeline enforcement)
    cancelWithCleanup(runtime);

    // Create new handle and seek
    const handle = createPlaybackHandle(timeline, element);

    runtime.activeHandle = { handle, timeline };
    handle.seek(timeMs);
  }

  function stopTimeline(elementId: string, _timelineName: string): void {
    const element = elementMap.get(elementId);

    if (!element) return;

    const runtime = runtimes.get(element);

    if (!runtime) return;

    cancelWithCleanup(runtime);
  }

  function destroy(): void {
    for (const element of [...runtimes.keys()]) {
      detach(element);
    }
  }

  return {
    attach,
    detach,
    play,
    pause,
    seek,
    setSpeed,
    setRegistry,
    seekTimeline,
    stopTimeline,
    destroy,
  };
}
