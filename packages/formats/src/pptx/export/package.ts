import { type BroadsetDocument, type BroadsetElement, type Page, styleSchema } from '@broadset/model';

import { writeBroadsetXmp } from '../../_shared';
import { ContentTypesBuilder } from '../ooxml/content-types';
import { OOXML_CONTENT_TYPES, OOXML_REL_TYPES } from '../ooxml/namespaces';
import { buildRelationshipsXml, RelationshipAllocator } from '../ooxml/relationships';
import { canvasLengthToEmu } from '../ooxml/units';
import { escapeXmlText, XML_DECLARATION } from '../ooxml/xml';
import { encodeText, writeOoxmlPackage } from '../ooxml/zip';
import { buildProjectCustomXml } from '../semantic/custom-xml';
import { buildLedger, buildLedgerXml } from '../semantic/ledger';
import {
  BROADSET_CUSTOM_XML_INTEROP,
  BROADSET_CUSTOM_XML_PROJECT,
  type PptxExportOptions,
  type PptxExportWarning,
} from '../types';
import { buildTimingXml } from './animation';
import { emitSlideBackground } from './background';
import { createSlideContext, type SlideExportContext } from './context';
import { attachEmbeddedFonts, attachEmbeddedFontsAsync } from './fonts';
import { buildNotesMasterXml, buildNotesSlideXml } from './notes';
import { emitShapeTree } from './shapes';
import { buildSlideLayoutXml, buildSlideMasterXml, buildThemeXml, deriveTheme } from './theme';

/**
 * Full async PPTX package builder (includes the interop ledger whose
 * per-element fingerprints require xxhash-wasm init on the first call).
 * Convenience wrapper that discards the warnings sink — callers that
 * want fidelity-loss visibility should use
 * {@link buildPptxPackageWithReport}.
 *
 * @see buildPptxPackageSync for the sync fast-path used by
 * {@link exportPptxBytes}.
 */
export async function buildPptxPackage(
  document: BroadsetDocument,
  options: PptxExportOptions = {},
): Promise<Uint8Array> {
  const report = await buildPptxPackageWithReport(document, options);

  return report.bytes;
}

/**
 * Full async PPTX package builder that surfaces an aggregated warnings
 * sink (silent drops in {@link emitEffects}, unmappable animations,
 * etc.). Used by {@link exportPptxWithReportAsync}.
 */
