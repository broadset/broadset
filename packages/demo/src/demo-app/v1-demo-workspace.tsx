import {
  createProjectEditorStore,
  ProjectEditorProvider,
  type ProjectEditorState,
  type ProjectEditorStore,
  resolvePreviewSequenceId,
  selectActiveDocumentV1,
  selectActiveElementIdsV1,
} from '@broadset/editor';
import { type EditorConfig, projectFormatV1 } from '@broadset/model';
import {
  isInterpolationPreset,
  KEYFRAME_INTERPOLATION_PRESETS,
  KeyframePropertyProvider,
  PageSorter,
  resolveSnapIntervalTicks,
  TimelineBottomPanel,
  TimelineEditingProvider,
  TimelineEditor,
  type TimelineOwnerAddress,
  useTimelineEditing,
} from '@broadset/ui';
import { Tabs, Toast, toast } from '@heroui/react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { loadStoredProjectV1, saveStoredProjectV1 } from '../v1-project-persistence';
import { useEditorSelector } from './helpers';
import { presetToInterpolation } from './keyframe-interpolation-presets';
import { V1AnimationToolbar } from './v1-animation-toolbar';
import { V1DataSidebar } from './v1-data-sidebar';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';
import { V1ElementSidebar } from './v1-element-sidebar';
import { V1ElementToolbar } from './v1-element-toolbar';
import { createKeyframePropertyAdapter } from './v1-keyframe-property-adapter';
import { V1ProjectFileControls } from './v1-project-file-controls';
import { V1SequenceSidebar } from './v1-sequence-sidebar';
import { buildTimelineViewSequence } from './v1-timeline-adapter';
import { V1ViewportToolbar } from './v1-viewport-toolbar';

/** timeline.md's 100 ms grid preference, converted once per render to an integer tick interval. */
const SNAP_PREFERENCE_MS = 100;

interface V1DemoWorkspaceProps {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs?: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array> | undefined;
  readonly config?: Partial<EditorConfig> | undefined;
  readonly initialElementId?: projectFormatV1.Id | undefined;
  readonly onProjectRecoveryRetained?: ((bytes: Uint8Array) => void) | undefined;
  readonly onStoreReady?: ((store: ProjectEditorStore) => void) | undefined;
  readonly persistence?:
    | {
        readonly storage: {
          readonly getItem: (key: string) => string | null;
          readonly setItem: (key: string, value: string) => void;
        };
        readonly storageKey: string;
      }
    | undefined;
}

type WorkspaceTab = 'layers' | 'properties' | 'animation' | 'data';

interface TimelineKeyframeSelection {
  readonly trackId: string;
  readonly keyframeId: string;
}

function renderWorkspaceSidebar(editorStore: ProjectEditorStore, tab: WorkspaceTab): React.JSX.Element {
  switch (tab) {
    case 'animation':
      return <V1SequenceSidebar editorStore={editorStore} />;
    case 'data':
      return <V1DataSidebar editorStore={editorStore} />;
    case 'layers':
    case 'properties':
      return <V1ElementSidebar editorStore={editorStore} tab={tab} />;
  }
}

