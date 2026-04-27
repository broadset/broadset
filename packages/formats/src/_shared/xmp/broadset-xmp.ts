import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

/**
 * Phase 2 `_shared/xmp/` — reads and writes the Broadset XMP packet
 * under the shared `broadset:` namespace per IO-D-08. One footprint
 * across every carrier (PSD, PDF, SVG, PPTX metadata streams) so the
 * reconciliation pipeline can recover document identity and the
 * preserved-metadata baseline regardless of source format.
 *
 * Read path wraps `fast-xml-parser` with strict entity-expansion
 * hardening (no DTDs, no external entities) per the importer
 * security contract. Write path composes RDF/XML as a string
 * explicitly so the output is deterministic byte-for-byte, ready to
 * embed in any carrier.
 */

export const BROADSET_XMP_NAMESPACE = 'https://broadset.io/ns/xmp/1.0/';
export const BROADSET_XMP_VERSION = '1.0';

const XMP_META_OPEN = '<x:xmpmeta xmlns:x="adobe:ns:meta/">';
const XMP_META_CLOSE = '</x:xmpmeta>';
const RDF_OPEN = '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">';
const RDF_CLOSE = '</rdf:RDF>';

/**
 * Preserved per-element identity block. Carries the element id (as it
 * existed when the document was exported) plus a fingerprint so the
 * reconciliation pipeline can recover identity after an external tool
 * strips `data-bs-*` attributes or renames the shape.
 */
export interface BroadsetXmpElementEntry {
  readonly id: string;
  readonly fingerprint: string;
}

export interface BroadsetXmpPacket {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly elements: readonly BroadsetXmpElementEntry[];
}

const elementEntrySchema: z.ZodType<BroadsetXmpElementEntry> = z.object({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
});

export const broadsetXmpPacketSchema: z.ZodType<BroadsetXmpPacket> = z.object({
  documentId: z.string().min(1),
  version: z.string().min(1),
  exportedAt: z.string().min(1),
  elements: z.array(elementEntrySchema),
});

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderElementEntry(entry: BroadsetXmpElementEntry): string {
  return [
    '        <rdf:li rdf:parseType="Resource">',
    `          <broadset:id>${escapeXml(entry.id)}</broadset:id>`,
    `          <broadset:fingerprint>${escapeXml(entry.fingerprint)}</broadset:fingerprint>`,
    '        </rdf:li>',
  ].join('\n');
}

/**
 * Serializes a `BroadsetXmpPacket` to the canonical RDF/XML string
 * embedded in a carrier's metadata stream. Output is deterministic and
 * Zod-valid; callers paste it into the format-specific wrapper
 * (e.g. PSD `XMPMetadata` resource, PDF `Metadata` dictionary, SVG
 * `<metadata>` child).
 */
export function writeBroadsetXmp(packet: BroadsetXmpPacket): string {
  const validated = broadsetXmpPacketSchema.parse(packet);
  const elementsXml = validated.elements.map(renderElementEntry).join('\n');
  const elementsBlock =
    validated.elements.length > 0 ?
      [
        '      <broadset:elements>',
        '        <rdf:Seq>',
        elementsXml,
        '        </rdf:Seq>',
        '      </broadset:elements>',
      ].join('\n')
    : '      <broadset:elements><rdf:Seq/></broadset:elements>';

  return [
    XMP_META_OPEN,
    '  ' + RDF_OPEN,
    `    <rdf:Description rdf:about="" xmlns:broadset="${BROADSET_XMP_NAMESPACE}">`,
    `      <broadset:documentId>${escapeXml(validated.documentId)}</broadset:documentId>`,
    `      <broadset:version>${escapeXml(validated.version)}</broadset:version>`,
    `      <broadset:exportedAt>${escapeXml(validated.exportedAt)}</broadset:exportedAt>`,
    elementsBlock,
    '    </rdf:Description>',
    '  ' + RDF_CLOSE,
    XMP_META_CLOSE,
  ].join('\n');
}

interface ParsedRdfDescription {
  readonly [key: string]: unknown;
}

interface ParsedRdfSeqEntry {
  readonly [key: string]: unknown;
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (value && typeof value === 'object' && '#text' in value) {
    const text = (value as { readonly '#text'?: unknown })['#text'];

    return typeof text === 'string' ? text : undefined;
  }

  return undefined;
}

function coerceEntryList(raw: unknown): readonly unknown[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw;

  return [raw];
}

function extractEntries(description: ParsedRdfDescription): readonly BroadsetXmpElementEntry[] {
  const elementsNode = description['broadset:elements'];

  if (elementsNode === null || elementsNode === undefined || typeof elementsNode !== 'object') return [];

  const seq = (elementsNode as { readonly 'rdf:Seq'?: unknown })['rdf:Seq'];

  if (seq === null || seq === undefined || typeof seq !== 'object') return [];

  const items = coerceEntryList((seq as { readonly 'rdf:li'?: unknown })['rdf:li']);
  const entries: BroadsetXmpElementEntry[] = [];

  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;

    const cast = item as ParsedRdfSeqEntry;
    const id = toStringValue(cast['broadset:id']);
    const fingerprint = toStringValue(cast['broadset:fingerprint']);

    if (id === undefined || fingerprint === undefined) continue;

    entries.push({ id, fingerprint });
  }

  return entries;
}

/**
 * Parses a Broadset XMP packet from an RDF/XML string. Returns `null`
 * when the input is empty, unparseable, lacks the `broadset:` namespace,
 * or fails Zod validation — callers fall back to the preserved-metadata
 * absent path rather than crashing.
 *
 * DTD and external entity processing are disabled on the parser per
 * the importer security contract (billion-laughs / XXE hardening).
 */
export function readBroadsetXmp(input: string | Uint8Array): BroadsetXmpPacket | null {
  const xml = typeof input === 'string' ? input : new TextDecoder().decode(input);
  const trimmed = xml.trim();

  if (trimmed === '') return null;

  try {
    // `processEntities: true` decodes built-in XML entities (&lt; etc.) but
    // does NOT enable DTD or external entity resolution — fast-xml-parser
    // never processes DTDs. XXE / billion-laughs hardening is intrinsic.
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: true,
      htmlEntities: false,
      parseTagValue: false,
      trimValues: true,
    });
    const parsed = parser.parse(trimmed) as Record<string, unknown>;
    const meta = (parsed['x:xmpmeta'] ?? parsed) as Record<string, unknown>;
    const rdf = (meta['rdf:RDF'] ?? meta) as Record<string, unknown>;
    const descriptions = coerceEntryList(rdf['rdf:Description']);

    for (const descriptionRaw of descriptions) {
      if (descriptionRaw === null || typeof descriptionRaw !== 'object') continue;

      const description = descriptionRaw as ParsedRdfDescription;
      const documentId = toStringValue(description['broadset:documentId']);
      const version = toStringValue(description['broadset:version']);
      const exportedAt = toStringValue(description['broadset:exportedAt']);

      if (documentId === undefined || version === undefined || exportedAt === undefined) continue;

      const packet: BroadsetXmpPacket = {
        documentId,
        version,
        exportedAt,
        elements: extractEntries(description),
      };
      const result = broadsetXmpPacketSchema.safeParse(packet);

      if (result.success) return result.data;
    }

    return null;
  } catch {
    return null;
  }
}
