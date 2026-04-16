import type { EditorStore } from '@broadset/editor';
import type { BroadsetDocument } from '@broadset/model';
import { createEmptyBroadsetDocument } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { computeTimelineLoopDuration, createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import type { DocumentPreset, ExportProgress, MediaAsset, TemplateEntry } from '@broadset/ui';
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
  readonly exportProgress: ExportProgress | null;
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

const FORMATS_LOAD_TIMEOUT_MS = 60_000;

/** Round up to the nearest even number (H.264 requires even dimensions). */
function ensureEven(n: number): number {
  const rounded = Math.ceil(n);

  return rounded % 2 === 0 ? rounded : rounded + 1;
}

async function preRenderFramesOffscreen(options: {
  readonly doc: BroadsetDocument;
  readonly totalFrames: number;
  readonly frameRate: number;
  readonly width: number;
  readonly height: number;
  readonly createBatchCapture: (
    el: HTMLElement,
    w: number,
    h: number,
  ) => Promise<{
    readonly capture: () => Promise<HTMLCanvasElement>;
    readonly destroy: () => void;
  }>;
  readonly onProgress?: (frame: number, total: number) => void;
}): Promise<readonly ImageData[]> {
  const { doc, totalFrames, frameRate, width, height, createBatchCapture, onProgress } = options;

  // Create a hidden host that is part of the DOM (so CSS/fonts resolve) but
  // invisible to the user.  Using `visibility: hidden` instead of
  // `display: none` ensures the browser still lays out the elements.
  const offscreenHost = document.createElement('div');

  offscreenHost.style.position = 'fixed';
  offscreenHost.style.left = '-99999px';
  offscreenHost.style.top = '0';
  offscreenHost.style.width = `${String(width)}px`;
  offscreenHost.style.height = `${String(height)}px`;
  offscreenHost.style.overflow = 'hidden';
  offscreenHost.style.pointerEvents = 'none';
  offscreenHost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(offscreenHost);

  const renderer = createScreenRenderer({ host: offscreenHost, document: doc });
  const controller = createPlaybackController({
    root: offscreenHost,
    animations: doc.animations,
    suppressTransitions: true,
  });

  controller.attach();

  try {
    // The renderer root is the [data-broadset-canvas-root] child it created.
    const canvasRoot = offscreenHost.querySelector<HTMLElement>('[data-broadset-canvas-root]');

    if (canvasRoot === null) {
      throw new Error('Offscreen renderer did not create a canvas root');
    }

    // Create a batch capture session that pre-embeds fonts/images ONCE.
    // Subsequent capture() calls reuse cached data — orders of magnitude
    // faster than calling captureElementToCanvas per frame.
    const session = await createBatchCapture(canvasRoot, width, height);

    try {
      const frames: ImageData[] = [];

      for (let i = 0; i < totalFrames; i++) {
        const timeMs = (i / frameRate) * 1000;

        controller.seek(timeMs);

        // No waitTwoFrames needed: seek() updates CSS synchronously and
        // modern-screenshot reads computed styles from the live DOM, not
        // painted pixels. The batch session handles any needed yields.
        const captured = await session.capture();
        const ctx = captured.getContext('2d');

        if (ctx === null) {
          throw new Error('Failed to get 2d context from captured canvas');
        }

        frames.push(ctx.getImageData(0, 0, captured.width, captured.height));
        onProgress?.(i + 1, totalFrames);
      }

      return frames;
    } finally {
      session.destroy();
    }
  } finally {
    controller.destroy();
    renderer.destroy();
    offscreenHost.remove();
  }
}

export function useDemoFileHandlers({
  editorStore,
  currentDocument,
  pushToast,
  setActiveDialog,
  fileInputRef,
}: UseDemoFileHandlersOptions): DemoFileHandlers {
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);

  useEffect(() => {
    // Warm the formats bundle in the background so export starts faster and
    // avoids stalling at first-use dynamic import under browser CT.
    void import('../formatBridge')
      .then(async (bridge) => {
        await bridge.loadFormats();
      })
      .catch(() => {
        // Ignore prewarm failures. Real export path reports actionable errors.
      });
  }, []);

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

      const isVideoFormat = exporter === 'mp4' || exporter === 'webm';

      // For video exports, keep the dialog open to show progress.
      if (!isVideoFormat) {
        setActiveDialog(null);
      }

      const doExport = async (): Promise<void> => {
        document.body.setAttribute('data-export-status', 'loading');
        setExportProgress(isVideoFormat ? { progress: 0, stage: 'Loading export engine…' } : null);

        const bridge = await import('../formatBridge');

        document.body.setAttribute('data-export-status', 'bridge-loaded');
        document.body.setAttribute('data-export-status', 'formats-loading');

        const formats = await Promise.race([
          bridge.loadFormats(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => {
              reject(new Error('Timed out while loading export formats.'));
            }, FORMATS_LOAD_TIMEOUT_MS);
          }),
        ]);

        document.body.setAttribute('data-export-status', 'formats-loaded');
        setExportProgress(isVideoFormat ? { progress: 0.05, stage: 'Preparing export…' } : null);

        const pixelRatio = getOptionalNumber(data, 'pixelRatio');
        const jpegQuality = getOptionalNumber(data, 'jpegQuality');
        const videoFrameRate = getOptionalNumber(data, 'videoFrameRate');
        const videoQuality = getOptionalNumber(data, 'videoQuality');

        const videoFrameRateActual = videoFrameRate ?? 30;

        // Parse selected animation IDs from export data.
        const rawSelectedIds = data['selectedAnimationIds'];
        const selectedAnimationIds =
          Array.isArray(rawSelectedIds) ?
            new Set(rawSelectedIds.filter((id): id is string => typeof id === 'string'))
          : null;

        // Filter animations to only selected ones (for video export).
        const exportAnimations =
          selectedAnimationIds !== null && selectedAnimationIds.size > 0 ?
            currentDocument.animations.filter((a) => selectedAnimationIds.has(a.elementId))
          : currentDocument.animations;

        // For raster exports, try native <canvas> first, then DOM renderer root.
        // Video exports pre-render frames offscreen and don't need this snapshot.
        let snapshotCanvas: HTMLCanvasElement | undefined;

        if (!isVideoFormat) {
          snapshotCanvas = formats.discoverCanvasElement() ?? undefined;

          const rendererRoot = snapshotCanvas === undefined ? formats.discoverRendererRoot() : null;

          if (snapshotCanvas === undefined && rendererRoot !== null) {
            snapshotCanvas = await formats.captureElementToCanvas(
              rendererRoot,
              currentDocument.canvas.width,
              currentDocument.canvas.height,
            );
          }
        }

        // Fail fast if WebCodecs is unavailable — don't waste time
        // pre-rendering frames only to discover we can't encode them.
        if (isVideoFormat && !formats.isVideoExportSupported()) {
          throw new Error('Video export is not supported: VideoEncoder API is unavailable in this browser.');
        }

        let renderFrame: ((timeMs: number) => void | Promise<void>) | undefined;
        let playbackDurationMs: number | undefined;

        if (isVideoFormat) {
          // Force even dimensions for H.264 codec compatibility.
          const exportWidth = ensureEven(currentDocument.canvas.width);
          const exportHeight = ensureEven(currentDocument.canvas.height);

          // Compute the playback duration from the selected animations.
          playbackDurationMs = Math.max(
            1000,
            ...exportAnimations
              .flatMap((a) => a.config.timelines.map((t) => computeTimelineLoopDuration(t)))
              .filter((d) => Number.isFinite(d)),
          );

          const totalFrames = Math.ceil((playbackDurationMs / 1000) * videoFrameRateActual);

          setExportProgress({ progress: 0.1, stage: `Rendering ${String(totalFrames)} frames…` });
          document.body.setAttribute('data-export-status', 'rendering');

          // Build a document with only the selected animations for the
          // offscreen renderer — all elements are still rendered, but only
          // selected animations will drive property changes during seek.
          const exportDoc: BroadsetDocument = {
            ...currentDocument,
            animations: [...exportAnimations],
          };

          // Pre-render every frame in a disposable offscreen renderer so the
          // live editor workspace is not disturbed.
          const preRendered = await preRenderFramesOffscreen({
            doc: exportDoc,
            totalFrames,
            frameRate: videoFrameRateActual,
            width: exportWidth,
            height: exportHeight,
            createBatchCapture: formats.createBatchCapture,
            onProgress: (frame, total) => {
              document.body.setAttribute('data-export-progress', `${String(frame)}/${String(total)}`);

              const renderProgress = 0.1 + 0.6 * (frame / total);

              setExportProgress({
                progress: renderProgress,
                stage: `Rendering frame ${String(frame)} / ${String(total)}`,
              });
            },
          });

          setExportProgress({ progress: 0.75, stage: `Encoding ${exporter.toUpperCase()} video…` });
          document.body.setAttribute('data-export-status', 'encoding');

          // Create a canvas for the encoder to read from.
          snapshotCanvas = document.createElement('canvas');
          snapshotCanvas.width = exportWidth;
          snapshotCanvas.height = exportHeight;

          const encodingCanvas = snapshotCanvas;

          renderFrame = (timeMs: number): void => {
            const frameIndex = Math.min(Math.round((timeMs / 1000) * videoFrameRateActual), preRendered.length - 1);
            const imageData = preRendered[frameIndex];

            if (imageData !== undefined) {
              const ctx = encodingCanvas.getContext('2d');

              ctx?.putImageData(imageData, 0, 0);
            }
          };
        }

        await bridge.exportDocument(exporter as ExportFormat, {
          document: currentDocument,
          ...(pixelRatio !== undefined ? { pixelRatio } : {}),
          ...(jpegQuality !== undefined ? { jpegQuality } : {}),
          ...(videoFrameRate !== undefined ? { videoFrameRate } : {}),
          ...(videoQuality !== undefined ? { videoQuality } : {}),
          ...(snapshotCanvas !== undefined ? { snapshotCanvas } : {}),
          ...(renderFrame !== undefined ? { renderFrame } : {}),
          ...(playbackDurationMs !== undefined ? { playbackDurationMs } : {}),
          onProgress: (progress: number, stage?: string) => {
            // Map encoder progress (0–1) into our 0.75–0.95 range.
            const encoderProgress = 0.75 + 0.2 * progress;

            setExportProgress({ progress: encoderProgress, stage: stage ?? 'Encoding…' });
          },
        });

        setExportProgress({ progress: 1, stage: 'Done!' });
        pushToast('success', `Exported as ${exporter.toUpperCase()}.`);
        document.body.setAttribute('data-export-status', 'done');
      };

      void doExport()
        .catch((error: unknown) => {
          pushToast('error', `Export failed: ${error instanceof Error ? error.message : String(error)}`);
          document.body.setAttribute('data-export-status', 'error');
        })
        .finally(() => {
          // Close the modal after export finishes (success or error).
          if (isVideoFormat) {
            setActiveDialog(null);
          }

          setExportProgress(null);
        });
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
    exportProgress,
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
