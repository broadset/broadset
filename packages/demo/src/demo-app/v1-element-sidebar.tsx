import {
  type ProjectEditorStore,
  selectActiveDocumentV1,
  selectActivePageV1,
  selectElementByIdV1,
} from '@broadset/editor';
import { projectFormatV1 } from '@broadset/model';
import { LayersSidebar, PropertiesSidebar } from '@broadset/ui';

import { buildLayerInfoListV1, buildMediaAssetsV1 } from '../v1-demo-project';
import { toPanelElementV1 } from '../v1-panel-adapter';
import { updateElementFromPanelV1 } from '../v1-panel-mutations';
import { useEditorSelector } from './helpers';

interface V1ElementSidebarProps {
  readonly editorStore: ProjectEditorStore;
  readonly tab: 'layers' | 'properties';
}

function parseId(value: string): projectFormatV1.Id | undefined {
  const result = projectFormatV1.idSchema.safeParse(value);

  return result.success ? result.data : undefined;
}

function reorderRelative(options: {
  readonly store: ProjectEditorStore;
  readonly dragId: string;
  readonly targetId: string;
  readonly position: 'before' | 'inside' | 'after';
}): void {
  const state = options.store.getState();
  const dragId = parseId(options.dragId);
  const targetId = parseId(options.targetId);
  const document = selectActiveDocumentV1(state);
  const drag = document?.elements.find(({ id }) => id === dragId);
  const target = document?.elements.find(({ id }) => id === targetId);

  if (drag === undefined || target === undefined) return;

  if (options.position === 'inside') {
    state.reparentElement(drag.id, target.id);

    return;
  }

  if (drag.parentId !== target.parentId && !state.reparentElement(drag.id, target.parentId)) return;

  const refreshed = selectActiveDocumentV1(options.store.getState());
  const siblings = refreshed?.elements.filter((element) => element.parentId === target.parentId) ?? [];
  const dragIndex = siblings.findIndex(({ id }) => id === drag.id);
  const targetIndex = siblings.findIndex(({ id }) => id === target.id);

  if (dragIndex < targetIndex && options.position === 'before') state.reorderElement(drag.id, 'forward');
  if (dragIndex > targetIndex && options.position === 'after') state.reorderElement(drag.id, 'backward');
}

export function V1ElementSidebar({ editorStore, tab }: V1ElementSidebarProps): React.JSX.Element {
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const page = selectActivePageV1(state);
  const selectedId = state.activeElementIds[0];
  const selectedElement = selectedId === undefined ? undefined : selectElementByIdV1(state, selectedId);
  const layers =
    document === undefined || page === undefined ?
      []
    : buildLayerInfoListV1({ project: state.project, documentId: document.id, pageId: page.id });

  if (tab === 'layers') {
    return (
      <LayersSidebar
        layers={layers}
        selectedIds={state.activeElementIds}
        onDelete={(elementId) => {
          const id = parseId(elementId);

          if (id !== undefined) state.removeElement(id);
        }}
        onRename={(elementId, name) => {
          const id = parseId(elementId);

          if (id !== undefined) state.updateElement(id, (element) => ({ ...element, name }));
        }}
        onReorder={(dragId, targetId, position) => {
          reorderRelative({ store: editorStore, dragId, targetId, position });
        }}
        onSelect={(elementId, mode) => {
          const id = parseId(elementId);

          if (id === undefined) return;
          if (mode === 'toggle') state.toggleSelectElement(id);
          else state.selectElement(id);
        }}
        onToggleLock={(elementId) => {
          const id = parseId(elementId);

          if (id !== undefined) state.toggleLock(id);
        }}
        onToggleVisibility={(elementId) => {
          const id = parseId(elementId);

          if (id !== undefined) state.toggleVisibility(id);
        }}
      />
    );
  }

  const panelElement =
    selectedElement === undefined ? undefined : toPanelElementV1({ project: state.project, element: selectedElement });

  return (
    <PropertiesSidebar
      availableFonts={state.availableFonts}
      canvasHeight={document?.surface.size[1]}
      canvasWidth={document?.surface.size[0]}
      documentMode={document?.kind === 'print' ? 'print' : 'screen'}
      documentUnit={document?.surface.unit}
      elements={panelElement === undefined ? [] : [panelElement]}
      mediaAssets={buildMediaAssetsV1(state.project)}
      onUpdate={(key, value) => {
        if (selectedElement === undefined) return;

        if (key === 'locked' && typeof value === 'boolean') {
          state.toggleLock(selectedElement.id);

          return;
        }

        state.updateElement(selectedElement.id, (element) => updateElementFromPanelV1({ element, key, value }));
      }}
    />
  );
}
