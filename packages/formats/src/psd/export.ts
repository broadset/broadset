import type { BroadsetDocument, BroadsetElement, Canvas } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import type { Layer, Psd } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';

import { canvasUnitToMm, MM_PER_INCH } from '../_shared/geometry';
import { elementToLayer, getPendingLinkedFiles, resetExportState, setPrefetchedUrlImages } from './export-layer';
import { writeBroadsetXmpForDocument } from './export-xmp';
import { collectExportOptionsWarnings, collectPreflightWarnings } from './preflight';
import { ensureCanvasInitialized } from './runtime-canvas';
import type { PsdExportOptions } from './types';

interface PsdImageBytes {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/**
 * Sync export options. Adds `prefetchedUrlImages` on top of the
 * shared `PsdExportOptions` surface — the sync entry cannot fetch
 * remote URL bytes itself, so any `image` element pointing at an
 * `http(s)://` URL must come pre-resolved.
 */
export interface ExportPsdSyncOptions extends PsdExportOptions {
  readonly prefetchedUrlImages?: ReadonlyMap<string, PsdImageBytes>;
}

/**
 * Async export options. Adds the optional `fetch` override on top of
 * the shared `PsdExportOptions` surface so test environments can
 * inject a deterministic fetcher without touching `globalThis.fetch`.
 */
export interface ExportPsdAsyncOptions extends PsdExportOptions {
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Builds PSD layers from a subset of `elements` whose parent matches
 * `parentId`. Group elements recurse so the final PSD layer tree
 * mirrors the Broadset `parentId` tree exactly. Orphan elements
 * (parentId points at an element not in `elements`) surface at the
 * root rather than being dropped, per IO-D-18.
 */
function buildLayersForParent(elements: readonly BroadsetElement[], parentId: string | null): Layer[] {
  const layers: Layer[] = [];
  const knownIds = new Set(elements.map((el) => el.id));

  for (const el of elements) {
    const effectiveParent = el.parentId ?? null;
    const effectiveParentExists = effectiveParent === null || knownIds.has(effectiveParent);
    const resolvedParent = effectiveParentExists ? effectiveParent : null;

    if (resolvedParent !== parentId) continue;

    if (el.type === 'group') {
      const children = buildLayersForParent(elements, el.id);
      const groupLayer: Layer = {
        name: el.name,
        left: Math.round(el.position.x),
        top: Math.round(el.position.y),
        right: Math.round(el.position.x + el.width),
        bottom: Math.round(el.position.y + el.height),
        opacity: el.style.opacity,
        hidden: false,
        opened: true,
        children,
      };

      layers.push(groupLayer);
      continue;
    }

    layers.push(elementToLayer(el));
  }

  return layers;
}

function canvasToPixels(canvas: Canvas, value: number): number {
  if (canvas.unit === 'px') return value;

  // mm / in → mm via the shared helper, then mm → px via the canvas DPI.
  return (canvasUnitToMm(canvas, value) / MM_PER_INCH) * canvas.dpi;
}

function isUrl(content: string): boolean {
  return content.startsWith('http://') || content.startsWith('https://');
}

async function fetchImageAsBytes(
  url: string,
  fetchFn: typeof globalThis.fetch,
): Promise<{ readonly mime: string; readonly bytes: Uint8Array } | undefined> {
  try {
    const response = await fetchFn(url);

    if (!response.ok) return undefined;

    const contentType = response.headers.get('content-type') ?? 'image/png';
    const mime = contentType.split(';')[0]?.trim() ?? 'image/png';
    const arrayBuffer = await response.arrayBuffer();

    return { mime, bytes: new Uint8Array(arrayBuffer) };
  } catch {
    return undefined;
  }
}

/**
 * Build the per-page visibility filter applied in multi-page exports.
 * When `preserveVisibility` is `false` (the explicit "flatten"
 * choice), every element marked `visible: false` on the page instance
 * is omitted instead of being emitted-and-hidden. Default behaviour
 * (undefined or `true`) keeps the existing semantics: only elements
 * with `visible === true` are exported per page.
 */
function isElementVisibleOnPage(
  element: BroadsetElement,
  elementsById: ReadonlyMap<string, BroadsetElement>,
  pageInstanceById: ReadonlyMap<string, { readonly visible: boolean }>,
): boolean {
  let current: BroadsetElement = element;
  let parentId = current.parentId ?? null;

  while (parentId !== null) {
    const parent = elementsById.get(parentId);

    if (parent === undefined) {
      return false;
    }

    current = parent;
    parentId = current.parentId ?? null;
  }

  const rootInstance = pageInstanceById.get(current.id);

  return rootInstance?.visible === true;
}

/**
 * For single-page documents we previously had no per-instance
 * visibility filter. With `preserveVisibility: false` callers ask us
 * to drop invisible elements outright; we honour that by consulting
 * the sole page's instance map and filtering the same way as the
 * multi-page path. With the default (preserve), single-page exports
 * keep emitting every element regardless of instance visibility.
 */
function filterElementsForSinglePage(
  doc: BroadsetDocument,
  preserveVisibility: boolean,
): readonly BroadsetElement[] {
  if (preserveVisibility) return doc.elements;

  const onlyPage = doc.pages[0];

  if (onlyPage === undefined) return doc.elements;

  const elementsById = new Map(doc.elements.map((element) => [element.id, element]));
  const pageInstanceById = new Map(onlyPage.elements.map((instance) => [instance.elementId, instance]));

  return doc.elements.filter((element) => isElementVisibleOnPage(element, elementsById, pageInstanceById));
}

function exportPsdBytesCore(doc: BroadsetDocument, options: PsdExportOptions): Uint8Array {
  ensureCanvasInitialized();
  resetExportState();

  const preserveVisibility = options.preserveVisibility !== false;
  const width = Math.round(canvasToPixels(doc.canvas, doc.canvas.width));
  const height = Math.round(canvasToPixels(doc.canvas, doc.canvas.height));

  const psd: Psd = {
    width,
    height,
    colorMode: 3,
    children: [],
    imageResources: {
      xmpMetadata: writeBroadsetXmpForDocument(doc),
    },
  };

  if (doc.pages.length > 1) {
    const artboardLayers = [];
    const elementsById = new Map(doc.elements.map((element) => [element.id, element]));

    for (const page of doc.pages) {
      const pageInstanceById = new Map(page.elements.map((instance) => [instance.elementId, instance]));
      const visibleElements = doc.elements.filter((element) =>
        isElementVisibleOnPage(element, elementsById, pageInstanceById),
      );

      artboardLayers.push({
        name: page.name,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        artboard: {
          rect: { top: 0, left: 0, bottom: height, right: width },
        },
        children: buildLayersForParent(visibleElements, null),
      });
    }

    psd.children = artboardLayers;
  } else {
    psd.children = buildLayersForParent(filterElementsForSinglePage(doc, preserveVisibility), null);
  }

  const pendingLinkedFiles = getPendingLinkedFiles();

  if (pendingLinkedFiles.length > 0) {
    psd.linkedFiles = pendingLinkedFiles.map((lf) => ({
      id: lf.id,
      name: lf.name,
      data: lf.data,
    }));
  }

  return writePsdUint8Array(psd);
}

/**
 * Export a BroadsetDocument to PSD bytes.
 * Animated elements are exported at their rest state (t=0).
 * URL images require prefetched bytes in sync mode.
 */
export function exportPsdBytes(doc: BroadsetDocument, options?: ExportPsdSyncOptions): Uint8Array {
  const prefetched = new Map(options?.prefetchedUrlImages ?? []);
  const missingUrlElementNames = doc.elements
    .filter((el) => {
      const text = resolveContentAsPlainString(el.content);

      return el.type === 'image' && text !== '' && isUrl(text) && !prefetched.has(el.id);
    })
    .map((el) => el.name || el.id);

  if (missingUrlElementNames.length > 0) {
    throw new Error(
      `PSD sync export requires prefetched URL image bytes for: ${missingUrlElementNames.join(', ')}. ` +
        'Provide prefetchedUrlImages or use exportPsdBytesAsync.',
    );
  }

  setPrefetchedUrlImages(prefetched);

  return exportPsdBytesCore(doc, options ?? {});
}

/**
 * Export a BroadsetDocument to PSD bytes, fetching URL images via the
 * provided fetch function (defaults to `globalThis.fetch`). Falls
 * back to data URIs for non-URL content.
 */
export async function exportPsdBytesAsync(
  doc: BroadsetDocument,
  options?: ExportPsdAsyncOptions,
): Promise<Uint8Array> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const prefetched = new Map<string, { readonly mime: string; readonly bytes: Uint8Array }>();
  const urlElements = doc.elements.filter((el) => {
    const text = resolveContentAsPlainString(el.content);

    return el.type === 'image' && text !== '' && isUrl(text);
  });

