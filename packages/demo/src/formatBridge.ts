import type * as FormatsNS from '@broadset/formats';
import type { Asset, BroadsetDocument, BroadsetElement } from '@broadset/model';
import { broadsetDocumentSchema, isFontAsset } from '@broadset/model';
import type { PreflightFinding } from '@broadset/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type FormatsModule = typeof FormatsNS;

export type ExportFormat =
  | 'html'
  | 'jpeg'
  | 'json'
  | 'mp4'
  | 'ograf'
  | 'pdf'
  | 'png'
  | 'pptx'
  | 'psd'
  | 'svg'
  | 'svg-embedded'
  | 'webm';

export interface SvgExportOptionsInput {
  readonly fontEmbedding?: 'embed' | 'reference' | 'flatten';
  readonly includeMetadata?: boolean;
  readonly includeElementTagging?: boolean;
  readonly flattenGroups?: boolean;
  /**
   * Project assets the SVG exporter walks for `FontAsset` byte
   * sources. Used to populate `SvgExportOptions.fonts` so embed /
   * reference / flatten modes have something to embed beyond the
   * font-family name. Optional: when absent, the exporter emits
   * preflight warnings for every text element using a non-system
   * family.
   */
  readonly projectAssets?: readonly Asset[];
}

/**
 * PDF-specific options forwarded from the demo through
 * {@link exportDocument} into `formats.exportPdfBytes`. Mirrors the
 * subset of `PdfExportOptions` the UI surfaces today (colour space
 * + PDF/A conformance level). The UI's `'none'` PDF/A choice maps to
 * "do not opt into PDF/A" — the bridge omits the field in that case
 * so pdf-lib falls back to standard PDF.
 */
export interface PdfExportOptionsInput {
  readonly colorSpace?: 'rgb' | 'cmyk' | 'spot';
  readonly pdfaConformance?: '2b' | '2u' | '2a' | 'none';
}

/**
 * PSD-specific options forwarded through {@link exportDocument}.
 * Mirrors `PsdExportOptions` from `@broadset/formats/psd`. The
 * bridge passes the object straight through to `exportPsdBytesAsync`,
 * which honours `preserveVisibility` today and surfaces preflight
 * warnings for `colorSpace` / `bitDepth` / `linkSmartObjects` until
 * the lcms-wasm pipeline (cross-format-io-improvement-plan.md
 * Phase 4.1) lands.
 */
export interface PsdExportOptionsInput {
  readonly colorSpace?: 'rgb' | 'cmyk' | 'lab' | 'grayscale';
  readonly bitDepth?: 8 | 16;
  readonly embedIccProfile?: boolean;
  readonly linkSmartObjects?: boolean;
  readonly preserveVisibility?: boolean;
}

/**
 * PPTX-specific options forwarded through {@link exportDocument}. The
 * single UI-level field today is `embedFonts` — when true, the
 * bridge collects every `FontAsset` from the project and passes
 * them as `fontAssets` to the async PPTX exporter, which subsets +
 * embeds them under `ppt/fonts/` for any text element that uses the
 * matching `style.fontFamily`.
 */
export interface PptxExportOptionsInput {
  readonly embedFonts?: boolean;
  /**
   * Project assets the bridge walks for `FontAsset` entries when
   * `embedFonts` is true. Mirrors {@link SvgExportOptionsInput.projectAssets}.
   */
  readonly projectAssets?: readonly Asset[];
}

export interface ExportContext {
  readonly document: BroadsetDocument;
  readonly snapshotCanvas?: HTMLCanvasElement;
  readonly renderFrame?: (timeMs: number) => void | Promise<void>;
  readonly playbackDurationMs?: number;
  readonly pixelRatio?: number;
  readonly jpegQuality?: number;
  readonly videoFrameRate?: number;
  readonly videoQuality?: number;
  readonly onProgress?: (progress: number, stage?: string) => void;
  /** SVG-specific options from the `FormatExportOptionsModal`. */
  readonly svgOptions?: SvgExportOptionsInput;
  /** PDF-specific options from the `FormatExportOptionsModal`. */
  readonly pdfOptions?: PdfExportOptionsInput;
  /** PSD-specific options from the `FormatExportOptionsModal`. */
  readonly psdOptions?: PsdExportOptionsInput;
  /** PPTX-specific options from the `FormatExportOptionsModal`. */
  readonly pptxOptions?: PptxExportOptionsInput;
}

