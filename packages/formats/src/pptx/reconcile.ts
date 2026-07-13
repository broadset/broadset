import type { BroadsetDocument, BroadsetElement } from '@broadset/model';

import { fingerprintElement, reconcile, type ReconcileResult } from '../_shared';
import { importPptxWithReport } from './import';
import { resolvePptxImportCaps } from './import-caps';
import { readOoxmlPackageWithCaps, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import { BROADSET_CUSTOM_XML_PROJECT, type PptxImportOptions } from './types';

/**
 * Reconcile a PPTX file against its preserved Broadset metadata. When
 * the file was previously exported by Broadset, the
 * `customXml/broadset-project.xml` part is the preserved state and the
 * operator-level extraction of the slide tree is the current state.
 *
 * For files without preserved metadata, the result's `additions` bucket
 * carries every shape as a "new element" — equivalent to a first-time
 * import.
 *
 * Reuses the format-agnostic `_shared/reconcile/` engine so PSD / PDF /
 * SVG / PPTX all produce the same result shape.
 */
export async function reconcilePptx(data: Uint8Array, options?: PptxImportOptions): Promise<ReconcileResult> {
  const caps = resolvePptxImportCaps(options);

  if (data.byteLength > caps.maxInputBytes) return emptyReconcileResult();

  const pkgResult = tryReadPackage(data, options);

  if (pkgResult === null) return emptyReconcileResult();

  const pkg = pkgResult.pkg;
  const preservedXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);
  const preservedDocument = preservedXml !== null ? parseProjectCustomXml(preservedXml) : null;
  const currentDocument = importPptxWithReport(data, options).document;
  const preservedElements = isDocumentShape(preservedDocument) ? preservedDocument.elements : [];
  const fingerprintsByElementId = await computeFingerprints([...preservedElements, ...currentDocument.elements]);

  return reconcile({
    preservedMetadata: { elements: preservedElements },
    currentVisual: { elements: currentDocument.elements },
    fingerprintsByElementId,
  });
}

function emptyReconcileResult(): ReconcileResult {
  return { modifications: [], additions: [], deletions: [], recoveredByHash: [] };
}

function tryReadPackage(
  data: Uint8Array,
  options?: PptxImportOptions,
): ReturnType<typeof readOoxmlPackageWithCaps> | null {
  const caps = resolvePptxImportCaps(options);

  try {
    return readOoxmlPackageWithCaps(data, {
      maxEntries: caps.maxEntries,
      maxPartBytes: caps.maxPartBytes,
      maxTotalUncompressedBytes: caps.maxTotalUncompressedBytes,
    });
  } catch {
    return null;
  }
}

async function computeFingerprints(elements: readonly BroadsetElement[]): Promise<ReadonlyMap<string, string>> {
  const map = new Map<string, string>();

  for (const element of elements) {
    if (map.has(element.id)) continue;

    const fingerprint = await fingerprintElement(element);

    map.set(element.id, fingerprint);
  }

  return map;
}

function isDocumentShape(value: unknown): value is BroadsetDocument {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return Array.isArray(record['elements']) && typeof record['id'] === 'string';
}
