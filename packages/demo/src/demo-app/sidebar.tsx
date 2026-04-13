import type {
  BroadsetDocument,
  BroadsetElement,
  ElementAnimationConfig,
  TemplateGroup,
  TemplateGroupRole,
  Timeline,
} from '@broadset/model';
import {
  AnimationSidebar,
  glassPanelStyle,
  type LayerInfo,
  LayersSidebar,
  type PreflightIssue,
  PreflightPanel,
  PropertiesSidebar,
  type PropertyValue,
  TemplateGroupPanel,
} from '@broadset/ui';
import { toast } from '@heroui/react';

import type { SidebarTab } from '../demo-types';
import { toPanelElement } from '../demo-utils';

export interface DemoSidebarPanelProps {
  readonly sidebarTab: SidebarTab;
  readonly layers: readonly LayerInfo[];
  readonly activeElementIds: readonly string[];
  readonly selectedElement: BroadsetElement | null;
  readonly currentDocumentMode: BroadsetDocument['documentMode'];
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
  readonly onToggleVisibility: (elementId: string) => void;
  readonly onUpdateProperty: (key: string, value: PropertyValue) => void;
  readonly setEditingTimeline: (timeline: Timeline | null) => void;
  readonly setEditingTimelineSelectedKf: (index: number | null) => void;
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
  onToggleVisibility,
  onUpdateProperty,
  preflightIssues,
  selectedElement,
  setEditingTimeline,
  setEditingTimelineSelectedKf,
  sidebarTab,
  templateGroups,
}: DemoSidebarPanelProps): React.JSX.Element {
  if (sidebarTab === 'layers') {
    return (
      <LayersSidebar
        layers={layers}
        selectedIds={activeElementIds}
        onDelete={onRemoveElement}
        onSelect={(elementId, _mode) => {
          onSelectElement(elementId);
        }}
        onToggleLock={onToggleLock}
        onToggleVisibility={onToggleVisibility}
      />
    );
  }

  if (sidebarTab === 'properties') {
    return (
      <PropertiesSidebar
        documentMode={currentDocumentMode}
        elements={selectedElement === null ? [] : [toPanelElement(selectedElement)]}
        onUpdate={onUpdateProperty}
      />
    );
  }

  if (sidebarTab === 'animation') {
    return (
      <AnimationSidebar
        element={selectedElement === null ? null : toPanelElement(selectedElement)}
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
        activeState={null}
        activeModifiers={[]}
        onSelectState={() => {
          toast.info('State selection not yet wired.');
        }}
        onToggleModifier={() => {
          toast.info('Modifier toggle not yet wired.');
        }}
        onAddTimeline={() => {
          toast.info('Add timeline not yet wired.');
        }}
        onEditTimeline={(id: string) => {
          const timeline = animationConfig?.timelines.find((t) => t.id === id);

          if (timeline !== undefined) {
            setEditingTimeline(timeline);
            setEditingTimelineSelectedKf(null);
          }
        }}
        onDeleteTimeline={() => {
          toast.info('Delete timeline not yet wired.');
        }}
        onDuplicateTimeline={() => {
          toast.info('Duplicate timeline not yet wired.');
        }}
        onRenameTimeline={() => {
          toast.info('Rename timeline not yet wired.');
        }}
        onQuickSetup={() => {
          toast.info('Quick setup not yet wired.');
        }}
        onAddStateBinding={() => {
          toast.info('Add state binding not yet wired.');
        }}
        onRemoveStateBinding={() => {
          toast.info('Remove state binding not yet wired.');
        }}
        onAddModifierBinding={() => {
          toast.info('Add modifier binding not yet wired.');
        }}
        onRemoveModifierBinding={() => {
          toast.info('Remove modifier binding not yet wired.');
        }}
      />
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