export interface ImportReconciliationElement {
  readonly id: string;
  readonly name?: string;
  readonly description?: string;
}

/**
 * Phase 4.9 — modifications carry the full preserved + current element
 * references so the demo can apply per-element "Use preserved / Use
 * visual" choices via `applyReconciliationChoices` from
 * `@broadset/formats`. The summary fields (id / name / description) are
 * what the modal itself displays; the element refs stay in the demo's
 * state and are never threaded into the modal props.
 */
export interface ImportReconciliationModification extends ImportReconciliationElement {
  readonly preservedElement: BroadsetElement;
  readonly currentElement: BroadsetElement;
}

export interface ImportReconciliationData {
  readonly modifications: readonly ImportReconciliationModification[];
  readonly additions: readonly ImportReconciliationElement[];
  readonly deletions: readonly ImportReconciliationElement[];
  readonly recoveredByHash: readonly ImportReconciliationElement[];
}

export interface ImportDocumentResult {
  readonly document: BroadsetDocument;
  readonly warnings: readonly string[];
  /**
   * Project-level asset list when the imported file was a
   * `BroadsetProject` (JSON / `.bsp` with a `documents` array).
   * Lets the demo replace its in-memory project assets so SVG
   * exports can embed fonts the imported project actually
   * declares — instead of defaulting to the bundled sample.
   */
  readonly projectAssets?: readonly Asset[] | undefined;
  /**
   * Populated for any format re-import where the input carries
   * Broadset round-trip metadata (PDF/A XMP, PSD XMP, PPTX customXml,
   * SVG `<metadata>` RDF). Surfaces the four reconcile buckets so the
   * demo opens `FormatReconciliationModal` instead of the flat-string
   * `FormatImportWarningsModal`. `null` for arbitrary third-party
   * files and for round-trips where the buckets are all empty (no
   * external edits).
   */
  readonly reconciliation?: ImportReconciliationData | null;
}

/**
 * Per-format export result. Carries any fidelity-loss warnings that
 * surfaced during emission (today: PPTX `<a:outerShdw>` inset skips,
 * multi-shadow truncation, animations beyond fade-entry per IO-D-16).
 *
 * Two views of the same data:
 * - `warnings` — flat strings consumed by the existing toast layer
 *   (`formatExportWarningMessage`).
 * - `preflight` — structured `PreflightFinding[]` consumed by the
 *   `FormatPreflightModal`. Populated for formats whose underlying
 *   warning shape carries codes (PPTX), and for formats whose prose
 *   warnings are mapped to a generic `'preflight'` code (PSD, SVG).
 *   Empty for formats that don't emit structured preflight today.
 */
export interface ExportDocumentResult {
  readonly warnings: readonly string[];
  readonly preflight: readonly PreflightFinding[];
}

/* ------------------------------------------------------------------ */
/*  Lazy Loading                                                      */
/* ------------------------------------------------------------------ */

let formatsCache: FormatsModule | null = null;

/** Load the formats module on first use and cache it for subsequent calls. */
export async function loadFormats(): Promise<FormatsModule> {
  formatsCache ??= await import('@broadset/formats');

  return formatsCache;
}

/** Reset the cache (testing only). */
export function resetFormatsCache(): void {
  formatsCache = null;
}

/* ------------------------------------------------------------------ */
/*  Export Orchestration                                               */
/* ------------------------------------------------------------------ */

