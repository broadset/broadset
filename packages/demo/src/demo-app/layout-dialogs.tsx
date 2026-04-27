import { computeTimelineLoopDuration } from '@broadset/playback';
import {
  AboutModal,
  CanvasSettingsModal,
  type ExportAnimationInfo,
  ExportModal,
  FormatImportWarningsModal,
  MediaLibraryModal,
  NewDocumentModal,
  ShortcutHelpModal,
  TemplateBrowserModal,
} from '@broadset/ui';
import { Toast } from '@heroui/react';
import { useMemo } from 'react';

import { DEMO_DOCUMENT_PRESETS } from '../demoConfig';
import { DEMO_MEDIA_ASSETS, DEMO_TEMPLATES, ENABLED_EXPORTERS, MEDIA_CATEGORIES } from './constants';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutDialogs(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    activeDialog,
    canvasSettings,
    currentDocument,
    editorState,
    editorStore,
    exportProgress,
    handleCreateFromPreset,
    handleExportFormat,
    handleMediaSelect,
    handleTemplateSelect,
    pendingImportFormatLabel,
    pendingImportWarnings,
    setActiveDialog,
    setPendingImportWarnings,
  } = props;

  // Compute animation info for the ExportModal from the current document.
  const exportAnimations: readonly ExportAnimationInfo[] = useMemo(() => {
    return currentDocument.animations.map((anim) => {
      const element = currentDocument.elements.find((el) => el.id === anim.elementId);
      const maxDuration = Math.max(
        0,
        ...anim.config.timelines.map((t) => computeTimelineLoopDuration(t)).filter((d) => Number.isFinite(d)),
      );

      return {
        elementId: anim.elementId,
        elementName: element?.name ?? anim.elementId,
        durationMs: maxDuration,
        timelineCount: anim.config.timelines.length,
      };
    });
  }, [currentDocument.animations, currentDocument.elements]);

  return (
    <>
      <NewDocumentModal
        isOpen={activeDialog === 'new-document'}
        presets={DEMO_DOCUMENT_PRESETS}
        onCreateDocument={handleCreateFromPreset}
        onClose={() => {
          setActiveDialog(null);
        }}
      />

      <CanvasSettingsModal
        isOpen={activeDialog === 'settings'}
        documentName={currentDocument.name}
        showRulers={canvasSettings.showRulers}
        rulerUnit={canvasSettings.units}
        viewMode={canvasSettings.viewMode}
        perspective={canvasSettings.perspective}
        showGrid={editorState.gridSettings.showGrid}
        gridSize={editorState.gridSettings.gridSize}
        snapToGrid={editorState.gridSettings.snapToGrid}
        snapThreshold={editorState.gridSettings.snapThreshold}
        showExperimentalFeatures={canvasSettings.showExperimentalFeatures}
        onDocumentNameChange={(name: string) => {
          editorStore.getState().loadTemplate({ ...currentDocument, name });
        }}
        onRulerChange={(show: boolean) => {
          editorStore.getState().updateCanvasSettings({ showRulers: show });
        }}
        onRulerUnitChange={(unit: string) => {
          editorStore.getState().updateCanvasSettings({ units: unit as 'in' | 'mm' | 'px' });
        }}
        onViewModeChange={(mode: string) => {
          editorStore.getState().updateCanvasSettings({ viewMode: mode as 'broadcast' | 'none' | 'print' });
        }}
        onPerspectiveChange={(value: number) => {
          editorStore.getState().updateCanvasSettings({ perspective: value });
        }}
        onShowExperimentalFeaturesChange={(value: boolean) => {
          editorStore.getState().updateCanvasSettings({ showExperimentalFeatures: value });
        }}
        onGridChange={(changes: {
          gridSize?: number;
          showGrid?: boolean;
          snapThreshold?: number;
          snapToGrid?: boolean;
        }) => {
          editorStore.getState().updateGridSettings(changes);
        }}
        onClose={() => {
          setActiveDialog(null);
        }}
      />

      {canvasSettings.showExperimentalFeatures ?
        <ExportModal
          isOpen={activeDialog === 'export'}
          enabledExporters={ENABLED_EXPORTERS}
          dynamicData={{}}
          animations={exportAnimations}
          exportProgress={exportProgress}
          onExport={handleExportFormat}
          onClose={() => {
            setActiveDialog(null);
          }}
        />
      : null}

      <ShortcutHelpModal
        isOpen={activeDialog === 'shortcuts'}
        onClose={() => {
          setActiveDialog(null);
        }}
      />

      <AboutModal
        isOpen={activeDialog === 'about'}
        version="0.1.0"
        onClose={() => {
          setActiveDialog(null);
        }}
      />

      <MediaLibraryModal
        isOpen={activeDialog === 'media-library'}
        assets={DEMO_MEDIA_ASSETS}
        categories={MEDIA_CATEGORIES}
        onSelect={handleMediaSelect}
        onClose={() => {
          setActiveDialog(null);
        }}
      />

      {canvasSettings.showExperimentalFeatures ?
        <TemplateBrowserModal
          isOpen={activeDialog === 'template-browser'}
          templates={DEMO_TEMPLATES}
          hasUnsavedChanges={false}
          onSelectTemplate={handleTemplateSelect}
          onClose={() => {
            setActiveDialog(null);
          }}
        />
      : null}

      <FormatImportWarningsModal
        isOpen={activeDialog === 'format-import-warnings'}
        formatLabel={pendingImportFormatLabel}
        warnings={pendingImportWarnings}
        onClose={() => {
          setActiveDialog(null);
          setPendingImportWarnings([]);
        }}
        onAcknowledge={() => {
          setActiveDialog(null);
          setPendingImportWarnings([]);
        }}
      />

      <Toast.Provider className="bottom-7 right-7 z-40" placement="bottom end" />
    </>
  );
}