export async function buildPptxPackageWithReport(
  document: BroadsetDocument,
  options: PptxExportOptions = {},
): Promise<{ readonly bytes: Uint8Array; readonly warnings: readonly PptxExportWarning[] }> {
  const includeMetadata = options.preserveBroadsetMetadata !== false;
  const includeLedger = options.includeInteropLedger !== false;
  const parts = new Map<string, Uint8Array>();
  const contentTypes = new ContentTypesBuilder();
  const warnings: PptxExportWarning[] = [];

  // Presentation-level relationships.
  const presRels = new RelationshipAllocator();

  // Slide master + layout + theme live once per package.
  const masterRels = new RelationshipAllocator();
  const layoutRels = new RelationshipAllocator();

  presRels.add(OOXML_REL_TYPES.slideMaster, 'slideMasters/slideMaster1.xml');
  presRels.add(OOXML_REL_TYPES.theme, 'theme/theme1.xml');
  masterRels.add(OOXML_REL_TYPES.slideLayout, '../slideLayouts/slideLayout1.xml');
  masterRels.add(OOXML_REL_TYPES.theme, '../theme/theme1.xml');
  layoutRels.add(OOXML_REL_TYPES.slideMaster, '../slideMasters/slideMaster1.xml');

  const pages = document.pages.length > 0 ? document.pages : [createFallbackPage()];

  for (const [index, page] of pages.entries()) {
    const slideIndex = index + 1;
    const slideFile = `slide${String(slideIndex)}.xml`;
    const slidePath = `ppt/slides/${slideFile}`;
    const slideXml = buildSlideForPage(document, page);

    for (const w of slideXml.warnings) warnings.push(w);

    parts.set(`ppt/slides/_rels/${slideFile}.rels`, encodeText(buildRelationshipsXml(slideXml.rels)));

    // Register media files.
    for (const [mediaPath, mediaBytes] of slideXml.media) {
      parts.set(mediaPath, mediaBytes);
      registerMediaContentType(contentTypes, mediaPath);
    }

    parts.set(slidePath, encodeText(slideXml.xml));
    contentTypes.addOverride(`/ppt/slides/${slideFile}`, OOXML_CONTENT_TYPES.slide);
    presRels.add(OOXML_REL_TYPES.slide, `slides/${slideFile}`);

    attachNotesForSlide({
      parts,
      contentTypes,
      slideIndex,
      slideFile,
      slideRelsEntries: [...slideXml.rels],
      notes: page.notes,
    });
  }

  attachNotesMasterIfNeeded({ parts, contentTypes, presRels, pages });

  // Theme / master / layout parts.
  const theme = deriveTheme(document, options.themeColors, options.themeFonts);

  parts.set('ppt/slideMasters/slideMaster1.xml', encodeText(buildSlideMasterXml()));
  parts.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(buildRelationshipsXml(masterRels.entries())));
  parts.set('ppt/slideLayouts/slideLayout1.xml', encodeText(buildSlideLayoutXml()));
  parts.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', encodeText(buildRelationshipsXml(layoutRels.entries())));
  parts.set('ppt/theme/theme1.xml', encodeText(buildThemeXml(theme)));

  contentTypes.addOverride('/ppt/slideMasters/slideMaster1.xml', OOXML_CONTENT_TYPES.slideMaster);
  contentTypes.addOverride('/ppt/slideLayouts/slideLayout1.xml', OOXML_CONTENT_TYPES.slideLayout);
  contentTypes.addOverride('/ppt/theme/theme1.xml', OOXML_CONTENT_TYPES.theme);

  // Custom XML parts (fast-path round-trip).
  const ledgerFingerprints = await attachAsyncMetadata({
    parts,
    contentTypes,
    presRels,
    document,
    options,
    includeMetadata,
    includeLedger,
  });

  // Embedded fonts. Walks text elements collecting (familyName,
  // codepoints), subsets each matched FontAsset, writes
  // ppt/fonts/font{N}.fntdata, and returns the
  // <p:embeddedFontLst> XML fragment to splice into presentation.xml.
  // Async path supports url / file sources via the caller-supplied
  // resolveFontBytes; sync path stays embedded-only.
  const embeddedFontLst = await attachEmbeddedFontsAsync({
    document,
    fontAssets: options.fontAssets ?? [],
    parts,
    contentTypes,
    presRels,
    warnings,
    ...(options.resolveFontBytes !== undefined ? { resolveFontBytes: options.resolveFontBytes } : {}),
    ...(options.fontFetchTimeoutMs !== undefined ? { fontFetchTimeoutMs: options.fontFetchTimeoutMs } : {}),
    ...(options.fontMaxBytes !== undefined ? { fontMaxBytes: options.fontMaxBytes } : {}),
  });

  // Presentation-level parts.
  parts.set('ppt/presentation.xml', encodeText(buildPresentationXml(document, pages.length, embeddedFontLst)));
  parts.set('ppt/_rels/presentation.xml.rels', encodeText(buildRelationshipsXml(presRels.entries())));
  contentTypes.addOverride('/ppt/presentation.xml', OOXML_CONTENT_TYPES.presentation);

  // docProps/custom.xml carries the broadset: XMP packet as a schema-valid
  // custom property (cross-format metadata requirement, IO-D-08). Async path
  // populates per-element fingerprints from the ledger; sync path leaves them empty.
  if (includeMetadata) {
    attachXmpPacket({ parts, contentTypes, document, exportedAt: options.exportedAt, fingerprints: ledgerFingerprints });
  }

  // Root rels + content types.
  const rootRels = new RelationshipAllocator();

  rootRels.add(OOXML_REL_TYPES.officeDocument, 'ppt/presentation.xml');
  parts.set('_rels/.rels', encodeText(buildRelationshipsXml(rootRels.entries())));
  parts.set('[Content_Types].xml', encodeText(contentTypes.build()));

  return { bytes: writeOoxmlPackage(parts), warnings };
}

/**
 * Synchronous package builder. Omits the interop ledger (which requires
 * async xxhash-wasm init). Convenience wrapper that discards the
 * warnings sink — callers that need fidelity-loss visibility should use
 * {@link buildPptxPackageSyncWithReport} (or
 * {@link buildPptxPackageWithReport} for the async path with ledger).
 */
export function buildPptxPackageSync(document: BroadsetDocument, options: PptxExportOptions = {}): Uint8Array {
  return buildPptxPackageSyncWithReport(document, options).bytes;
}

/**
 * Synchronous package builder that surfaces an aggregated warnings
 * sink. Mirrors {@link buildPptxPackageWithReport} for the sync path.
 */