const DEFAULT_PIXEL_RATIO = 2;
const DEFAULT_JPEG_QUALITY = 0.92;
const DEFAULT_VIDEO_FRAME_RATE = 30;
const DEFAULT_VIDEO_QUALITY = 0.8;

/**
 * Build the SVG-specific export options + font source map from the
 * caller's `svgOptions`, and route the result through
 * `exportSvgDocument`. Extracted from the main `exportDocument`
 * switch to keep that function's cognitive complexity below the
 * sonarjs threshold.
 */
async function exportSvgVia(formats: FormatsModule, context: ExportContext, name: string): Promise<readonly string[]> {
  const projectAssets = context.svgOptions?.projectAssets ?? [];
  const fonts = projectAssets.length > 0 ? formats.buildSvgFontSourcesFromAssets(projectAssets) : undefined;
  // Resolve image / pattern asset ids to URLs (data: for embedded
  // bytes, https: for hosted) so standalone SVG viewers render
  // them. Without this the exporter emits the bare Broadset asset
  // id as `<image href>`, which Illustrator / Inkscape / browsers
  // cannot fetch. P7.7j adds the resolver hook.
  const assetResolver = projectAssets.length > 0 ? formats.buildSvgAssetResolverFromAssets(projectAssets) : undefined;
  const svgExportOptions = {
    ...(context.svgOptions?.fontEmbedding !== undefined ? { fontEmbedding: context.svgOptions.fontEmbedding } : {}),
    ...(context.svgOptions?.includeMetadata !== undefined ?
      { includeMetadata: context.svgOptions.includeMetadata }
    : {}),
    ...(context.svgOptions?.includeElementTagging !== undefined ?
      { includeElementTagging: context.svgOptions.includeElementTagging }
    : {}),
    ...(context.svgOptions?.flattenGroups !== undefined ? { flattenGroups: context.svgOptions.flattenGroups } : {}),
    ...(fonts !== undefined ? { fonts } : {}),
    ...(assetResolver !== undefined ? { assetResolver } : {}),
  };
  const result = await formats.exportSvgDocument(context.document, svgExportOptions);
  const blob = new Blob([result.svg], { type: 'image/svg+xml' });

  // Surface preflight warnings (missing fonts, restricted-
  // permission embeds) to the caller via the onProgress stage
  // channel so the toast layer can announce them.
  if (result.warnings.length > 0 && context.onProgress !== undefined) {
    const summary = `Exported with ${String(result.warnings.length)} font warning(s): ${result.warnings[0] ?? ''}`;

    context.onProgress(1, summary);
  }

  formats.triggerDownload(blob, `${name}.svg`);

  return result.warnings;
}

/**
 * Build a `PdfExportOptions`-shaped object from the caller's
 * `pdfOptions`. The UI's `'none'` PDF/A choice is collapsed by
 * omitting the field so pdf-lib emits standard PDF; populated values
 * map straight through.
 */
function buildPdfExportOptions(context: ExportContext): Record<string, unknown> {
  const pdfOpts = context.pdfOptions ?? {};
  const exportOpts: Record<string, unknown> = {};

  if (pdfOpts.colorSpace !== undefined) {
    exportOpts['colorSpace'] = pdfOpts.colorSpace;
  }

  if (pdfOpts.pdfaConformance !== undefined && pdfOpts.pdfaConformance !== 'none') {
    exportOpts['pdfaConformance'] = pdfOpts.pdfaConformance;
  }

  return exportOpts;
}

/**
 * Build a `PptxExportOptions`-shaped object from the caller's
 * `pptxOptions`. When `embedFonts === true` and the project carries
 * `FontAsset`s, they're forwarded into the PPTX exporter's
 * `fontAssets` slot for subset-and-embed under `ppt/fonts/`.
 */
