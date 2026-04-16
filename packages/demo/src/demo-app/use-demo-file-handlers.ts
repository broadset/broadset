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
  readonly renderDocument: BroadsetDocument;
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

/**
 * Resolves once every `<img>` under `root` has either loaded or errored.
 *
 * Image loads are async; if export starts before the browser finishes
 * downloading/decoding, the capture pipeline may miss CORS-cached bytes
 * and fall back to placeholders for the first frame.
 */
async function waitForImagesToSettle(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll('img'));

  await Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalWidth > 0) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        const settle = (): void => {
          resolve();
        };

        img.addEventListener('load', settle, { once: true });
        img.addEventListener('error', settle, { once: true });
      });
    }),
  );
}

/**
 * Handle to a streaming video export session.
 *
 * The session owns a disposable offscreen renderer + playback controller +
 * batch capture context. Callers drive encoding through `encoderCanvas` and
 * `renderFrame`, which streams one frame at a time into the encoder without
 * buffering every frame in memory (prior approach OOM'd for any real video).
 */
interface StreamingExportSession {
  /** Single canvas the video encoder reads from. Updated per frame by `renderFrame`. */
  readonly encoderCanvas: HTMLCanvasElement;
  /** Seek the playback controller, capture the DOM, blit to `encoderCanvas`. */
  readonly renderFrame: (timeMs: number) => Promise<void>;
  /** Release the offscreen renderer, controller, capture context, and host node. */
  readonly dispose: () => void;
}

async function createStreamingExportSession(options: {
  readonly doc: BroadsetDocument;
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
}): Promise<StreamingExportSession> {
  const { doc, width, height, createBatchCapture } = options;

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

  const canvasRoot = offscreenHost.querySelector<HTMLElement>('[data-broadset-canvas-root]');

  if (canvasRoot === null) {
    controller.destroy();
    renderer.destroy();
    offscreenHost.remove();
    throw new Error('Offscreen renderer did not create a canvas root');
  }

  // Wait for every <img> under the offscreen host to finish loading (or
  // error out) before creating the batch capture context.
  await waitForImagesToSettle(canvasRoot);

  let session: { readonly capture: () => Promise<HTMLCanvasElement>; readonly destroy: () => void };

  try {
    // Pre-embed fonts/images ONCE; subsequent captures reuse the cache.
    session = await createBatchCapture(canvasRoot, width, height);
  } catch (error: unknown) {
    controller.destroy();
    renderer.destroy();
    offscreenHost.remove();
    throw error;
  }

  // Persistent canvas consumed by the encoder. `renderFrame` overwrites it per frame.
  const encoderCanvas = document.createElement('canvas');

  encoderCanvas.width = width;
  encoderCanvas.height = height;

  const encoderCtx = encoderCanvas.getContext('2d');

  if (encoderCtx === null) {
    session.destroy();
    controller.destroy();
    renderer.destroy();
    offscreenHost.remove();
    throw new Error('Failed to get 2d context for encoder canvas');
  }

  const renderFrame = async (timeMs: number): Promise<void> => {
    controller.seek(timeMs);

    const captured = await session.capture();

    // Blit — single GPU/CPU copy, no ImageData round-trip.
    encoderCtx.drawImage(captured, 0, 0, width, height);
  };

  const dispose = (): void => {
    session.destroy();
    controller.destroy();
    renderer.destroy();
    offscreenHost.remove();
  };

  return { encoderCanvas, renderFrame, dispose };
}

export function useDemoFileHandlers({
  editorStore,
  currentDocument,
  renderDocument,
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
        // Video exports use a streaming session and don't need this snapshot.
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
        // preparing the streaming session only to discover we can't encode.
        if (isVideoFormat && !formats.isVideoExportSupported()) {
          throw new Error('Video export is not supported: VideoEncoder API is unavailable in this browser.');
        }

        let renderFrame: ((timeMs: number) => void | Promise<void>) | undefined;
        let playbackDurationMs: number | undefined;
        let streamingSession: StreamingExportSession | undefined;
        let totalFrames = 0;
        let framesEncoded = 0;

        if (isVideoFormat) {
          // Force even dimensions for H.264 codec compatibility.
          const exportWidth = ensureEven(renderDocument.canvas.width);
          const exportHeight = ensureEven(renderDocument.canvas.height);

          // Compute the playback duration from the selected animations.
          playbackDurationMs = Math.max(
            1000,
            ...exportAnimations
              .flatMap((a) => a.config.timelines.map((t) => computeTimelineLoopDuration(t)))
              .filter((d) => Number.isFinite(d)),
          );

          totalFrames = Math.ceil((playbackDurationMs / 1000) * videoFrameRateActual);

          setExportProgress({ progress: 0.1, stage: `Preparing ${String(totalFrames)} frames…` });
          document.body.setAttribute('data-export-status', 'rendering');

          // Build a document with only the selected animations so seek()
          // only drives the chosen timelines. All elements still render.
          const exportDoc: BroadsetDocument = {
            ...renderDocument,
            animations: [...exportAnimations],
          };

          // Streaming session: one offscreen renderer + one batch-capture
          // context reused across every frame. Per-frame work is only
          // seek + DOM clone + encoder blit — no ImageData buffering.
          streamingSession = await createStreamingExportSession({
            doc: exportDoc,
            width: exportWidth,
            height: exportHeight,
            createBatchCapture: formats.createBatchCapture,
          });

          snapshotCanvas = streamingSession.encoderCanvas;

          const session = streamingSession;

          renderFrame = async (timeMs: number): Promise<void> => {
            await session.renderFrame(timeMs);

            framesEncoded += 1;
            document.body.setAttribute('data-export-progress', `${String(framesEncoded)}/${String(totalFrames)}`);

            // Reserve 0.1–0.9 for streaming render+encode, 0.9–1 for finalize.
            const ratio = totalFrames > 0 ? framesEncoded / totalFrames : 1;
            const progress = 0.1 + 0.8 * ratio;

            setExportProgress({
              progress,
              stage: `Encoding frame ${String(framesEncoded)} / ${String(totalFrames)}`,
            });
          };
        }

        try {
          await bridge.exportDocument(exporter as ExportFormat, {
            document: renderDocument,
            ...(pixelRatio !== undefined ? { pixelRatio } : {}),
            ...(jpegQuality !== undefined ? { jpegQuality } : {}),
            ...(videoFrameRate !== undefined ? { videoFrameRate } : {}),
            ...(videoQuality !== undefined ? { videoQuality } : {}),
            ...(snapshotCanvas !== undefined ? { snapshotCanvas } : {}),
            ...(renderFrame !== undefined ? { renderFrame } : {}),
            ...(playbackDurationMs !== undefined ? { playbackDurationMs } : {}),
            onProgress: (progress: number, stage?: string) => {
              // Only honor encoder progress callbacks for the finalization
              // stretch (0.9–1). The render/encode loop already reports
              // per-frame progress via `renderFrame` above.
              if (stage === 'Finalizing' || stage === 'Complete') {
                const finalizeProgress = 0.9 + 0.1 * progress;

                setExportProgress({ progress: finalizeProgress, stage: stage });
              }
            },
          });

          setExportProgress({ progress: 1, stage: 'Done!' });
          pushToast('success', `Exported as ${exporter.toUpperCase()}.`);
          document.body.setAttribute('data-export-status', 'done');
        } finally {
          streamingSession?.dispose();
        }
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
    [currentDocument, handleSaveAsJson, pushToast, renderDocument, setActiveDialog],
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
