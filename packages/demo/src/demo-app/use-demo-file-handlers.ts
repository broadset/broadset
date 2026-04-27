import type { EditorStore } from '@broadset/editor';
import type { BroadsetDocument, BroadsetProject } from '@broadset/model';
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
import type { exportDocument, ExportFormat, FormatsModule, loadFormats } from '../formatBridge';

type LoadFormats = typeof loadFormats;
type ExportDocument = typeof exportDocument;
type FormatBridge = { readonly loadFormats: LoadFormats; readonly exportDocument: ExportDocument };

interface UseDemoFileHandlersOptions {
  readonly editorStore: EditorStore;
  readonly currentDocument: ReturnType<EditorStore['getState']>['document'];
  readonly renderDocument: BroadsetDocument;
  readonly playbackControllerRef: Readonly<RefObject<PlaybackController | null>>;
  readonly pushToast: (severity: 'error' | 'info' | 'success', message: string) => void;
  readonly setActiveDialog: Dispatch<SetStateAction<ActiveDialog>>;
  readonly fileInputRef: RefObject<HTMLInputElement | null>;
  /**
   * Project-level assets (font, image, video, etc.). The SVG
   * exporter walks `FontAsset` entries here to populate
   * `SvgExportOptions.fonts` so embed / reference / flatten modes
   * find byte sources for any text element using a non-system
   * `font-family`. Optional — when absent SVG export still works
   * but emits "no font bytes supplied" warnings.
   */
  readonly projectAssets?: BroadsetProject['assets'];
  /**
   * Setter the import handler invokes when the imported file is a
   * `BroadsetProject` wrapper carrying its own `assets`. Lets the
   * demo replace its in-memory project assets so subsequent SVG
   * exports embed fonts the imported project actually declares
   * rather than the bundled sample's. Optional — when absent, the
   * file handler just leaves the existing `projectAssets` in place.
   */
  readonly setProjectAssets?: Dispatch<SetStateAction<BroadsetProject['assets']>>;
}

function formatExportWarningMessage(warnings: readonly string[]): string {
  return formatWarningMessage('Export', warnings);
}

function formatWarningMessage(action: 'Export' | 'Import', warnings: readonly string[]): string {
  const [firstWarning, secondWarning] = warnings;

  if (warnings.length === 1 && firstWarning !== undefined) {
    return `${action} completed with 1 warning: ${firstWarning}`;
  }

  if (warnings.length > 1 && firstWarning !== undefined) {
    const moreCount = warnings.length - 1;
    const suffix = secondWarning === undefined ? '' : ` Next: ${secondWarning}`;

    return `${action} completed with ${String(warnings.length)} warnings. First: ${firstWarning}${suffix}${moreCount > 1 ? ' …' : ''}`;
  }

  return `${action} completed with warnings.`;
}

/**
 * Per-format import warnings surfaced via the shared
 * `FormatImportWarningsModal` from `@broadset/ui`. The modal opens
 * automatically when an import returns a non-empty warning list and
 * closes via the user pressing acknowledge or close.
 *
 * Spec: `project/spec/formats/pptx.md` — Reconciliation Reporting
 * acceptance criterion "report consumable by FormatImportWarningsModal"
 * and the parallel PSD/SVG import paths use the same modal.
 */
export interface ImportWarningsModalState {
  readonly formatLabel: string;
  readonly warnings: readonly string[];
}

/**
 * Per-element reconciliation diff surfaced when a Broadset-exported
 * file is re-imported after external editing (PowerPoint / Keynote /
 * Google Slides modified the file in between). The richer
 * `FormatReconciliationModal` shows per-bucket counts plus expandable
 * element lists; the flat `FormatImportWarningsModal` falls back to
 * the warning summary lines when reconciliation is null.
 */
