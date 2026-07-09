/** @vitest-environment jsdom */

import { createEditorStore } from '@broadset/editor';
import {
  type BroadsetDocument,
  createDefaultAnimationConfig,
  createDefaultElement,
  createEmptyBroadsetDocument,
  type ElementAnimationConfig,
  type Keyframe,
  type Timeline,
} from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { act, renderHook } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useAnimationEditing } from './use-animation-editing';

const ELEMENT_ID = 'animated-element';

function makeKeyframe(name: string, offsetMs: number, opacity: number): Keyframe {
  return {
    name,
    offsetMs,
    action: 'none',
    properties: {
      opacity: { type: 'number', value: opacity, easing: 'linear' },
    },
  };
}

function makeTargetKeyframe(name: string, offsetMs: number, target: string, opacity: number): Keyframe {
  return {
    ...makeKeyframe(name, offsetMs, opacity),
    target,
  };
}

function makeTimeline(id: string, name: string, opacity = 0.5): Timeline {
  return {
    id,
    name,
    durationMs: 1000,
    loop: 'none',
    loopCount: null,
    childTimelines: [],
    audioCues: [],
    keyframes: [makeKeyframe('Start', 0, opacity), makeKeyframe('End', 1000, opacity)],
  };
}

function makeDocument(config: ElementAnimationConfig): BroadsetDocument {
  const baseDocument = createEmptyBroadsetDocument();
  const element = createDefaultElement('rectangle', { id: ELEMENT_ID });

  return {
    ...baseDocument,
    elements: [element],
    animations: [{ elementId: ELEMENT_ID, config }],
  };
}

function makeConfig(overrides: Partial<ElementAnimationConfig>): ElementAnimationConfig {
  return {
    ...createDefaultAnimationConfig(),
    ...overrides,
  };
}

function renderAnimationEditingHook(
  currentDocument: BroadsetDocument,
  options: { readonly initialEditingTimeline?: Timeline | null | undefined } = {},
) {
  const editorStore = createEditorStore();
  const pushToast = vi.fn<(severity: 'error' | 'info' | 'success', message: string) => void>();

  editorStore.setState({ document: currentDocument });

  return renderHook(() => {
    const [storeDocument, setStoreDocument] = useState(() => editorStore.getState().document);
    const playbackControllerRef = useRef<PlaybackController | null>(null);
    const [editingTimeline, setEditingTimeline] = useState<Timeline | null>(options.initialEditingTimeline ?? null);
    const [editingTimelineSelectedKf, setEditingTimelineSelectedKf] = useState<number | null>(0);

    useEffect(
      () =>
        editorStore.subscribe((state) => {
          setStoreDocument(state.document);
        }),
      [],
    );

    const controller = useAnimationEditing({
      currentDocument: storeDocument,
      selectedElementId: ELEMENT_ID,
      editorStore,
      playbackControllerRef,
      pushToast,
      editingTimeline,
      setEditingTimeline,
      setEditingTimelineSelectedKf,
    });

    return { controller, editorStore, editingTimeline, editingTimelineSelectedKf, setEditingTimeline };
  });
}

