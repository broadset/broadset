import type { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectEditorState } from './project-store';
import {
  insertPageIntoProject,
  removePageFromProject,
  setPageRootVisibilityInProject,
  updateDocumentInProject,
} from './project-store-mutations';
import { resolvePreviewSequenceId } from './project-store-playback';

type ProjectEditorNavigationActions = Pick<
  ProjectEditorState,
  | 'addPage'
  | 'removePage'
  | 'setActiveDocument'
  | 'setActivePage'
  | 'setPageRootVisibility'
  | 'switchPage'
  | 'updateActiveDocument'
>;

export function createProjectEditorNavigationActions(
  store: Pick<StoreApi<ProjectEditorState>, 'getState' | 'setState'>,
): ProjectEditorNavigationActions {
  return {
    setActiveDocument(documentId: projectFormatV1.Id): boolean {
      let activated = false;

      store.setState((state) => {
        const document = state.project.documents.find(({ id }) => id === documentId);
        const page = document?.pages[0];

        if (document === undefined || page === undefined) return {};

        activated = true;

        return {
          activeDocumentId: document.id,
          activePageId: page.id,
          activeInstanceAddresses: [],
          playbackSequenceId: resolvePreviewSequenceId({
            project: state.project,
            documentId: document.id,
            pageId: page.id,
          }),
          playbackTick: 0,
          playbackPlaying: false,
        };
      });

      return activated;
    },
    setActivePage(pageId: projectFormatV1.Id): boolean {
      let activated = false;

      store.setState((state) => {
        const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);

        if (document?.pages.some((page) => page.id === pageId) !== true) return {};

        activated = true;

        return {
          activePageId: pageId,
          activeInstanceAddresses: [],
          playbackSequenceId: resolvePreviewSequenceId({
            project: state.project,
            documentId: state.activeDocumentId,
            pageId,
          }),
          playbackTick: 0,
          playbackPlaying: false,
        };
      });

      return activated;
    },
    switchPage(index: number): boolean {
      const state = store.getState();
      const document = state.project.documents.find(({ id }) => id === state.activeDocumentId);
      const page = document?.pages[index];

      return page !== undefined && store.getState().setActivePage(page.id);
    },
    addPage(page: projectFormatV1.PageDefinition): boolean {
      let added = false;

      store.setState((state) => {
        const project = insertPageIntoProject({
          project: state.project,
          documentId: state.activeDocumentId,
          page,
        });

        if (project === state.project) return {};

        added = true;

        return { project };
      });

      return added;
    },
    removePage(pageId: projectFormatV1.Id): boolean {
      let removed = false;

      store.setState((state) => {
        const project = removePageFromProject({
          project: state.project,
          documentId: state.activeDocumentId,
          pageId,
        });

        if (project === state.project) return {};

        const document = project.documents.find(({ id }) => id === state.activeDocumentId);
        const activePageId = state.activePageId === pageId ? document?.pages[0]?.id : state.activePageId;

        if (activePageId === undefined) return {};

        removed = true;

        return {
          project,
          activePageId,
          activeInstanceAddresses: [],
          playbackSequenceId: resolvePreviewSequenceId({
            project,
            documentId: state.activeDocumentId,
            pageId: activePageId,
          }),
          playbackTick: 0,
          playbackPlaying: false,
        };
      });

      return removed;
    },
    setPageRootVisibility(rootInstanceId: projectFormatV1.Id, visible: boolean): boolean {
      let updated = false;

      store.setState((state) => {
        const project = setPageRootVisibilityInProject({
          project: state.project,
          documentId: state.activeDocumentId,
          pageId: state.activePageId,
          rootInstanceId,
          visible,
        });

        if (project === state.project) return {};

        updated = true;

        return { project };
      });

      return updated;
    },
    updateActiveDocument(
      updater: (document: projectFormatV1.BroadsetDocumentV1) => projectFormatV1.BroadsetDocumentV1,
    ): boolean {
      let updated = false;

      store.setState((state) => {
        const project = updateDocumentInProject({
          project: state.project,
          documentId: state.activeDocumentId,
          updater,
        });

        if (project === state.project) return {};

        updated = true;

        return { project };
      });

      return updated;
    },
  };
}