export interface ImportReconciliationModalState {
  readonly formatLabel: string;
  readonly data: {
    readonly modifications: readonly ImportReconciliationModalElement[];
    readonly additions: readonly ImportReconciliationModalElement[];
    readonly deletions: readonly ImportReconciliationModalElement[];
    readonly recoveredByHash: readonly ImportReconciliationModalElement[];
  };
  readonly warnings: readonly string[];
}

export interface ImportReconciliationModalElement {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
}

interface DemoFileHandlers {
  readonly exportProgress: ExportProgress | null;
  readonly importWarningsModal: ImportWarningsModalState | null;
  readonly importReconciliationModal: ImportReconciliationModalState | null;
  readonly dismissImportReconciliationModal: () => void;
  readonly dismissImportWarningsModal: () => void;
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

const FORMAT_LABEL_BY_EXTENSION: ReadonlyMap<string, string> = new Map([
  ['bsp', 'Broadset Project'],
  ['json', 'JSON'],
  ['pptx', 'PowerPoint (PPTX)'],
  ['psd', 'Photoshop (PSD)'],
  ['svg', 'SVG'],
]);

function deriveFormatLabel(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  return FORMAT_LABEL_BY_EXTENSION.get(ext) ?? ext.toUpperCase();
}

function getOptionalNumber(data: Readonly<Record<string, unknown>>, key: string): number | undefined {
  const value = data[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Pull a `Record<string, unknown>`-shaped object from `data[key]`.
 * The `ExportModal` writes the per-format options block at
 * `svgOptions` / `psdOptions` / `pdfOptions` / `pptxOptions`; this
 * helper narrows from `unknown` so the bridge call site stays
 * strictly typed.
 */
function extractFormatOptionsObject(
  data: Readonly<Record<string, unknown>>,
  key: string,
): Readonly<Record<string, unknown>> | undefined {
  const value = data[key];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;

  // After the narrowing above we know `value` is a non-null,
  // non-array object — `Object.fromEntries(Object.entries(...))`
  // produces a fresh `Record<string, unknown>` without widening or
  // a type-asserting cast.
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(value);

  return Object.fromEntries(entries);
}

/**
 * Per-format options arriving from the FormatExportOptionsModal.
 * Each entry is a partial of the matching `*ExportOptionsInput`
 * shape on the bridge — keys missing from the dynamic data are
 * omitted so the bridge falls back to its own defaults.
 */
interface FormatScopedExportArgs {
  readonly svgOptions?: Readonly<Record<string, unknown>>;
  readonly pdfOptions?: Readonly<Record<string, unknown>>;
  readonly psdOptions?: Readonly<Record<string, unknown>>;
  readonly pptxOptions?: Readonly<Record<string, unknown>>;
}

function buildSvgScopedArgs(
  data: Readonly<Record<string, unknown>>,
  projectAssets: BroadsetProject['assets'] | undefined,
): FormatScopedExportArgs {
  const svgFromUi = extractFormatOptionsObject(data, 'svgOptions');

  if (projectAssets === undefined && svgFromUi === undefined) return {};

  return {
    svgOptions: { ...(svgFromUi ?? {}), ...(projectAssets !== undefined ? { projectAssets } : {}) },
  };
}

function buildPptxScopedArgs(
  data: Readonly<Record<string, unknown>>,
  projectAssets: BroadsetProject['assets'] | undefined,
): FormatScopedExportArgs {
  const pptxFromUi = extractFormatOptionsObject(data, 'pptxOptions');

  if (pptxFromUi === undefined) return {};

  return {
    pptxOptions: { ...pptxFromUi, ...(projectAssets !== undefined ? { projectAssets } : {}) },
  };
}

/**
 * Aggregate per-format option objects the bridge expects. The
 * `ExportModal` writes each format's block onto the dynamic-data
 * payload by key (`svgOptions`, `psdOptions`, `pdfOptions`,
 * `pptxOptions`); this helper merges those values with project
 * assets where the bridge needs them (SVG fonts, PPTX font embed).
 *
 * Extracted from `handleExportFormat` to keep that function under
 * the sonarjs cognitive-complexity threshold.
 */
function buildFormatScopedExportArgs(
  exporter: string,
  data: Readonly<Record<string, unknown>>,
  projectAssets: BroadsetProject['assets'] | undefined,
): FormatScopedExportArgs {
  switch (exporter) {
    case 'svg':
      return buildSvgScopedArgs(data, projectAssets);

    case 'pdf': {
      const pdfFromUi = extractFormatOptionsObject(data, 'pdfOptions');

      return pdfFromUi !== undefined ? { pdfOptions: pdfFromUi } : {};
    }

    case 'psd': {
      const psdFromUi = extractFormatOptionsObject(data, 'psdOptions');

      return psdFromUi !== undefined ? { psdOptions: psdFromUi } : {};
    }

    case 'pptx':
      return buildPptxScopedArgs(data, projectAssets);

    default:
      return {};
  }
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

interface ParsedExportOptions {
  readonly pixelRatio: number | undefined;
  readonly jpegQuality: number | undefined;
  readonly videoFrameRate: number | undefined;
  readonly videoQuality: number | undefined;
  readonly videoFrameRateActual: number;
  readonly selectedAnimationIds: ReadonlySet<string> | null;
}

function parseExportOptions(data: Readonly<Record<string, unknown>>): ParsedExportOptions {
  const videoFrameRate = getOptionalNumber(data, 'videoFrameRate');
  const rawSelectedIds = data['selectedAnimationIds'];
  const selectedAnimationIds =
    Array.isArray(rawSelectedIds) ? new Set(rawSelectedIds.filter((id): id is string => typeof id === 'string')) : null;

  return {
    pixelRatio: getOptionalNumber(data, 'pixelRatio'),
    jpegQuality: getOptionalNumber(data, 'jpegQuality'),
    videoFrameRate,
    videoQuality: getOptionalNumber(data, 'videoQuality'),
    videoFrameRateActual: videoFrameRate ?? 30,
    selectedAnimationIds,
  };
}

function buildOptionalExportArgs(options: ParsedExportOptions): Record<string, number> {
  const args: Record<string, number> = {};

  if (options.pixelRatio !== undefined) args['pixelRatio'] = options.pixelRatio;
  if (options.jpegQuality !== undefined) args['jpegQuality'] = options.jpegQuality;
  if (options.videoFrameRate !== undefined) args['videoFrameRate'] = options.videoFrameRate;
  if (options.videoQuality !== undefined) args['videoQuality'] = options.videoQuality;

  return args;
}

function filterAnimations(
  animations: BroadsetDocument['animations'],
  selectedIds: ReadonlySet<string> | null,
): BroadsetDocument['animations'] {
  if (selectedIds === null || selectedIds.size === 0) return animations;

  return animations.filter((a) => selectedIds.has(a.elementId));
}

async function loadBridgeWithTimeout(
  setExportProgress: Dispatch<SetStateAction<ExportProgress | null>>,
  isVideoFormat: boolean,
): Promise<FormatBridge> {
  document.body.setAttribute('data-export-status', 'loading');
  setExportProgress(isVideoFormat ? { progress: 0, stage: 'Loading export engine…' } : null);

  const bridge = await import('../formatBridge');

  document.body.setAttribute('data-export-status', 'bridge-loaded');
  document.body.setAttribute('data-export-status', 'formats-loading');

  await Promise.race([
    bridge.loadFormats(),
    new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('Timed out while loading export formats.'));
      }, FORMATS_LOAD_TIMEOUT_MS);
    }),
  ]);

  return bridge;
}

