import type { AnimationDefinition, ElementAnimationConfig, Timeline } from '@broadset/model';

import { computeTimelineFrame, computeTimelineLoopDuration, type TimelineFrame } from './timeline';

const FRAME_STEP_MS = 16;
const EMPTY_ANIMATION_CONFIG: ElementAnimationConfig = {
  timelines: [],
  stateTimelineBindings: [],
  modifierTimelineBindings: [],
  textAnimator: null,
};

type VisibilityState = 'onscreen' | 'offscreen';

export interface ParsedElementRuntimeState {
  readonly visibility: VisibilityState;
  readonly activeState: string | null;
  readonly modifiers: ReadonlySet<string>;
}

export interface PlaybackHandle {
  readonly currentTimeMs: number;
  readonly durationMs: number;
  readonly isActive: boolean;
  play(): void;
  pause(): void;
  seek(timeMs: number): void;
  setSpeed(speed: number): void;
  cancel(): void;
}

export interface CreatePlaybackHandleOptions {
  readonly durationMs: number;
  readonly onFrame?: ((timeMs: number) => void) | undefined;
  readonly onComplete?: (() => void) | undefined;
}

export interface AnimationTargetsResolver {
  applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void;
  invalidate(container: HTMLElement): void;
  clear(): void;
}

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

interface ResolvedAnimationTargets {
  readonly contentTarget: HTMLElement;
  readonly opacityTarget: HTMLElement;
}

interface MutableTransformState {
  x?: number | undefined;
  y?: number | undefined;
  translateX?: number | undefined;
  translateY?: number | undefined;
  rotation?: number | undefined;
  scale?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
}

function isKnownVisibility(value: string | undefined): value is VisibilityState {
  return value === 'onscreen' || value === 'offscreen';
}

function findContentTarget(container: HTMLElement): HTMLElement {
  const target = container.querySelector<HTMLElement>('[data-element-content]');

  return target ?? container;
}

function findOpacityTarget(container: HTMLElement, contentTarget: HTMLElement): HTMLElement {
  const target = container.querySelector<HTMLElement>('[data-opacity-target]');

  return target ?? contentTarget;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

function composeTransformValue(state: MutableTransformState): string {
  const translateX = (state.x ?? 0) + (state.translateX ?? 0);
  const translateY = (state.y ?? 0) + (state.translateY ?? 0);
  const scaleX = state.scaleX ?? state.scale ?? 1;
  const scaleY = state.scaleY ?? state.scale ?? 1;
  const rotation = state.rotation ?? 0;
  const parts: string[] = [];

  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${String(translateX)}px, ${String(translateY)}px)`);
  }

  if (rotation !== 0) {
    parts.push(`rotate(${String(rotation)}deg)`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${String(scaleX)}, ${String(scaleY)})`);
  }

  return parts.join(' ');
}

function isTransformProperty(propertyName: string): boolean {
  return ['x', 'y', 'translateX', 'translateY', 'rotation', 'scale', 'scaleX', 'scaleY'].includes(propertyName);
}

function applyPathValue(target: HTMLElement, value: string): void {
  if (target instanceof SVGElement && target.tagName.toLowerCase() === 'path') {
    target.setAttribute('d', value);

    return;
  }

  const pathElement = target.querySelector<SVGPathElement>('path');

  if (pathElement !== null) {
    pathElement.setAttribute('d', value);
  }
}

