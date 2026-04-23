import type { BroadsetDocument, BroadsetElement, Canvas } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import type { Layer, Psd } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';

import { elementToLayer, getPendingLinkedFiles, resetExportState, setPrefetchedUrlImages } from './export-layer';
import { ensureCanvasInitialized } from './runtime-canvas';

interface PsdImageBytes {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

interface ExportPsdSyncOptions {
  readonly prefetchedUrlImages?: ReadonlyMap<string, PsdImageBytes>;
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
  switch (canvas.unit) {
    case 'px':
      return value;
    case 'mm':
      return (value / 25.4) * canvas.dpi;
    case 'in':
      return value * canvas.dpi;
  }
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

function exportPsdBytesCore(doc: BroadsetDocument): Uint8Array {
  ensureCanvasInitialized();
  resetExportState();

  const width = Math.round(canvasToPixels(doc.canvas, doc.canvas.width));
  const height = Math.round(canvasToPixels(doc.canvas, doc.canvas.height));

  const psd: Psd = {
    width,
    height,
    colorMode: 3,
    children: [],
  };

  if (doc.pages.length > 1) {
    const artboardLayers = [];
    const elementsById = new Map(doc.elements.map((element) => [element.id, element]));

    for (const page of doc.pages) {
      const pageInstanceById = new Map(page.elements.map((instance) => [instance.elementId, instance]));
      const visibleElements = doc.elements.filter((element) => {
        let current = element;

        while (current.parentId !== null) {
          const parent = elementsById.get(current.parentId);

          if (parent === undefined) {
            return false;
          }

          current = parent;
        }

        const rootInstance = pageInstanceById.get(current.id);

        return rootInstance?.visible === true;
      });

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
    psd.children = buildLayersForParent(doc.elements, null);
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

  return exportPsdBytesCore(doc);
}

/**
 * Export a BroadsetDocument to PSD bytes, fetching URL images via the
 * provided fetch function. Falls back to data URIs for non-URL content.
 */
export async function exportPsdBytesAsync(
  doc: BroadsetDocument,
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<Uint8Array> {
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

  return exportPsdBytesCore(doc);
}