export function buildPptxPackageSyncWithReport(
  document: BroadsetDocument,
  options: PptxExportOptions = {},
): { readonly bytes: Uint8Array; readonly warnings: readonly PptxExportWarning[] } {
  const includeMetadata = options.preserveBroadsetMetadata !== false;
  const parts = new Map<string, Uint8Array>();
  const warnings: PptxExportWarning[] = [];
  const contentTypes = new ContentTypesBuilder();
  const presRels = new RelationshipAllocator();
  const masterRels = new RelationshipAllocator();
  const layoutRels = new RelationshipAllocator();

  presRels.add(OOXML_REL_TYPES.slideMaster, 'slideMasters/slideMaster1.xml');
  presRels.add(OOXML_REL_TYPES.theme, 'theme/theme1.xml');
  masterRels.add(OOXML_REL_TYPES.slideLayout, '../slideLayouts/slideLayout1.xml');
  masterRels.add(OOXML_REL_TYPES.theme, '../theme/theme1.xml');
  layoutRels.add(OOXML_REL_TYPES.slideMaster, '../slideMasters/slideMaster1.xml');

  const pages = document.pages.length > 0 ? document.pages : [createFallbackPage()];

  for (const [index, page] of pages.entries()) {
    const slideIndex = index + 1;
    const slideFile = `slide${String(slideIndex)}.xml`;
    const slidePath = `ppt/slides/${slideFile}`;
    const slideXml = buildSlideForPage(document, page);

    for (const w of slideXml.warnings) warnings.push(w);

    parts.set(`ppt/slides/_rels/${slideFile}.rels`, encodeText(buildRelationshipsXml(slideXml.rels)));

    for (const [mediaPath, mediaBytes] of slideXml.media) {
      parts.set(mediaPath, mediaBytes);

      const ext = extensionOf(mediaPath.toLowerCase());

      if (ext === 'png') contentTypes.addDefault('png', 'image/png');
      else if (ext === 'jpeg' || ext === 'jpg') contentTypes.addDefault(ext, 'image/jpeg');
      else if (ext === 'gif') contentTypes.addDefault('gif', 'image/gif');
      else if (ext === 'svg') contentTypes.addDefault('svg', 'image/svg+xml');
      else if (ext === 'webp') contentTypes.addDefault('webp', 'image/webp');
      else if (ext === 'bmp') contentTypes.addDefault('bmp', 'image/bmp');
    }

    parts.set(slidePath, encodeText(slideXml.xml));
    contentTypes.addOverride(`/ppt/slides/${slideFile}`, OOXML_CONTENT_TYPES.slide);
    presRels.add(OOXML_REL_TYPES.slide, `slides/${slideFile}`);

    attachNotesForSlide({
      parts,
      contentTypes,
      slideIndex,
      slideFile,
      slideRelsEntries: [...slideXml.rels],
      notes: page.notes,
    });
  }

  attachNotesMasterIfNeeded({ parts, contentTypes, presRels, pages });

  const theme = deriveTheme(document, options.themeColors, options.themeFonts);

  parts.set('ppt/slideMasters/slideMaster1.xml', encodeText(buildSlideMasterXml()));
  parts.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(buildRelationshipsXml(masterRels.entries())));
  parts.set('ppt/slideLayouts/slideLayout1.xml', encodeText(buildSlideLayoutXml()));
  parts.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', encodeText(buildRelationshipsXml(layoutRels.entries())));
  parts.set('ppt/theme/theme1.xml', encodeText(buildThemeXml(theme)));

  contentTypes.addOverride('/ppt/slideMasters/slideMaster1.xml', OOXML_CONTENT_TYPES.slideMaster);
  contentTypes.addOverride('/ppt/slideLayouts/slideLayout1.xml', OOXML_CONTENT_TYPES.slideLayout);
  contentTypes.addOverride('/ppt/theme/theme1.xml', OOXML_CONTENT_TYPES.theme);

  if (includeMetadata) {
    parts.set(BROADSET_CUSTOM_XML_PROJECT, encodeText(buildProjectCustomXml(document)));
    contentTypes.addOverride(`/${BROADSET_CUSTOM_XML_PROJECT}`, OOXML_CONTENT_TYPES.customXml);
    presRels.add(OOXML_REL_TYPES.customXml, `../${BROADSET_CUSTOM_XML_PROJECT}`);
    attachXmpPacket({ parts, contentTypes, document, exportedAt: options.exportedAt, fingerprints: null });
  }

  const embeddedFontLst = attachEmbeddedFonts({
    document,
    fontAssets: options.fontAssets ?? [],
    parts,
    contentTypes,
    presRels,
    warnings,
  });

  parts.set('ppt/presentation.xml', encodeText(buildPresentationXml(document, pages.length, embeddedFontLst)));
  parts.set('ppt/_rels/presentation.xml.rels', encodeText(buildRelationshipsXml(presRels.entries())));
  contentTypes.addOverride('/ppt/presentation.xml', OOXML_CONTENT_TYPES.presentation);

  const rootRels = new RelationshipAllocator();

  rootRels.add(OOXML_REL_TYPES.officeDocument, 'ppt/presentation.xml');
  parts.set('_rels/.rels', encodeText(buildRelationshipsXml(rootRels.entries())));
  parts.set('[Content_Types].xml', encodeText(contentTypes.build()));

  return { bytes: writeOoxmlPackage(parts), warnings };
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');

  return dot >= 0 ? path.slice(dot + 1) : '';
}

