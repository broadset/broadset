import {
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
} from 'pdf-lib';

import { type BroadsetXmpPacket, readBroadsetXmp } from '../../_shared/xmp';
import type { MarkedContentKind, MarkedContentTag, PdfRoundTripMetadata } from '../types';

const METADATA_KEY = PDFName.of('Metadata');
const RESOURCES_KEY = PDFName.of('Resources');
const PROPERTIES_KEY = PDFName.of('Properties');
const ID_KEY = PDFName.of('ID');
const KIND_KEY = PDFName.of('Kind');
const DIRTY_KEY = PDFName.of('Dirty');
const DATA_FIELD_KEY = PDFName.of('DataField');
const BLOB_KEY = PDFName.of('Blob');

const BS_PROP_PREFIX = 'BS_';

const MARKED_CONTENT_KIND_FALLBACK: MarkedContentKind = 'path';
const VALID_KINDS: ReadonlySet<MarkedContentKind> = new Set<MarkedContentKind>([
  'text',
  'image',
  'svg',
  'path',
  'rectangle',
  'ellipse',
  'qrcode',
  'group',
  'video',
  'clock',
  'ticker',
]);

/**
 * Load a PDF byte stream with `pdf-lib`. Returns `null` for input the
 * parser cannot recognise (malformed bytes, unsupported encryption,
 * attacker-crafted structure) so callers degrade gracefully to the
 * operator-extraction fallback in P6.4b rather than throwing.
 */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument | null> {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return null;
  }
}

/**
 * Read the `broadset:` XMP packet off the document catalog's `/Metadata`
 * stream. Returns `null` for PDFs without a metadata stream, for streams
 * that cannot be decoded, and for packets that fail the shared Zod
 * schema validation (handled inside `readBroadsetXmp`).
 */
export function readDocumentXmp(pdf: PDFDocument): BroadsetXmpPacket | null {
  const metadataRef = pdf.catalog.get(METADATA_KEY);

  if (metadataRef === undefined) return null;

  const stream = pdf.context.lookup(metadataRef);

  if (!(stream instanceof PDFRawStream)) return null;

  return readBroadsetXmp(stream.contents);
}

/**
 * Walk every page's `/Resources /Properties` and collect every
 * `/BS_<id>` marked-content property dict as a typed
 * `MarkedContentTag`. The `/BS_` prefix filters out third-party
 * marked-content names so only Broadset-owned tags land in the result.
 */
export function collectMarkedContentTags(pdf: PDFDocument): readonly MarkedContentTag[] {
  const tags: MarkedContentTag[] = [];

  for (const page of pdf.getPages()) {
    const properties = pagePropertiesDict(page.node);

    if (properties !== undefined) {
      tags.push(...tagsFromProperties(properties));
    }
  }

  return tags;
}

function pagePropertiesDict(pageNode: PDFDict): PDFDict | undefined {
  const resources = pageNode.lookupMaybe(RESOURCES_KEY, PDFDict);

  if (resources === undefined) return undefined;

  return resources.lookupMaybe(PROPERTIES_KEY, PDFDict);
}

function tagsFromProperties(properties: PDFDict): readonly MarkedContentTag[] {
  const tags: MarkedContentTag[] = [];

  for (const [keyName] of properties.entries()) {
    if (!keyName.decodeText().startsWith(BS_PROP_PREFIX)) continue;

    const entry = properties.lookupMaybe(keyName, PDFDict);

    if (entry === undefined) continue;

    const tag = tagFromDict(entry);

    if (tag !== null) {
      tags.push(tag);
    }
  }

  return tags;
}

function tagFromDict(dict: PDFDict): MarkedContentTag | null {
  const idEntry = dict.lookupMaybe(ID_KEY, PDFString);

  if (idEntry === undefined) return null;

  const kindEntry = dict.lookupMaybe(KIND_KEY, PDFName);

  if (kindEntry === undefined) return null;

  const dirtyEntry = dict.lookupMaybe(DIRTY_KEY, PDFBool);
  const dataFieldEntry = dict.lookupMaybe(DATA_FIELD_KEY, PDFString);
  const blobEntry = dict.lookupMaybe(BLOB_KEY, PDFString);

  const rawKind = kindEntry.decodeText().toLowerCase();
  const kind = isMarkedContentKind(rawKind) ? rawKind : MARKED_CONTENT_KIND_FALLBACK;

  const dataField = dataFieldEntry === undefined ? undefined : dataFieldEntry.decodeText();
  const preservationBlob = blobEntry === undefined ? undefined : blobEntry.decodeText();

  return {
    id: idEntry.decodeText(),
    kind,
    dirty: dirtyEntry === undefined ? false : dirtyEntry.asBoolean(),
    ...(dataField !== undefined ? { dataField } : {}),
    ...(preservationBlob !== undefined ? { preservationBlob } : {}),
  };
}

function isMarkedContentKind(value: string): value is MarkedContentKind {
  return VALID_KINDS.has(value as MarkedContentKind);
}

/**
 * Read XMP packet + marked-content tag list from a PDF byte stream in
 * one pass. Returns `{ xmp: null, markedContentTags: [] }` when the PDF
 * cannot be loaded or carries no Broadset metadata.
 */
export async function readRoundTripMetadata(bytes: Uint8Array): Promise<PdfRoundTripMetadata> {
  const pdf = await loadPdf(bytes);

  if (pdf === null) {
    return { xmp: null, markedContentTags: [] };
  }

  return {
    xmp: readDocumentXmp(pdf),
    markedContentTags: collectMarkedContentTags(pdf),
  };
}
