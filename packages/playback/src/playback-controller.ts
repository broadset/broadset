import type { AnimationDefinition, ElementAnimationConfig, Timeline } from '@broadset/model';

import {
  EMPTY_ANIMATION_CONFIG,
  getDefaultTimelines,
  resolveModifierTimeline,
  resolveStateTimeline,
  resolveTimelineFromReference,
  validateAnimationDefinitions,
} from './playback-controller-utils';
import {
  applyTimelineFrameToDom,
  applyVisibility,
  escapeCssIdentifier,
  type ParsedElementRuntimeState,
  parseElementRuntimeState,
  resolveAnimationTargets,
  syncStateClasses,
} from './playback-dom';
import { createPlaybackHandle, type PlaybackHandle } from './playback-handle';
import { computeTimelineFrame, computeTimelineLoopDuration, type TimelineFrame } from './timeline';

export {
  createPlaybackHandle,
  escapeCssIdentifier,
  parseElementRuntimeState,
  resolveAnimationTargets,
  validateAnimationDefinitions,
};
export type { AnimationTargetsResolver, ParsedElementRuntimeState } from './playback-dom';
export type { CreatePlaybackHandleOptions, PlaybackHandle } from './playback-handle';

export interface SeekTimelineOptions {
  readonly elementId: string;
  readonly timelineId?: string | undefined;
  readonly timelineName?: string | undefined;
  readonly timeMs: number;
}

export interface StopTimelineOptions {
  readonly elementId: string;
  readonly timelineId?: string | undefined;
  readonly timelineName?: string | undefined;
}

export interface ClearStylesOptions {
  readonly shouldClearProperty?: ((propertyName: string) => boolean) | undefined;
  readonly clearStateClasses?: boolean | undefined;
}

export interface PlaybackController {
  attach(): void;
  clearStyles(options?: ClearStylesOptions): void;
  detach(): void;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  setSpeed(speed: number): void;
  setAnimations(animations: readonly AnimationDefinition[]): void;
  seekTimeline(options: SeekTimelineOptions): TimelineFrame | null;
  stopTimeline(options: StopTimelineOptions): void;
  destroy(): void;
}

export interface CreatePlaybackControllerOptions {
  readonly root: HTMLElement;
  readonly animations: readonly AnimationDefinition[];
  readonly suppressTransitions?: boolean | undefined;
}

interface RuntimeRecord {
  readonly container: HTMLElement;
  readonly config: ElementAnimationConfig;
  parsedState: ParsedElementRuntimeState;
}

type AppliedTimelineStyles = Map<HTMLElement, Set<string>>;
type AppliedTimelineStates = Set<string>;

function getHandleKey(elementId: string, timelineId: string): string {
  return `${elementId}:${timelineId}`;
}

function elementIdFor(container: HTMLElement): string | undefined {
  return container.dataset['elementId'];
}

function runtimeContainers(root: HTMLElement): readonly HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-element-id]'));
}

function modifierNames(modifiers: ReadonlySet<string>): readonly string[] {
  return Array.from(modifiers);
}

function playbackHandles(handles: ReadonlyMap<string, PlaybackHandle>): readonly PlaybackHandle[] {
  return Array.from(handles.values());
}

function playbackHandleKeys(handles: ReadonlyMap<string, PlaybackHandle>): readonly string[] {
  return Array.from(handles.keys());
}

function closestRuntimeContainer(target: HTMLElement): HTMLElement | null {
  return elementIdFor(target) !== undefined ? target : target.closest<HTMLElement>('[data-element-id]');
}

function collectFrameStatesInto(
  statesByElementId: Map<string, { readonly activeState: string | null; readonly modifiers: ReadonlySet<string> }>,
  elementId: string,
  frame: TimelineFrame,
): void {
  statesByElementId.set(elementId, {
    activeState: frame.activeState,
    modifiers: frame.modifiers,
  });

  for (const [targetId, targetState] of Object.entries(frame.targetStates ?? {})) {
    statesByElementId.set(targetId, targetState);
  }

  for (const [childElementId, childFrame] of Object.entries(frame.childFrames)) {
    collectFrameStatesInto(statesByElementId, childElementId, childFrame);
  }
}