function parseTimelineId(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

/**
 * Seed a newly appended keyframe from the target track's own last keyframe value so the seed is
 * always type-correct for that track's `valueType` (color/tuple/length/etc. tracks, not just
 * opacity). Falls back to the element's opacity only for the degenerate case of a track with no
 * keyframes yet, which should not occur in practice since every authored track carries at least one.
 */
function resolveAddedKeyframeSeedValue(options: {
  readonly track: projectFormatV1.Track | undefined;
  readonly document: projectFormatV1.BroadsetDocumentV1;
}): projectFormatV1.TypedValue {
  const lastTrackKeyframeValue = options.track?.keyframes[options.track.keyframes.length - 1]?.value;

  if (lastTrackKeyframeValue !== undefined) return lastTrackKeyframeValue;

  const seededElement = options.document.elements.find(({ id }) => id === options.track?.target.entity.entityId);

  return { type: 'number', value: seededElement?.appearance.opacity ?? 1 };
}

/** Scrubbing the ruler takes precedence over the underlying playback-playing flag for the preview label. */
function resolveTimelinePreviewState(options: {
  readonly scrubbing: boolean;
  readonly playing: boolean;
}): 'playing' | 'paused' | 'scrubbing' {
  if (options.scrubbing) return 'scrubbing';

  return options.playing ? 'playing' : 'paused';
}

/** The sequence currently being previewed: an explicit playback pin, else the active page's default. */
function resolveActiveSequenceId(state: ProjectEditorState): projectFormatV1.Id | null {
  if (state.playbackSequenceId !== null) return state.playbackSequenceId;

  const document = selectActiveDocumentV1(state);

  if (document === undefined) return null;

  return resolvePreviewSequenceId({
    project: state.project,
    documentId: state.activeDocumentId,
    pageId: state.activePageId,
  });
}

/** Hosts the shipped TimelineEditor for the sequence currently previewed by playback, or renders nothing. */
function renderTimelinePanel(options: {
  readonly state: ProjectEditorState;
  readonly timelineOpen: boolean;
  readonly selectedTimelineKeyframe: TimelineKeyframeSelection | null;
  /** True once the user has dismissed the easing graph for the current selection; hides the graph without touching the selection. */
  readonly easingGraphDismissed: boolean;
  readonly scrubbing: boolean;
  readonly onCloseTimeline: () => void;
  readonly onClearSelectedTimelineKeyframe: () => void;
  readonly onDismissEasingGraph: () => void;
  readonly onScrubbingChange: (scrubbing: boolean) => void;
  readonly onSelectTimelineKeyframe: (selection: TimelineKeyframeSelection) => void;
}): React.JSX.Element | null {
  const {
    state,
    timelineOpen,
    selectedTimelineKeyframe,
    easingGraphDismissed,
    scrubbing,
    onCloseTimeline,
    onClearSelectedTimelineKeyframe,
    onDismissEasingGraph,
    onScrubbingChange,
    onSelectTimelineKeyframe,
  } = options;
  const document = selectActiveDocumentV1(state);
  const sequenceId = resolveActiveSequenceId(state);
  const sequence = document?.sequences.find(({ id }) => id === sequenceId);

  if (document === undefined || sequence === undefined) return null;

  const view = buildTimelineViewSequence({
    document,
    sequence,
    selectedElementIds: new Set(selectActiveElementIdsV1(state)),
  });
  const snapIntervalTicks = resolveSnapIntervalTicks(SNAP_PREFERENCE_MS, view.ticksPerSecond);
  const selectedTrack = sequence.tracks.find(({ id }) => id === selectedTimelineKeyframe?.trackId);
  const selectedIndex =
    selectedTrack?.keyframes.findIndex(({ id }) => id === selectedTimelineKeyframe?.keyframeId) ?? -1;
  const selectedModelKeyframe = selectedIndex >= 0 ? selectedTrack?.keyframes[selectedIndex] : undefined;
  const nextModelKeyframe = selectedIndex >= 0 ? selectedTrack?.keyframes[selectedIndex + 1] : undefined;
  const easing =
    !easingGraphDismissed && selectedTrack !== undefined && selectedModelKeyframe?.interpolation !== undefined ?
      {
        interpolation: selectedModelKeyframe.interpolation,
        presets: KEYFRAME_INTERPOLATION_PRESETS.filter((preset) =>
          projectFormatV1.interpolationMatchesType(presetToInterpolation(preset), selectedTrack.valueType),
        ),
        previewProgress:
          (
            nextModelKeyframe !== undefined &&
            state.playbackTick >= selectedModelKeyframe.tick &&
            state.playbackTick <= nextModelKeyframe.tick &&
            nextModelKeyframe.tick > selectedModelKeyframe.tick
          ) ?
            (state.playbackTick - selectedModelKeyframe.tick) / (nextModelKeyframe.tick - selectedModelKeyframe.tick)
          : null,
      }
    : null;

  const previewState = resolveTimelinePreviewState({ scrubbing, playing: state.playbackPlaying });

  return (
    <TimelineBottomPanel isOpen={timelineOpen} subtitle={document.name} title={sequence.name} onClose={onCloseTimeline}>
      <TimelineEditor
        currentTick={state.playbackTick}
        easing={easing}
        previewState={previewState}
        selectedKeyframe={selectedTimelineKeyframe}
        sequence={view}
        snapIntervalTicks={snapIntervalTicks}
        onAddKeyframe={(seqId, trackId, tick) => {
          const track = sequence.tracks.find(({ id }) => id === trackId);

          state.addKeyframe({
            sequenceId: parseTimelineId(seqId),
            trackId: parseTimelineId(trackId),
            tick,
            value: resolveAddedKeyframeSeedValue({ track, document }),
          });
        }}
        onCloseEasing={onDismissEasingGraph}
        onCommitEasing={(interpolation) => {
          if (selectedTimelineKeyframe === null) return;

          state.updateKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(selectedTimelineKeyframe.trackId),
            keyframeId: parseTimelineId(selectedTimelineKeyframe.keyframeId),
            interpolation,
          });
        }}
        onDeleteKeyframe={(trackId, keyframeId) => {
          state.removeKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(trackId),
            keyframeId: parseTimelineId(keyframeId),
          });
          onClearSelectedTimelineKeyframe();
        }}
        onMoveKeyframe={(trackId, keyframeId, tick) => {
          state.updateKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(trackId),
            keyframeId: parseTimelineId(keyframeId),
            tick,
          });
        }}
        onScrubbingChange={onScrubbingChange}
        onSeekTick={(tick) => {
          state.seekPlaybackTick(tick);
        }}
        onSelectEasingPreset={(preset) => {
          if (selectedTimelineKeyframe === null || !isInterpolationPreset(preset)) return;

          state.updateKeyframe({
            sequenceId: parseTimelineId(sequence.id),
            trackId: parseTimelineId(selectedTimelineKeyframe.trackId),
            keyframeId: parseTimelineId(selectedTimelineKeyframe.keyframeId),
            interpolation: presetToInterpolation(preset),
          });
        }}
        onSelectKeyframe={(trackId, keyframeId) => {
          onSelectTimelineKeyframe({ trackId, keyframeId });
        }}
      />
    </TimelineBottomPanel>
  );
}

