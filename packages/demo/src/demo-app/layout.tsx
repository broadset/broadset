import { EditorErrorBoundary, EditorProvider } from '@broadset/editor';
import { color, TimelineEditingProvider } from '@broadset/ui';

import { COUNTDOWN_PLUGIN } from '../demoConfig';
import { DemoCanvasSurface } from './demo-canvas-surface';
import { DemoRulers } from './demo-rulers';
import { LayoutContextMenu } from './layout-context-menu';
import { LayoutDialogs } from './layout-dialogs';
import { LayoutOverlayControls } from './layout-overlay-controls';
import { LayoutSidebarShell } from './layout-sidebar-shell';
import { LayoutTimelinePanel } from './layout-timeline-panel';
import type { DemoAppLayoutProps } from './layout-types';

export function DemoAppLayout(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    canvasSettings,
    currentDocument,
    dataStore,
    editorState,
    editorStore,
    fileInputRef,
    handleCanvasClick,
    handleCanvasContextMenu,
    handleCanvasPointerMove,
    handleCanvasViewportChange,
    handleElementTransformCommit,
    handleElementTransformPreview,
    handleImportFileChange,
    isPlaying,
    renderDocument,
    resetToken,
    selectedElement,
    viewportSize,
  } = props;

  return (
    <EditorProvider components={[{ ...COUNTDOWN_PLUGIN }]} dataStore={dataStore} store={editorStore}>
      <TimelineEditingProvider>
        <main
          className="fixed inset-0 overflow-hidden"
          data-testid="demo-shell"
          style={{ backgroundColor: color('surface'), color: color('foreground') }}
        >
          <input
            ref={fileInputRef}
            accept=".json,.bsp,.psd,.pptx,.svg,application/json,image/vnd.adobe.photoshop,image/svg+xml"
            hidden
            type="file"
            onChange={(event) => {
              void handleImportFileChange(event);
            }}
          />
          {canvasSettings.showRulers ?
            <DemoRulers
              documentCanvasHeight={currentDocument.canvas.height}
              documentCanvasWidth={currentDocument.canvas.width}
              editorStore={editorStore}
              viewportHeight={viewportSize.height}
              viewportWidth={viewportSize.width}
            />
          : null}

          <EditorErrorBoundary>
            <div className="h-full w-full overflow-hidden">
              <section className="relative h-full overflow-hidden">
                <LayoutOverlayControls {...props} />

                <div className="h-full w-full overflow-hidden">
                  <div
                    className="h-full w-full overflow-hidden"
                    data-testid="demo-canvas-workarea"
                    style={{
                      backgroundColor: color('surface-secondary'),
                      border: `1px solid ${color('border')}`,
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                  >
                    <DemoCanvasSurface
                      allElements={currentDocument.elements}
                      clipPathEditingElement={
                        editorState.clipPathEditingElementId === null ?
                          null
                        : (currentDocument.elements.find(
                            (candidate) => candidate.id === editorState.clipPathEditingElementId,
                          ) ?? null)
                      }
                      cursor={
                        editorState.placement !== null || editorState.pathDrawingElementId !== null ?
                          'crosshair'
                        : 'default'
                      }
                      editorStore={editorStore}
                      isTransformWidgetSuppressed={
                        editorState.placement !== null ||
                        editorState.pathDrawingElementId !== null ||
                        editorState.pathEditingElementId !== null ||
                        editorState.clipPathEditingElementId !== null ||
                        editorState.inlineTextEditingElementId !== null
                      }
                      isPlaying={isPlaying}
                      onCanvasClick={handleCanvasClick}
                      onCanvasContextMenu={handleCanvasContextMenu}
                      onCanvasPointerMove={handleCanvasPointerMove}
                      onElementTransformCommit={handleElementTransformCommit}
                      onElementTransformPreview={handleElementTransformPreview}
                      onPlaybackControllerChange={props.setPreviewPlaybackController}
                      onViewportChange={handleCanvasViewportChange}
                      pathEditingElement={
                        editorState.pathEditingElementId === null ?
                          null
                        : (currentDocument.elements.find(
                            (candidate) => candidate.id === editorState.pathEditingElementId,
                          ) ?? null)
                      }
                      renderDocument={renderDocument}
                      resetToken={resetToken}
                      selectedElement={selectedElement}
                    />
                  </div>
                </div>
              </section>

              <LayoutSidebarShell {...props} />

              <LayoutContextMenu {...props} />
              <LayoutDialogs {...props} />
            </div>
          </EditorErrorBoundary>
        </main>
        <LayoutTimelinePanel {...props} />
      </TimelineEditingProvider>
    </EditorProvider>
  );
}
