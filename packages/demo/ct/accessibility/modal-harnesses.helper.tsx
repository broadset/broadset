import {
  CanvasSettingsModal,
  type DocumentPreset,
  ExportModal,
  GuidePositionModal,
  type MediaAsset,
  MediaLibraryModal,
  NewDocumentModal,
  TemplateBrowserModal,
  type TemplateEntry,
} from '@broadset/ui';
import { type JSX, useState } from 'react';

export const CT_MEDIA_ASSETS: readonly MediaAsset[] = [
  { id: 'a-logo', name: 'Arena Logo', url: 'https://example.com/logo.png', category: 'Logos' },
  { id: 'a-photo', name: 'Player Photo', url: 'https://example.com/photo.png', category: 'Photos' },
];

export const CT_DOCUMENT_PRESETS: readonly DocumentPreset[] = [
  { name: 'HD Broadcast', width: 1920, height: 1080, unit: 'px', mode: 'screen', category: 'Broadcast' },
  { name: 'Square Social', width: 1080, height: 1080, unit: 'px', mode: 'screen', category: 'Social' },
];

export const CT_TEMPLATE_ENTRIES: readonly TemplateEntry[] = [
  { id: 'tpl-live', name: 'Live Show', thumbnail: 'https://example.com/live.png', category: 'Broadcast' },
  { id: 'tpl-result', name: 'Final Result', thumbnail: 'https://example.com/result.png', category: 'Broadcast' },
];

export function CanvasSettingsHarness(): JSX.Element {
  const [documentName, setDocumentName] = useState('Demo Document');
  const [showRulers, setShowRulers] = useState(true);
  const [rulerUnit, setRulerUnit] = useState<'in' | 'mm' | 'px'>('px');
  const [viewMode, setViewMode] = useState<'broadcast' | 'none' | 'print'>('broadcast');
  const [showGrid, setShowGrid] = useState(true);
  const [showExperimentalFeatures, setShowExperimentalFeatures] = useState(true);

  return (
    <>
      <CanvasSettingsModal
        isOpen
        documentName={documentName}
        showRulers={showRulers}
        rulerUnit={rulerUnit}
        viewMode={viewMode}
        perspective={1200}
        showGrid={showGrid}
        gridSize={10}
        snapToGrid
        snapThreshold={8}
        showExperimentalFeatures={showExperimentalFeatures}
        onDocumentNameChange={setDocumentName}
        onRulerChange={setShowRulers}
        onRulerUnitChange={(unit) => {
          if (unit === 'px' || unit === 'mm' || unit === 'in') {
            setRulerUnit(unit);
          }
        }}
        onViewModeChange={(mode) => {
          if (mode === 'broadcast' || mode === 'none' || mode === 'print') {
            setViewMode(mode);
          }
        }}
        onPerspectiveChange={() => undefined}
        onShowExperimentalFeaturesChange={setShowExperimentalFeatures}
        onGridChange={(changes) => {
          if (changes.showGrid !== undefined) {
            setShowGrid(changes.showGrid);
          }
        }}
        onClose={() => undefined}
      />
      <output data-testid="settings-state">{`${documentName}|${String(showRulers)}|${rulerUnit}|${viewMode}|${String(showGrid)}`}</output>
    </>
  );
}

export function ExportHarness(): JSX.Element {
  const [payload, setPayload] = useState('none');

  return (
    <>
      <ExportModal
        isOpen
        enabledExporters={['html', 'png']}
        dynamicData={{ score: 3 }}
        onExport={(exporter, data) => {
          setPayload(JSON.stringify({ data, exporter }));
        }}
        onClose={() => undefined}
      />
      <output data-testid="export-payload">{payload}</output>
    </>
  );
}

export function MediaLibraryHarness(): JSX.Element {
  const [selected, setSelected] = useState('none');
  const [uploads, setUploads] = useState(0);

  return (
    <>
      <MediaLibraryModal
        isOpen
        assets={CT_MEDIA_ASSETS}
        categories={['All', 'Logos', 'Photos']}
        onSelect={(asset) => {
          setSelected(asset.id);
        }}
        onUploadRequest={() => {
          setUploads((count) => count + 1);
        }}
        onClose={() => undefined}
      />
      <output data-testid="media-selected">{selected}</output>
      <output data-testid="media-uploads">{String(uploads)}</output>
    </>
  );
}

export function NewDocumentHarness(): JSX.Element {
  const [created, setCreated] = useState('none');

  return (
    <>
      <NewDocumentModal
        isOpen
        presets={CT_DOCUMENT_PRESETS}
        onCreateDocument={(preset) => {
          setCreated(preset.name);
        }}
        onClose={() => undefined}
      />
      <output data-testid="new-document-created">{created}</output>
    </>
  );
}

export function TemplateBrowserHarness(): JSX.Element {
  const [created, setCreated] = useState('none');

  return (
    <>
      <TemplateBrowserModal
        isOpen
        templates={CT_TEMPLATE_ENTRIES}
        hasUnsavedChanges
        onSelectTemplate={(template) => {
          setCreated(template.id);
        }}
        onClose={() => undefined}
      />
      <output data-testid="template-created">{created}</output>
    </>
  );
}

export function GuidePositionHarness(): JSX.Element {
  const [position, setPosition] = useState(48);
  const [applyCount, setApplyCount] = useState(0);
  const [deletedCount, setDeletedCount] = useState(0);

  return (
    <>
      <GuidePositionModal
        isOpen
        position={position}
        unit="px"
        onApply={(value) => {
          setPosition(value);
          setApplyCount((count) => count + 1);
        }}
        onDelete={() => {
          setDeletedCount((value) => value + 1);
        }}
        onClose={() => undefined}
      />
      <output data-testid="guide-applies">{String(applyCount)}</output>
      <output data-testid="guide-position">{String(position)}</output>
      <output data-testid="guide-deletes">{String(deletedCount)}</output>
    </>
  );
}
