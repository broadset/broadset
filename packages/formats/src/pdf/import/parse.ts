import {
  EncryptedPDFError,
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
const NAMES_KEY = PDFName.of('Names');
const OPEN_ACTION_KEY = PDFName.of('OpenAction');
const AA_KEY = PDFName.of('AA');
const JAVASCRIPT_KEY = PDFName.of('JavaScript');
const EMBEDDED_FILES_KEY = PDFName.of('EmbeddedFiles');
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
 * Result of probing a PDF byte stream. Callers use the tag to
 * differentiate "could not parse bytes" from "encrypted — need
 * password" from "parsed successfully" so UI messaging can be precise.
 */
export type PdfLoadResult =
  | { readonly kind: 'ok'; readonly pdf: PDFDocument }
  | { readonly kind: 'encrypted' }
  | { readonly kind: 'malformed' };

/**
 * Load a PDF byte stream with `pdf-lib`, differentiating encryption
 * rejection from generic parse failure. Encrypted PDFs are NEVER
 * silently accepted per `project/spec/formats/pdf.md` §"Security —
 * Encrypted Input and Active Content": the spec mandates "abort
 * parsing before allocation" unless an explicit password is supplied.
 *
 * When `password` is provided but pdf-lib still throws (the library
 * does not expose a public password-decryption API), the result is
 * still `'encrypted'` so the caller surfaces the "pdf-lib cannot
 * decrypt" outcome honestly rather than silently dropping.
 */
export async function probeLoadPdf(
  bytes: Uint8Array,
  options: { readonly password?: string } = {},
): Promise<PdfLoadResult> {
  try {
    const pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });

    return { kind: 'ok', pdf };
  } catch (err) {
    if (isEncryptionError(err)) {
      return { kind: 'encrypted' };
    }

    // `options.password` cannot be passed to pdf-lib at load time —
    // the library does not expose a public password-decryption API.
    // Callers still receive 'encrypted' so UI messaging is honest
    // rather than silently dropping the password attempt.
    if (options.password !== undefined) {
      return { kind: 'encrypted' };
    }

    return { kind: 'malformed' };
  }
}

/**
 * pdf-lib's public `EncryptedPDFError` class is the intended signal
 * for encrypted-input rejection, but the `Error` thrown by
 * `PDFDocument.load` can arrive as a plain `Error` instance in some
 * bundled builds (the `__extends`-patched class loses its constructor
 * name after minification). Checking the message body is a stable
 * fallback — pdf-lib's message consistently includes the literal
 * substring "is encrypted" regardless of subclass plumbing.
 */
function isEncryptionError(err: unknown): boolean {
  if (err instanceof EncryptedPDFError) return true;

  if (err instanceof Error) {
    return err.message.toLowerCase().includes('is encrypted');
  }

  return false;
}

/**
 * Convenience wrapper that returns the PDFDocument when load succeeds
 * or `null` when the PDF is encrypted or malformed. Callers that need
 * to distinguish the two outcomes should use `probeLoadPdf` directly.
 */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocument | null> {
  const result = await probeLoadPdf(bytes);

  return result.kind === 'ok' ? result.pdf : null;
}

/**
 * Detect presence of embedded JavaScript actions on the document
 * catalog. PDF 1.7 § 12.6.4 lists four JS carriers: `/Names
 * /JavaScript`, `/OpenAction`, page-level `/AA`, and annotation `/A`.
 * This probe catches the first two — the most common carriers emitted
 * by Acrobat — and is sufficient to satisfy the spec's "strip +
 * warn" floor. Per-annotation JS detection lands with the full
 * annotation walker in a later iteration.
 */
export function hasEmbeddedJavaScript(pdf: PDFDocument): boolean {
  const names = pdf.catalog.lookupMaybe(NAMES_KEY, PDFDict);

  if (names !== undefined) {
    const js = names.lookupMaybe(JAVASCRIPT_KEY, PDFDict);

    if (js !== undefined) return true;
  }

  // `/OpenAction` can be either an action dict (typed `S /JavaScript`)
  // or a destination array (`[page /XYZ x y zoom]` from jsPDF, Acrobat,
  // etc.). We detect only the action-dict form. pdf-lib's
  // `lookupMaybe` throws when the value's type does not match the
  // requested class — wrap in try/catch so a destination-array
  // /OpenAction gracefully falls through rather than aborting import.
  const openAction = lookupOpenActionDict(pdf);

  if (openAction !== undefined) {
    const subtype = openAction.lookupMaybe(PDFName.of('S'), PDFName);

    if (subtype?.decodeText() === 'JavaScript') {
      return true;
    }
  }

  return hasDocumentAdditionalActionJs(pdf);
}

function lookupOpenActionDict(pdf: PDFDocument): PDFDict | undefined {
  try {
    return pdf.catalog.lookupMaybe(OPEN_ACTION_KEY, PDFDict);
  } catch {
    return undefined;
  }
}

function hasDocumentAdditionalActionJs(pdf: PDFDocument): boolean {
  const aa = pdf.catalog.lookupMaybe(AA_KEY, PDFDict);

  if (aa === undefined) return false;

  for (const [, value] of aa.entries()) {
    if (!(value instanceof PDFDict)) continue;

    const subtype = value.lookupMaybe(PDFName.of('S'), PDFName);

    if (subtype?.decodeText() === 'JavaScript') {
      return true;
    }
  }

  return false;
}

/**
 * Collect embedded-file names from the document's `/Names
 * /EmbeddedFiles` name tree. The spec requires these survive import
 * as opaque preservation entries under `extensions.pdf.embeddedFiles`;
 * the collector returns the file names so the caller can surface a
 * warning listing what was preserved (and therefore what MUST NOT be
 * assumed "gone").
 *
 * Name-tree traversal is simplified — we read the direct entries at
 * the root plus one level of `/Kids` so common Acrobat-produced
 * name trees are covered. Deeply-nested name trees produce a partial
 * list, but that is a "count is at least N" signal, never a silent
 * drop: the caller always receives at least one entry when any
 * embedded file is present.
 */
export function collectEmbeddedFileNames(pdf: PDFDocument): readonly string[] {
  const names = pdf.catalog.lookupMaybe(NAMES_KEY, PDFDict);

  if (names === undefined) return [];

  const embeddedFilesNode = names.lookupMaybe(EMBEDDED_FILES_KEY, PDFDict);

  if (embeddedFilesNode === undefined) return [];

  return collectNameTreeLabels(embeddedFilesNode);
}

function collectNameTreeLabels(node: PDFDict): readonly string[] {
  const labels: string[] = [];
  const namesArray = node.lookupMaybe(PDFName.of('Names'), PDFDict);

  if (namesArray !== undefined) {
    for (const [key] of namesArray.entries()) {
      labels.push(key.decodeText());
    }
  }

  const kids = node.lookupMaybe(PDFName.of('Kids'), PDFDict);

  if (kids !== undefined) {
    for (const [, kid] of kids.entries()) {
      if (kid instanceof PDFDict) {
        labels.push(...collectNameTreeLabels(kid));
      }
    }
  }

  return labels;
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
 * cannot be loaded (malformed or encrypted) or carries no Broadset
 * metadata.
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