async function acquireRasterSnapshotCanvas(
  formats: FormatsModule,
  doc: { readonly canvas: { readonly width: number; readonly height: number } },
): Promise<HTMLCanvasElement | undefined> {
  const direct = formats.discoverCanvasElement() ?? undefined;

  if (direct !== undefined) return direct;

  const rendererRoot = formats.discoverRendererRoot();

  if (rendererRoot === null) return undefined;

  return formats.captureElementToCanvas(rendererRoot, doc.canvas.width, doc.canvas.height);
}

interface VideoSessionResult {
  readonly session: StreamingExportSession;
  readonly renderFrame: (timeMs: number) => Promise<void>;
  readonly playbackDurationMs: number;
}

async function setupVideoSession(args: {
  readonly renderDocument: BroadsetDocument;
  readonly exportAnimations: BroadsetDocument['animations'];
  readonly videoFrameRate: number;
  readonly createBatchCapture: (
    el: HTMLElement,
    w: number,
    h: number,
  ) => Promise<{ readonly capture: () => Promise<HTMLCanvasElement>; readonly destroy: () => void }>;
  readonly setExportProgress: Dispatch<SetStateAction<ExportProgress | null>>;
}): Promise<VideoSessionResult> {
  const { renderDocument, exportAnimations, videoFrameRate, createBatchCapture, setExportProgress } = args;
  const exportWidth = ensureEven(renderDocument.canvas.width);
  const exportHeight = ensureEven(renderDocument.canvas.height);
  const playbackDurationMs = Math.max(
    1000,
    ...exportAnimations
      .flatMap((a) => a.config.timelines.map((t) => computeTimelineLoopDuration(t)))
      .filter((d) => Number.isFinite(d)),
  );
  const totalFrames = Math.ceil((playbackDurationMs / 1000) * videoFrameRate);

  setExportProgress({ progress: 0.1, stage: `Preparing ${String(totalFrames)} frames…` });
  document.body.setAttribute('data-export-status', 'rendering');

  const session = await createStreamingExportSession({
    doc: { ...renderDocument, animations: [...exportAnimations] },
    width: exportWidth,
    height: exportHeight,
    createBatchCapture,
  });

  let framesEncoded = 0;
  const renderFrame = async (timeMs: number): Promise<void> => {
    await session.renderFrame(timeMs);
    framesEncoded += 1;
    document.body.setAttribute('data-export-progress', `${String(framesEncoded)}/${String(totalFrames)}`);

    const ratio = totalFrames > 0 ? framesEncoded / totalFrames : 1;

    setExportProgress({
      progress: 0.1 + 0.8 * ratio,
      stage: `Encoding frame ${String(framesEncoded)} / ${String(totalFrames)}`,
    });
  };

  return { session, renderFrame, playbackDurationMs };
}

