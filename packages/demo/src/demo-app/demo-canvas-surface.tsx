import type { EditorStore, ElementUpdate } from '@broadset/editor';
import type { BroadsetDocument, BroadsetElement } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';

import { ScreenPreview } from '../demo-components';
import { useCanvasViewport } from './helpers';

export interface DemoCanvasSurfaceProps {
  readonly editorStore: EditorStore;
  readonly allElements: readonly BroadsetElement[];
  readonly selectedElement: BroadsetElement | null;
  readonly renderDocument: BroadsetDocument;
  readonly isPlaying: boolean;
  readonly resetToken: number;
  readonly cursor: 'crosshair' | 'default';
  readonly onCanvasClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  readonly onCanvasContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
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
  renderDocument,
  isPlaying,
  resetToken,
  cursor,
  onCanvasClick,
  onCanvasContextMenu,
  onViewportChange,
  onElementTransformPreview,
  onElementTransformCommit,
  onPlaybackControllerChange,
}: DemoCanvasSurfaceProps): React.JSX.Element {
  const viewport = useCanvasViewport(editorStore);

  return (
    <ScreenPreview
      allElements={allElements}
      cursor={cursor}
      documentData={renderDocument}
      isPlaying={isPlaying}
      onPlaybackControllerChange={onPlaybackControllerChange}
      panX={viewport.panX}
      panY={viewport.panY}
      selectedElement={selectedElement}
      zoom={viewport.zoom}
      onCanvasClick={onCanvasClick}
      onCanvasContextMenu={onCanvasContextMenu}
      onElementTransformCommit={onElementTransformCommit}
      onElementTransformPreview={onElementTransformPreview}
      onViewportChange={onViewportChange}
      resetToken={resetToken}
    />
  );
}
