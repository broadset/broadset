/** @jest-environment jsdom */

import { createEditorStore } from '@broadset/editor';
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';

import { DemoSidebarPanel, type DemoSidebarPanelProps } from './demo-app/sidebar';
import { DEMO_EDITOR_CONFIG } from './demoConfig';
import { createDemoAppPlaybackTestDocument } from './test-fixtures';

function createSidebarProps(selectedKeyframeIndex: number | null): DemoSidebarPanelProps {
  const playbackDocument = createDemoAppPlaybackTestDocument();
  const editorStore = createEditorStore({ config: DEMO_EDITOR_CONFIG });

  editorStore.getState().loadTemplate(playbackDocument);

  const selectedElement = playbackDocument.elements[0];

  if (selectedElement === undefined) {
    throw new Error('Playback fixture must contain at least one element.');
  }

  const selectedElementInstance = playbackDocument.pages[0]?.elements.find(
    (instance) => instance.elementId === selectedElement.id,
  );

  if (selectedElementInstance === undefined) {
    throw new Error('Playback fixture must contain a page instance for the selected element.');
  }

  const animationConfig = playbackDocument.animations.find(
    (animation) => animation.elementId === selectedElement.id,
  )?.config;

  if (animationConfig === undefined) {
    throw new Error('Playback fixture must contain animation config for the selected element.');
  }

  const editingTimeline = animationConfig.timelines[0];

  if (editingTimeline === undefined) {
    throw new Error('Playback fixture animation config must include at least one timeline.');
  }

  return {
    sidebarTab: 'animation',
    layers: [],
    activeElementIds: [selectedElement.id],
    selectedElement,
    currentDocumentMode: playbackDocument.documentMode,
    selectedElementInstance,
    preflightIssues: [],
    templateGroups: [],
    availableDocuments: [],
    animationConfig,
    handleAddMember: jest.fn(),
    handleCreateGroup: jest.fn(),
    handleRemoveGroup: jest.fn(),
    handleRemoveMember: jest.fn(),
    handleRenameGroup: jest.fn(),
    handleUpdateMemberRole: jest.fn(),
    onRemoveElement: jest.fn(),
    onSelectElement: jest.fn(),
    onToggleLock: jest.fn(),
    onReorderLayers: jest.fn(),
    onToggleVisibility: jest.fn(),
    onUpdateProperty: jest.fn(),
    onAnimationAddModifierBinding: jest.fn(),
    onAnimationAddStateBinding: jest.fn(),
    onAnimationAddTimeline: jest.fn(),
    onAnimationDeleteTimeline: jest.fn(),
    onAnimationDuplicateTimeline: jest.fn(),
    onAnimationEditTimeline: jest.fn(),
    onAnimationQuickSetup: jest.fn(),
    onAnimationRemoveModifierBinding: jest.fn(),
    onAnimationRemoveStateBinding: jest.fn(),
    onAnimationRenameTimeline: jest.fn(),
    onAnimationSelectState: jest.fn(),
    onAnimationToggleModifier: jest.fn(),
    editorStore,
    editingTimeline,
    editingTimelineSelectedKf: selectedKeyframeIndex,
    setEditingTimeline: jest.fn(),
    setEditingTimelineSelectedKf: jest.fn(),
    timelinePreviewActiveModifiers: [],
    timelinePreviewActiveState: null,
    mediaAssets: [],
    canvasWidth: playbackDocument.canvas.width,
    canvasHeight: playbackDocument.canvas.height,
    documentUnit: playbackDocument.canvas.unit,
  };
}

describe('DemoSidebarPanel keyframe routing', () => {
  /** @description Animation-mode property routing must follow keyframe selection state: selected keyframe shows animation properties, deselection restores normal animation sidebar only. */
  it('shows animation mode only while a keyframe is selected', () => {
    const selectedProps = createSidebarProps(0);
    const { rerender } = render(<DemoSidebarPanel {...selectedProps} />);

    expect(screen.getByText('Animation Mode')).not.toBeNull();

    const deselectedProps = createSidebarProps(null);

    rerender(<DemoSidebarPanel {...deselectedProps} />);

    expect(screen.queryByText('Animation Mode')).toBeNull();
  });
});
