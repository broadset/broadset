import type { EditorStore } from '@broadset/editor';
import type { BroadsetDocument } from '@broadset/model';
import { createEmptyBroadsetDocument } from '@broadset/model';
import type { PlaybackController } from '@broadset/playback';
import { computeTimelineLoopDuration, createPlaybackController } from '@broadset/playback';
import { createScreenRenderer } from '@broadset/renderer';
import type { DocumentPreset, MediaAsset, TemplateEntry } from '@broadset/ui';
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect } from 'react';

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

const FORMATS_LOAD_TIMEOUT_MS = 60_000;

/**
 * Pre-renders all video frames using a disposable offscreen DOM renderer.
 *
 * Creates a hidden renderer + playback controller, seeks to each frame time,
 * captures via `domToCanvas`, and returns an array of `ImageData`.
 * The offscreen elements are removed from the DOM when done (or on error).
 *
 * This avoids disturbing the live editor workspace and prevents visual
 * flickering during export.
 */
/** Round up to the nearest even number (H.264 requires even dimensions). */
function ensureEven(n: number): number {
  const rounded = Math.ceil(n);

  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Wait for two animation frames so the browser fully paints DOM changes. */
function waitTwoFrames(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function preRenderFramesOffscreen(options: {
  readonly doc: BroadsetDocument;
  readonly totalFrames: number;
  readonly frameRate: number;
  readonly width: number;
  readonly height: number;
  readonly captureElementToCanvas: (el: HTMLElement, w: number, h: number) => Promise<HTMLCanvasElement>;
  readonly onProgress?: (frame: number, total: number) => void;
}): Promise<readonly ImageData[]> {
  const { doc, totalFrames, frameRate, width, height, captureElementToCanvas, onProgress } = options;

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

    const frames: ImageData[] = [];

    for (let i = 0; i < totalFrames; i++) {
      const timeMs = (i / frameRate) * 1000;

      controller.seek(timeMs);

      // Wait two animation frames so the browser fully paints the DOM
      // after seeking — matches the proven approach from the legacy exporter.
      await waitTwoFrames();

      const captured = await captureElementToCanvas(canvasRoot, width, height);
      const ctx = captured.getContext('2d');

      if (ctx === null) {
        throw new Error('Failed to get 2d context from captured canvas');
      }

      frames.push(ctx.getImageData(0, 0, captured.width, captured.height));
      onProgress?.(i + 1, totalFrames);
    }

    return frames;
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

      const doExport = async (): Promise<void> => {
        document.body.setAttribute('data-export-status', 'loading');

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

        const pixelRatio = getOptionalNumber(data, 'pixelRatio');
        const jpegQuality = getOptionalNumber(data, 'jpegQuality');
        const videoFrameRate = getOptionalNumber(data, 'videoFrameRate');
        const videoQuality = getOptionalNumber(data, 'videoQuality');

        const isVideoFormat = exporter === 'mp4' || exporter === 'webm';
        const videoFrameRateActual = videoFrameRate ?? 30;
        const formatLabel = exporter.toUpperCase();

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

        if (isVideoFormat) {
          // Force even dimensions for H.264 codec compatibility.
          const exportWidth = ensureEven(currentDocument.canvas.width);
          const exportHeight = ensureEven(currentDocument.canvas.height);

          // Compute the playback duration from the document's animations.
          const playbackDuration = Math.max(
            1000,
            ...currentDocument.animations
              .flatMap((a) => a.config.timelines.map((t) => computeTimelineLoopDuration(t)))
              .filter((d) => Number.isFinite(d)),
          );

          const totalFrames = Math.ceil((playbackDuration / 1000) * videoFrameRateActual);

          pushToast('info', `Rendering ${String(totalFrames)} frames…`);
          document.body.setAttribute('data-export-status', 'rendering');

          // Pre-render every frame in a disposable offscreen renderer so the
          // live editor workspace is not disturbed.
          const preRendered = await preRenderFramesOffscreen({
            doc: currentDocument,
            totalFrames,
            frameRate: videoFrameRateActual,
            width: exportWidth,
            height: exportHeight,
            captureElementToCanvas: formats.captureElementToCanvas,
            onProgress: (frame, total) => {
              document.body.setAttribute('data-export-progress', `${String(frame)}/${String(total)}`);

              if (frame % 5 === 0 || frame === total) {
                pushToast('info', `Rendering frames: ${String(frame)}/${String(total)}`);
              }
            },
          });

          pushToast('info', `Encoding ${formatLabel} video…`);
          document.body.setAttribute('data-export-status', 'encoding');

          // Create a canvas for the encoder to read from.
          // If we already discovered one earlier (native <canvas> path),
          // reuse it; otherwise create a fresh offscreen one.
          if (snapshotCanvas === undefined) {
            snapshotCanvas = document.createElement('canvas');
            snapshotCanvas.width = exportWidth;
            snapshotCanvas.height = exportHeight;
          } else {
            // Ensure even dimensions on existing canvas too.
            snapshotCanvas.width = exportWidth;
            snapshotCanvas.height = exportHeight;
          }

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

        const playbackDurationMs =
          isVideoFormat ?
            Math.max(
              1000,
              ...currentDocument.animations
                .flatMap((a) => a.config.timelines.map((t) => computeTimelineLoopDuration(t)))
                .filter((d) => Number.isFinite(d)),
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
        document.body.setAttribute('data-export-status', 'done');
      };

      void doExport().catch((error: unknown) => {
        pushToast('error', `Export failed: ${error instanceof Error ? error.message : String(error)}`);
        document.body.setAttribute('data-export-status', 'error');
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
