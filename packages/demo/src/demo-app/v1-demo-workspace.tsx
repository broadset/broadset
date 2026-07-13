import {
  createProjectEditorStore,
  ProjectEditorProvider,
  type ProjectEditorStore,
  selectActiveDocumentV1,
} from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { PageSorter } from '@broadset/ui';
import { Tabs } from '@heroui/react';
import { useEffect, useState } from 'react';

import { loadStoredProjectV1, saveStoredProjectV1 } from '../v1-project-persistence';
import { useEditorSelector } from './helpers';
import { V1DataSidebar } from './v1-data-sidebar';
import { V1DemoCanvasSurface } from './v1-demo-canvas-surface';
import { V1ElementSidebar } from './v1-element-sidebar';
import { V1ProjectExportControls } from './v1-project-export-controls';
import { V1ProjectFileControls } from './v1-project-file-controls';
import { V1SequenceSidebar } from './v1-sequence-sidebar';

interface V1DemoWorkspaceProps {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly initialElementId?: projectFormatV1.Id | undefined;
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

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function handleWorkspaceKeyDown(store: ProjectEditorStore, event: KeyboardEvent): void {
  if (isEditableTarget(event.target)) return;

  const state = store.getState();
  const modifier = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();

  if ((event.key === 'Delete' || event.key === 'Backspace') && state.activeElementIds.length > 0) {
    event.preventDefault();
    state.removeElements(state.activeElementIds);

    return;
  }

  if (modifier && key === 'a') {
    const document = selectActiveDocumentV1(state);

    if (document === undefined) return;

    event.preventDefault();
    state.setActiveElements(document.elements.map(({ id }) => id));

    return;
  }

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

export function V1DemoWorkspace({
  project,
  initialElementId,
  onStoreReady,
  persistence,
}: V1DemoWorkspaceProps): React.JSX.Element {
  const [editorStore] = useState<ProjectEditorStore>(() => {
    const store = createProjectEditorStore({ project });

    if (initialElementId !== undefined) store.getState().selectElement(initialElementId);

    return store;
  });
  const [tab, setTab] = useState<WorkspaceTab>('properties');
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const activePageIndex = document?.pages.findIndex((page) => page.id === state.activePageId) ?? 0;

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
    }).then((result) => {
      if (!active) return;

      editorStore.getState().setProject(result.project);
      if (initialElementId !== undefined) editorStore.getState().selectElement(initialElementId);

      let previousProject = editorStore.getState().project;

      unsubscribe = editorStore.subscribe((nextState) => {
        if (nextState.project === previousProject) return;

        previousProject = nextState.project;
        saveStoredProjectV1({
          storage: persistence.storage,
          storageKey: persistence.storageKey,
          project: nextState.project,
        });
      });
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [editorStore, initialElementId, persistence, project]);

  return (
    <ProjectEditorProvider components={[]} dataStore={null} store={editorStore}>
      <div
        data-testid="v1-demo-workspace"
        style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%' }}
      >
        <V1ProjectFileControls editorStore={editorStore} />
        <V1ProjectExportControls editorStore={editorStore} />
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

                if (next === 'layers' || next === 'properties' || next === 'animation' || next === 'data') setTab(next);
              }}
            >
              <Tabs.List>
                <Tabs.Tab id="layers">Layers</Tabs.Tab>
                <Tabs.Tab id="properties">Properties</Tabs.Tab>
                <Tabs.Tab id="animation">Animation</Tabs.Tab>
                <Tabs.Tab id="data">Data</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{renderWorkspaceSidebar(editorStore, tab)}</div>
          </aside>
          <main style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
            <V1DemoCanvasSurface
              documentId={state.activeDocumentId}
              editorStore={editorStore}
              pageId={state.activePageId}
              project={state.project}
            />
          </main>
        </div>
      </div>
    </ProjectEditorProvider>
  );
}
