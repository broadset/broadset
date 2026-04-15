import type { EditorStore } from '@broadset/editor';
import { createEmptyBroadsetDocument } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { computeTimelineLoopDuration } from '@broadset/playback';
import type { DocumentPreset, MediaAsset, TemplateEntry } from '@broadset/ui';
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback } from 'react';

import type { ActiveDialog } from '../demo-types';
import { DOCUMENT_STORAGE_KEY } from '../demo-types';
import { downloadJsonFile } from '../demo-utils';
import type { ExportFormat } from '../formatBridge';

export interface UseDemoFileHandlersOptions {
  readonly editorStore: EditorStore;
  readonly currentDocument: ReturnType<EditorStore['getState']>['document'];
  readonly playbackControllerRef: Readonly<RefObject<PlaybackController | null>>;
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly setActiveDialog: Dispatch<SetStateAction<ActiveDialog>>;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
}

function formatImportWarningMessage(warnings: readonly string[]): string {
  const [firstWarning, secondWarning] = warnings;

  if (warnings.length === 1 && firstWarning !== undefined) {
    return `Import completed with 1 warning: ${firstWarning}`;
  }

  if (warnings.length > 1 && firstWarning !== undefined) {
    const moreCount = warnings.length - 1;
    const suffix = secondWarning === undefined ? '' : ` Next: ${secondWarning}`;

    return `Import completed with ${String(warnings.length)} warnings. First: ${firstWarning}${suffix}${moreCount > 1 ? ' …' : ''}`;
  }

  return 'Import completed with warnings.';
}

export interface DemoFileHandlers {
  readonly handleCreateFromPreset: (preset: DocumentPreset) => void;
  readonly handleDebugSnapshotDownload: () => void;
  readonly handleDeleteSnapshot: (snapshotId: string) => void;
  readonly handleExportFormat: (exporter: string, data: Readonly<Record<string, unknown>>) => void;
  readonly handleImportFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly handleMediaSelect: (asset: MediaAsset) => void;
  readonly handleOpenImportDialog: () => void;
  readonly handleRestoreSnapshot: (snapshotId: string) => void;
  readonly handleSaveAsJson: () => void;
  readonly handleSaveDocument: () => void;
  readonly handleSaveSnapshot: () => void;
  readonly handleTemplateSelect: (template: TemplateEntry) => void;
}