const MEDIA_CONTENT_TYPES_BY_EXTENSION: ReadonlyMap<string, { readonly extension: string; readonly contentType: string }> = new Map([
  ['png', { extension: 'png', contentType: 'image/png' }],
  ['jpeg', { extension: 'jpeg', contentType: 'image/jpeg' }],
  ['jpg', { extension: 'jpg', contentType: 'image/jpeg' }],
  ['gif', { extension: 'gif', contentType: 'image/gif' }],
  ['svg', { extension: 'svg', contentType: 'image/svg+xml' }],
  ['webp', { extension: 'webp', contentType: 'image/webp' }],
  ['bmp', { extension: 'bmp', contentType: 'image/bmp' }],
]);

function registerMediaContentType(contentTypes: ContentTypesBuilder, mediaPath: string): void {
  const ext = extensionOf(mediaPath.toLowerCase());
  const entry = MEDIA_CONTENT_TYPES_BY_EXTENSION.get(ext);

  if (entry === undefined) return;

  contentTypes.addDefault(entry.extension, entry.contentType);
}

function createFallbackPage(): Page {
  return { id: 'page-1', name: 'Page 1', elements: [], locale: null, extensions: {} };
}

/**
 * Attach the project + ledger custom-XML parts (async path because
 * the ledger requires xxhash-wasm). Returns the per-element
 * fingerprint map so the XMP packet can include them.
 */
async function attachAsyncMetadata(args: {
  readonly parts: Map<string, Uint8Array>;
  readonly contentTypes: ContentTypesBuilder;
  readonly presRels: RelationshipAllocator;
  readonly document: BroadsetDocument;
  readonly options: PptxExportOptions;
  readonly includeMetadata: boolean;
  readonly includeLedger: boolean;
}): Promise<ReadonlyMap<string, string> | null> {
  const { parts, contentTypes, presRels, document, options, includeMetadata, includeLedger } = args;

  if (!includeMetadata) return null;

  parts.set(BROADSET_CUSTOM_XML_PROJECT, encodeText(buildProjectCustomXml(document)));
  contentTypes.addOverride(`/${BROADSET_CUSTOM_XML_PROJECT}`, OOXML_CONTENT_TYPES.customXml);
  presRels.add(OOXML_REL_TYPES.customXml, `../${BROADSET_CUSTOM_XML_PROJECT}`);

  if (!includeLedger) return null;

  const ledger = await buildLedger({
    documentId: document.id,
    version: '1.0.0',
    exportedAt: new Date(options.exportedAt ?? 0).toISOString(),
    elements: document.elements,
  });

  parts.set(BROADSET_CUSTOM_XML_INTEROP, encodeText(buildLedgerXml(ledger)));
  contentTypes.addOverride(`/${BROADSET_CUSTOM_XML_INTEROP}`, OOXML_CONTENT_TYPES.customXml);
  presRels.add(OOXML_REL_TYPES.customXml, `../${BROADSET_CUSTOM_XML_INTEROP}`);

  return new Map(ledger.entries.map((e) => [e.elementId, e.fingerprint]));
}

/**
 * Attach the document-level `broadset:` XMP packet at
 * `docProps/custom.xml` as a standard custom property. Cross-format
 * metadata requirement (IO-D-08): every round-trippable format exporter
 * writes a packet under the shared namespace URI so reconciliation
 * recovers document identity regardless of source format.
 *
 * Per-element fingerprints are populated from the interop ledger when
 * available; sync exports without the ledger emit an empty element
 * list (still satisfies the "packet exists" half of the contract).
 */
