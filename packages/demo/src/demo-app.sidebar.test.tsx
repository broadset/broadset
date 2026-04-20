/** @vitest-environment jsdom */

import { createEditorStore } from '@broadset/editor';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
    handleAddMember: vi.fn(),
    handleCreateGroup: vi.fn(),
    handleRemoveGroup: vi.fn(),
    handleRemoveMember: vi.fn(),
    handleRenameGroup: vi.fn(),
    handleUpdateMemberRole: vi.fn(),
    onRemoveElement: vi.fn(),
    onSelectElement: vi.fn(),
    onToggleLock: vi.fn(),
    onReorderLayers: vi.fn(),
    onToggleVisibility: vi.fn(),
    onUpdateProperty: vi.fn(),
    onAnimationAddModifierBinding: vi.fn(),
    onAnimationAddStateBinding: vi.fn(),
    onAnimationAddTimeline: vi.fn(),
    onAnimationDeleteTimeline: vi.fn(),
    onAnimationDuplicateTimeline: vi.fn(),
    onAnimationEditTimeline: vi.fn(),
    onAnimationQuickSetup: vi.fn(),
    onAnimationRemoveModifierBinding: vi.fn(),
    onAnimationRemoveStateBinding: vi.fn(),
    onAnimationRenameTimeline: vi.fn(),
    onAnimationSelectState: vi.fn(),
    onAnimationToggleModifier: vi.fn(),
    editorStore,
    editingTimeline,
    editingTimelineSelectedKf: selectedKeyframeIndex,
    setEditingTimeline: vi.fn(),
    setEditingTimelineSelectedKf: vi.fn(),
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