/** Timeline open/close API derived from the ambient `TimelineEditingProvider` target. */
interface TimelineOpenBridgeApi {
  readonly timelineOpen: boolean;
  readonly openTimeline: (owner: TimelineOwnerAddress, sequenceId: string) => void;
  readonly closeTimeline: () => void;
}

interface TimelineOpenBridgeProps {
  readonly children: (api: TimelineOpenBridgeApi) => ReactNode;
}

/**
 * Bridges `useTimelineEditing()` into a render-prop so the workspace body keeps deriving
 * `timelineOpen` from the sequence/track editing target instead of a parallel ad-hoc boolean,
 * without hoisting the entire workspace render tree's local state into a second component.
 */
function TimelineOpenBridge({ children }: TimelineOpenBridgeProps): React.JSX.Element {
  const timelineEditing = useTimelineEditing();
  const api: TimelineOpenBridgeApi = {
    timelineOpen: (timelineEditing?.target ?? null) !== null,
    openTimeline(owner, sequenceId) {
      timelineEditing?.openSequence(owner, sequenceId, null);
    },
    closeTimeline() {
      timelineEditing?.closeSequence();
    },
  };

  return <>{children(api)}</>;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function cancelPlacementFromEscape(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || store.getState().placement === null) return false;

  event.preventDefault();
  store.getState().cancelPlacement();

  return true;
}

function finishPathDrawingFromKeyboard(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  const state = store.getState();
  const elementId = state.pathDrawingElementId;

  if (elementId === null || (event.key !== 'Enter' && event.key !== 'Escape')) return false;

  event.preventDefault();

  if (event.key === 'Enter') {
    state.updateElement(elementId, (element) => {
      if (element.kind !== 'vector' || element.geometryData.kind !== 'path') return element;
      if (element.geometryData.path.closed) return element;

      return {
        ...element,
        geometryData: {
          ...element.geometryData,
          path: {
            ...element.geometryData.path,
            closed: true,
            segments: [
              ...element.geometryData.path.segments,
              { id: projectFormatV1.idSchema.parse(crypto.randomUUID()), kind: 'close' },
            ],
          },
        },
      };
    });
  }

  store.getState().finishPathDrawing();

  return true;
}

function exitEditingFromEscape(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  const state = store.getState();

  if (event.key !== 'Escape' || (state.pathEditingElementId === null && state.clipPathEditingElementId === null)) {
    return false;
  }

  event.preventDefault();
  state.finishPathDrawing();

  return true;
}

function handleClipboardWorkspaceShortcut(store: ProjectEditorStore, event: KeyboardEvent): boolean {
  if (!(event.ctrlKey || event.metaKey)) return false;

  const state = store.getState();

  switch (event.key.toLowerCase()) {
    case 'c':
      event.preventDefault();
      void state.copySelection();

      return true;
    case 'd':
      event.preventDefault();
      void state.duplicateSelection();

      return true;
    case 'v':
      event.preventDefault();
      void state.pasteClipboard();

      return true;
    case 'x':
      event.preventDefault();
      void state.cutSelection();

      return true;
    default:
      return false;
  }
}