function buildPptxExportOptions(context: ExportContext): Record<string, unknown> {
  const pptxOpts = context.pptxOptions ?? {};
  const exportOpts: Record<string, unknown> = {};

  if (pptxOpts.embedFonts === true) {
    const projectAssets = pptxOpts.projectAssets ?? [];
    const fontAssets = projectAssets.filter(isFontAsset);

    if (fontAssets.length > 0) {
      exportOpts['fontAssets'] = fontAssets;
    }
  }

  return exportOpts;
}

/**
 * Per-format collector output. Extracted so the main `exportDocument`
 * switch stays under the sonarjs cognitive-complexity threshold and
 * each format's warning-to-finding mapping lives next to its export
 * call instead of being inlined into the switch body.
 */
interface FormatExportWarnings {
  readonly warnings: readonly string[];
  readonly preflight: readonly PreflightFinding[];
}

const EMPTY_FORMAT_WARNINGS: FormatExportWarnings = { warnings: [], preflight: [] };

/**
 * SVG warnings are prose-only today (font-embedding gaps, restricted
 * permissions). Map them to a generic `'svg-preflight'` code so the
 * modal groups them under the shared severity bucket. Structured
 * codes will replace the placeholder when SVG preflight grows a
 * per-cause taxonomy.
 */
function collectSvgFormatWarnings(svgWarnings: readonly string[]): FormatExportWarnings {
  return {
    warnings: svgWarnings,
    preflight: svgWarnings.map((warning) => ({
      code: 'svg-preflight',
      message: warning,
      severity: 'warning',
    })),
  };
}

/**
 * PPTX is the only exporter whose warnings already carry a structured
 * shape (`PptxExportWarning { code, message, elementId?, detail? }`).
 * Preserve every field on the way into the modal so users see the
 * underlying cause rather than a flattened code-prefixed string.
 */
function collectPptxFormatWarnings(report: FormatsNS.PptxExportReport): FormatExportWarnings {
  return {
    warnings: report.warnings.map((w) => `${w.code}: ${w.message}`),
    preflight: report.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      severity: 'warning',
      ...(w.elementId !== undefined ? { elementId: w.elementId } : {}),
      ...(w.detail !== undefined ? { hint: w.detail } : {}),
    })),
  };
}

/**
 * PSD warnings are prose-only today — `'preflight'` is the honest
 * placeholder code until per-cause structured codes land alongside
 * the lcms-wasm pipeline (cross-format-io improvement plan Phase
 * 4.1).
 */
function collectPsdFormatWarnings(psdWarnings: readonly string[]): FormatExportWarnings {
  return {
    warnings: psdWarnings,
    preflight: psdWarnings.map((warning) => ({
      code: 'preflight',
      message: warning,
      severity: 'warning',
    })),
  };
}

/**
 * PDF warnings are prose-only too — `exportPdfWithPreflight` produces
 * a flat string list combining `collectPreflightWarnings` (font /
 * permission / out-of-gamut) and runtime extras (Google Fonts fetch
 * failures, embedded image decode warnings). Map each to the same
 * `'preflight'` placeholder code as PSD until structured codes land
 * with Phase 4.2 / 5.8.
 */
