import {
  type EditorStore,
  removeModifierBinding,
  removeStateBinding,
  removeTimeline,
  setModifierBinding,
  setStateBinding,
  toggleModifier,
  upsertTimeline,
} from '@broadset/editor';
import { type BroadsetDocument, type EasingMode, type ElementAnimationConfig, type Timeline } from '@broadset/model';
import { computeTimelineFrame, type PlaybackController } from '@broadset/playback';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import type { RuntimeTimelineOverlay } from '../preview-runtime-overlay';
import { applyAnimationConfigUpdate } from './animation-adapter';
import {
  addTimelineKeyframe,
  changeTimelineKeyframeEasing,
  computeTimelineDurationMs,
  createDemoTimeline,
  duplicateDemoTimeline,
  getNextAvailableBindingName,
  moveTimelineKeyframe,
  removeTimelineReferences,
  snapTimelineOffsetMs,
  updateTimelineById,
} from './animation-editing';

const RESERVED_STATE_BINDINGS = ['IN', 'OUT'] as const;
const TIMELINE_LOOP_EPSILON_MS = 16;

interface UseAnimationEditingOptions {
  readonly currentDocument: BroadsetDocument;
  readonly selectedElementId: string | null;
  readonly editorStore: EditorStore;
  readonly playbackControllerRef: RefObject<PlaybackController | null>;
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly editingTimeline: Timeline | null;
  readonly setEditingTimeline: React.Dispatch<React.SetStateAction<Timeline | null>>;
  readonly setEditingTimelineSelectedKf: React.Dispatch<React.SetStateAction<number | null>>;
}

interface AnimationEditingController {
  readonly activeModifiers: readonly string[];
  readonly activeState: string | null;
  readonly currentTimeMs: number;
  readonly isTimelinePlaying: boolean;
  readonly onAddKeyframe: (offsetMs?: number) => void;
  readonly onAddModifierBinding: () => void;
  readonly onAddStateBinding: () => void;
  readonly onAddTimeline: () => void;
  readonly onChangeEasing: (index: number, easing: EasingMode) => void;
  readonly onDeleteTimeline: (timelineId: string) => void;
  readonly onDuplicateTimeline: (timelineId: string) => void;
  readonly onEditTimeline: (timelineId: string) => void;
  readonly onMoveKeyframe: (index: number, offsetMs: number) => void;
  readonly onPlayTimeline: () => void;
  readonly onQuickSetup: () => void;
  readonly onRemoveModifierBinding: (modifierName: string) => void;
  readonly onRemoveStateBinding: (stateName: string) => void;
  readonly onRenameTimeline: (timelineId: string) => void;
  readonly onSeekTimeline: (timeMs: number) => void;
  readonly onSelectState: (stateName: string | null) => void;
  readonly onStopTimeline: () => void;
  readonly onToggleModifier: (modifierName: string) => void;
  readonly playbackControllerRef: Readonly<RefObject<PlaybackController | null>>;
  readonly registerPlaybackController: (controller: PlaybackController | null) => void;
  readonly runtimeOverlay: RuntimeTimelineOverlay | null;
}

function getAnimationConfig(document: BroadsetDocument, elementId: string | null): ElementAnimationConfig | null {
  if (elementId === null) {
    return null;
  }

  return document.animations.find((animation) => animation.elementId === elementId)?.config ?? null;
}

function getTimelineById(document: BroadsetDocument, elementId: string, timelineId: string): Timeline | null {
  return (
    document.animations
      .find((animation) => animation.elementId === elementId)
      ?.config.timelines.find((timeline) => timeline.id === timelineId) ?? null
  );
}

function ensureStateBindings(config: ElementAnimationConfig, timelineId: string): ElementAnimationConfig {
  let nextConfig = config;

  for (const stateName of RESERVED_STATE_BINDINGS) {
    if (!nextConfig.stateTimelineBindings.some((binding) => binding.stateName === stateName)) {
      nextConfig = setStateBinding(nextConfig, { stateName, timelineId });
    }
  }

  return nextConfig;
}

function computePlaybackTime(timeline: Timeline, elapsedMs: number): number {
  const durationMs = Math.max(computeTimelineDurationMs(timeline), 1);

  if (timeline.loop === 'loop') {
    return elapsedMs % durationMs;
  }

  if (timeline.loop === 'ping-pong') {
    const cycleDurationMs = durationMs * 2;
    const cycleTimeMs = elapsedMs % cycleDurationMs;

    return cycleTimeMs <= durationMs ? cycleTimeMs : cycleDurationMs - cycleTimeMs;
  }

  return Math.min(elapsedMs, durationMs);
}