function attachXmpPacket(options: {
  readonly parts: Map<string, Uint8Array>;
  readonly contentTypes: ContentTypesBuilder;
  readonly document: BroadsetDocument;
  readonly exportedAt: number | undefined;
  readonly fingerprints: ReadonlyMap<string, string> | null;
}): void {
  const { parts, contentTypes, document, exportedAt, fingerprints } = options;

  // Only emit per-element entries when we have real fingerprints from
  // the ledger — the XMP schema requires non-empty fingerprint strings.
  // Sync export still emits the packet (document-level identity) with
  // an empty elements list.
  const elementsList =
    fingerprints !== null
      ? document.elements
          .map((el) => {
            const fp = fingerprints.get(el.id);

            return fp !== undefined && fp.length > 0 ? { id: el.id, fingerprint: fp } : null;
          })
          .filter((entry): entry is { readonly id: string; readonly fingerprint: string } => entry !== null)
      : [];
  const packet = writeBroadsetXmp({
    documentId: document.id,
    version: '1.0.0',
    exportedAt: new Date(exportedAt ?? 0).toISOString(),
    elements: elementsList,
  });

  parts.set('docProps/custom.xml', encodeText(encodeCustomPropertiesXml(packet)));
  contentTypes.addOverride('/docProps/custom.xml', OOXML_CONTENT_TYPES.customProperties);
}

function encodeCustomPropertiesXml(xmpPacket: string): string {
  return `${XML_DECLARATION}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="BroadsetXmp"><vt:lpwstr>${escapeXmlText(xmpPacket)}</vt:lpwstr></property></Properties>`;
}

/**
 * Attach the one-per-package notes master when any page carries notes.
 */
function attachNotesMasterIfNeeded(options: {
  readonly parts: Map<string, Uint8Array>;
  readonly contentTypes: ContentTypesBuilder;
  readonly presRels: RelationshipAllocator;
  readonly pages: readonly Page[];
}): void {
  const { parts, contentTypes, presRels, pages } = options;
  const hasAnyNotes = pages.some((p) => typeof p.notes === 'string' && p.notes.length > 0);

  if (!hasAnyNotes) return;
  parts.set('ppt/notesMasters/notesMaster1.xml', encodeText(buildNotesMasterXml()));

  const notesMasterRels = new RelationshipAllocator();

  notesMasterRels.add(OOXML_REL_TYPES.theme, '../theme/theme1.xml');
  parts.set('ppt/notesMasters/_rels/notesMaster1.xml.rels', encodeText(buildRelationshipsXml(notesMasterRels.entries())));
  contentTypes.addOverride('/ppt/notesMasters/notesMaster1.xml', OOXML_CONTENT_TYPES.notesMaster);
  presRels.add(OOXML_REL_TYPES.notesMaster, 'notesMasters/notesMaster1.xml');
}

/**
 * Attach the per-slide notes-slide part, its rels, and the
 * slide → notesSlide relationship. A no-op when the page has no notes.
 */
function attachNotesForSlide(options: {
  readonly parts: Map<string, Uint8Array>;
  readonly contentTypes: ContentTypesBuilder;
  readonly slideIndex: number;
  readonly slideFile: string;
  readonly slideRelsEntries: readonly ReturnType<RelationshipAllocator['entries']>[number][];
  readonly notes: string | undefined;
}): void {
  const { parts, contentTypes, slideIndex, slideFile, slideRelsEntries, notes } = options;

  if (notes === undefined || notes.length === 0) return;

  const notesFile = `notesSlide${String(slideIndex)}.xml`;
  const notesPath = `ppt/notesSlides/${notesFile}`;

  parts.set(notesPath, encodeText(buildNotesSlideXml(notes)));
  contentTypes.addOverride(`/${notesPath}`, OOXML_CONTENT_TYPES.notesSlide);

  const notesRels = new RelationshipAllocator();

  notesRels.add(OOXML_REL_TYPES.slide, `../slides/${slideFile}`);
  notesRels.add(OOXML_REL_TYPES.notesMaster, '../notesMasters/notesMaster1.xml');
  parts.set(`ppt/notesSlides/_rels/${notesFile}.rels`, encodeText(buildRelationshipsXml(notesRels.entries())));

  // Slide → notesSlide. The slide's rels were already serialised; append
  // the notes rel and rewrite.
  const slideNotesRels = [...slideRelsEntries, { id: `rId${String(slideRelsEntries.length + 1)}` as `rId${number}`, type: OOXML_REL_TYPES.notesSlide, target: `../notesSlides/${notesFile}` }];

  parts.set(`ppt/slides/_rels/${slideFile}.rels`, encodeText(buildRelationshipsXml(slideNotesRels)));
}

