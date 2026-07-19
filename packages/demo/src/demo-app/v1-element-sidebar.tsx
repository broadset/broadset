import {
  type ProjectEditorStore,
  selectActiveDocumentV1,
  selectActivePageV1,
  selectElementByIdV1,
} from '@broadset/editor';
import {
  color,
  font,
  type KeyframePropertyAdapter,
  LayersSidebar,
  PropertiesSidebar,
  useKeyframePropertyAdapter,
} from '@broadset/ui';

import {
  buildLayerInfoListV1,
  buildMediaAssetsV1,
  layerInstanceIdV1,
  parseLayerInstanceIdV1,
} from '../v1-demo-project';
import { toPanelElementV1 } from '../v1-panel-adapter';
import { updateElementFromPanelV1 } from '../v1-panel-mutations';
import { useEditorSelector } from './helpers';

interface V1ElementSidebarProps {
  readonly editorStore: ProjectEditorStore;
  readonly tab: 'layers' | 'properties';
}

/** panels.md "Animation Mode Properties": the RFC 6901 pointer the Opacity field addresses. */
const OPACITY_PROPERTY_POINTER = '/appearance/opacity';

/**
 * panels.md "Property Editing Context for Keyframes": true only when the timeline's selected
 * keyframe adapter was actually resolved against `selectedElementId` — never merely because a
 * keyframe happens to be selected while a different element is showing in the sidebar. Timeline
 * keyframe selection is independent of canvas selection, so this identity check is required
 * before routing an edit (or showing the keyframe-mode banner) to the adapter's typed value.
 */
function keyframeTargetsElement(
  adapter: KeyframePropertyAdapter | null,
  selectedElementId: string | undefined,
): boolean {
  if (adapter === null || selectedElementId === undefined) return false;

  return adapter.target.entityId === selectedElementId;
}

function reorderRelative(options: {
  readonly store: ProjectEditorStore;
  readonly dragId: string;
  readonly targetId: string;
  readonly position: 'before' | 'inside' | 'after';
}): void {
  const state = options.store.getState();
  const dragAddress = parseLayerInstanceIdV1(options.dragId, state.activePageId);
  const targetAddress = parseLayerInstanceIdV1(options.targetId, state.activePageId);
  const document = selectActiveDocumentV1(state);
  const page = selectActivePageV1(state);
  const drag = document?.elements.find(({ id }) => id === dragAddress?.elementId);
  const target = document?.elements.find(({ id }) => id === targetAddress?.elementId);

  if (dragAddress === undefined || targetAddress === undefined || drag === undefined || target === undefined) return;

  if (options.position === 'inside') {
    state.reparentElement(drag.id, target.id);

    return;
  }

  const dragRoot = page?.rootInstances.find(({ id }) => id === dragAddress.rootInstanceId);
  const targetRoot = page?.rootInstances.find(({ id }) => id === targetAddress.rootInstanceId);
  const addressesRootRows =
    dragRoot?.elementId === drag.id &&
    targetRoot?.elementId === target.id &&
    dragAddress.componentInstancePath.length === 0 &&
    targetAddress.componentInstancePath.length === 0;

  if (addressesRootRows) {
    state.moveRootInstance(dragRoot.id, targetRoot.id, options.position);

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
  const keyframeAdapter = useKeyframePropertyAdapter();
  const state = useEditorSelector(editorStore, (current) => current);
  const document = selectActiveDocumentV1(state);
  const page = selectActivePageV1(state);
  const selectedAddress = state.activeInstanceAddresses[0];
  const selectedId = selectedAddress?.elementId;
  const selectedElement = selectedId === undefined ? undefined : selectElementByIdV1(state, selectedId);
  const layers =
    document === undefined || page === undefined ?
      []
    : buildLayerInfoListV1({ project: state.project, documentId: document.id, pageId: page.id });

  if (tab === 'layers') {
    return (
      <LayersSidebar
        layers={layers}
        selectedIds={state.activeInstanceAddresses.map((address) =>
          layerInstanceIdV1({ pageId: state.activePageId, address }),
        )}
        onDelete={(elementId) => {
          const address = parseLayerInstanceIdV1(elementId, state.activePageId);

          if (address !== undefined) state.removeElement(address.elementId);
        }}
        onRename={(elementId, name) => {
          const address = parseLayerInstanceIdV1(elementId, state.activePageId);

          if (address !== undefined) state.updateElement(address.elementId, (element) => ({ ...element, name }));
        }}
        onReorder={(dragId, targetId, position) => {
          reorderRelative({ store: editorStore, dragId, targetId, position });
        }}
        onSelect={(elementId, mode) => {
          const address = parseLayerInstanceIdV1(elementId, state.activePageId);

          if (address === undefined) return;
          if (mode === 'toggle') state.toggleSelectInstance(address);
          else state.selectInstance(address);
        }}
        onToggleLock={(elementId) => {
          const address = parseLayerInstanceIdV1(elementId, state.activePageId);

          if (address !== undefined) state.toggleLock(address.elementId);
        }}
        onToggleVisibility={(elementId) => {
          const address = parseLayerInstanceIdV1(elementId, state.activePageId);

          if (address !== undefined) state.toggleInstanceVisibility(address);
        }}
      />
    );
  }

  const panelElement =
    selectedElement === undefined ? undefined : toPanelElementV1({ project: state.project, element: selectedElement });
  const keyframeTargetsSelectedElement = keyframeTargetsElement(keyframeAdapter, selectedElement?.id);

  return (
    <>
      {!keyframeTargetsSelectedElement ? null : (
        <span
          data-testid="keyframe-mode-banner"
          style={{ color: color('accent'), display: 'block', fontSize: font('label') }}
        >
          Editing keyframe
        </span>
      )}
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

          // panels.md "Animation Mode Properties": with a keyframe selected on its own property,
          // route the edit to the keyframe's typed value instead of the element's base appearance.
          // Guarded by keyframeTargetsSelectedElement so an edit never lands on a keyframe that
          // belongs to a different element than the one currently selected on canvas.
          if (
            key === 'opacity' &&
            typeof value === 'number' &&
            keyframeAdapter !== null &&
            keyframeAdapter.target.pointer === OPACITY_PROPERTY_POINTER &&
            keyframeTargetsSelectedElement
          ) {
            keyframeAdapter.updateValue(value);

            return;
          }

          if (key === 'locked' && typeof value === 'boolean') {
            state.toggleLock(selectedElement.id);

            return;
          }

          state.updateElement(selectedElement.id, (element) => updateElementFromPanelV1({ element, key, value }));
        }}
      />
    </>
  );
}
