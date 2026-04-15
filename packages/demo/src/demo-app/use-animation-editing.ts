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
import type { PlaybackController } from '@broadset/playback';
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

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

export interface AnimationEditingController {
  readonly activeModifiers: readonly string[];
  readonly activeState: string | null;
  readonly currentTimeMs: number;
  readonly isTimelinePlaying: boolean;
  readonly onAddKeyframe: () => void;
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
}

function getAnimationConfig(document: BroadsetDocument, elementId: string | null): ElementAnimationConfig | null {
  if (elementId === null) {
    return null;
  }

  return document.animations.find((animation) => animation.elementId === elementId)?.config ?? null;
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
  const animationFrameRef = useRef<number | null>(null);
  const playbackStartRef = useRef(0);
  const playbackStartOffsetRef = useRef(0);

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

      playbackControllerRef.current?.seekTimeline({
        elementId: selectedElementId,
        timelineId: timeline.id,
        timeMs: clampedTimeMs,
      });
      setCurrentTimeMs(clampedTimeMs);
    },
    [selectedElementId],
  );

  const resetTimelinePlayback = useCallback((): void => {
    stopPlaybackLoop();
    setIsTimelinePlaying(false);
    setCurrentTimeMs(0);

    if (editingTimeline !== null && selectedElementId !== null) {
      playbackControllerRef.current?.stopTimeline({ elementId: selectedElementId, timelineId: editingTimeline.id });
      playbackControllerRef.current?.seekTimeline({
        elementId: selectedElementId,
        timelineId: editingTimeline.id,
        timeMs: 0,
      });
    }
  }, [editingTimeline, selectedElementId, stopPlaybackLoop]);

  useEffect(() => {
    if (selectedElementId === null) {
      setActiveState(null);
      setActiveModifiers([]);
      resetTimelinePlayback();
      setEditingTimeline(null);
      setEditingTimelineSelectedKf(null);
    }
  }, [resetTimelinePlayback, selectedElementId, setEditingTimeline, setEditingTimelineSelectedKf]);

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
    setEditingTimeline(nextTimeline);
    setEditingTimelineSelectedKf(null);
    setCurrentTimeMs(0);
    setIsTimelinePlaying(false);
    pushToast('success', `Added ${nextTimeline.name}.`);
  }, [
    applyConfigUpdate,
    currentDocument,
    pushToast,
    selectedElementId,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
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

      applyConfigUpdate((config) => upsertTimeline(config, duplicate));
      pushToast('success', `Duplicated ${sourceTimeline.name}.`);
    },
    [applyConfigUpdate, currentDocument, pushToast, selectedElementId],
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

      applyConfigUpdate((config) =>
        updateTimelineById(config, timelineId, (timeline) => ({ ...timeline, name: nextName })),
      );
      pushToast('success', `Renamed timeline to ${nextName}.`);
    },
    [applyConfigUpdate, currentDocument, pushToast, selectedElementId],
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
      }

      pushToast('success', `Removed ${stateName} state binding.`);
    },
    [activeState, applyConfigUpdate, pushToast],
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
      pushToast('success', `Removed ${modifierName} modifier binding.`);
    },
    [applyConfigUpdate, pushToast],
  );

  const onAddKeyframe = useCallback((): void => {
    if (editingTimeline === null) {
      return;
    }

    const nextConfig = applyConfigUpdate((config) =>
      updateTimelineById(config, editingTimeline.id, (timeline) => addTimelineKeyframe(timeline)),
    );
    const nextTimeline = nextConfig?.timelines.find((timeline) => timeline.id === editingTimeline.id) ?? null;

    if (nextTimeline !== null) {
      setEditingTimeline(nextTimeline);
      setEditingTimelineSelectedKf(nextTimeline.keyframes.length - 1);
      seekTimeline(nextTimeline, currentTimeMs);
    }
  }, [
    applyConfigUpdate,
    currentTimeMs,
    editingTimeline,
    seekTimeline,
    setEditingTimeline,
    setEditingTimelineSelectedKf,
  ]);

  const onMoveKeyframe = useCallback(
    (index: number, offsetMs: number): void => {
      if (editingTimeline === null) {
        return;
      }

      const nextConfig = applyConfigUpdate((config) =>
        updateTimelineById(config, editingTimeline.id, (timeline) => moveTimelineKeyframe(timeline, index, offsetMs)),
      );
      const nextTimeline = nextConfig?.timelines.find((timeline) => timeline.id === editingTimeline.id) ?? null;

      if (nextTimeline !== null) {
        setEditingTimeline(nextTimeline);
        seekTimeline(nextTimeline, Math.min(offsetMs, computeTimelineDurationMs(nextTimeline)));
      }
    },
    [applyConfigUpdate, editingTimeline, seekTimeline, setEditingTimeline],
  );

  const onChangeEasing = useCallback(
    (index: number, easing: EasingMode): void => {
      if (editingTimeline === null) {
        return;
      }

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
    [applyConfigUpdate, currentTimeMs, editingTimeline, seekTimeline, setEditingTimeline],
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
      const elapsedMs = Math.max(0, frameTimeMs - playbackStartRef.current) + playbackStartOffsetRef.current;
      const nextTimeMs = computePlaybackTime(editingTimeline, elapsedMs);

      playbackControllerRef.current?.seekTimeline({
        elementId: selectedElementId,
        timelineId: editingTimeline.id,
        timeMs: nextTimeMs,
      });
      setCurrentTimeMs(nextTimeMs);

      const shouldContinue =
        editingTimeline.loop !== 'none' ||
        elapsedMs + TIMELINE_LOOP_EPSILON_MS < computeTimelineDurationMs(editingTimeline);

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
        resetTimelinePlayback();

        return;
      }

      const config = getAnimationConfig(currentDocument, selectedElementId);
      const timelineId = config?.stateTimelineBindings.find((binding) => binding.stateName === stateName)?.timelineId;
      const timeline = config?.timelines.find((entry) => entry.id === timelineId);

      if (timeline !== undefined) {
        seekTimeline(timeline, 0);
      }
    },
    [currentDocument, resetTimelinePlayback, seekTimeline, selectedElementId],
  );

  const onToggleModifier = useCallback(
    (modifierName: string): void => {
      const nextModifiers = toggleModifier(activeModifiers, modifierName);

      setActiveModifiers(nextModifiers);

      const config = getAnimationConfig(currentDocument, selectedElementId);
      const binding = config?.modifierTimelineBindings.find((entry) => entry.modifierName === modifierName);

      if (binding === undefined) {
        return;
      }

      const isEnabled = nextModifiers.includes(modifierName);
      const timelineId = isEnabled ? binding.inTimelineId : binding.outTimelineId;
      const timeline = config?.timelines.find((entry) => entry.id === timelineId);

      if (timeline !== undefined) {
        seekTimeline(timeline, 0);
      }
    },
    [activeModifiers, currentDocument, seekTimeline, selectedElementId],
  );

  const registerPlaybackController = useCallback((controller: PlaybackController | null): void => {
    playbackControllerRef.current = controller;
  }, []);

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
  };
}
