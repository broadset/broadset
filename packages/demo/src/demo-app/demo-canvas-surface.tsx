import type { EditorStore, ElementUpdate } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';

import { ScreenPreview } from '../demo-components';
import { useCanvasViewport } from './helpers';

interface DemoCanvasSurfaceProps {
  readonly editorStore: EditorStore;
  readonly allElements: readonly BroadsetElement[];
  readonly selectedElement: BroadsetElement | null;
  readonly pathEditingElement: BroadsetElement | null;
  readonly clipPathEditingElement: BroadsetElement | null;
  readonly isTransformWidgetSuppressed: boolean;
  readonly renderDocument: BroadsetDocument;
  readonly isPlaying: boolean;
  readonly resetToken: number;
  readonly cursor: 'crosshair' | 'default';
  readonly onCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasPointerMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onViewportChange: (settings: {
    readonly panX?: number;
    readonly panY?: number;
    readonly zoom?: number;
  }) => void;
  readonly onElementTransformPreview: (elementId: string, updates: ElementUpdate) => void;
  readonly onElementTransformCommit: (elementId: string, updates: ElementUpdate) => void;
  readonly onPlaybackControllerChange: (controller: PlaybackController | null) => void;
}

export function DemoCanvasSurface({
  editorStore,
  allElements,
  selectedElement,
  pathEditingElement,
  clipPathEditingElement,
  isTransformWidgetSuppressed,
  renderDocument,
  isPlaying,
  resetToken,
  cursor,
  onCanvasClick,
  onCanvasContextMenu,
  onCanvasPointerMove,
  onViewportChange,
  onElementTransformPreview,
  onElementTransformCommit,
  onPlaybackControllerChange,
}: DemoCanvasSurfaceProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);

  return (
    <ScreenPreview
      allElements={allElements}
      clipPathEditingElement={clipPathEditingElement}
      cursor={cursor}
      isTransformWidgetSuppressed={isTransformWidgetSuppressed}
      documentData={renderDocument}
      editorStore={editorStore}
      isPlaying={isPlaying}
      onPlaybackControllerChange={onPlaybackControllerChange}
      panX={viewport.panX}
      panY={viewport.panY}
      pathEditingElement={pathEditingElement}
      selectedElement={selectedElement}
      zoom={viewport.zoom}
      onCanvasClick={onCanvasClick}
      onCanvasContextMenu={onCanvasContextMenu}
      onCanvasPointerMove={onCanvasPointerMove}
      onElementTransformCommit={onElementTransformCommit}
      onElementTransformPreview={onElementTransformPreview}
      onViewportChange={onViewportChange}
      perspective={viewport.perspective}
      resetToken={resetToken}
    />
  );
}
