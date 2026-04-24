import { type BroadsetDocument, createEmptyBroadsetDocument } from '@broadset/model';

import { readOoxmlPackage, readTextPart } from './ooxml/zip';
import { parseProjectCustomXml } from './semantic/custom-xml';
import { BROADSET_CUSTOM_XML_PROJECT } from './types';

/**
 * PPTX importer (P8.2a / P8.3a fast-path).
 *
 * When the incoming PPTX was previously exported by Broadset, the
 * document state is restored from the `customXml/broadset-project.xml`
 * custom XML part. Untouched elements round-trip losslessly via this
 * path.
 *
 * Falls back to an empty document with a single default page when no
 * Broadset metadata is present — arbitrary third-party extraction
 * (operator-level import) lands in P8.3b.
 */
export function importPptx(data: Uint8Array): BroadsetDocument {
  const pkg = readOoxmlPackage(data);
  const projectXml = readTextPart(pkg, BROADSET_CUSTOM_XML_PROJECT);
  const fastPath = projectXml !== null ? parseProjectCustomXml(projectXml) : null;

  if (isDocumentShape(fastPath)) {
    // The payload was produced by our own serializer — we trust its
    // shape and return it directly. Strict schema validation is left to
    // the editor / model boundary which sees this document next.
    return fastPath;
  }

  // Operator-level extraction arrives in P8.3b. Until then, arbitrary
  // third-party files round-trip to an empty document — callers see an
  // import warning via the shared warning surface.
  return createEmptyBroadsetDocument();
}

function isDocumentShape(value: unknown): value is BroadsetDocument {
  if (value === null || typeof value !== 'object') return false;

  const record = value as Record<string, unknown>;

  return (
    typeof record['id'] === 'string' &&
    Array.isArray(record['elements']) &&
    Array.isArray(record['pages']) &&
    typeof record['canvas'] === 'object' &&
    record['canvas'] !== null
  );
}
