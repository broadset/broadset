import { projectFormatV1 } from '@broadset/model';
import type { StoreApi } from 'zustand/vanilla';

import type { ProjectEditorState } from './project-store';

type SelectionActionsV1 = Pick<
  ProjectEditorState,
  | 'selectElement'
  | 'selectInstance'
  | 'setActiveElements'
  | 'setActiveInstances'
  | 'toggleSelectElement'
  | 'toggleSelectInstance'
>;

function sameInstanceAddress(
  left: projectFormatV1.InstanceAddress,
  right: projectFormatV1.InstanceAddress,
): boolean {
  return (
    left.rootInstanceId === right.rootInstanceId &&
    left.elementId === right.elementId &&
    left.componentInstancePath.length === right.componentInstancePath.length &&
    left.componentInstancePath.every((id, index) => id === right.componentInstancePath[index])
  );
}

function pageInstanceAddresses(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId: projectFormatV1.Id;
  readonly pageId: projectFormatV1.Id;
}): readonly projectFormatV1.InstanceAddress[] {
  return projectFormatV1.resolvePageInstanceTree(options).map(({ rootInstanceId, componentInstancePath, element }) => ({
    rootInstanceId,
    componentInstancePath,
    elementId: element.id,
  }));
}

export function filterInstanceAddresses(
  state: Pick<ProjectEditorState, 'project' | 'activeDocumentId' | 'activePageId'>,
  addresses: readonly projectFormatV1.InstanceAddress[],
): readonly projectFormatV1.InstanceAddress[] {
  const available = pageInstanceAddresses({
    project: state.project,
    documentId: state.activeDocumentId,
    pageId: state.activePageId,
  });

  return addresses.filter((address) => available.some((candidate) => sameInstanceAddress(candidate, address)));
}

export function firstInstanceAddressForElement(
  state: Pick<ProjectEditorState, 'project' | 'activeDocumentId' | 'activePageId'>,
  elementId: projectFormatV1.Id,
): projectFormatV1.InstanceAddress | undefined {
  return pageInstanceAddresses({
    project: state.project,
    documentId: state.activeDocumentId,
    pageId: state.activePageId,
  }).find((address) => address.elementId === elementId);
}

function createSelectionUpdate(
  state: ProjectEditorState,
  addresses: readonly projectFormatV1.InstanceAddress[],
): Partial<ProjectEditorState> {
  const activeInstanceAddresses = filterInstanceAddresses(state, addresses);
  const selectedElementIds = activeInstanceAddresses.map(({ elementId }) => elementId);
  const editingElementId =
    state.pathEditingElementId ??
    state.pathDrawingElementId ??
    state.clipPathEditingElementId ??
    state.motionPathEditingElementId ??
    state.inlineTextEditingElementId;
  const preservesEditing =
    editingElementId !== null && selectedElementIds.length === 1 && selectedElementIds[0] === editingElementId;

  return preservesEditing ?
      { activeInstanceAddresses }
    : {
        activeInstanceAddresses,
        pathEditingElementId: null,
        pathDrawingElementId: null,
        clipPathEditingElementId: null,
        motionPathEditingElementId: null,
        inlineTextEditingElementId: null,
        editingMode: { type: 'none' },
      };
}

export function createProjectEditorSelectionActions(
  set: StoreApi<ProjectEditorState>['setState'],
): SelectionActionsV1 {
  return {
    setActiveElements(elementIds: readonly projectFormatV1.Id[]): void {
      set((state) =>
        createSelectionUpdate(
          state,
          elementIds.flatMap((elementId) => {
            const address = firstInstanceAddressForElement(state, elementId);

            return address === undefined ? [] : [address];
          }),
        ),
      );
    },
    selectElement(elementId: projectFormatV1.Id | null): void {
      set((state) => {
        const address = elementId === null ? undefined : firstInstanceAddressForElement(state, elementId);

        return createSelectionUpdate(state, address === undefined ? [] : [address]);
      });
    },
    toggleSelectElement(elementId: projectFormatV1.Id): void {
      set((state) => {
        const address = firstInstanceAddressForElement(state, elementId);

        if (address === undefined) return {};

        const addresses =
          state.activeInstanceAddresses.some((active) => sameInstanceAddress(active, address)) ?
            state.activeInstanceAddresses.filter((active) => !sameInstanceAddress(active, address))
          : [...state.activeInstanceAddresses, address];

        return createSelectionUpdate(state, addresses);
      });
    },
    setActiveInstances(addresses: readonly projectFormatV1.InstanceAddress[]): void {
      set((state) => createSelectionUpdate(state, addresses));
    },
    selectInstance(address: projectFormatV1.InstanceAddress | null): void {
      set((state) => createSelectionUpdate(state, address === null ? [] : [address]));
    },
    toggleSelectInstance(address: projectFormatV1.InstanceAddress): void {
      set((state) => {
        const addresses =
          state.activeInstanceAddresses.some((active) => sameInstanceAddress(active, address)) ?
            state.activeInstanceAddresses.filter((active) => !sameInstanceAddress(active, address))
          : [...state.activeInstanceAddresses, address];

        return createSelectionUpdate(state, addresses);
      });
    },
  };
}
