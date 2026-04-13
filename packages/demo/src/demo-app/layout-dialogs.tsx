import { Toast } from '@heroui/react';

import {
  AboutModal,
  CanvasSettingsModal,
  ExportModal,
  MediaLibraryModal,
  NewDocumentModal,
  ShortcutHelpModal,
  TemplateBrowserModal,
} from '../../../ui/src/modals';
import { DEMO_DOCUMENT_PRESETS } from '../demoConfig';
import { DEMO_MEDIA_ASSETS, DEMO_TEMPLATES, ENABLED_EXPORTERS, MEDIA_CATEGORIES } from './constants';
import type { DemoAppLayoutProps } from './layout-types';

export function LayoutDialogs(props: DemoAppLayoutProps): React.JSX.Element {
  const {
    activeDialog,
    currentDocument,
    editorState,
    editorStore,
    handleCreateFromPreset,
    handleExportFormat,
    handleMediaSelect,
    handleTemplateSelect,
    setActiveDialog,
  } = props;

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
        showRulers={editorState.canvasSettings.showRulers}
        rulerUnit={editorState.canvasSettings.units}
        viewMode={editorState.canvasSettings.viewMode}
        perspective={editorState.canvasSettings.perspective}
        showGrid={editorState.gridSettings.showGrid}
        gridSize={editorState.gridSettings.gridSize}
        snapToGrid={editorState.gridSettings.snapToGrid}
        snapThreshold={editorState.gridSettings.snapThreshold}
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

      <ExportModal
        isOpen={activeDialog === 'export'}
        enabledExporters={ENABLED_EXPORTERS}
        dynamicData={{}}
        onExport={handleExportFormat}
        onClose={() => {
          setActiveDialog(null);
        }}
      />

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

      <TemplateBrowserModal
        isOpen={activeDialog === 'template-browser'}
        templates={DEMO_TEMPLATES}
        hasUnsavedChanges={false}
        onSelectTemplate={handleTemplateSelect}
        onClose={() => {
          setActiveDialog(null);
        }}
      />

      <Toast.Provider className="bottom-7 right-7 z-40" placement="bottom end" />
    </>
  );
}