function findInsertedKeyframeIndex(timeline: Timeline, keyframeBaseName: string, offsetMs: number): number {
  const candidates = timeline.keyframes
    .map((keyframe, index) => ({ index, keyframe }))
    .filter(
      ({ keyframe }) =>
        keyframe.offsetMs === offsetMs &&
        (keyframe.name === keyframeBaseName || keyframe.name.startsWith(`${keyframeBaseName}-`)),
    );
  const populatedCandidate = candidates.find(({ keyframe }) => Object.keys(keyframe.properties).length > 0);

  return populatedCandidate?.index ?? candidates[0]?.index ?? -1;
}

export function useAnimationEditing({
  currentDocument,
  selectedElementId,
  editorStore,
  playbackControllerRef,
  pushToast,
  editingTimeline,
  setEditingTimeline,
  setEditingTimelineSelectedKf,
}: UseAnimationEditingOptions): AnimationEditingController {
  const [activeState, setActiveState] = useState<string | null>(null);
  const [activeModifiers, setActiveModifiers] = useState<readonly string[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
  const [runtimeOverlay, setRuntimeOverlay] = useState<RuntimeTimelineOverlay | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartRef = useRef(0);
  const playbackStartOffsetRef = useRef(0);
  const previousDocumentRef = useRef(currentDocument);
  const previousSelectedElementIdRef = useRef(selectedElementId);
  const editingTimelineRef = useRef<Timeline | null>(editingTimeline);

  editingTimelineRef.current = editingTimeline;

  useEffect(() => {
    editingTimelineRef.current = editingTimeline;
  }, [editingTimeline]);

  const stopPlaybackLoop = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const applyConfigUpdate = useCallback(
    (updater: (config: ElementAnimationConfig) => ElementAnimationConfig): ElementAnimationConfig | null => {
      if (selectedElementId === null) {
        pushToast('info', 'Select an element before editing animations.');

        return null;
      }

      return applyAnimationConfigUpdate(editorStore, selectedElementId, updater);
    },
    [editorStore, pushToast, selectedElementId],
  );

  const seekTimeline = useCallback(
    (timeline: Timeline | null, timeMs: number): void => {
      if (timeline === null || selectedElementId === null) {
        return;
      }

      const clampedTimeMs = Math.max(0, Math.min(timeMs, computeTimelineDurationMs(timeline)));

      setRuntimeOverlay({
        elementId: selectedElementId,
        frame: computeTimelineFrame({ timeline, timeMs: clampedTimeMs }),
      });
      setCurrentTimeMs(clampedTimeMs);
    },
    [selectedElementId],
  );

  const resetTimelinePlayback = useCallback((): void => {
    stopPlaybackLoop();
    setIsTimelinePlaying(false);
    setCurrentTimeMs(0);
    setRuntimeOverlay(null);
  }, [stopPlaybackLoop]);

  const clearEditedTimelinePreview = useCallback((): void => {
    resetTimelinePlayback();
    setEditingTimeline(null);
    setEditingTimelineSelectedKf(null);
  }, [resetTimelinePlayback, setEditingTimeline, setEditingTimelineSelectedKf]);

  const stopTimelinePreviewLoop = useCallback((): void => {
    stopPlaybackLoop();
    setIsTimelinePlaying(false);
  }, [stopPlaybackLoop]);

  useEffect(() => {
    const previousSelectedElementId = previousSelectedElementIdRef.current;

    if (previousSelectedElementId === selectedElementId) {
      return;
    }

    previousSelectedElementIdRef.current = selectedElementId;
    setActiveState(null);
    setActiveModifiers([]);
    resetTimelinePlayback();
    setEditingTimeline(null);
    setEditingTimelineSelectedKf(null);
  }, [resetTimelinePlayback, selectedElementId, setEditingTimeline, setEditingTimelineSelectedKf]);

  useEffect(() => {
    if (editingTimeline === null) {
      resetTimelinePlayback();
    }
  }, [editingTimeline, resetTimelinePlayback]);

  useEffect(() => {
    const previousDocument = previousDocumentRef.current;

    previousDocumentRef.current = currentDocument;

    if (previousDocument === currentDocument || runtimeOverlay === null) {
      return;
    }

    const nextTimeline = getTimelineById(currentDocument, runtimeOverlay.elementId, runtimeOverlay.frame.timelineId);

    if (nextTimeline === null) {
      resetTimelinePlayback();

      return;
    }

    const clampedTimeMs = Math.max(0, Math.min(runtimeOverlay.frame.timeMs, computeTimelineDurationMs(nextTimeline)));

    setRuntimeOverlay({
      elementId: runtimeOverlay.elementId,
      frame: computeTimelineFrame({ timeline: nextTimeline, timeMs: clampedTimeMs }),
    });
    setCurrentTimeMs(clampedTimeMs);
  }, [currentDocument, resetTimelinePlayback, runtimeOverlay]);

  useEffect(() => {
    if (editingTimeline === null || selectedElementId === null) {
      return;
    }

    const nextTimeline =
      getAnimationConfig(currentDocument, selectedElementId)?.timelines.find(
        (timeline) => timeline.id === editingTimeline.id,
      ) ?? null;

    if (nextTimeline === null) {
      resetTimelinePlayback();
      setEditingTimeline(null);
      setEditingTimelineSelectedKf(null);

      return;
    }

    if (nextTimeline !== editingTimeline) {
      setEditingTimeline(nextTimeline);
    }
  }, [
    currentDocument,
    editingTimeline,
    resetTimelinePlayback,
    selectedElementId,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
  ]);

  useEffect(() => {
    return () => {
      stopPlaybackLoop();
    };
  }, [stopPlaybackLoop]);

  const onAddTimeline = useCallback((): void => {
    const nextTimeline = createDemoTimeline(
      `Timeline ${String((getAnimationConfig(currentDocument, selectedElementId)?.timelines.length ?? 0) + 1)}`,
    );

    applyConfigUpdate((config) => upsertTimeline(config, nextTimeline));
    stopTimelinePreviewLoop();
    setEditingTimeline(nextTimeline);
    setEditingTimelineSelectedKf(null);
    setCurrentTimeMs(0);
    setRuntimeOverlay(null);
    pushToast('success', `Added ${nextTimeline.name}.`);
  }, [
    applyConfigUpdate,
    currentDocument,
    pushToast,
    selectedElementId,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
    stopTimelinePreviewLoop,
  ]);

  const onEditTimeline = useCallback(
    (timelineId: string): void => {
      const timeline = getAnimationConfig(currentDocument, selectedElementId)?.timelines.find(
        (entry) => entry.id === timelineId,
      );

      if (timeline === undefined) {
        return;
      }

      resetTimelinePlayback();
      setEditingTimeline(timeline);
      setEditingTimelineSelectedKf(null);
    },
    [currentDocument, resetTimelinePlayback, selectedElementId, setEditingTimeline, setEditingTimelineSelectedKf],
  );

  const onDeleteTimeline = useCallback(
    (timelineId: string): void => {
      const removedTimeline = getAnimationConfig(currentDocument, selectedElementId)?.timelines.find(
        (timeline) => timeline.id === timelineId,
      );

      applyConfigUpdate((config) => removeTimelineReferences(removeTimeline(config, timelineId), timelineId));

      if (editingTimeline?.id === timelineId) {
        resetTimelinePlayback();
        setEditingTimeline(null);
        setEditingTimelineSelectedKf(null);
      }

      if (removedTimeline !== undefined) {
        pushToast('success', `Deleted ${removedTimeline.name}.`);
      }
    },
    [
      applyConfigUpdate,
      currentDocument,
      editingTimeline?.id,
      pushToast,
      resetTimelinePlayback,
      selectedElementId,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
    ],
  );

  const onDuplicateTimeline = useCallback(
    (timelineId: string): void => {
      const sourceTimeline = getAnimationConfig(currentDocument, selectedElementId)?.timelines.find(
        (timeline) => timeline.id === timelineId,
      );

      if (sourceTimeline === undefined) {
        return;
      }

      const duplicate = duplicateDemoTimeline(sourceTimeline, `${sourceTimeline.name} Copy`);

      stopTimelinePreviewLoop();
      applyConfigUpdate((config) => upsertTimeline(config, duplicate));
      pushToast('success', `Duplicated ${sourceTimeline.name}.`);
    },
    [applyConfigUpdate, currentDocument, pushToast, selectedElementId, stopTimelinePreviewLoop],
  );

  const onRenameTimeline = useCallback(
    (timelineId: string): void => {
      const sourceTimeline = getAnimationConfig(currentDocument, selectedElementId)?.timelines.find(
        (timeline) => timeline.id === timelineId,
      );

      if (sourceTimeline === undefined) {
        return;
      }

      const nextName = window.prompt('Rename timeline:', sourceTimeline.name)?.trim();

      if (nextName === undefined || nextName === '') {
        return;
      }

      stopTimelinePreviewLoop();
      applyConfigUpdate((config) =>
        updateTimelineById(config, timelineId, (timeline) => ({ ...timeline, name: nextName })),
      );
      pushToast('success', `Renamed timeline to ${nextName}.`);
    },
    [applyConfigUpdate, currentDocument, pushToast, selectedElementId, stopTimelinePreviewLoop],
  );

  const onQuickSetup = useCallback((): void => {
    const introTimeline = createDemoTimeline('Intro');
    const outroTimeline = createDemoTimeline('Outro');

    applyConfigUpdate((config) => {
      let nextConfig = upsertTimeline(config, introTimeline);

      nextConfig = upsertTimeline(nextConfig, outroTimeline);
      nextConfig = setStateBinding(nextConfig, { stateName: 'IN', timelineId: introTimeline.id });

      return setStateBinding(nextConfig, { stateName: 'OUT', timelineId: outroTimeline.id });
    });
    pushToast('success', 'Added intro and outro timelines.');
  }, [applyConfigUpdate, pushToast]);

  const onAddStateBinding = useCallback((): void => {
    const config = getAnimationConfig(currentDocument, selectedElementId);
    const baseTimeline = config?.timelines[0] ?? createDemoTimeline('Timeline 1');
    const usedStates = new Set((config?.stateTimelineBindings ?? []).map((binding) => binding.stateName));
    const nextState = getNextAvailableBindingName(['LIVE', 'HIGHLIGHT', 'BREAKING'], usedStates);

    applyConfigUpdate((inputConfig) => {
      let nextConfig = inputConfig;

      if (inputConfig.timelines.length === 0) {
        nextConfig = upsertTimeline(nextConfig, baseTimeline);
      }

      nextConfig = ensureStateBindings(nextConfig, baseTimeline.id);

      return nextState === null ? nextConfig : (
          setStateBinding(nextConfig, { stateName: nextState, timelineId: baseTimeline.id })
        );
    });

    if (nextState === null) {
      pushToast('info', 'All demo states already have bindings.');

      return;
    }

    pushToast('success', `Added ${nextState} state binding.`);
  }, [applyConfigUpdate, currentDocument, pushToast, selectedElementId]);

  const onRemoveStateBinding = useCallback(
    (stateName: string): void => {
      applyConfigUpdate((config) => removeStateBinding(config, stateName));

      if (activeState === stateName) {
        setActiveState(null);
        clearEditedTimelinePreview();
      }

      pushToast('success', `Removed ${stateName} state binding.`);
    },
    [activeState, applyConfigUpdate, clearEditedTimelinePreview, pushToast],
  );

  const onAddModifierBinding = useCallback((): void => {
    const config = getAnimationConfig(currentDocument, selectedElementId);
    const baseTimeline = config?.timelines[0] ?? createDemoTimeline('Timeline 1');
    const usedModifiers = new Set((config?.modifierTimelineBindings ?? []).map((binding) => binding.modifierName));
    const nextModifier = getNextAvailableBindingName(['hover', 'focus', 'active'], usedModifiers);

    if (nextModifier === null) {
      pushToast('info', 'All demo modifiers already have bindings.');

      return;
    }

    applyConfigUpdate((inputConfig) => {
      const nextConfig = inputConfig.timelines.length === 0 ? upsertTimeline(inputConfig, baseTimeline) : inputConfig;

      return setModifierBinding(nextConfig, { modifierName: nextModifier, inTimelineId: baseTimeline.id });
    });
    pushToast('success', `Added ${nextModifier} modifier binding.`);
  }, [applyConfigUpdate, currentDocument, pushToast, selectedElementId]);

  const onRemoveModifierBinding = useCallback(
    (modifierName: string): void => {
      applyConfigUpdate((config) => removeModifierBinding(config, modifierName));
      setActiveModifiers((modifiers) => modifiers.filter((modifier) => modifier !== modifierName));

      if (activeModifiers.includes(modifierName)) {
        clearEditedTimelinePreview();
      }

      pushToast('success', `Removed ${modifierName} modifier binding.`);
    },
    [activeModifiers, applyConfigUpdate, clearEditedTimelinePreview, pushToast],
  );

  const onAddKeyframe = useCallback(
    (offsetMs?: number): void => {
      if (editingTimeline === null) {
        return;
      }

      stopTimelinePreviewLoop();

      const keyframeOffsetMs = Math.max(0, offsetMs ?? currentTimeMs);
      const snappedOffsetMs = snapTimelineOffsetMs(keyframeOffsetMs);
      const nextKeyframeName = `keyframe-${String(editingTimeline.keyframes.length + 1)}`;
      const nextConfig = applyConfigUpdate((config) =>
        updateTimelineById(config, editingTimeline.id, (timeline) => addTimelineKeyframe(timeline, keyframeOffsetMs)),
      );
      const nextTimeline = nextConfig?.timelines.find((timeline) => timeline.id === editingTimeline.id) ?? null;

      if (nextTimeline !== null) {
        const insertedIndex = findInsertedKeyframeIndex(nextTimeline, nextKeyframeName, snappedOffsetMs);

        setEditingTimeline(nextTimeline);
        setEditingTimelineSelectedKf(insertedIndex === -1 ? nextTimeline.keyframes.length - 1 : insertedIndex);
        seekTimeline(nextTimeline, snappedOffsetMs);
      }
    },
    [
      applyConfigUpdate,
      currentTimeMs,
      editingTimeline,
      seekTimeline,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
      stopTimelinePreviewLoop,
    ],
  );

  const onMoveKeyframe = useCallback(
    (index: number, offsetMs: number): void => {
      if (editingTimeline === null) {
        return;
      }

      stopTimelinePreviewLoop();

      const sourceKeyframe = editingTimeline.keyframes[index];
      const nextConfig = applyConfigUpdate((config) =>
        updateTimelineById(config, editingTimeline.id, (timeline) => moveTimelineKeyframe(timeline, index, offsetMs)),
      );
      const nextTimeline = nextConfig?.timelines.find((timeline) => timeline.id === editingTimeline.id) ?? null;

      if (nextTimeline !== null) {
        const selectedIndex =
          sourceKeyframe === undefined ? -1 : (
            nextTimeline.keyframes.findIndex(
              (keyframe) =>
                keyframe.name === sourceKeyframe.name &&
                keyframe.action === sourceKeyframe.action &&
                keyframe.offsetMs === Math.max(0, offsetMs),
            )
          );

        setEditingTimeline(nextTimeline);
        setEditingTimelineSelectedKf(selectedIndex === -1 ? index : selectedIndex);
        seekTimeline(nextTimeline, Math.min(offsetMs, computeTimelineDurationMs(nextTimeline)));
      }
    },
    [
      applyConfigUpdate,
      editingTimeline,
      seekTimeline,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
      stopTimelinePreviewLoop,
    ],
  );

  const onChangeEasing = useCallback(
    (index: number, easing: EasingMode): void => {
      if (editingTimeline === null) {
        return;
      }

      stopTimelinePreviewLoop();

      const nextConfig = applyConfigUpdate((config) =>
        updateTimelineById(config, editingTimeline.id, (timeline) =>
          changeTimelineKeyframeEasing(timeline, index, easing),
        ),
      );
      const nextTimeline = nextConfig?.timelines.find((timeline) => timeline.id === editingTimeline.id) ?? null;

      if (nextTimeline !== null) {
        setEditingTimeline(nextTimeline);
        seekTimeline(nextTimeline, currentTimeMs);
      }
    },
    [applyConfigUpdate, currentTimeMs, editingTimeline, seekTimeline, setEditingTimeline, stopTimelinePreviewLoop],
  );

  const onSeekTimeline = useCallback(
    (timeMs: number): void => {
      stopPlaybackLoop();
      setIsTimelinePlaying(false);
      seekTimeline(editingTimeline, timeMs);
    },
    [editingTimeline, seekTimeline, stopPlaybackLoop],
  );

  const onPlayTimeline = useCallback((): void => {
    if (editingTimeline === null || selectedElementId === null) {
      return;
    }

    const durationMs = Math.max(computeTimelineDurationMs(editingTimeline), 1);
    const shouldRestartFromStart =
      editingTimeline.loop === 'none' && currentTimeMs + TIMELINE_LOOP_EPSILON_MS >= durationMs;

    if (shouldRestartFromStart) {
      seekTimeline(editingTimeline, 0);
    }

    stopPlaybackLoop();
    playbackStartRef.current = performance.now();
    playbackStartOffsetRef.current = shouldRestartFromStart ? 0 : currentTimeMs;
    setIsTimelinePlaying(true);

    const step = (frameTimeMs: number): void => {
      const currentTimeline = editingTimelineRef.current;

      if (currentTimeline === null) {
        setIsTimelinePlaying(false);
        animationFrameRef.current = null;

        return;
      }

      const elapsedMs = Math.max(0, frameTimeMs - playbackStartRef.current) + playbackStartOffsetRef.current;
      const nextTimeMs = computePlaybackTime(currentTimeline, elapsedMs);

      setRuntimeOverlay({
        elementId: selectedElementId,
        frame: computeTimelineFrame({ timeline: currentTimeline, timeMs: nextTimeMs }),
      });
      setCurrentTimeMs(nextTimeMs);

      const shouldContinue =
        currentTimeline.loop !== 'none' ||
        elapsedMs + TIMELINE_LOOP_EPSILON_MS < computeTimelineDurationMs(currentTimeline);

      if (!shouldContinue) {
        setIsTimelinePlaying(false);
        animationFrameRef.current = null;

        return;
      }

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, [currentTimeMs, editingTimeline, selectedElementId, stopPlaybackLoop]);

  const onStopTimeline = useCallback((): void => {
    resetTimelinePlayback();
  }, [resetTimelinePlayback]);

  const onSelectState = useCallback(
    (stateName: string | null): void => {
      setActiveState(stateName);

      if (stateName === null) {
        clearEditedTimelinePreview();

        return;
      }

      const config = getAnimationConfig(currentDocument, selectedElementId);
      const timelineId = config?.stateTimelineBindings.find((binding) => binding.stateName === stateName)?.timelineId;
      const timeline = config?.timelines.find((entry) => entry.id === timelineId);

      if (timeline === undefined) {
        clearEditedTimelinePreview();

        return;
      }

      stopTimelinePreviewLoop();
      setEditingTimeline(timeline);
      setEditingTimelineSelectedKf(null);
      seekTimeline(timeline, 0);
    },
    [
      clearEditedTimelinePreview,
      currentDocument,
      seekTimeline,
      selectedElementId,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
      stopTimelinePreviewLoop,
    ],
  );

  const onToggleModifier = useCallback(
    (modifierName: string): void => {
      const nextModifiers = toggleModifier(activeModifiers, modifierName);

      setActiveModifiers(nextModifiers);

      const config = getAnimationConfig(currentDocument, selectedElementId);
      const binding = config?.modifierTimelineBindings.find((entry) => entry.modifierName === modifierName);

      if (binding === undefined) {
        clearEditedTimelinePreview();

        return;
      }

      const isEnabled = nextModifiers.includes(modifierName);
      const timelineId = isEnabled ? binding.inTimelineId : binding.outTimelineId;
      const timeline = config?.timelines.find((entry) => entry.id === timelineId);

      if (timeline === undefined) {
        clearEditedTimelinePreview();

        return;
      }

      stopTimelinePreviewLoop();
      setEditingTimeline(timeline);
      setEditingTimelineSelectedKf(null);
      seekTimeline(timeline, 0);
    },
    [
      activeModifiers,
      clearEditedTimelinePreview,
      currentDocument,
      seekTimeline,
      selectedElementId,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
      stopTimelinePreviewLoop,
    ],
  );

  const registerPlaybackController = useCallback((controller: PlaybackController | null): void => {
    playbackControllerRef.current = controller;
  }, []);
  const effectiveRuntimeOverlay =
    (
      runtimeOverlay !== null &&
      editingTimeline !== null &&
      runtimeOverlay.elementId === selectedElementId &&
      runtimeOverlay.frame.timelineId === editingTimeline.id
    ) ?
      runtimeOverlay
    : null;

  return {
    activeModifiers,
    activeState,
    currentTimeMs,
    isTimelinePlaying,
    onAddKeyframe,
    onAddModifierBinding,
    onAddStateBinding,
    onAddTimeline,
    onChangeEasing,
    onDeleteTimeline,
    onDuplicateTimeline,
    onEditTimeline,
    onMoveKeyframe,
    onPlayTimeline,
    onQuickSetup,
    onRemoveModifierBinding,
    onRemoveStateBinding,
    onRenameTimeline,
    onSeekTimeline,
    onSelectState,
    onStopTimeline,
    onToggleModifier,
    playbackControllerRef,
    registerPlaybackController,
    runtimeOverlay: effectiveRuntimeOverlay,
  };
}
