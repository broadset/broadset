import type { EditorStore } from '@broadset/editor';
import type {
  BroadsetDocument,
  BroadsetElement,
  ElementAnimationConfig,
  PageElementInstance,
  TemplateGroup,
  TemplateGroupRole,
  Timeline,
} from '@broadset/model';
import {
  AnimationModePropertiesPanel,
  AnimationSidebar,
  glassPanelStyle,
  type LayerInfo,
  LayersSidebar,
  type MediaAsset,
  type PreflightIssue,
  PreflightPanel,
  PropertiesSidebar,
  type PropertyFieldAdapter,
  type PropertyValue,
  TemplateGroupPanel,
} from '@broadset/ui';
import { useMemo } from 'react';

import type { SidebarTab } from '../demo-types';
import { toPanelElement } from '../demo-utils';
import { createKeyframeAdapter } from './keyframe-adapter';

export interface DemoSidebarPanelProps {
  readonly sidebarTab: SidebarTab;
  readonly layers: readonly LayerInfo[];
  readonly activeElementIds: readonly string[];
  readonly selectedElement: BroadsetElement | null;
  readonly currentDocumentMode: BroadsetDocument['documentMode'];
  readonly selectedElementInstance: PageElementInstance | null;
  readonly preflightIssues: readonly PreflightIssue[];
  readonly templateGroups: readonly TemplateGroup[];
  readonly availableDocuments: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly animationConfig: ElementAnimationConfig | null;
  readonly handleAddMember: (groupId: string, documentId: string, role: TemplateGroupRole) => void;
  readonly handleCreateGroup: (name: string) => void;
  readonly handleRemoveGroup: (groupId: string) => void;
  readonly handleRemoveMember: (groupId: string, documentId: string) => void;
  readonly handleRenameGroup: (groupId: string, nextName: string) => void;
  readonly handleUpdateMemberRole: (
    groupId: string,
    documentId: string,
    role: TemplateGroupRole,
    label?: string,
  ) => void;
  readonly onRemoveElement: (elementId: string) => void;
  readonly onSelectElement: (elementId: string) => void;
  readonly onToggleLock: (elementId: string) => void;
  readonly onReorderLayers: (dragId: string, targetId: string, position: 'before' | 'inside' | 'after') => void;
  readonly onToggleVisibility: (elementId: string) => void;
  readonly onUpdateProperty: (key: string, value: PropertyValue) => void;
  readonly onAnimationAddModifierBinding: () => void;
  readonly onAnimationAddStateBinding: () => void;
  readonly onAnimationAddTimeline: () => void;
  readonly onAnimationDeleteTimeline: (timelineId: string) => void;
  readonly onAnimationDuplicateTimeline: (timelineId: string) => void;
  readonly onAnimationEditTimeline: (timelineId: string) => void;
  readonly onAnimationQuickSetup: () => void;
  readonly onAnimationRemoveModifierBinding: (modifierName: string) => void;
  readonly onAnimationRemoveStateBinding: (stateName: string) => void;
  readonly onAnimationRenameTimeline: (timelineId: string) => void;
  readonly onAnimationSelectState: (stateName: string | null) => void;
  readonly onAnimationToggleModifier: (modifierName: string) => void;
  readonly editorStore: EditorStore;
  readonly editingTimeline: Timeline | null;
  readonly editingTimelineSelectedKf: number | null;
  readonly setEditingTimeline: (timeline: Timeline | null) => void;
  readonly setEditingTimelineSelectedKf: (index: number | null) => void;
  readonly timelinePreviewActiveModifiers: readonly string[];
  readonly timelinePreviewActiveState: string | null;
  readonly mediaAssets: readonly MediaAsset[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly documentUnit: 'px' | 'mm' | 'in';
}

export function DemoSidebarPanel({
  activeElementIds,
  animationConfig,
  availableDocuments,
  currentDocumentMode,
  handleAddMember,
  handleCreateGroup,
  handleRemoveGroup,
  handleRemoveMember,
  handleRenameGroup,
  handleUpdateMemberRole,
  layers,
  onRemoveElement,
  onSelectElement,
  onToggleLock,
  onReorderLayers,
  onToggleVisibility,
  onUpdateProperty,
  onAnimationAddModifierBinding,
  onAnimationAddStateBinding,
  onAnimationAddTimeline,
  onAnimationDeleteTimeline,
  onAnimationDuplicateTimeline,
  onAnimationEditTimeline,
  onAnimationQuickSetup,
  onAnimationRemoveModifierBinding,
  onAnimationRemoveStateBinding,
  onAnimationRenameTimeline,
  onAnimationSelectState,
  onAnimationToggleModifier,
  editorStore,
  editingTimeline,
  editingTimelineSelectedKf,
  preflightIssues,
  selectedElement,
  setEditingTimeline,
  selectedElementInstance,
  setEditingTimelineSelectedKf,
  sidebarTab,
  templateGroups,
  timelinePreviewActiveModifiers,
  timelinePreviewActiveState,
  mediaAssets,
  canvasWidth,
  canvasHeight,
  documentUnit,
}: DemoSidebarPanelProps): React.JSX.Element {
  const keyframeAdapter: PropertyFieldAdapter | null = useMemo(() => {
    if (editingTimeline === null || editingTimelineSelectedKf === null || selectedElement === null) {
      return null;
    }

    return createKeyframeAdapter(
      editorStore,
      selectedElement.id,
      editingTimeline.id,
      editingTimelineSelectedKf,
      (nextTimeline) => {
        setEditingTimeline(nextTimeline);
      },
    );
  }, [editorStore, editingTimeline, editingTimelineSelectedKf, selectedElement, setEditingTimeline]);

  if (sidebarTab === 'layers') {
    return (
      <LayersSidebar
        layers={layers}
        selectedIds={activeElementIds}
        onDelete={onRemoveElement}
        onSelect={(elementId, _mode) => {
          onSelectElement(elementId);
        }}
        onReorder={onReorderLayers}
        onToggleLock={onToggleLock}
        onToggleVisibility={onToggleVisibility}
      />
    );
  }

  if (sidebarTab === 'properties') {
    return (
      <PropertiesSidebar
        documentMode={currentDocumentMode}
        availableFonts={editorStore.getState().availableFonts}
        elements={
          selectedElement === null ? [] : [toPanelElement(selectedElement, selectedElementInstance ?? undefined)]
        }
        mediaAssets={mediaAssets}
        onUpdate={onUpdateProperty}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        documentUnit={documentUnit}
      />
    );
  }

  if (sidebarTab === 'animation') {
    const panelElement =
      selectedElement === null ? null : toPanelElement(selectedElement, selectedElementInstance ?? undefined);

    return (
      <>
        <AnimationSidebar
          element={panelElement}
          isLocked={selectedElement?.locked ?? false}
          animationsEnabled
          timelines={animationConfig?.timelines.map((t) => ({
            id: t.id,
            name: t.name,
            keyframes: t.keyframes,
          }))}
          stateBindings={animationConfig?.stateTimelineBindings.map((b) => ({
            stateName: b.stateName,
            timelineId: b.timelineId,
          }))}
          modifierBindings={animationConfig?.modifierTimelineBindings.map((b) => ({
            modifierName: b.modifierName,
            inTimelineId: b.inTimelineId,
            ...(b.outTimelineId !== undefined ? { outTimelineId: b.outTimelineId } : {}),
          }))}
          availableStates={['IN', 'OUT', 'LOOP']}
          availableModifiers={['hover', 'focus', 'active']}
          activeState={timelinePreviewActiveState}
          activeModifiers={timelinePreviewActiveModifiers}
          onSelectState={onAnimationSelectState}
          onToggleModifier={onAnimationToggleModifier}
          onAddTimeline={onAnimationAddTimeline}
          onEditTimeline={(id: string) => {
            const timeline = animationConfig?.timelines.find((t) => t.id === id);

            if (timeline !== undefined) {
              setEditingTimeline(timeline);
              setEditingTimelineSelectedKf(null);
            }

            onAnimationEditTimeline(id);
          }}
          onDeleteTimeline={onAnimationDeleteTimeline}
          onDuplicateTimeline={onAnimationDuplicateTimeline}
          onRenameTimeline={onAnimationRenameTimeline}
          onQuickSetup={onAnimationQuickSetup}
          onAddStateBinding={onAnimationAddStateBinding}
          onRemoveStateBinding={onAnimationRemoveStateBinding}
          onAddModifierBinding={onAnimationAddModifierBinding}
          onRemoveModifierBinding={onAnimationRemoveModifierBinding}
        />
        {keyframeAdapter !== null && panelElement !== null && (
          <AnimationModePropertiesPanel
            element={panelElement}
            adapter={keyframeAdapter}
            documentMode={currentDocumentMode}
            onUpdate={onUpdateProperty}
            timelineName={editingTimeline?.name}
            keyframeName={
              editingTimelineSelectedKf === null ? undefined : (
                editingTimeline?.keyframes[editingTimelineSelectedKf]?.name
              )
            }
          />
        )}
      </>
    );
  }

  if (sidebarTab === 'template-groups') {
    return (
      <TemplateGroupPanel
        groups={templateGroups}
        availableDocuments={availableDocuments}
        onCreateGroup={handleCreateGroup}
        onRemoveGroup={handleRemoveGroup}
        onRenameGroup={handleRenameGroup}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
        onUpdateMemberRole={handleUpdateMemberRole}
      />
    );
  }

  return (
    <div className="p-3" style={glassPanelStyle()}>
      <PreflightPanel issues={preflightIssues} />
    </div>
  );
}