interface SlideXmlResult {
  readonly xml: string;
  readonly rels: ReturnType<RelationshipAllocator['entries']>;
  readonly media: ReadonlyMap<string, Uint8Array>;
  readonly warnings: readonly PptxExportWarning[];
}

function buildSlideForPage(document: BroadsetDocument, page: Page): SlideXmlResult {
  const ctx: SlideExportContext = createSlideContext(document.canvas);
  const effectiveElements = applyPageOverrides(document.elements, page);
  const shapeTree = emitShapeTree(ctx, effectiveElements);
  // The shape tree emission populated ctx.shapeIdByElementId with the
  // real OOXML `<p:cNvPr id="…">` id per element; pass that map to the
  // timing emitter so `<p:spTgt spid="…">` references valid shapes.
  const timing = buildTimingXml(document, ctx);
  const bg = emitSlideBackground(document.canvas);
  const xml = `${XML_DECLARATION}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapeTree}</p:spTree></p:cSld>${timing}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

  return { xml, rels: ctx.rels.entries(), media: ctx.media, warnings: ctx.warnings };
}

function applyPageOverrides(elements: readonly BroadsetElement[], page: Page): readonly BroadsetElement[] {
  const overrides = page.elements;

  if (overrides.length === 0) return elements;

  const overrideMap = new Map<string, (typeof overrides)[number]>();

  for (const override of overrides) {
    overrideMap.set(override.elementId, override);
  }

  const result: BroadsetElement[] = [];

  for (const element of elements) {
    const override = overrideMap.get(element.id);

    if (override === undefined) {
      result.push(element);
      continue;
    }

    if (!override.visible) continue;

    result.push(applyOverrideToElement(element, override));
  }

  return result;
}

/**
 * Merges a single `PageElementInstance` override onto its target
 * element. Content / style / assetId substitutions land first; the
 * transform applies last so position + rotation stay winning over any
 * conflicting style override (e.g. an override style that carried a
 * stale `transform` field would still lose to the explicit transform).
 */
function applyOverrideToElement(
  element: BroadsetElement,
  override: Page['elements'][number],
): BroadsetElement {
  let merged: BroadsetElement = element;

  // Per-page `content` override supersedes the element-level content
  // for this slide only (e.g. "Page 1 of N", localized variants).
  if (override.content !== undefined) {
    merged = { ...merged, content: override.content };
  }

  // Per-page `style` override merges on top of the element style.
  // Absent keys fall through to the document-level value. The merged
  // record is fed through `styleSchema` to normalize input-side
  // conveniences (string fills → `BroadsetFill`, number radii →
  // tuples) the same way `elementSchema` normalizes element-level
  // styles. A parse failure falls back to the unmerged element style
  // so a malformed override never crashes export.
  if (override.style !== undefined) {
    const mergedStyleResult = styleSchema.safeParse({ ...merged.style, ...override.style });

    if (mergedStyleResult.success) {
      merged = { ...merged, style: mergedStyleResult.data };
    }
  }

  // Per-page `assetId` override swaps the element's asset reference
  // (typical case: image element pointing to a different asset on a
  // sister page) without forking the document-level element.
  if (override.assetId !== undefined) {
    merged = { ...merged, assetId: override.assetId };
  }

  // Page overrides carry a per-element transform (position / rotation
  // / scale). Apply the transform LAST so transform stays winning over
  // any content / style / asset substitutions that landed first.
  const pos = override.transform.position;
  const rot = override.transform.rotation;

  return { ...merged, position: { x: pos.x, y: pos.y }, rotation: rot.x };
}

function buildPresentationXml(document: BroadsetDocument, slideCount: number, embeddedFontLst = ''): string {
  const canvas = document.canvas;
  const cx = canvasLengthToEmu(canvas, canvas.width);
  const cy = canvasLengthToEmu(canvas, canvas.height);
  const slideIds = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${String(256 + i)}" r:id="rId${String(2 + i)}"/>`).join('');

  return `${XML_DECLARATION}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${String(cx)}" cy="${String(cy)}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/>${embeddedFontLst}</p:presentation>`;
}