function getOptionalNumber(data: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = data[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function useDemoFileHandlers({
  editorStore,
  currentDocument,
  playbackControllerRef,
  pushToast,
  setActiveDialog,
  fileInputRef,
}: UseDemoFileHandlersOptions): DemoFileHandlers {
  const handleSaveDocument = useCallback((): void => {
    try {
      window.localStorage.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(currentDocument));
      pushToast('success', 'Saved the demo document locally.');
    } catch {
      pushToast('error', 'Could not save the demo document.');
    }
  }, [currentDocument, pushToast]);

  const handleOpenImportDialog = useCallback((): void => {
    fileInputRef.current?.click();
  }, [fileInputRef]);

  const handleImportFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const file = event.currentTarget.files?.[0];

      if (file === undefined) {
        return;
      }

      try {
        const { importDocument } = await import('../formatBridge');
        const result = await importDocument(file);

        editorStore.getState().loadTemplate(result.document);
        pushToast('success', 'Import complete.');

        if (result.warnings.length > 0) {
          pushToast('info', formatImportWarningMessage(result.warnings));
        }
      } catch (error: unknown) {
        pushToast('error', `Import failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        event.currentTarget.value = '';
      }
    },
    [editorStore, pushToast],
  );

  const handleSaveAsJson = useCallback((): void => {
    try {
      downloadJsonFile(
        `${currentDocument.name.replace(/\s+/g, '-').toLowerCase() || 'broadset-document'}.json`,
        currentDocument,
      );
      pushToast('success', 'Downloaded the current document as JSON.');
    } catch {
      pushToast('error', 'Could not export the document JSON.');
    }
  }, [currentDocument, pushToast]);

  const handleDebugSnapshotDownload = useCallback((): void => {
    try {
      downloadJsonFile('broadset-debug-snapshot.json', editorStore.getState());
      pushToast('success', 'Downloaded a debug snapshot.');
    } catch {
      pushToast('error', 'Could not download a debug snapshot.');
    }
  }, [editorStore, pushToast]);

  const handleSaveSnapshot = useCallback((): void => {
    const name = window.prompt('Snapshot name:');

    if (name === null || name.trim() === '') {
      return;
    }

    try {
      editorStore.getState().saveSnapshot(name.trim());
      pushToast('success', `Saved snapshot "${name.trim()}".`);
    } catch (error: unknown) {
      pushToast('error', error instanceof Error ? error.message : 'Could not save snapshot.');
    }
  }, [editorStore, pushToast]);

  const handleRestoreSnapshot = useCallback(
    (snapshotId: string): void => {
      editorStore.getState().restoreSnapshot(snapshotId);
      pushToast('success', 'Restored snapshot.');
    },
    [editorStore, pushToast],
  );

  const handleDeleteSnapshot = useCallback(
    (snapshotId: string): void => {
      editorStore.getState().deleteSnapshot(snapshotId);
      pushToast('success', 'Deleted snapshot.');
    },
    [editorStore, pushToast],
  );

  const handleCreateFromPreset = useCallback(
    (preset: DocumentPreset): void => {
      const doc = createEmptyBroadsetDocument();
      const viewMode = preset.mode === 'broadcast' || preset.mode === 'print' ? preset.mode : 'none';
      const updated = {
        ...doc,
        name: preset.name,
        canvas: { ...doc.canvas, width: preset.width, height: preset.height, unit: preset.unit as 'in' | 'mm' | 'px' },
      };

      editorStore.getState().loadTemplate(updated);
      editorStore.getState().updateCanvasSettings({ viewMode });
      setActiveDialog(null);
      pushToast(
        'success',
        `Created "${preset.name}" (${String(preset.width)}×${String(preset.height)} ${preset.unit}).`,
      );
    },
    [editorStore, pushToast, setActiveDialog],
  );

  const handleExportFormat = useCallback(
    (exporter: string, data: Readonly<Record<string, unknown>>): void => {
      if (exporter === 'json') {
        handleSaveAsJson();
        setActiveDialog(null);

        return;
      }

      const doExport = async (): Promise<void> => {
        const bridge = await import('../formatBridge');
        const formats = await bridge.loadFormats();
        const snapshotCanvas = formats.discoverCanvasElement() ?? undefined;
        const pixelRatio = getOptionalNumber(data, 'pixelRatio');
        const jpegQuality = getOptionalNumber(data, 'jpegQuality');
        const videoFrameRate = getOptionalNumber(data, 'videoFrameRate');
        const videoQuality = getOptionalNumber(data, 'videoQuality');

        const isVideoFormat = exporter === 'mp4' || exporter === 'webm';
        const controller = playbackControllerRef.current;
        const renderFrame =
          isVideoFormat && controller !== null ?
            (timeMs: number): void => {
              controller.seek(timeMs);
            }
          : undefined;
        const playbackDurationMs =
          isVideoFormat ?
            Math.max(
              1000,
              ...currentDocument.animations.flatMap((a) =>
                a.config.timelines.map((t) => computeTimelineLoopDuration(t)),
              ),
            )
          : undefined;

        await bridge.exportDocument(exporter as ExportFormat, {
          document: currentDocument,
          ...(pixelRatio !== undefined ? { pixelRatio } : {}),
          ...(jpegQuality !== undefined ? { jpegQuality } : {}),
          ...(videoFrameRate !== undefined ? { videoFrameRate } : {}),
          ...(videoQuality !== undefined ? { videoQuality } : {}),
          ...(snapshotCanvas !== undefined ? { snapshotCanvas } : {}),
          ...(renderFrame !== undefined ? { renderFrame } : {}),
          ...(playbackDurationMs !== undefined ? { playbackDurationMs } : {}),
        });
        pushToast('success', `Exported as ${exporter.toUpperCase()}.`);
      };

      void doExport().catch((error: unknown) => {
        pushToast('error', `Export failed: ${error instanceof Error ? error.message : String(error)}`);
      });

      setActiveDialog(null);
    },
    [currentDocument, handleSaveAsJson, pushToast, setActiveDialog],
  );

  const handleMediaSelect = useCallback(
    (asset: MediaAsset): void => {
      pushToast('success', `Selected media: ${asset.name}`);
      setActiveDialog(null);
    },
    [pushToast, setActiveDialog],
  );

  const handleTemplateSelect = useCallback(
    (template: TemplateEntry): void => {
      const doc = createEmptyBroadsetDocument();

      editorStore.getState().loadTemplate({ ...doc, name: template.name });
      setActiveDialog(null);
      pushToast('success', `Loaded template "${template.name}".`);
    },
    [editorStore, pushToast, setActiveDialog],
  );

  return {
    handleCreateFromPreset,
    handleDebugSnapshotDownload,
    handleDeleteSnapshot,
    handleExportFormat,
    handleImportFileChange,
    handleMediaSelect,
    handleOpenImportDialog,
    handleRestoreSnapshot,
    handleSaveAsJson,
    handleSaveDocument,
    handleSaveSnapshot,
    handleTemplateSelect,
  };
}
