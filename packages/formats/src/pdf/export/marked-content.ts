import type { BroadsetElement } from '@broadset/model';
import {
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  type PDFPage,
  PDFString,
} from 'pdf-lib';

import type { MarkedContentKind, MarkedContentTag } from '../types';

const BSET_TAG = PDFName.of('BSET');
const PROPERTIES_KEY = PDFName.of('Properties');
const RESOURCES_KEY = PDFName.of('Resources');
const ID_KEY = PDFName.of('ID');
const KIND_KEY = PDFName.of('Kind');
const DIRTY_KEY = PDFName.of('Dirty');
const DATA_FIELD_KEY = PDFName.of('DataField');
const BLOB_KEY = PDFName.of('Blob');

const MARKED_CONTENT_KIND_FALLBACK: MarkedContentKind = 'path';

/**
 * Build the `/BSET` marked-content tag for a Broadset element, matching
 * the shape defined in `project/spec/formats/pdf.md` → "Marked-Content
 * Element Tags".
 *
 * - `/ID` — element stable id as a PDF string literal
 * - `/Kind` — element type as a PDF name
 * - `/Dirty` — `extensions.pdf.dirty` flag (default `false` on fresh export)
 * - `/DataField` — element's data-binding field when present
 * - `/Blob` — preservation blob for features the importer recognised but
 *   cannot emit natively (populated in later phases — currently unused)
 */
export function buildMarkedContentTag(element: BroadsetElement): MarkedContentTag {
  const dataField = element.dataField?.fieldName;
  const preservationBlob = readPdfPreservationBlob(element);

  return {
    id: element.id,
    kind: normalizeKind(element.type),
    dirty: readPdfDirtyFlag(element),
    ...(dataField !== undefined ? { dataField } : {}),
    ...(preservationBlob !== undefined ? { preservationBlob } : {}),
  };
}

/**
 * Read `extensions.pdf.preservationBlob` off an element. The importer
 * stores the marked-content `/Blob` property on import so untouched
 * (`dirty === false`) elements can re-emit byte-identical operators on
 * re-export. The operator-level byte-identical re-emission pathway is
 * Spec Gapped in `project/spec/formats/pdf.md` pending the per-element
 * operator-capture work in P6.4b; until then `buildMarkedContentTag`
 * round-trips the blob through the `/Blob` property so the data is
 * preserved across import / edit / re-export.
 */
function readPdfPreservationBlob(element: BroadsetElement): string | undefined {
  const extensions = element.extensions as Readonly<Record<string, unknown>> | undefined;

  if (extensions === undefined) return undefined;

  const pdfExt = extensions['pdf'];

  if (pdfExt === undefined || pdfExt === null || typeof pdfExt !== 'object') return undefined;

  const blob = (pdfExt as Record<string, unknown>)['preservationBlob'];

  return typeof blob === 'string' ? blob : undefined;
}

/**
 * Register the tag's property dict in the page's `/Resources /Properties`
 * under a unique name and return the `/BSET /<name> BDC` opening operator
 * plus the matching `EMC` end operator. Callers bracket the element's
 * painting sequence with the two operators.
 *
 * Named (vs. inline) property lists are used so the dict survives in the
 * page resources object — visible without decompressing the content
 * stream, which matches the PDF producers Illustrator / Acrobat emit and
 * round-trips cleanly through external editors.
 */
export function markedContentBrackets(
  pdf: PDFDocument,
  page: PDFPage,
  tag: MarkedContentTag,
): { readonly start: PDFOperator; readonly end: PDFOperator } {
  const propsDict = buildPropsDict(pdf, tag);
  const propertyName = propertyNameFor(tag.id);

  registerPropertyDict(pdf, page, propertyName, propsDict);

  const start = PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [BSET_TAG, propertyName]);
  const end = PDFOperator.of(PDFOperatorNames.EndMarkedContent);

  return { start, end };
}

function buildPropsDict(pdf: PDFDocument, tag: MarkedContentTag): PDFDict {
  const dict = PDFDict.withContext(pdf.context);

  dict.set(ID_KEY, PDFString.of(tag.id));
  dict.set(KIND_KEY, PDFName.of(capitalise(tag.kind)));
  dict.set(DIRTY_KEY, pdf.context.obj(tag.dirty));

  if (tag.dataField !== undefined) {
    dict.set(DATA_FIELD_KEY, PDFString.of(tag.dataField));
  }

  if (tag.preservationBlob !== undefined) {
    dict.set(BLOB_KEY, PDFString.of(tag.preservationBlob));
  }

  return dict;
}

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

function isMarkedContentKind(v: string): v is MarkedContentKind {
  return VALID_KINDS.has(v as MarkedContentKind);
}

function normalizeKind(raw: string): MarkedContentKind {
  return isMarkedContentKind(raw) ? raw : MARKED_CONTENT_KIND_FALLBACK;
}

/**
 * Read the `extensions.pdf.dirty` flag off an element. Defaults to
 * `false` when the element was never marked dirty (fresh Broadset-authored
 * content rather than a re-import).
 */
function readPdfDirtyFlag(element: BroadsetElement): boolean {
  const extensions = element.extensions as Readonly<Record<string, unknown>> | undefined;

  if (extensions === undefined) return false;

  const pdfExt = extensions['pdf'];

  if (pdfExt === undefined || pdfExt === null || typeof pdfExt !== 'object') {
    return false;
  }

  const dirty = (pdfExt as Record<string, unknown>)['dirty'];

  return dirty === true;
}

function capitalise(kind: MarkedContentKind): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

/**
 * PDF name for the marked-content property dict referenced from the BDC
 * operator. Uses a `BS_` prefix + a safe encoding of the element id so
 * the name is unique per element and valid PDF name syntax.
 */
function propertyNameFor(elementId: string): PDFName {
  const safe = elementId.replace(/[^A-Za-z0-9_-]/g, '_');

  return PDFName.of(`BS_${safe}`);
}

/**
 * Insert `propsDict` under `name` in the page's `/Resources /Properties`
 * dictionary, creating the `/Properties` entry if the page doesn't already
 * carry one.
 */
function registerPropertyDict(pdf: PDFDocument, page: PDFPage, name: PDFName, propsDict: PDFDict): void {
  const resources = readOrCreateResourcesDict(pdf, page);
  const properties = readOrCreatePropertiesDict(pdf, resources);

  properties.set(name, propsDict);
}

function readOrCreateResourcesDict(pdf: PDFDocument, page: PDFPage): PDFDict {
  const existing = page.node.Resources();

  if (existing !== undefined) {
    return existing;
  }

  const created = PDFDict.withContext(pdf.context);

  page.node.set(RESOURCES_KEY, created);

  return created;
}

function readOrCreatePropertiesDict(pdf: PDFDocument, resources: PDFDict): PDFDict {
  const existing = resources.lookupMaybe(PROPERTIES_KEY, PDFDict);

  if (existing !== undefined) {
    return existing;
  }

  const created = PDFDict.withContext(pdf.context);

  resources.set(PROPERTIES_KEY, created);

  return created;
}
