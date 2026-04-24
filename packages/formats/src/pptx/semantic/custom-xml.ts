import type { BroadsetDocument } from '@broadset/model';

import { XML_DECLARATION } from '../ooxml/xml';

/**
 * Custom XML parts — `customXml/broadset-project.xml` and
 * `customXml/broadset-interop.xml`. Alongside the document XMP, these
 * are the standards-only document-level carriers for Broadset state that
 * PPTX cannot express in native shapes:
 *
 *   - `broadset-project.xml` — project / settings / canvas / assets /
 *     data schema / page definitions + override maps / Dublin Core
 *     metadata. Animations are deliberately NOT carried here per
 *     io-prereqs IO-D-16 (mappable → `<p:timing>`, unmappable → drop).
 *   - `broadset-interop.xml` — per-element content-hash ledger (see
 *     `semantic/ledger.ts`).
 *
 * These parts are registered against `ppt/presentation.xml` via its
 * `_rels` file, and declared in `[Content_Types].xml` with the
 * `application/xml` override.
 */

const PROJECT_NS = 'https://broadset.io/ns/pptx/project/1.0/';

/**
 * Serialize the project-level custom XML part.
 *
 * The Broadset document state is JSON-stringified and base64-encoded
 * inside a `<document encoding="base64">` child. Base64 carries no
 * XML-special characters, so the resulting XML part is robust against
 * aggressive external XML normalization (entity rewriting, CDATA
 * collapsing, whitespace stripping). Conforming readers preserve
 * unknown custom-XML parts verbatim across save (that's the reason
 * DOCX / XLSX use this mechanism for app-private state).
 */
export function buildProjectCustomXml(document: BroadsetDocument): string {
  const payload = serializeDocumentForCustomXml(document);
  const encoded = base64Encode(payload);

  return `${XML_DECLARATION}<broadsetProject xmlns="${PROJECT_NS}" schemaVersion="1"><document encoding="base64">${encoded}</document></broadsetProject>`;
}

/**
 * Parse a project-level custom XML part back into the document payload.
 * Returns `null` for empty / non-project input so the fast-path can
 * branch on absence.
 */
export function parseProjectCustomXml(body: string): unknown {
  if (!body.includes(PROJECT_NS)) return null;

  const payload = extractDocumentBody(body);

  if (payload === null) return null;

  try {
    const decoded = base64Decode(payload);

    return JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }
}

/**
 * Canonical serialization of the BroadsetDocument for custom-XML
 * storage. We stringify with sorted keys at the top level so exports
 * are byte-reproducible across runs.
 */
function serializeDocumentForCustomXml(document: BroadsetDocument): string {
   
  const stripped = stripAnimations(document);

  return JSON.stringify(stripped);
}

function stripAnimations(document: BroadsetDocument): BroadsetDocument {
  // Animations are NOT preserved in custom XML (IO-D-16). They either
  // map to `<p:timing>` or they drop.
  return { ...document, animations: [] };
}

function extractDocumentBody(xml: string): string | null {
  const match = xml.match(/<document\b[^>]*>([\s\S]*?)<\/document>/);

  return match?.[1]?.trim() ?? null;
}

function base64Encode(input: string): string {
  const bytes = new TextEncoder().encode(input);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';

  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }

  return btoa(binary);
}

function base64Decode(input: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(input, 'base64').toString('utf-8');
  }

  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new TextDecoder('utf-8').decode(bytes);
}
