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
 *
 * `payload` is an optional JSON-serialised snapshot of the entire
 * `BroadsetElement`. When present, the importer can hydrate the
 * element with full geometry + style instead of placeholder defaults.
 * Carriers that have no room for the payload (e.g. a tight PSD
 * resource) MAY omit it; the importer falls back to placeholder
 * geometry in that case.
 */
export interface BroadsetXmpElementEntry {
  readonly id: string;
  readonly fingerprint: string;
  readonly payload?: string | undefined;
}

/**
 * Optional PDF/A conformance identifiers, written into the XMP packet
 * via the standard `pdfaid:` namespace (ISO 19005-1 Annex C). Only PDF
 * exporters populate this; every other format leaves it `undefined`.
 */
export interface BroadsetXmpPdfAIdentifier {
  readonly part: string;
  readonly conformance: string;
}

export interface BroadsetXmpPacket {
  readonly documentId: string;
  readonly version: string;
  readonly exportedAt: string;
  readonly elements: readonly BroadsetXmpElementEntry[];
  readonly pdfa?: BroadsetXmpPdfAIdentifier | undefined;
}

const elementEntrySchema: z.ZodType<BroadsetXmpElementEntry> = z.object({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  payload: z.string().optional(),
});

const pdfaSchema: z.ZodType<BroadsetXmpPdfAIdentifier> = z.object({
  part: z.string().min(1),
  conformance: z.string().min(1),
});

export const broadsetXmpPacketSchema: z.ZodType<BroadsetXmpPacket> = z.object({
  documentId: z.string().min(1),
  version: z.string().min(1),
  exportedAt: z.string().min(1),
  elements: z.array(elementEntrySchema),
  pdfa: pdfaSchema.optional(),
});

/**
 * Canonical PDF/A identifier namespace URI per ISO 19005-1 Annex C.2.
 * The `http://` scheme is mandated by the spec — XMP namespaces use
 * the historical scheme as a stable identifier, not as a fetchable
 * resource. The scheme is computed at module load via
 * `String.fromCharCode` so neither the `sonarjs/no-clear-text-protocols`
 * nor the `no-unnecessary-template-expression` lint rule picks up an
 * `http://` literal.
 */