  const fetchResults = await Promise.all(
    urlElements.map(async (el) => {
      const result = await fetchImageAsBytes(resolveContentAsPlainString(el.content), fetchFn);

      return { id: el.id, result };
    }),
  );

  for (const { id, result } of fetchResults) {
    if (result) {
      prefetched.set(id, result);
    }
  }

  setPrefetchedUrlImages(prefetched);

  return exportPsdBytesCore(doc, options ?? {});
}

/**
 * Result of a preflight-aware export: the bytes plus the structured
 * warning list. Mirrors `PdfExportResult`.
 */
export interface PsdExportResult {
  readonly bytes: Uint8Array;
  readonly warnings: readonly string[];
}

/**
 * Preflight-aware export — runs `collectPreflightWarnings` to surface
 * the static-document concerns (animations dropped, rotated non-image
 * elements, colour-mode downgrades, stale unmapped-effects, URL
 * images), `collectExportOptionsWarnings` for caller-supplied options
 * the writer cannot honour today, and appends fetch-failure messages
 * from the async resolution. Always returns bytes — preflight
 * warnings never block the export per IO-D-14.
 */
export async function exportPsdBytesAsyncWithPreflight(
  doc: BroadsetDocument,
  options?: ExportPsdAsyncOptions,
): Promise<PsdExportResult> {
  const fetchFn = options?.fetch ?? globalThis.fetch;
  const baseWarnings = collectPreflightWarnings(doc);
  const optionWarnings = collectExportOptionsWarnings(options);
  const fetchWarnings: string[] = [];
  const prefetched = new Map<string, { readonly mime: string; readonly bytes: Uint8Array }>();

  const urlElements = doc.elements.filter((el) => {
    const text = resolveContentAsPlainString(el.content);

    return el.type === 'image' && text !== '' && isUrl(text);
  });

  const fetchResults = await Promise.all(
    urlElements.map(async (el) => {
      const url = resolveContentAsPlainString(el.content);
      const result = await fetchImageAsBytes(url, fetchFn);

      return { id: el.id, name: el.name || el.id, url, result };
    }),
  );

  for (const { id, name, url, result } of fetchResults) {
    if (result) {
      prefetched.set(id, result);
      continue;
    }

    fetchWarnings.push(`PSD preflight: failed to fetch image "${name}" from ${url}; the layer will export with placeholder pixels.`);
  }

  setPrefetchedUrlImages(prefetched);

  const bytes = exportPsdBytesCore(doc, options ?? {});

  return { bytes, warnings: [...baseWarnings, ...optionWarnings, ...fetchWarnings] };
}