export function resolveAnimationTargets(): AnimationTargetsResolver {
  const cache = new WeakMap<HTMLElement, ResolvedAnimationTargets>();
  const transforms = new WeakMap<HTMLElement, MutableTransformState>();

  function getTargets(container: HTMLElement): ResolvedAnimationTargets {
    const cached = cache.get(container);

    if (cached !== undefined) {
      return cached;
    }

    const contentTarget = findContentTarget(container);
    const opacityTarget = findOpacityTarget(container, contentTarget);
    const resolvedTargets: ResolvedAnimationTargets = {
      contentTarget,
      opacityTarget,
    };

    cache.set(container, resolvedTargets);

    return resolvedTargets;
  }

  function updateTransform(target: HTMLElement, propertyName: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return;
    }

    const current = transforms.get(target) ?? {};

    switch (propertyName) {
      case 'x':
        current.x = value;
        break;
      case 'y':
        current.y = value;
        break;
      case 'translateX':
        current.translateX = value;
        break;
      case 'translateY':
        current.translateY = value;
        break;
      case 'rotation':
        current.rotation = value;
        break;
      case 'scale':
        current.scale = value;
        break;
      case 'scaleX':
        current.scaleX = value;
        break;
      case 'scaleY':
        current.scaleY = value;
        break;
      default:
        break;
    }

    transforms.set(target, current);
    target.style.transform = composeTransformValue(current);
  }

  return {
    applyStyles(container: HTMLElement, styles: Readonly<Record<string, unknown>>): void {
      const targets = getTargets(container);

      for (const [propertyName, value] of Object.entries(styles)) {
        if (propertyName === 'opacity') {
          targets.opacityTarget.style.opacity = String(value);
          continue;
        }

        if (propertyName === 'content' || propertyName === 'textContent') {
          targets.contentTarget.textContent = String(value);
          continue;
        }

        if (propertyName === 'transform') {
          transforms.delete(targets.contentTarget);
          targets.contentTarget.style.transform = String(value);
          continue;
        }

        if (propertyName === 'd') {
          applyPathValue(targets.contentTarget, String(value));
          continue;
        }

        if (isTransformProperty(propertyName)) {
          updateTransform(targets.contentTarget, propertyName, value);
          continue;
        }

        targets.contentTarget.style.setProperty(toKebabCase(propertyName), String(value));
      }
    },
    invalidate(container: HTMLElement): void {
      cache.delete(container);
    },
    clear(): void {
      /* WeakMap storage clears naturally; no explicit action required. */
    },
  };
}

export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }

  return value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"');
}

function findTimelineByReference(timelines: readonly Timeline[], reference: string): Timeline | null {
  for (const timeline of timelines) {
    if (timeline.id === reference || timeline.name === reference) {
      return timeline;
    }
  }

  return null;
}

function resolveTimelineFromOptions(
  config: ElementAnimationConfig,
  options: SeekTimelineOptions | StopTimelineOptions,
): Timeline | null {
  if (options.timelineId !== undefined) {
    return findTimelineByReference(config.timelines, options.timelineId);
  }

  if (options.timelineName !== undefined) {
    return findTimelineByReference(config.timelines, options.timelineName);
  }

  return config.timelines[0] ?? null;
}

function resolveStateTimeline(config: ElementAnimationConfig, stateName: string): Timeline | null {
  const binding = config.stateTimelineBindings.find((entry) => entry.stateName === stateName);

  if (binding === undefined) {
    return null;
  }

  return findTimelineByReference(config.timelines, binding.timelineId);
}

function getDefaultTimelines(config: ElementAnimationConfig): readonly Timeline[] {
  const inTimeline = resolveStateTimeline(config, 'IN');

  if (inTimeline !== null) {
    return [inTimeline];
  }

  const firstTimeline = config.timelines[0];

  return firstTimeline === undefined ? [] : [firstTimeline];
}

function resolveModifierTimeline(
  config: ElementAnimationConfig,
  modifierName: string,
  kind: 'in' | 'out',
): Timeline | null {
  const binding = config.modifierTimelineBindings.find((entry) => entry.modifierName === modifierName);

  if (binding === undefined) {
    return null;
  }

  const reference = kind === 'in' ? binding.inTimelineId : binding.outTimelineId;

  if (reference === undefined) {
    return null;
  }

  return findTimelineByReference(config.timelines, reference);
}

