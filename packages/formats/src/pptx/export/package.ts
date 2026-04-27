import type { BroadsetDocument, BroadsetElement, Page } from '@broadset/model';

import { writeBroadsetXmp } from '../../_shared';
import { ContentTypesBuilder } from '../ooxml/content-types';
import { OOXML_CONTENT_TYPES, OOXML_REL_TYPES } from '../ooxml/namespaces';
import { buildRelationshipsXml, RelationshipAllocator } from '../ooxml/relationships';
import { canvasLengthToEmu } from '../ooxml/units';
import { XML_DECLARATION } from '../ooxml/xml';
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
import { createSlideContext, type SlideExportContext } from './context';
import { buildNotesMasterXml, buildNotesSlideXml } from './notes';
import { emitShapeTree } from './shapes';

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

      const lowerPath = mediaPath.toLowerCase();
      const ext = extensionOf(lowerPath);

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

  // Theme / master / layout parts.
  parts.set('ppt/slideMasters/slideMaster1.xml', encodeText(buildSlideMasterXml()));
  parts.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(buildRelationshipsXml(masterRels.entries())));
  parts.set('ppt/slideLayouts/slideLayout1.xml', encodeText(buildSlideLayoutXml()));
  parts.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', encodeText(buildRelationshipsXml(layoutRels.entries())));
  parts.set('ppt/theme/theme1.xml', encodeText(buildThemeXml()));

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

  // Presentation-level parts.
  parts.set('ppt/presentation.xml', encodeText(buildPresentationXml(document, pages.length)));
  parts.set('ppt/_rels/presentation.xml.rels', encodeText(buildRelationshipsXml(presRels.entries())));
  contentTypes.addOverride('/ppt/presentation.xml', OOXML_CONTENT_TYPES.presentation);

  // docProps/custom.xml carries the broadset: XMP packet (cross-format
  // metadata requirement, IO-D-08). Async path populates per-element
  // fingerprints from the ledger; sync path leaves them empty.
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

  parts.set('ppt/slideMasters/slideMaster1.xml', encodeText(buildSlideMasterXml()));
  parts.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(buildRelationshipsXml(masterRels.entries())));
  parts.set('ppt/slideLayouts/slideLayout1.xml', encodeText(buildSlideLayoutXml()));
  parts.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', encodeText(buildRelationshipsXml(layoutRels.entries())));
  parts.set('ppt/theme/theme1.xml', encodeText(buildThemeXml()));

  contentTypes.addOverride('/ppt/slideMasters/slideMaster1.xml', OOXML_CONTENT_TYPES.slideMaster);
  contentTypes.addOverride('/ppt/slideLayouts/slideLayout1.xml', OOXML_CONTENT_TYPES.slideLayout);
  contentTypes.addOverride('/ppt/theme/theme1.xml', OOXML_CONTENT_TYPES.theme);

  if (includeMetadata) {
    parts.set(BROADSET_CUSTOM_XML_PROJECT, encodeText(buildProjectCustomXml(document)));
    contentTypes.addOverride(`/${BROADSET_CUSTOM_XML_PROJECT}`, OOXML_CONTENT_TYPES.customXml);
    presRels.add(OOXML_REL_TYPES.customXml, `../${BROADSET_CUSTOM_XML_PROJECT}`);
    attachXmpPacket({ parts, contentTypes, document, exportedAt: options.exportedAt, fingerprints: null });
  }

  parts.set('ppt/presentation.xml', encodeText(buildPresentationXml(document, pages.length)));
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
 * `docProps/custom.xml`. Cross-format metadata requirement (IO-D-08):
 * every round-trippable format exporter writes a packet under the
 * shared namespace URI so reconciliation recovers document identity
 * regardless of source format.
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

  parts.set('docProps/custom.xml', encodeText(packet));
  contentTypes.addOverride('/docProps/custom.xml', OOXML_CONTENT_TYPES.customProperties);
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

/**
 * Emit `<p:bg>` from the document's canvas background. Solid-fill
 * canvases produce `<a:solidFill>`; transparent canvases produce
 * nothing (the master / theme background shows through).
 */
function emitSlideBackground(canvas: BroadsetDocument['canvas']): string {
  if (canvas.backgroundMode !== 'solid') return '';

  const colour = canvas.backgroundColor;

  if (colour === undefined || colour.length === 0) return '';

  const stripped = colour.startsWith('#') ? colour.slice(1) : colour;
  const expanded = stripped.length === 3
    ? `${stripped[0] ?? ''}${stripped[0] ?? ''}${stripped[1] ?? ''}${stripped[1] ?? ''}${stripped[2] ?? ''}${stripped[2] ?? ''}`
    : stripped.slice(0, 6);
  const hex = expanded.toUpperCase();

  return `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></p:bgPr></p:bg>`;
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

    // Page overrides carry a per-element transform (position / rotation
    // / scale). Apply the transform to produce the slide-time element.
    const pos = override.transform.position;
    const rot = override.transform.rotation;

    result.push({ ...element, position: { x: pos.x, y: pos.y }, rotation: rot.x });
  }

  return result;
}

function buildPresentationXml(document: BroadsetDocument, slideCount: number): string {
  const canvas = document.canvas;
  const cx = canvasLengthToEmu(canvas, canvas.width);
  const cy = canvasLengthToEmu(canvas, canvas.height);
  const slideIds = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${String(256 + i)}" r:id="rId${String(2 + i)}"/>`).join('');

  return `${XML_DECLARATION}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${String(cx)}" cy="${String(cy)}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

function buildThemeXml(): string {
  return `${XML_DECLARATION}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Broadset"><a:themeElements><a:clrScheme name="Broadset"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EDEDED"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Broadset"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Broadset"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function buildSlideMasterXml(): string {
  return `${XML_DECLARATION}<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
}

function buildSlideLayoutXml(): string {
  return `${XML_DECLARATION}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}