function collectPdfFormatWarnings(pdfWarnings: readonly string[]): FormatExportWarnings {
  return {
    warnings: pdfWarnings,
    preflight: pdfWarnings.map((warning) => ({
      code: 'preflight',
      message: warning,
      severity: 'warning',
    })),
  };
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function exportDocument(format: ExportFormat, context: ExportContext): Promise<ExportDocumentResult> {
  const formats = await loadFormats();
  const { document: doc } = context;
  const name = formats.sanitizeFilename(doc.name || 'broadset-document');
  let collected: FormatExportWarnings = EMPTY_FORMAT_WARNINGS;

  switch (format) {
    case 'json': {
      const json = JSON.stringify(doc, null, 2);
      const blob = new Blob([json], { type: 'application/json' });

      formats.triggerDownload(blob, `${name}.json`);
      break;
    }

    case 'svg': {
      const svgWarnings = await exportSvgVia(formats, context, name);

      collected = collectSvgFormatWarnings(svgWarnings);
      break;
    }

    case 'html': {
      const html = formats.exportHtmlStandalone(doc);
      const blob = new Blob([html], { type: 'text/html' });

      formats.triggerDownload(blob, `${name}.html`);
      break;
    }

    case 'pdf': {
      const pdfResult = await formats.exportPdfWithPreflight(doc, buildPdfExportOptions(context));
      const blob = new Blob([bytesToBlobPart(pdfResult.bytes)], { type: 'application/pdf' });

      formats.triggerDownload(blob, `${name}.pdf`);
      collected = collectPdfFormatWarnings(pdfResult.warnings);
      break;
    }

    case 'pptx': {
      const pptxReport = await formats.exportPptxWithReportAsync(doc, buildPptxExportOptions(context));
      const blob = new Blob([bytesToBlobPart(pptxReport.bytes)], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });

      formats.triggerDownload(blob, `${name}.pptx`);
      collected = collectPptxFormatWarnings(pptxReport);
      break;
    }

    case 'psd': {
      // Switch to the preflight-aware variant so the structured
      // warning list (animations dropped, rotated non-image
      // elements, colour-mode downgrades, URL fetch failures) reaches
      // the modal. The bytes are identical to `exportPsdBytesAsync`.
      const psdResult = await formats.exportPsdBytesAsyncWithPreflight(doc, { ...(context.psdOptions ?? {}) });
      const blob = new Blob([bytesToBlobPart(psdResult.bytes)], { type: 'image/vnd.adobe.photoshop' });

      formats.triggerDownload(blob, `${name}.psd`);
      collected = collectPsdFormatWarnings(psdResult.warnings);
      break;
    }

    case 'png': {
      requireSnapshotCanvas(context);

      const pngBlob = await formats.exportPngBlob(context.snapshotCanvas, {
        pixelRatio: context.pixelRatio ?? DEFAULT_PIXEL_RATIO,
      });

      formats.triggerDownload(pngBlob, `${name}.png`);
      break;
    }

    case 'jpeg': {
      requireSnapshotCanvas(context);

      const jpegBlob = await formats.exportJpegBlob(context.snapshotCanvas, {
        pixelRatio: context.pixelRatio ?? DEFAULT_PIXEL_RATIO,
        quality: context.jpegQuality ?? DEFAULT_JPEG_QUALITY,
      });

      formats.triggerDownload(jpegBlob, `${name}.jpeg`);
      break;
    }

    case 'svg-embedded': {
      requireSnapshotCanvas(context);

      const embeddedBlob = await formats.exportEmbeddedSvgBlob(context.snapshotCanvas);

      formats.triggerDownload(embeddedBlob, `${name}-embedded.svg`);
      break;
    }

    case 'mp4': {
      requireVideoSettings(context);

      const mp4Blob = await formats.exportVideoBlob({
        canvas: context.snapshotCanvas,
        renderFrame: context.renderFrame,
        durationMs: context.playbackDurationMs,
        frameRate: context.videoFrameRate ?? DEFAULT_VIDEO_FRAME_RATE,
        quality: context.videoQuality ?? DEFAULT_VIDEO_QUALITY,
        format: 'mp4',
        ...(context.onProgress !== undefined ? { onProgress: context.onProgress } : {}),
      });

      formats.triggerDownload(mp4Blob, `${name}.mp4`);
      break;
    }

    case 'webm': {
      requireVideoSettings(context);

      const videoBlob = await formats.exportVideoBlob({
        canvas: context.snapshotCanvas,
        renderFrame: context.renderFrame,
        durationMs: context.playbackDurationMs,
        frameRate: context.videoFrameRate ?? DEFAULT_VIDEO_FRAME_RATE,
        quality: context.videoQuality ?? DEFAULT_VIDEO_QUALITY,
        format: 'webm',
        ...(context.onProgress !== undefined ? { onProgress: context.onProgress } : {}),
      });

      formats.triggerDownload(videoBlob, `${name}.webm`);
      break;
    }

    case 'ograf': {
      const packages = formats.generateOGrafPackages(doc);
      const jsonStr = JSON.stringify(packages, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });

      formats.triggerDownload(blob, `${name}-ograf.json`);
      break;
    }

    default: {
      const _exhaustive: never = format;

      throw new Error(`Unsupported export format: ${_exhaustive as string}`);
    }
  }

  return { warnings: collected.warnings, preflight: collected.preflight };
}