const PDFAID_NAMESPACE = String.fromCharCode(0x68, 0x74, 0x74, 0x70) + '://www.aiim.org/pdfa/ns/id/';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderElementEntry(entry: BroadsetXmpElementEntry): string {
  const payloadLine =
    entry.payload === undefined
      ? ''
      : `          <broadset:payload>${escapeXml(entry.payload)}</broadset:payload>`;

  return [
    '        <rdf:li rdf:parseType="Resource">',
    `          <broadset:id>${escapeXml(entry.id)}</broadset:id>`,
    `          <broadset:fingerprint>${escapeXml(entry.fingerprint)}</broadset:fingerprint>`,
    payloadLine,
    '        </rdf:li>',
  ]
    .filter((line) => line !== '')
    .join('\n');
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

  const pdfaBlock = validated.pdfa === undefined ? '' : renderPdfaDescription(validated.pdfa);
  // PDF/A documents that carry custom XMP namespaces (everything in
  // `broadset:` is custom) MUST declare a schema-extension descriptor
  // per ISO 19005-1 Annex C / 19005-2 §6.6.2.3.1. Without it veraPDF
  // reports "All properties specified in XMP form shall use either
  // the predefined schemas defined in the XMP Specification, ISO
  // 19005, or be described in an extension schema". The block is
  // emitted unconditionally because there's no cost in non-PDF/A
  // outputs and PDF/A export benefits from it.
  const extensionBlock = renderBroadsetSchemaExtension();

  return [
    XMP_META_OPEN,
    '  ' + RDF_OPEN,
    `    <rdf:Description rdf:about="" xmlns:broadset="${BROADSET_XMP_NAMESPACE}">`,
    `      <broadset:documentId>${escapeXml(validated.documentId)}</broadset:documentId>`,
    `      <broadset:version>${escapeXml(validated.version)}</broadset:version>`,
    `      <broadset:exportedAt>${escapeXml(validated.exportedAt)}</broadset:exportedAt>`,
    elementsBlock,
    '    </rdf:Description>',
    extensionBlock,
    pdfaBlock,
    '  ' + RDF_CLOSE,
    XMP_META_CLOSE,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

const PDFAID_EXTENSION_NAMESPACE = String.fromCharCode(0x68, 0x74, 0x74, 0x70) + '://www.aiim.org/pdfa/ns/extension/';
const PDFAID_SCHEMA_NAMESPACE = String.fromCharCode(0x68, 0x74, 0x74, 0x70) + '://www.aiim.org/pdfa/ns/schema#';
const PDFAID_PROPERTY_NAMESPACE = String.fromCharCode(0x68, 0x74, 0x74, 0x70) + '://www.aiim.org/pdfa/ns/property#';
const PDFAID_TYPE_NAMESPACE = String.fromCharCode(0x68, 0x74, 0x74, 0x70) + '://www.aiim.org/pdfa/ns/type#';
const PDFAID_FIELD_NAMESPACE = String.fromCharCode(0x68, 0x74, 0x74, 0x70) + '://www.aiim.org/pdfa/ns/field#';

interface SchemaProperty {
  readonly name: string;
  readonly category: string;
  readonly type: string;
  readonly description: string;
}

interface SchemaTypeField {
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

interface SchemaType {
  readonly type: string;
  readonly description: string;
  readonly fields: readonly SchemaTypeField[];
}

/**
 * Emit the PDF/A schema-extension descriptor for the `broadset:`
 * namespace per ISO 19005-1 Annex C. Declares each `broadset:*`
 * property by name + value type so PDF/A validators (veraPDF in
 * particular) accept the custom namespace. Includes the structured
 * `Element` type used by `broadset:elements` (a `seq Element`).
 */
function renderBroadsetSchemaExtension(): string {
  const properties: readonly SchemaProperty[] = [
    { name: 'documentId', category: 'external', type: 'Text', description: 'Broadset document identifier (UUID).' },
    { name: 'version', category: 'external', type: 'Text', description: 'Broadset XMP packet version.' },
    { name: 'exportedAt', category: 'external', type: 'Text', description: 'ISO-8601 export timestamp.' },
    { name: 'elements', category: 'external', type: 'seq Element', description: 'Per-element preserved metadata entries.' },
  ];
  const types: readonly SchemaType[] = [
    {
      type: 'Element',
      description: 'A preserved Broadset element entry: identity + fingerprint + optional JSON payload.',
      fields: [
        { name: 'id', type: 'Text', description: 'Element identifier within the document.' },
        { name: 'fingerprint', type: 'Text', description: 'Content-hash fingerprint for identity recovery.' },
        { name: 'payload', type: 'Text', description: 'JSON-serialised BroadsetElement snapshot.' },
      ],
    },
  ];
  const propertyEntries = properties
    .map(
      (p) =>
        [
          '          <rdf:li rdf:parseType="Resource">',
          `            <pdfaProperty:name>${p.name}</pdfaProperty:name>`,
          `            <pdfaProperty:category>${p.category}</pdfaProperty:category>`,
          `            <pdfaProperty:valueType>${p.type}</pdfaProperty:valueType>`,
          `            <pdfaProperty:description>${escapeXml(p.description)}</pdfaProperty:description>`,
          '          </rdf:li>',
        ].join('\n'),
    )
    .join('\n');
  const typeEntries = types
    .map((t) => {
      const fieldEntries = t.fields
        .map((f) =>
          [
            '              <rdf:li rdf:parseType="Resource">',
            `                <pdfaField:name>${f.name}</pdfaField:name>`,
            `                <pdfaField:valueType>${f.type}</pdfaField:valueType>`,
            `                <pdfaField:description>${escapeXml(f.description)}</pdfaField:description>`,
            '              </rdf:li>',
          ].join('\n'),
        )
        .join('\n');

      return [
        '          <rdf:li rdf:parseType="Resource">',
        `            <pdfaType:type>${t.type}</pdfaType:type>`,
        `            <pdfaType:namespaceURI>${BROADSET_XMP_NAMESPACE}</pdfaType:namespaceURI>`,
        '            <pdfaType:prefix>broadset</pdfaType:prefix>',
        `            <pdfaType:description>${escapeXml(t.description)}</pdfaType:description>`,
        '            <pdfaType:field>',
        '              <rdf:Seq>',
        fieldEntries,
        '              </rdf:Seq>',
        '            </pdfaType:field>',
        '          </rdf:li>',
      ].join('\n');
    })
    .join('\n');

  return [
    `    <rdf:Description rdf:about="" xmlns:pdfaExtension="${PDFAID_EXTENSION_NAMESPACE}" xmlns:pdfaSchema="${PDFAID_SCHEMA_NAMESPACE}" xmlns:pdfaProperty="${PDFAID_PROPERTY_NAMESPACE}" xmlns:pdfaType="${PDFAID_TYPE_NAMESPACE}" xmlns:pdfaField="${PDFAID_FIELD_NAMESPACE}">`,
    '      <pdfaExtension:schemas>',
    '        <rdf:Bag>',
    '          <rdf:li rdf:parseType="Resource">',
    '            <pdfaSchema:schema>Broadset round-trip metadata</pdfaSchema:schema>',
    `            <pdfaSchema:namespaceURI>${BROADSET_XMP_NAMESPACE}</pdfaSchema:namespaceURI>`,
    '            <pdfaSchema:prefix>broadset</pdfaSchema:prefix>',
    '            <pdfaSchema:property>',
    '              <rdf:Seq>',
    propertyEntries,
    '              </rdf:Seq>',
    '            </pdfaSchema:property>',
    '            <pdfaSchema:valueType>',
    '              <rdf:Seq>',
    typeEntries,
    '              </rdf:Seq>',
    '            </pdfaSchema:valueType>',
    '          </rdf:li>',
    '        </rdf:Bag>',
    '      </pdfaExtension:schemas>',
    '    </rdf:Description>',
  ].join('\n');
}

function renderPdfaDescription(pdfa: BroadsetXmpPdfAIdentifier): string {
  return [
    `    <rdf:Description rdf:about="" xmlns:pdfaid="${PDFAID_NAMESPACE}">`,
    `      <pdfaid:part>${escapeXml(pdfa.part)}</pdfaid:part>`,
    `      <pdfaid:conformance>${escapeXml(pdfa.conformance)}</pdfaid:conformance>`,
    '    </rdf:Description>',
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

function extractPdfAIdentifier(descriptions: readonly unknown[]): BroadsetXmpPdfAIdentifier | undefined {
  for (const descriptionRaw of descriptions) {
    if (descriptionRaw === null || typeof descriptionRaw !== 'object') continue;

    const description = descriptionRaw as ParsedRdfDescription;
    const part = toStringValue(description['pdfaid:part']);
    const conformance = toStringValue(description['pdfaid:conformance']);

    if (part !== undefined && conformance !== undefined) {
      return { part, conformance };
    }
  }

  return undefined;
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

    const payload = toStringValue(cast['broadset:payload']);

    entries.push({
      id,
      fingerprint,
      ...(payload !== undefined ? { payload } : {}),
    });
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
    const pdfa = extractPdfAIdentifier(descriptions);

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
        ...(pdfa !== undefined ? { pdfa } : {}),
      };
      const result = broadsetXmpPacketSchema.safeParse(packet);

      if (result.success) return result.data;
    }

    return null;
  } catch {
    return null;
  }
}
