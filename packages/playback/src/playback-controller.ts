import type { AnimationDefinition, ElementAnimationConfig, Timeline } from '@broadset/model';

import {
  clearTimelineStyles,
  EMPTY_ANIMATION_CONFIG,
  getDefaultTimelines,
  resolveModifierTimeline,
  resolveStateTimeline,
  resolveTimelineFromReference,
  validateAnimationRegistry,
} from './playback-controller-utils';
import {
  applyTimelineFrameToDom,
  applyVisibility,
  escapeCssIdentifier,
  type ParsedElementRuntimeState,
  parseElementRuntimeState,
  resolveAnimationTargets,
} from './playback-dom';
import { createPlaybackHandle, type PlaybackHandle } from './playback-handle';
import { computeTimelineFrame, computeTimelineLoopDuration, type TimelineFrame } from './timeline';

export {
  createPlaybackHandle,
  escapeCssIdentifier,
  parseElementRuntimeState,
  resolveAnimationTargets,
  validateAnimationRegistry,
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

export interface PlaybackController {
  attach(): void;
  detach(): void;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  setSpeed(speed: number): void;
  setRegistry(registry: readonly AnimationDefinition[]): void;
  seekTimeline(options: SeekTimelineOptions): TimelineFrame | null;
  stopTimeline(options: StopTimelineOptions): void;
  destroy(): void;
}

export interface CreatePlaybackControllerOptions {
  readonly root: HTMLElement;
  readonly registry: readonly AnimationDefinition[];
  readonly suppressTransitions?: boolean | undefined;
}

interface RuntimeRecord {
  readonly container: HTMLElement;
  readonly config: ElementAnimationConfig;
  parsedState: ParsedElementRuntimeState;
}

function getHandleKey(elementId: string, timelineId: string): string {
  return `${elementId}:${timelineId}`;
}

export function createPlaybackController(options: CreatePlaybackControllerOptions): PlaybackController {
  validateAnimationRegistry(options.registry);

  const targetsResolver = resolveAnimationTargets();
  const runtimes = new Map<string, RuntimeRecord>();
  const handles = new Map<string, PlaybackHandle>();
  let registry = options.registry;
  let currentTimeMs = 0;
  let playbackSpeed = 1;
  let observer: MutationObserver | null = null;
  let isAttached = false;
  let isDestroyed = false;
  let isApplyingMutation = false;

  function refreshRuntimes(): void {
    const containers = options.root.querySelectorAll<HTMLElement>('[data-element-id]');
    const seenIds = new Set<string>();

    for (const container of containers) {
      const elementId = container.dataset['elementId'];

      if (elementId === undefined) {
        continue;
      }

      const config = registry.find((entry) => entry.elementId === elementId)?.config ?? EMPTY_ANIMATION_CONFIG;
      const parsedState = parseElementRuntimeState({ element: container, config });

      applyVisibility(container, parsedState.visibility);
      runtimes.set(elementId, {
        container,
        config,
        parsedState,
      });
      seenIds.add(elementId);
    }

    for (const runtimeId of [...runtimes.keys()]) {
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

  function playResolvedTimeline(args: {
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

  function syncTransitions(
    elementId: string,
    runtime: RuntimeRecord,
    previousState: ParsedElementRuntimeState,
    nextState: ParsedElementRuntimeState,
  ): void {
    if (nextState.visibility !== previousState.visibility) {
      if (nextState.visibility === 'onscreen') {
        applyVisibility(runtime.container, 'onscreen');

        if (nextState.activeState === null) {
          const inTimeline = resolveStateTimeline(runtime.config, 'IN');

          if (inTimeline !== null) {
            if (options.suppressTransitions === true) {
              seekTimelineInternal({
                elementId,
                timelineId: inTimeline.id,
                timeMs: computeTimelineLoopDuration(inTimeline),
              });
            } else {
              playResolvedTimeline({ elementId, timeline: inTimeline, restart: true });
            }
          }
        }
      } else {
        const outTimeline = resolveStateTimeline(runtime.config, 'OUT');

        if (outTimeline === null) {
          applyVisibility(runtime.container, 'offscreen');
        } else if (options.suppressTransitions === true) {
          seekTimelineInternal({
            elementId,
            timelineId: outTimeline.id,
            timeMs: computeTimelineLoopDuration(outTimeline),
          });
          applyVisibility(runtime.container, 'offscreen');
        } else {
          playResolvedTimeline({
            elementId,
            timeline: outTimeline,
            restart: true,
            onComplete: () => {
              applyVisibility(runtime.container, 'offscreen');
            },
          });
        }
      }
    }

    if (nextState.activeState !== previousState.activeState) {
      if (previousState.activeState !== null) {
        const previousTimeline = resolveStateTimeline(runtime.config, previousState.activeState);

        if (previousTimeline !== null) {
          cancelHandle(getHandleKey(elementId, previousTimeline.id));
          clearTimelineStyles({
            root: options.root,
            targetsResolver,
            container: runtime.container,
            timeline: previousTimeline,
          });
        }
      }

      if (nextState.activeState !== null && nextState.activeState !== 'IN' && nextState.activeState !== 'OUT') {
        const nextTimeline = resolveStateTimeline(runtime.config, nextState.activeState);

        if (nextTimeline !== null) {
          if (options.suppressTransitions === true) {
            seekTimelineInternal({
              elementId,
              timelineId: nextTimeline.id,
              timeMs: computeTimelineLoopDuration(nextTimeline),
            });
          } else {
            playResolvedTimeline({ elementId, timeline: nextTimeline, restart: true });
          }
        }
      }
    }

    for (const modifier of nextState.modifiers) {
      if (previousState.modifiers.has(modifier)) {
        continue;
      }

      const inTimeline = resolveModifierTimeline(runtime.config, modifier, 'in');

      if (inTimeline === null) {
        continue;
      }

      if (options.suppressTransitions === true) {
        seekTimelineInternal({
          elementId,
          timelineId: inTimeline.id,
          timeMs: computeTimelineLoopDuration(inTimeline),
        });
      } else {
        playResolvedTimeline({ elementId, timeline: inTimeline, restart: true });
      }
    }

    for (const modifier of previousState.modifiers) {
      if (nextState.modifiers.has(modifier)) {
        continue;
      }

      const outTimeline = resolveModifierTimeline(runtime.config, modifier, 'out');
      const inTimeline = resolveModifierTimeline(runtime.config, modifier, 'in');

      if (outTimeline !== null) {
        if (options.suppressTransitions === true) {
          seekTimelineInternal({
            elementId,
            timelineId: outTimeline.id,
            timeMs: computeTimelineLoopDuration(outTimeline),
          });
        } else {
          playResolvedTimeline({ elementId, timeline: outTimeline, restart: true });
        }
      } else if (inTimeline !== null) {
        cancelHandle(getHandleKey(elementId, inTimeline.id));
        clearTimelineStyles({
          root: options.root,
          targetsResolver,
          container: runtime.container,
          timeline: inTimeline,
        });
      }
    }
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

        const container =
          target.dataset['elementId'] !== undefined ? target : target.closest<HTMLElement>('[data-element-id]');

        if (container === null || container.dataset['elementId'] === undefined) {
          continue;
        }

        const runtime = findRuntime(container.dataset['elementId']);

        if (runtime === null) {
          continue;
        }

        const nextState = parseElementRuntimeState({ element: container, config: runtime.config });

        syncTransitions(container.dataset['elementId'], runtime, runtime.parsedState, nextState);
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

    const effectiveTimeMs =
      options.suppressTransitions === true ? computeTimelineLoopDuration(timeline) : seekOptions.timeMs;
    const frame = computeTimelineFrame({
      timeline,
      timeMs: effectiveTimeMs,
    });

    isApplyingMutation = true;

    try {
      applyTimelineFrameToDom({
        root: options.root,
        targetsResolver,
        container: runtime.container,
        config: runtime.config,
        frame,
      });
    } finally {
      isApplyingMutation = false;
    }

    runtime.parsedState = {
      visibility: runtime.parsedState.visibility,
      activeState: frame.activeState,
      modifiers: new Set(frame.modifiers),
    };

    return frame;
  }

  return {
    attach(): void {
      if (isDestroyed || isAttached) {
        return;
      }

      isAttached = true;
      refreshRuntimes();
      observeMutations();
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
        this.attach();
      }

      for (const entry of registry) {
        for (const timeline of getDefaultTimelines(entry.config)) {
          playResolvedTimeline({ elementId: entry.elementId, timeline });
        }
      }
    },
    pause(): void {
      for (const handle of handles.values()) {
        handle.pause();
      }
    },
    seek(timeMs: number): void {
      currentTimeMs = Math.max(0, timeMs);

      for (const entry of registry) {
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

      for (const handle of handles.values()) {
        handle.setSpeed(speed);
      }
    },
    setRegistry(nextRegistry: readonly AnimationDefinition[]): void {
      validateAnimationRegistry(nextRegistry);
      registry = nextRegistry;
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

      cancelHandle(getHandleKey(stopOptions.elementId, timeline.id));
    },
    destroy(): void {
      if (isDestroyed) {
        return;
      }

      isDestroyed = true;
      this.detach();

      for (const [handleKey] of handles.entries()) {
        cancelHandle(handleKey);
      }

      targetsResolver.clear();
      runtimes.clear();
    },
  };
}