function handleGeneralWorkspaceShortcut(store: ProjectEditorStore, event: KeyboardEvent): void {
  const state = store.getState();
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if ((event.key === 'Delete' || event.key === 'Backspace') && state.activeInstanceAddresses.length > 0) {
    event.preventDefault();
    state.removeElements(state.activeInstanceAddresses.map(({ elementId }) => elementId));

    return;
  }

  if (modifier && key === 'a') {
    const document = selectActiveDocumentV1(state);

    if (document === undefined) return;

    event.preventDefault();
    state.setActiveElements(document.elements.map(({ id }) => id));

    return;
  }

  if (handleClipboardWorkspaceShortcut(store, event)) return;

  if (modifier && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) state.redo();
    else state.undo();

    return;
  }

  if (modifier && key === 'y') {
    event.preventDefault();
    state.redo();
  }
}

function handleWorkspaceKeyDown(store: ProjectEditorStore, event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) return;
  if (finishPathDrawingFromKeyboard(store, event)) return;
  if (exitEditingFromEscape(store, event)) return;
  if (cancelPlacementFromEscape(store, event)) return;

  handleGeneralWorkspaceShortcut(store, event);
}

export function V1DemoWorkspace({
  project,
  blobs,
  config,
  initialElementId,
  onProjectRecoveryRetained,
  onStoreReady,
  persistence,
}: V1DemoWorkspaceProps): React.JSX.Element {
  const [editorStore] = useState<ProjectEditorStore>(() => {
    const store = createProjectEditorStore({
      project,
      ...(blobs === undefined ? {} : { blobs }),
      ...(config === undefined ? {} : { config }),
    });

    if (initialElementId !== undefined) store.getState().selectElement(initialElementId);

    return store;
  });
  const [quarantinedProjectBytes, setQuarantinedProjectBytes] = useState<Uint8Array | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('properties');
  const [scrubbing, setScrubbing] = useState(false);
  const [selectedTimelineKeyframe, setSelectedTimelineKeyframe] = useState<TimelineKeyframeSelection | null>(null);
  /**
   * Whether the user has dismissed the easing graph (outside mousedown, Esc, etc.) for the
   * currently selected keyframe. Deliberately independent of `selectedTimelineKeyframe`: a
   * mousedown that closes the graph (e.g. on the Properties panel's Opacity slider, which does
   * not stop propagation the way HeroUI's press-driven controls do) must not also drop the
   * keyframe selection, or the property panel would silently misroute the edit to the base
   * element instead of the keyframe.
   */
  const [easingGraphDismissed, setEasingGraphDismissed] = useState(false);
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const activePageIndex = document?.pages.findIndex((page) => page.id === state.activePageId) ?? 0;
  const retainProjectRecovery = useCallback(
    (bytes: Uint8Array): void => {
      setQuarantinedProjectBytes(bytes);
      onProjectRecoveryRetained?.(bytes.slice());
    },
    [onProjectRecoveryRetained],
  );

  useEffect(() => {
    if (state.activeInstanceAddresses.length === 0 && (tab === 'properties' || tab === 'animation')) setTab('layers');
  }, [state.activeInstanceAddresses.length, tab]);

  useEffect(() => {
    onStoreReady?.(editorStore);
  }, [editorStore, onStoreReady]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      handleWorkspaceKeyDown(editorStore, event);
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      editorStore.getState().clearClipboard();
    };
  }, [editorStore]);

  useEffect(() => {
    if (persistence === undefined) return undefined;

    let active = true;
    let unsubscribe: (() => void) | undefined;

    void loadStoredProjectV1({
      storage: persistence.storage,
      storageKey: persistence.storageKey,
      fallbackProject: project,
      fallbackBlobs: blobs ?? new Map(),
    }).then((result) => {
      if (!active) return;

      editorStore.getState().setProject(result.project, result.blobs);
      if (initialElementId !== undefined) editorStore.getState().selectElement(initialElementId);
      if (result.quarantinedBytes !== undefined) retainProjectRecovery(result.quarantinedBytes);

      if (result.diagnostics.length > 0) {
        toast.danger(result.diagnostics.map(({ message }) => message).join('; '), { timeout: 5000 });
      }

      let previousProject = editorStore.getState().project;
      let previousBlobs = editorStore.getState().blobs;
      let pendingSave = Promise.resolve(true);
      let saveFailureNotified = false;

      unsubscribe = editorStore.subscribe((nextState) => {
        if (nextState.project === previousProject && nextState.blobs === previousBlobs) return;

        previousProject = nextState.project;
        previousBlobs = nextState.blobs;
        pendingSave = pendingSave.then(async () => {
          const saved = await saveStoredProjectV1({
            storage: persistence.storage,
            storageKey: persistence.storageKey,
            project: nextState.project,
            blobs: nextState.blobs,
          });

          if (!saved && !saveFailureNotified) {
            saveFailureNotified = true;
            toast.danger('Automatic project save failed.', { timeout: 5000 });
          }

          if (saved) saveFailureNotified = false;

          return saved;
        });
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [blobs, editorStore, initialElementId, persistence, project, retainProjectRecovery]);

  return (
    <ProjectEditorProvider store={editorStore}>
      <TimelineEditingProvider>
        <TimelineOpenBridge>
          {(timeline) => (
            <div
              data-testid="v1-demo-workspace"
              style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%' }}
            >
              <Toast.Provider maxVisibleToasts={4} placement="bottom end" />
              <V1ProjectFileControls editorStore={editorStore} onProjectQuarantined={retainProjectRecovery} />
              {quarantinedProjectBytes === null ? null : (
                <span role="status">Recovery source retained ({String(quarantinedProjectBytes.byteLength)} bytes)</span>
              )}
              <V1ViewportToolbar editorStore={editorStore} />
              <V1ElementToolbar editorStore={editorStore} />
              <PageSorter
                activePageIndex={activePageIndex}
                pages={document?.pages ?? []}
                onPageAdd={() => {
                  if (document === undefined) return;

                  const page = projectFormatV1.createPageV1({
                    id: projectFormatV1.idSchema.parse(crypto.randomUUID()),
                    name: `Scene ${String(document.pages.length + 1)}`,
                  });

                  if (state.addPage(page)) state.setActivePage(page.id);
                }}
                onPageRemove={(index) => {
                  const page = document?.pages[index];

                  if (page !== undefined) state.removePage(page.id);
                }}
                onPageSelect={(index) => {
                  state.switchPage(index);
                }}
              />
              <div style={{ display: 'flex', flex: 1, minHeight: 0, width: '100%' }}>
                <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, width: 360 }}>
                  <Tabs
                    aria-label="Inspector"
                    selectedKey={tab}
                    onSelectionChange={(key) => {
                      const next = String(key);

                      if (next === 'layers' || next === 'properties' || next === 'animation' || next === 'data')
                        setTab(next);
                    }}
                  >
                    <Tabs.List>
                      <Tabs.Tab id="layers">Layers</Tabs.Tab>
                      <Tabs.Tab id="properties" isDisabled={state.activeInstanceAddresses.length === 0}>
                        Properties
                      </Tabs.Tab>
                      <Tabs.Tab id="animation" isDisabled={state.activeInstanceAddresses.length === 0}>
                        Animation
                      </Tabs.Tab>
                      <Tabs.Tab id="data">Data</Tabs.Tab>
                    </Tabs.List>
                  </Tabs>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <KeyframePropertyProvider
                      adapter={
                        selectedTimelineKeyframe === null || state.playbackSequenceId === null ?
                          null
                        : createKeyframePropertyAdapter({
                            store: editorStore,
                            sequenceId: state.playbackSequenceId,
                            trackId: parseTimelineId(selectedTimelineKeyframe.trackId),
                            keyframeId: parseTimelineId(selectedTimelineKeyframe.keyframeId),
                          })
                      }
                    >
                      {renderWorkspaceSidebar(editorStore, tab)}
                    </KeyframePropertyProvider>
                  </div>
                </aside>
                <main style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
                  <V1DemoCanvasSurface
                    blobs={state.blobs}
                    documentId={state.activeDocumentId}
                    editorStore={editorStore}
                    pageId={state.activePageId}
                    project={state.project}
                  />
                  <V1AnimationToolbar
                    editorStore={editorStore}
                    onTimelineOpen={() => {
                      setTab('animation');

                      const sequenceId = resolveActiveSequenceId(state);

                      if (sequenceId === null) return;

                      timeline.openTimeline({ documentId: state.activeDocumentId }, sequenceId);
                    }}
                  />
                </main>
              </div>
              {renderTimelinePanel({
                state,
                timelineOpen: timeline.timelineOpen,
                selectedTimelineKeyframe,
                easingGraphDismissed,
                scrubbing,
                onCloseTimeline: () => {
                  timeline.closeTimeline();
                  setSelectedTimelineKeyframe(null);
                  setEasingGraphDismissed(false);
                },
                onClearSelectedTimelineKeyframe: () => {
                  setSelectedTimelineKeyframe(null);
                  setEasingGraphDismissed(false);
                },
                onDismissEasingGraph: () => {
                  setEasingGraphDismissed(true);
                },
                onScrubbingChange: setScrubbing,
                onSelectTimelineKeyframe: (selection) => {
                  setSelectedTimelineKeyframe(selection);
                  setEasingGraphDismissed(false);
                },
              })}
            </div>
          )}
        </TimelineOpenBridge>
      </TimelineEditingProvider>
    </ProjectEditorProvider>
  );
}
