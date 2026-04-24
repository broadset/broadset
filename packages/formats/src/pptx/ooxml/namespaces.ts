/**
 * OOXML namespace URIs used across the PPTX importer and exporter.
 * Stable under ECMA-376 / ISO/IEC 29500. Non-default prefixes are
 * permitted by the spec; importers match by URI, exporters emit the
 * canonical prefixes below.
 */
export const OOXML_NAMESPACES = {
  /** Main drawing ML (`a:`) — shapes, colours, fills, text. */
  drawingml: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  /** Presentation ML (`p:`) — slides, masters, layouts, timing. */
  presentationml: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  /** Relationships namespace for `r:id` / `r:embed` attributes. */
  relationships: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  /** Markup-compatibility namespace for optional `mc:` fallback blocks. */
  compatibility: 'http://schemas.openxmlformats.org/markup-compatibility/2006',
  /** DrawingML spreadsheet / diagram namespace. */
  drawingmlSpreadsheet: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  /** Chart ML used by `<c:chart>` references. */
  chartml: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  /** Package-level content-types default-namespace. */
  contentTypes: 'http://schemas.openxmlformats.org/package/2006/content-types',
  /** Package-level relationships default-namespace. */
  packageRelationships: 'http://schemas.openxmlformats.org/package/2006/relationships',
} as const;

/** Canonical prefix → namespace URI map used on export. */
export const OOXML_PREFIXES = {
  a: OOXML_NAMESPACES.drawingml,
  p: OOXML_NAMESPACES.presentationml,
  r: OOXML_NAMESPACES.relationships,
  mc: OOXML_NAMESPACES.compatibility,
  xdr: OOXML_NAMESPACES.drawingmlSpreadsheet,
  c: OOXML_NAMESPACES.chartml,
} as const;

/** OOXML relationship-type URIs — used by `_rels` entries. */
export const OOXML_REL_TYPES = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  notesSlide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
  notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
  customXml: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml',
  officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
  coreProperties: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
  extendedProperties: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
  customProperties: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties',
} as const;

/** Content-type strings for PPTX parts. */
export const OOXML_CONTENT_TYPES = {
  presentation: 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml',
  slide: 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml',
  slideMaster: 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml',
  slideLayout: 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml',
  theme: 'application/vnd.openxmlformats-officedocument.theme+xml',
  notesSlide: 'application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml',
  notesMaster: 'application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml',
  coreProperties: 'application/vnd.openxmlformats-package.core-properties+xml',
  extendedProperties: 'application/vnd.openxmlformats-officedocument.extended-properties+xml',
  customProperties: 'application/vnd.openxmlformats-officedocument.custom-properties+xml',
  customXml: 'application/xml',
  rels: 'application/vnd.openxmlformats-package.relationships+xml',
} as const;