function makeFinalizeProgressHandler(
  setExportProgress: Dispatch<SetStateAction<ExportProgress | null>>,
): (progress: number, stage?: string) => void {
  return (progress, stage) => {
    if (stage === 'Finalizing' || stage === 'Complete') {
      setExportProgress({ progress: 0.9 + 0.1 * progress, stage });
    }
  };
}

export function useDemoFileHandlers({
  editorStore,
  currentDocument,
  renderDocument,
  pushToast,
  setActiveDialog,
  fileInputRef,
  projectAssets,
  setProjectAssets,
}: UseDemoFileHandlersOptions): DemoFileHandlers {
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [importWarningsModal, setImportWarningsModal] = useState<ImportWarningsModalState | null>(null);
  const [importReconciliationModal, setImportReconciliationModal] = useState<ImportReconciliationModalState | null>(
    null,
  );
  const dismissImportWarningsModal = useCallback((): void => {
    setImportWarningsModal(null);
  }, []);
  const dismissImportReconciliationModal = useCallback((): void => {
    setImportReconciliationModal(null);
  }, []);

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
        // Pass the live project assets so SVG imports of third-
        // party files that carry `<text>` under baking transforms
        // can glyph-flatten via the project's fonts (P7.7i path).
        // Other formats ignore this option.
        const result = await importDocument(file, projectAssets !== undefined ? { projectAssets } : undefined);

        editorStore.getState().loadTemplate(result.document);

        // Replace the in-memory project assets when the imported
        // wrapper actually carried its own (a `BroadsetProject`
        // JSON / .bsp). SVG exports done after the import will
        // embed fonts the new project declares.
        if (result.projectAssets !== undefined && setProjectAssets !== undefined) {
          // ImportDocumentResult uses the raw `Asset` union; the
          // demo's state uses the zod-parsed shape. Both are
          // structurally identical at runtime — round-trip via
          // `[...projectAssets]` so TS sees a fresh mutable array.
          setProjectAssets([...result.projectAssets] as BroadsetProject['assets']);
        }

        pushToast('success', 'Import complete.');

        const formatLabel = deriveFormatLabel(file);

        if (result.reconciliation !== null && result.reconciliation !== undefined) {
          setImportReconciliationModal({
            formatLabel,
            data: result.reconciliation,
            warnings: result.warnings,
          });
        } else if (result.warnings.length > 0) {
          setImportWarningsModal({ formatLabel, warnings: result.warnings });
        }
      } catch (error: unknown) {
        pushToast('error', `Import failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        event.currentTarget.value = '';
      }
    },
    [editorStore, projectAssets, pushToast, setProjectAssets],
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
        const bridge = await loadBridgeWithTimeout(setExportProgress, isVideoFormat);
        const formats = await bridge.loadFormats();

        document.body.setAttribute('data-export-status', 'formats-loaded');
        setExportProgress(isVideoFormat ? { progress: 0.05, stage: 'Preparing export…' } : null);

        const options = parseExportOptions(data);
        const exportAnimations = filterAnimations(currentDocument.animations, options.selectedAnimationIds);

        let snapshotCanvas = isVideoFormat ? undefined : await acquireRasterSnapshotCanvas(formats, currentDocument);

        if (isVideoFormat && !formats.isVideoExportSupported()) {
          throw new Error('Video export is not supported: VideoEncoder API is unavailable in this browser.');
        }

        const videoSession =
          isVideoFormat ?
            await setupVideoSession({
              renderDocument,
              exportAnimations,
              videoFrameRate: options.videoFrameRateActual,
              createBatchCapture: formats.createBatchCapture,
              setExportProgress,
            })
          : null;

        if (videoSession !== null) snapshotCanvas = videoSession.session.encoderCanvas;

        // Per-format options (SVG font embed, PDF colour/PDF-A,
        // PSD colour mode, PPTX font embed) arrive from the
        // FormatExportOptionsModal via `data[<format>Options]`.
        // Build the bridge-shaped block once, including project
        // assets where applicable.
        const formatScopedArgs = buildFormatScopedExportArgs(exporter, data, projectAssets);

        try {
          const exportResult = await bridge.exportDocument(exporter as ExportFormat, {
            document: renderDocument,
            ...buildOptionalExportArgs(options),
            ...(snapshotCanvas !== undefined ? { snapshotCanvas } : {}),
            ...(videoSession?.renderFrame !== undefined ? { renderFrame: videoSession.renderFrame } : {}),
            ...(videoSession?.playbackDurationMs !== undefined ?
              { playbackDurationMs: videoSession.playbackDurationMs }
            : {}),
            ...formatScopedArgs,
            onProgress: makeFinalizeProgressHandler(setExportProgress),
          });

          setExportProgress({ progress: 1, stage: 'Done!' });

          if (exportResult.warnings.length > 0) {
            pushToast('info', formatExportWarningMessage(exportResult.warnings));
          } else {
            pushToast('success', `Exported as ${exporter.toUpperCase()}.`);
          }

          document.body.setAttribute('data-export-status', 'done');
        } finally {
          videoSession?.session.dispose();
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
    [currentDocument, handleSaveAsJson, projectAssets, pushToast, renderDocument, setActiveDialog],
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
    dismissImportReconciliationModal,
    dismissImportWarningsModal,
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
    importReconciliationModal,
    importWarningsModal,
  };
}