export function validateAnimationRegistry(registry: readonly AnimationDefinition[]): void {
  for (const entry of registry) {
    const triggeredReferences = new Set<string>();

    for (const binding of entry.config.stateTimelineBindings) {
      triggeredReferences.add(binding.timelineId);
    }

    for (const binding of entry.config.modifierTimelineBindings) {
      triggeredReferences.add(binding.inTimelineId);
      binding.outTimelineId !== undefined && triggeredReferences.add(binding.outTimelineId);
    }

    for (const reference of triggeredReferences) {
      const timeline = findTimelineByReference(entry.config.timelines, reference);

      if (timeline === null) {
        continue;
      }

      for (const keyframe of timeline.keyframes) {
        if (keyframe.action === 'none') {
          continue;
        }

        if (keyframe.target === undefined || keyframe.target === entry.elementId) {
          throw new Error(
            `Circular dependency detected: triggered timeline "${timeline.name}" for element "${entry.elementId}" contains a self-targeting action marker.`,
          );
        }
      }
    }
  }
}

export function parseElementRuntimeState(args: {
  readonly element: HTMLElement;
  readonly config: ElementAnimationConfig;
}): ParsedElementRuntimeState {
  const dataVisibility = args.element.dataset['visibility'];
  const visibility =
    isKnownVisibility(dataVisibility) ? dataVisibility
    : args.element.classList.contains('offscreen') ? 'offscreen'
    : 'onscreen';

  let activeState: string | null = null;

  for (const binding of args.config.stateTimelineBindings) {
    if (args.element.classList.contains(binding.stateName)) {
      activeState = binding.stateName;
      break;
    }
  }

  const modifiers = new Set<string>();

  for (const binding of args.config.modifierTimelineBindings) {
    args.element.classList.contains(binding.modifierName) && modifiers.add(binding.modifierName);
  }

  return {
    visibility,
    activeState,
    modifiers,
  };
}

export function createPlaybackHandle(options: CreatePlaybackHandleOptions): PlaybackHandle {
  let currentTimeMs = 0;
  let isActive = false;
  let isCancelled = false;
  let speed = 1;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let lastTickTimestamp = Date.now();
  let hasCompleted = false;

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function notifyFrame(): void {
    options.onFrame?.(currentTimeMs);
  }

  function scheduleNextTick(): void {
    if (!isActive) {
      return;
    }

    timerId = setTimeout(() => {
      if (!isActive) {
        return;
      }

      const now = Date.now();
      const deltaMs = Math.max(0, now - lastTickTimestamp) * speed;

      lastTickTimestamp = now;

      if (Number.isFinite(options.durationMs)) {
        currentTimeMs = Math.min(options.durationMs, currentTimeMs + deltaMs);
      } else {
        currentTimeMs += deltaMs;
      }

      notifyFrame();

      if (Number.isFinite(options.durationMs) && currentTimeMs >= options.durationMs) {
        isActive = false;
        clearTimer();

        if (!hasCompleted) {
          hasCompleted = true;
          options.onComplete?.();
        }

        return;
      }

      scheduleNextTick();
    }, FRAME_STEP_MS);
  }

  return {
    get currentTimeMs(): number {
      return currentTimeMs;
    },
    get durationMs(): number {
      return options.durationMs;
    },
    get isActive(): boolean {
      return isActive;
    },
    play(): void {
      if (isCancelled || isActive) {
        return;
      }

      if (Number.isFinite(options.durationMs) && currentTimeMs >= options.durationMs) {
        return;
      }

      isActive = true;
      lastTickTimestamp = Date.now();
      scheduleNextTick();
    },
    pause(): void {
      isActive = false;
      clearTimer();
    },
    seek(timeMs: number): void {
      const safeTime = Number.isFinite(timeMs) ? timeMs : 0;

      if (Number.isFinite(options.durationMs)) {
        currentTimeMs = Math.max(0, Math.min(options.durationMs, safeTime));
      } else {
        currentTimeMs = Math.max(0, safeTime);
      }

      hasCompleted = false;
      notifyFrame();
    },
    setSpeed(nextSpeed: number): void {
      if (Number.isFinite(nextSpeed) && nextSpeed > 0) {
        speed = nextSpeed;
      }
    },
    cancel(): void {
      isCancelled = true;
      isActive = false;
      clearTimer();
    },
  };
}