export function createPlaybackController(options: CreatePlaybackControllerOptions): PlaybackController {
  validateAnimationDefinitions(options.animations);

  const targetsResolver = resolveAnimationTargets();
  const runtimes = new Map<string, RuntimeRecord>();
  const handles = new Map<string, PlaybackHandle>();
  const appliedTimelineStyles = new Map<string, AppliedTimelineStyles>();
  const appliedTimelineStates = new Map<string, AppliedTimelineStates>();
  let animations = options.animations;
  let currentTimeMs = 0;
  let playbackSpeed = 1;
  let observer: MutationObserver | null = null;
  let isAttached = false;
  let isDestroyed = false;
  let isApplyingMutation = false;

  function refreshRuntimes(): void {
    const seenIds = new Set<string>();

    for (const container of runtimeContainers(options.root)) {
      const elementId = elementIdFor(container);

      if (elementId === undefined) {
        continue;
      }

      const config = animations.find((entry) => entry.elementId === elementId)?.config ?? EMPTY_ANIMATION_CONFIG;
      const parsedState = parseElementRuntimeState({ element: container, config });

      applyVisibility(container, parsedState.visibility);
      runtimes.set(elementId, {
        container,
        config,
        parsedState,
      });
      seenIds.add(elementId);
    }

    for (const runtimeId of Array.from(runtimes.keys())) {
      if (!seenIds.has(runtimeId)) {
        runtimes.delete(runtimeId);
      }
    }
  }

  function findRuntime(elementId: string): RuntimeRecord | null {
    const runtime = runtimes.get(elementId);

    if (runtime !== undefined) {
      return runtime;
    }

    refreshRuntimes();

    return runtimes.get(elementId) ?? null;
  }

  function cancelHandle(handleKey: string): void {
    const handle = handles.get(handleKey);

    if (handle === undefined) {
      return;
    }

    handle.cancel();
    handles.delete(handleKey);
  }

  function cancelAndClearHandle(handleKey: string, clearOptions?: ClearStylesOptions): void {
    cancelHandle(handleKey);
    clearAppliedTimelineStyles(handleKey, clearOptions);
    clearAppliedTimelineStateClasses(handleKey, clearOptions);
  }

  function cancelAndClearAllHandles(clearOptions?: ClearStylesOptions): void {
    const handleKeys = new Set([
      ...playbackHandleKeys(handles),
      ...appliedTimelineStyles.keys(),
      ...appliedTimelineStates.keys(),
    ]);

    for (const handleKey of handleKeys) {
      cancelAndClearHandle(handleKey, clearOptions);
    }
  }

  function recordAppliedTimelineStyles(
    handleKey: string,
    element: HTMLElement,
    propertyNames: readonly string[],
  ): void {
    if (propertyNames.length === 0) {
      return;
    }

    const elementStyles = appliedTimelineStyles.get(handleKey) ?? new Map<HTMLElement, Set<string>>();
    const nextPropertyNames = elementStyles.get(element) ?? new Set<string>();

    for (const propertyName of propertyNames) {
      nextPropertyNames.add(propertyName);
    }

    elementStyles.set(element, nextPropertyNames);
    appliedTimelineStyles.set(handleKey, elementStyles);
  }

  function shouldClearStateClasses(clearOptions?: ClearStylesOptions): boolean {
    if (clearOptions?.clearStateClasses !== undefined) {
      return clearOptions.clearStateClasses;
    }

    return clearOptions?.shouldClearProperty === undefined;
  }

  function recordAppliedTimelineStates(handleKey: string, elementIds: Iterable<string>): void {
    const stateElementIds = appliedTimelineStates.get(handleKey) ?? new Set<string>();

    for (const elementId of elementIds) {
      stateElementIds.add(elementId);
    }

    if (stateElementIds.size > 0) {
      appliedTimelineStates.set(handleKey, stateElementIds);
    }
  }

  function clearRuntimeStateClasses(elementId: string): void {
    const runtime = findRuntime(elementId);

    if (runtime === null) {
      return;
    }

    syncStateClasses(runtime.container, runtime.config, null, new Set());
    runtime.parsedState = {
      visibility: runtime.parsedState.visibility,
      activeState: null,
      modifiers: new Set(),
    };
  }

  function clearAppliedTimelineStateClasses(handleKey: string, clearOptions?: ClearStylesOptions): void {
    if (!shouldClearStateClasses(clearOptions)) {
      return;
    }

    const stateElementIds = appliedTimelineStates.get(handleKey);

    if (stateElementIds === undefined) {
      return;
    }

    isApplyingMutation = true;

    try {
      for (const elementId of stateElementIds) {
        clearRuntimeStateClasses(elementId);
      }
    } finally {
      isApplyingMutation = false;
    }

    appliedTimelineStates.delete(handleKey);
  }

  function clearAppliedTimelineStyles(handleKey: string, clearOptions?: ClearStylesOptions): void {
    const elementStyles = appliedTimelineStyles.get(handleKey);

    if (elementStyles === undefined) {
      return;
    }

    for (const [element, propertyNames] of Array.from(elementStyles.entries())) {
      const propertyNameValues = Array.from(propertyNames);
      const filteredPropertyNames =
        clearOptions?.shouldClearProperty === undefined ?
          propertyNameValues
        : propertyNameValues.filter(clearOptions.shouldClearProperty);

      if (filteredPropertyNames.length === 0) {
        continue;
      }

      targetsResolver.clearStyles(element, filteredPropertyNames);

      for (const propertyName of filteredPropertyNames) {
        propertyNames.delete(propertyName);
      }

      if (propertyNames.size === 0) {
        elementStyles.delete(element);
      }
    }

    if (elementStyles.size === 0) {
      appliedTimelineStyles.delete(handleKey);
    }
  }

  function playTimeline(args: {
    readonly elementId: string;
    readonly timeline: Timeline;
    readonly restart?: boolean | undefined;
    readonly onComplete?: (() => void) | undefined;
  }): void {
    const handleKey = getHandleKey(args.elementId, args.timeline.id);
    const existingHandle = handles.get(handleKey);

    if (existingHandle !== undefined && args.restart !== true) {
      if (Number.isFinite(existingHandle.durationMs) && existingHandle.currentTimeMs >= existingHandle.durationMs) {
        existingHandle.seek(0);
      }

      existingHandle.setSpeed(playbackSpeed);
      existingHandle.play();

      return;
    }

    cancelHandle(handleKey);

    const durationMs = computeTimelineLoopDuration(args.timeline);
    const handle = createPlaybackHandle({
      durationMs,
      onFrame(timeMs): void {
        currentTimeMs = timeMs;
        seekTimelineInternal({ elementId: args.elementId, timelineId: args.timeline.id, timeMs });
      },
      onComplete: args.onComplete,
    });

    handle.setSpeed(playbackSpeed);
    handle.seek(0);
    handle.play();
    handles.set(handleKey, handle);
  }

  /**
   * Either play a timeline as a transition, or jump straight to its end when
   * `options.suppressTransitions` is set. Used by every transition phase in
   * `syncTransitions` to keep the suppress/play decision in one place.
   */
  function runOrSeekTimeline(elementId: string, timeline: Timeline, onComplete?: () => void): void {
    if (options.suppressTransitions === true) {
      seekTimelineInternal({
        elementId,
        timelineId: timeline.id,
        timeMs: computeTimelineLoopDuration(timeline),
      });
      onComplete?.();
    } else {
      playTimeline({ elementId, timeline, restart: true, onComplete });
    }
  }

  function clearTimelineForElement(elementId: string, timeline: Timeline, clearOptions?: ClearStylesOptions): void {
    const handleKey = getHandleKey(elementId, timeline.id);

    cancelAndClearHandle(handleKey, clearOptions);
  }

  function syncVisibility(
    elementId: string,
    runtime: RuntimeRecord,
    previousState: ParsedElementRuntimeState,
    nextState: ParsedElementRuntimeState,
  ): void {
    if (nextState.visibility === previousState.visibility) return;

    if (nextState.visibility === 'onscreen') {
      applyVisibility(runtime.container, 'onscreen');

      // Only auto-fire the IN timeline when no explicit state will run one shortly.
      if (nextState.activeState !== null) return;

      const inTimeline = resolveStateTimeline(runtime.config, 'IN');

      if (inTimeline !== null) {
        runOrSeekTimeline(elementId, inTimeline);
      }

      return;
    }

    const outTimeline = resolveStateTimeline(runtime.config, 'OUT');

    if (outTimeline === null) {
      applyVisibility(runtime.container, 'offscreen');

      return;
    }

    runOrSeekTimeline(elementId, outTimeline, () => {
      applyVisibility(runtime.container, 'offscreen');
    });
  }

  function syncActiveState(
    elementId: string,
    runtime: RuntimeRecord,
    previousState: ParsedElementRuntimeState,
    nextState: ParsedElementRuntimeState,
  ): void {
    if (nextState.activeState === previousState.activeState) return;

    if (previousState.activeState !== null) {
      const previousTimeline = resolveStateTimeline(runtime.config, previousState.activeState);

      if (previousTimeline !== null) {
        clearTimelineForElement(elementId, previousTimeline);
      }
    }

    // IN/OUT are driven by the visibility phase; don't double-fire here.
    if (nextState.activeState === null || nextState.activeState === 'IN' || nextState.activeState === 'OUT') {
      return;
    }

    const nextTimeline = resolveStateTimeline(runtime.config, nextState.activeState);

    if (nextTimeline !== null) {
      runOrSeekTimeline(elementId, nextTimeline);
    }
  }

  function syncModifiersAdded(
    elementId: string,
    runtime: RuntimeRecord,
    previousState: ParsedElementRuntimeState,
    nextState: ParsedElementRuntimeState,
  ): void {
    for (const modifier of modifierNames(nextState.modifiers)) {
      if (previousState.modifiers.has(modifier)) continue;

      const inTimeline = resolveModifierTimeline(runtime.config, modifier, 'in');

      if (inTimeline !== null) {
        runOrSeekTimeline(elementId, inTimeline);
      }
    }
  }

  function syncModifiersRemoved(
    elementId: string,
    runtime: RuntimeRecord,
    previousState: ParsedElementRuntimeState,
    nextState: ParsedElementRuntimeState,
  ): void {
    for (const modifier of modifierNames(previousState.modifiers)) {
      if (nextState.modifiers.has(modifier)) continue;

      const outTimeline = resolveModifierTimeline(runtime.config, modifier, 'out');
      const inTimeline = resolveModifierTimeline(runtime.config, modifier, 'in');

      if (outTimeline !== null) {
        runOrSeekTimeline(elementId, outTimeline);
      } else if (inTimeline !== null) {
        clearTimelineForElement(elementId, inTimeline);
      }
    }
  }

  function syncTransitions(
    elementId: string,
    runtime: RuntimeRecord,
    previousState: ParsedElementRuntimeState,
    nextState: ParsedElementRuntimeState,
  ): void {
    syncVisibility(elementId, runtime, previousState, nextState);
    syncActiveState(elementId, runtime, previousState, nextState);
    syncModifiersAdded(elementId, runtime, previousState, nextState);
    syncModifiersRemoved(elementId, runtime, previousState, nextState);
  }

  function observeMutations(): void {
    observer?.disconnect();
    observer = new MutationObserver((records) => {
      if (isApplyingMutation) {
        return;
      }

      for (const record of records) {
        const target = record.target;

        if (!(target instanceof HTMLElement)) {
          continue;
        }

        const container = closestRuntimeContainer(target);

        if (container === null) {
          continue;
        }

        const elementId = elementIdFor(container);

        if (elementId === undefined) {
          continue;
        }

        const runtime = findRuntime(elementId);

        if (runtime === null) {
          continue;
        }

        const nextState = parseElementRuntimeState({ element: container, config: runtime.config });

        syncTransitions(elementId, runtime, runtime.parsedState, nextState);
        runtime.parsedState = nextState;
      }
    });
    observer.observe(options.root, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-visibility'],
    });
  }

  function seekTimelineInternal(seekOptions: SeekTimelineOptions): TimelineFrame | null {
    const runtime = findRuntime(seekOptions.elementId);

    if (runtime === null) {
      return null;
    }

    const timeline = resolveTimelineFromReference(runtime.config, seekOptions);

    if (timeline === null) {
      return null;
    }

    // Note: callers that need to skip to the end of a transition pass
    // `timeMs: computeTimelineLoopDuration(timeline)` explicitly.
    // We must NOT override `seekOptions.timeMs` here — doing so breaks
    // `seek()` which passes arbitrary times for frame-by-frame export.
    const frame = computeTimelineFrame({
      timeline,
      timeMs: seekOptions.timeMs,
    });
    const handleKey = getHandleKey(seekOptions.elementId, timeline.id);

    isApplyingMutation = true;

    try {
      applyTimelineFrameToDom({
        root: options.root,
        targetsResolver,
        container: runtime.container,
        config: runtime.config,
        frame,
        onApplyStyles: (element, propertyNames) => {
          recordAppliedTimelineStyles(handleKey, element, propertyNames);
        },
        resolveElementConfig: (elementId) => findRuntime(elementId)?.config ?? null,
      });
    } finally {
      isApplyingMutation = false;
    }

    const frameStates = new Map<
      string,
      { readonly activeState: string | null; readonly modifiers: ReadonlySet<string> }
    >();

    collectFrameStatesInto(frameStates, seekOptions.elementId, frame);
    recordAppliedTimelineStates(handleKey, frameStates.keys());

    for (const [elementId, state] of frameStates) {
      const stateRuntime = findRuntime(elementId);

      if (stateRuntime === null) {
        continue;
      }

      stateRuntime.parsedState = {
        visibility: stateRuntime.parsedState.visibility,
        activeState: state.activeState,
        modifiers: new Set(state.modifiers),
      };
    }

    return frame;
  }

  const controller: PlaybackController = {
    attach(): void {
      if (isDestroyed || isAttached) {
        return;
      }

      isAttached = true;
      refreshRuntimes();
      observeMutations();
    },
    clearStyles(clearOptions?: ClearStylesOptions): void {
      cancelAndClearAllHandles(clearOptions);

      if (shouldClearStateClasses(clearOptions)) {
        isApplyingMutation = true;

        try {
          for (const runtime of Array.from(runtimes.values())) {
            syncStateClasses(runtime.container, runtime.config, null, new Set());
            runtime.parsedState = {
              visibility: runtime.parsedState.visibility,
              activeState: null,
              modifiers: new Set(),
            };
          }
        } finally {
          isApplyingMutation = false;
        }
      }
    },
    detach(): void {
      if (!isAttached) {
        return;
      }

      observer?.disconnect();
      observer = null;
      isAttached = false;
    },
    play(): void {
      if (isDestroyed) {
        return;
      }

      if (!isAttached) {
        controller.attach();
      }

      for (const entry of animations) {
        for (const timeline of getDefaultTimelines(entry.config)) {
          playTimeline({ elementId: entry.elementId, timeline });
        }
      }
    },
    pause(): void {
      for (const handle of playbackHandles(handles)) {
        handle.pause();
      }
    },
    seek(timeMs: number): void {
      currentTimeMs = Math.max(0, timeMs);

      for (const entry of animations) {
        for (const timeline of getDefaultTimelines(entry.config)) {
          seekTimelineInternal({
            elementId: entry.elementId,
            timelineId: timeline.id,
            timeMs: currentTimeMs,
          });
        }
      }
    },
    setSpeed(speed: number): void {
      if (!Number.isFinite(speed) || speed <= 0) {
        return;
      }

      playbackSpeed = speed;

      for (const handle of playbackHandles(handles)) {
        handle.setSpeed(speed);
      }
    },
    setAnimations(nextAnimations: readonly AnimationDefinition[]): void {
      validateAnimationDefinitions(nextAnimations);
      cancelAndClearAllHandles();
      animations = nextAnimations;
      refreshRuntimes();
    },
    seekTimeline(seekOptions: SeekTimelineOptions): TimelineFrame | null {
      return seekTimelineInternal(seekOptions);
    },
    stopTimeline(stopOptions: StopTimelineOptions): void {
      const runtime = findRuntime(stopOptions.elementId);

      if (runtime === null) {
        return;
      }

      const timeline = resolveTimelineFromReference(runtime.config, stopOptions);

      if (timeline === null) {
        return;
      }

      cancelAndClearHandle(getHandleKey(stopOptions.elementId, timeline.id));
    },
    destroy(): void {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      controller.detach();
      cancelAndClearAllHandles();

      targetsResolver.clear();
      runtimes.clear();
    },
  };

  return controller;
}