function requireSnapshotCanvas(context: ExportContext): asserts context is ExportContext & {
  readonly snapshotCanvas: HTMLCanvasElement;
} {
  if (context.snapshotCanvas === undefined) {
    throw new Error('Raster export requires a snapshot renderer. No snapshot canvas is available.');
  }
}

function requireVideoSettings(context: ExportContext): asserts context is ExportContext & {
  readonly snapshotCanvas: HTMLCanvasElement;
  readonly renderFrame: (timeMs: number) => void | Promise<void>;
  readonly playbackDurationMs: number;
} {
  if (context.renderFrame === undefined || context.playbackDurationMs === undefined) {
    throw new Error('Video export requires a playback controller and video settings.');
  }

  if (context.snapshotCanvas === undefined) {
    throw new Error('Video export requires a snapshot canvas for frame rendering.');
  }
}

/* ------------------------------------------------------------------ */
/*  Import Orchestration                                              */
/* ------------------------------------------------------------------ */

/** Detect if a parsed JSON has a `documents` array (BroadsetProject wrapper). */
function hasDocumentsArray(value: unknown): value is { readonly documents: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'documents' in value &&
    Array.isArray((value as Record<string, unknown>)['documents'])
  );
}

/** Detect a `BroadsetProject`-shaped wrapper carrying both `documents` AND `assets`. */
function hasProjectShape(
  value: unknown,
): value is { readonly documents: readonly unknown[]; readonly assets: readonly Asset[] } {
  return hasDocumentsArray(value) && 'assets' in value && Array.isArray((value as Record<string, unknown>)['assets']);
}

export async function importDocument(
  file: File,
  options?: { readonly projectAssets?: readonly Asset[] },
): Promise<ImportDocumentResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    case 'json': // falls through

    case 'bsp': {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const candidate = hasDocumentsArray(parsed) ? parsed['documents'][0] : parsed;
      const projectAssets = hasProjectShape(parsed) ? parsed.assets : undefined;

      return {
        document: broadsetDocumentSchema.parse(candidate),
        warnings: [],
        ...(projectAssets !== undefined ? { projectAssets } : {}),
      };
    }

    case 'psd': {
      const formats = await loadFormats();
      const buffer = await file.arrayBuffer();

      return await formats.importPsdDocument(new Uint8Array(buffer));
    }

    case 'pptx': {
      const formats = await loadFormats();
      const buffer = await file.arrayBuffer();

      return await formats.importPptxDocument(new Uint8Array(buffer));
    }

    case 'svg': {
      const formats = await loadFormats();
      const text = await file.text();
      // Thread project font assets into the importer so a third-
      // party SVG with `<text>` under a baking ancestor (scale /
      // skew) can glyph-flatten into a `<path>` using the project's
      // own fonts. Without this, the importer silently drops the
      // scale to translate-only with a warning. P7.7i shipped the
      // import-side flatten; this wiring lets users actually
      // trigger it.
      const projectAssets = options?.projectAssets ?? [];
      const fontSources = projectAssets.length > 0 ? formats.buildSvgFontSourcesFromAssets(projectAssets) : undefined;

      return await formats.importSvgDocument(text, file.name, fontSources !== undefined ? { fontSources } : undefined);
    }

    case 'pdf': {
      const formats = await loadFormats();
      const buffer = await file.arrayBuffer();

      return await formats.importPdfDocument(new Uint8Array(buffer));
    }

    default:
      throw new Error(`Unsupported file format: .${ext}`);
  }
}
