import { EditorErrorBoundary, EditorProvider } from '@broadset/editor';
import { color, glassPanelStyle, sp, TimelineEditingProvider } from '@broadset/ui';

import { RulerStrip, ScreenPreview } from '../demo-components';
import { RULER_SIZE } from '../demo-types';
import { COUNTDOWN_PLUGIN } from '../demoConfig';
import { LayoutContextMenu } from './layout-context-menu';
import { LayoutDialogs } from './layout-dialogs';
import { LayoutOverlayControls } from './layout-overlay-controls';
import { LayoutSidebarShell } from './layout-sidebar-shell';
import { LayoutTimelinePanel } from './layout-timeline-panel';
import type { DemoAppLayoutProps } from './layout-types';

export function DemoAppLayout(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    currentDocument,
    dataStore,
    editorState,
    editorStore,
    fileInputRef,
    handleCanvasClick,
    handleCanvasContextMenu,
    handleCanvasViewportChange,
    handleElementTransformCommit,
    handleElementTransformPreview,
    handleImportFileChange,
    horizontalTicks,
    isPlaying,
    resetToken,
    selectedElement,
    verticalTicks,
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
          {editorState.canvasSettings.showRulers ?
            <>
              <div
                className="absolute left-0 top-0 z-30"
                data-testid="ruler-corner"
                style={{ height: `${String(RULER_SIZE)}px`, width: `${String(RULER_SIZE)}px` }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    ...glassPanelStyle(),
                    borderRadius: 0,
                    height: '100%',
                    width: '100%',
                  }}
                />
              </div>

              <div
                className="absolute right-0 top-0 z-20"
                data-testid="ruler-horizontal-strip"
                style={{ height: `${String(RULER_SIZE)}px`, left: `${String(RULER_SIZE)}px` }}
              >
                <RulerStrip orientation="horizontal" ticks={horizontalTicks} />
              </div>

              <div
                className="absolute bottom-0 left-0 z-20"
                data-testid="ruler-vertical-strip"
                style={{ top: `${String(RULER_SIZE)}px`, width: `${String(RULER_SIZE)}px` }}
              >
                <RulerStrip orientation="vertical" ticks={verticalTicks} />
              </div>
            </>
          : null}

          <EditorErrorBoundary>
            <div
              className="h-full w-full overflow-hidden"
              style={{ paddingLeft: `${String(RULER_SIZE)}px`, paddingTop: `${String(RULER_SIZE)}px` }}
            >
              <section
                className="relative h-full overflow-hidden"
                style={{
                  padding: sp('sp-04'),
                  paddingRight: sp('sp-04'),
                }}
              >
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
                    <ScreenPreview
                      cursor={editorState.pendingPlacementType === null ? 'default' : 'crosshair'}
                      documentData={currentDocument}
                      isPlaying={isPlaying}
                      panX={editorState.canvasSettings.panX}
                      panY={editorState.canvasSettings.panY}
                      selectedElement={selectedElement}
                      zoom={editorState.canvasSettings.zoom}
                      onCanvasClick={handleCanvasClick}
                      onCanvasContextMenu={handleCanvasContextMenu}
                      onElementTransformCommit={handleElementTransformCommit}
                      onElementTransformPreview={handleElementTransformPreview}
                      onViewportChange={handleCanvasViewportChange}
                      resetToken={resetToken}
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
