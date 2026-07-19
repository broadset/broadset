import {
  createProjectEditorStore,
  ProjectEditorProvider,
  type ProjectEditorStore,
  selectActiveDocumentV1,
} from '@broadset/editor';
import { type EditorConfig, projectFormatV1 } from '@broadset/model';
import { KeyframePropertyProvider, PageSorter, TimelineEditingProvider } from '@broadset/ui';
import { Tabs, Toast, toast } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

import { loadStoredProjectV1, saveStoredProjectV1 } from '../v1-project-persistence';
import { useEditorSelector } from './helpers';
import { TimelineOpenBridge } from './timeline-open-bridge';
import { useWorkspaceKeyboardShortcuts } from './use-workspace-keyboard-shortcuts';
import { V1AnimationToolbar } from './v1-animation-toolbar';
import { V1DataSidebar } from './v1-data-sidebar';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';
import { parseTimelineId, resolveActiveSequenceId } from './v1-demo-workspace-helpers';
import type { TimelineKeyframeSelection } from './v1-demo-workspace-types';
import { V1ElementSidebar } from './v1-element-sidebar';
import { V1ElementToolbar } from './v1-element-toolbar';
import { createKeyframePropertyAdapter } from './v1-keyframe-property-adapter';
import { V1ProjectFileControls } from './v1-project-file-controls';
import { V1SequenceSidebar } from './v1-sequence-sidebar';
import { renderTimelinePanel } from './v1-timeline-panel';
import { V1ViewportToolbar } from './v1-viewport-toolbar';

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

  useWorkspaceKeyboardShortcuts({ editorStore });

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