describe('useAnimationEditing', () => {
  /** @description Selecting a state with no bound timeline must clear stale preview/editing state instead of leaving the prior state animation visible. */
  it('clears stale runtime overlay when selecting an unbound state', () => {
    const inTimeline = makeTimeline('tl-in', 'In', 0.25);
    const document = makeDocument(
      makeConfig({
        timelines: [inTimeline],
        stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
      }),
    );
    const { result } = renderAnimationEditingHook(document);

    act(() => {
      result.current.controller.onSelectState('IN');
    });

    expect(result.current.controller.runtimeOverlay?.frame.timelineId).toBe('tl-in');
    expect(result.current.editingTimeline?.id).toBe('tl-in');

    act(() => {
      result.current.controller.onSelectState('LOOP');
    });

    expect(result.current.controller.activeState).toBe('LOOP');
    expect(result.current.controller.runtimeOverlay).toBeNull();
    expect(result.current.editingTimeline).toBeNull();
    expect(result.current.editingTimelineSelectedKf).toBeNull();
  });

  /** @description Removing the currently previewed state binding must clear the state preview immediately even if the timeline still exists. */
  it('clears stale runtime overlay when removing the active state binding', () => {
    const inTimeline = makeTimeline('tl-in', 'In', 0.25);
    const document = makeDocument(
      makeConfig({
        timelines: [inTimeline],
        stateTimelineBindings: [{ stateName: 'IN', timelineId: 'tl-in' }],
      }),
    );
    const { result } = renderAnimationEditingHook(document);

    act(() => {
      result.current.controller.onSelectState('IN');
    });

    expect(result.current.controller.runtimeOverlay?.frame.timelineId).toBe('tl-in');

    act(() => {
      result.current.controller.onRemoveStateBinding('IN');
    });

    expect(result.current.controller.activeState).toBeNull();
    expect(result.current.controller.runtimeOverlay).toBeNull();
    expect(result.current.editingTimeline).toBeNull();
    expect(result.current.editingTimelineSelectedKf).toBeNull();
  });

  /** @description Disabling a modifier with no OUT timeline must clear the IN preview so modifier state cannot leak after the user turns it off. */
  it('clears stale runtime overlay when disabling a modifier with no out timeline', () => {
    const hoverTimeline = makeTimeline('tl-hover-in', 'Hover In', 0.4);
    const document = makeDocument(
      makeConfig({
        timelines: [hoverTimeline],
        modifierTimelineBindings: [{ modifierName: 'hover', inTimelineId: 'tl-hover-in' }],
      }),
    );
    const { result } = renderAnimationEditingHook(document);

    act(() => {
      result.current.controller.onToggleModifier('hover');
    });

    expect(result.current.controller.activeModifiers).toEqual(['hover']);
    expect(result.current.controller.runtimeOverlay?.frame.timelineId).toBe('tl-hover-in');
    expect(result.current.editingTimeline?.id).toBe('tl-hover-in');

    act(() => {
      result.current.controller.onToggleModifier('hover');
    });

    expect(result.current.controller.activeModifiers).toEqual([]);
    expect(result.current.controller.runtimeOverlay).toBeNull();
    expect(result.current.editingTimeline).toBeNull();
    expect(result.current.editingTimelineSelectedKf).toBeNull();
  });

  /** @description Removing the currently previewed modifier binding must clear the modifier preview immediately even if the timeline still exists. */
  it('clears stale runtime overlay when removing the active modifier binding', () => {
    const hoverTimeline = makeTimeline('tl-hover-in', 'Hover In', 0.4);
    const document = makeDocument(
      makeConfig({
        timelines: [hoverTimeline],
        modifierTimelineBindings: [{ modifierName: 'hover', inTimelineId: 'tl-hover-in' }],
      }),
    );
    const { result } = renderAnimationEditingHook(document);

    act(() => {
      result.current.controller.onToggleModifier('hover');
    });

    expect(result.current.controller.runtimeOverlay?.frame.timelineId).toBe('tl-hover-in');

    act(() => {
      result.current.controller.onRemoveModifierBinding('hover');
    });

    expect(result.current.controller.activeModifiers).toEqual([]);
    expect(result.current.controller.runtimeOverlay).toBeNull();
    expect(result.current.editingTimeline).toBeNull();
    expect(result.current.editingTimelineSelectedKf).toBeNull();
  });

  /** @description Playback preview must use the latest edited timeline object on each animation frame so keyframe edits do not flicker back to stale values while playing. */
  it('uses the latest editing timeline inside an already-running preview loop', () => {
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    const callbacks: FrameRequestCallback[] = [];
    const initialTimeline = makeTimeline('tl-live', 'Live', 0.2);
    const updatedTimeline = makeTimeline('tl-live', 'Live', 0.8);
    const document = makeDocument(makeConfig({ timelines: [initialTimeline] }));
    const { result } = renderAnimationEditingHook(document, { initialEditingTimeline: initialTimeline });

    globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      callbacks.push(callback);

      return callbacks.length;
    };

    globalThis.cancelAnimationFrame = vi.fn() as typeof cancelAnimationFrame;

    try {
      act(() => {
        result.current.controller.onPlayTimeline();
      });

      act(() => {
        result.current.editorStore.getState().updateElementAnimationConfig(ELEMENT_ID, (config) => ({
          ...config,
          timelines: [updatedTimeline],
        }));
        result.current.setEditingTimeline(updatedTimeline);
      });

      act(() => {
        callbacks[0]?.(performance.now() + 100);
      });

      expect(result.current.controller.runtimeOverlay?.frame.properties['opacity']).toBe(0.8);
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  /** @description Closing the edited timeline must make the public runtime overlay disappear immediately, before passive cleanup effects run. */
  it('hides runtime overlay immediately when the edited timeline closes', () => {
    const timeline = makeTimeline('tl-close', 'Close', 0.2);
    const document = makeDocument(makeConfig({ timelines: [timeline] }));
    const { result } = renderAnimationEditingHook(document, { initialEditingTimeline: timeline });

    act(() => {
      result.current.controller.onSeekTimeline(500);
    });

    expect(result.current.controller.runtimeOverlay?.frame.timelineId).toBe('tl-close');

    act(() => {
      result.current.setEditingTimeline(null);
    });

    expect(result.current.controller.runtimeOverlay).toBeNull();
  });

  /** @description Adding a keyframe at an unsnapped playhead time must select and seek the snapped inserted keyframe. */
  it('selects the snapped inserted keyframe when adding at an unsnapped offset', () => {
    const timeline = makeTimeline('tl-snap', 'Snap', 0.2);
    const document = makeDocument(makeConfig({ timelines: [timeline] }));
    const { result } = renderAnimationEditingHook(document, { initialEditingTimeline: timeline });

    act(() => {
      result.current.controller.onAddKeyframe(153);
    });

    expect(result.current.editingTimeline?.keyframes.at(1)?.offsetMs).toBe(200);
    expect(result.current.editingTimelineSelectedKf).toBe(1);
    expect(result.current.controller.currentTimeMs).toBe(200);
  });

  /** @description Target-only timeline inserts must select the populated target keyframe rather than an empty owner shell. */
  it('selects the populated target keyframe when adding to a target-only timeline', () => {
    const timeline = {
      ...makeTimeline('tl-targeted', 'Targeted'),
      keyframes: [
        makeTargetKeyframe('Target Start', 0, 'target-element', 0),
        makeTargetKeyframe('Target End', 1000, 'target-element', 1),
      ],
    } satisfies Timeline;
    const document = makeDocument(makeConfig({ timelines: [timeline] }));
    const { result } = renderAnimationEditingHook(document, { initialEditingTimeline: timeline });

    act(() => {
      result.current.controller.onAddKeyframe(153);
    });

    const selectedKeyframe =
      result.current.editingTimelineSelectedKf === null ?
        null
      : result.current.editingTimeline?.keyframes[result.current.editingTimelineSelectedKf];

    expect(result.current.editingTimeline?.keyframes.some((keyframe) => keyframe.name === 'keyframe-3')).toBe(false);
    expect(selectedKeyframe?.target).toBe('target-element');
    expect(selectedKeyframe?.properties['opacity']).toEqual({ type: 'number', value: 0.2, easing: 'linear' });
    expect(result.current.controller.currentTimeMs).toBe(200);
  });
});