function getHandleKey(elementId: string, timelineId: string): string {
  return `${elementId}:${timelineId}`;
}

function applyVisibility(container: HTMLElement, visibility: VisibilityState): void {
  container.dataset['visibility'] = visibility;

  if (visibility === 'offscreen') {
    container.style.visibility = 'hidden';
    container.style.pointerEvents = 'none';

    return;
  }

  container.style.visibility = 'visible';
  container.style.pointerEvents = 'auto';
}

function syncStateClasses(
  container: HTMLElement,
  config: ElementAnimationConfig,
  activeState: string | null,
  modifiers: ReadonlySet<string>,
): void {
  const contentTarget = findContentTarget(container);
  const stateNames = config.stateTimelineBindings.map((binding) => binding.stateName);
  const modifierNames = config.modifierTimelineBindings.map((binding) => binding.modifierName);
  const targets = container === contentTarget ? [container] : [container, contentTarget];

  for (const target of targets) {
    for (const stateName of stateNames) {
      target.classList.remove(stateName);
    }

    for (const modifierName of modifierNames) {
      target.classList.remove(modifierName);
    }

    activeState !== null && target.classList.add(activeState);

    for (const modifierName of modifiers) {
      target.classList.add(modifierName);
    }
  }
}

function applyTimelineFrameToDom(
  root: HTMLElement,
  targetsResolver: AnimationTargetsResolver,
  runtime: RuntimeRecord,
  frame: TimelineFrame,
): void {
  targetsResolver.applyStyles(runtime.container, frame.properties);
  syncStateClasses(runtime.container, runtime.config, frame.activeState, frame.modifiers);

  for (const [targetId, properties] of Object.entries(frame.targetProperties)) {
    const targetContainer = root.querySelector<HTMLElement>(`[data-element-id="${escapeCssIdentifier(targetId)}"]`);

    if (targetContainer !== null) {
      targetsResolver.applyStyles(targetContainer, properties);
    }
  }
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

  function playResolvedTimeline(elementId: string, timeline: Timeline, onComplete?: () => void): void {
    const handleKey = getHandleKey(elementId, timeline.id);

    cancelHandle(handleKey);

    const durationMs = computeTimelineLoopDuration(timeline);
    const handle = createPlaybackHandle({
      durationMs,
      onFrame(timeMs): void {
        currentTimeMs = timeMs;
        seekTimelineInternal({ elementId, timelineId: timeline.id, timeMs });
      },
      onComplete,
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
              playResolvedTimeline(elementId, inTimeline);
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
          playResolvedTimeline(elementId, outTimeline, () => {
            applyVisibility(runtime.container, 'offscreen');
          });
        }
      }
    }

    if (nextState.activeState !== previousState.activeState) {
      if (previousState.activeState !== null) {
        const previousTimeline = resolveStateTimeline(runtime.config, previousState.activeState);

        previousTimeline !== null && cancelHandle(getHandleKey(elementId, previousTimeline.id));
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
            playResolvedTimeline(elementId, nextTimeline);
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
        playResolvedTimeline(elementId, inTimeline);
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
          playResolvedTimeline(elementId, outTimeline);
        }
      } else if (inTimeline !== null) {
        cancelHandle(getHandleKey(elementId, inTimeline.id));
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

    const timeline = resolveTimelineFromOptions(runtime.config, seekOptions);

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
      applyTimelineFrameToDom(options.root, targetsResolver, runtime, frame);
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
          playResolvedTimeline(entry.elementId, timeline);
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

      const timeline = resolveTimelineFromOptions(runtime.config, stopOptions);

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
