import type { projectFormatV1 } from '@broadset/model';

import { ContentTypesBuilder } from '../ooxml/content-types';
import { OOXML_CONTENT_TYPES, OOXML_REL_TYPES } from '../ooxml/namespaces';
import { buildRelationshipsXml, RelationshipAllocator } from '../ooxml/relationships';
import { escapeXmlAttribute, XML_DECLARATION } from '../ooxml/xml';
import { encodeText, writeOoxmlPackage } from '../ooxml/zip';
import { type PptxV1SerializeWarning, serializeSlideV1 } from './serialize-shapes';

interface SerializePptxProjectV1Options {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly pages: readonly projectFormatV1.PageDefinition[];
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
}

export interface SerializedPptxProjectV1 {
  readonly bytes: Uint8Array;
  readonly warnings: readonly PptxV1SerializeWarning[];
}

interface EmbeddedFontResult {
  readonly xml: string;
  readonly warnings: readonly PptxV1SerializeWarning[];
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

function surfaceLengthToEmu(value: number, surface: projectFormatV1.SurfaceDefinition): number {
  if (surface.unit === 'in') return Math.round(value * 914_400);
  if (surface.unit === 'mm') return Math.round((value / 25.4) * 914_400);

  return Math.round((value / surface.dpi) * 914_400);
}

function presentationXml(options: {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly slideRelationships: readonly string[];
  readonly embeddedFonts: string;
}): string {
  const slideIds = options.slideRelationships
    .map((relationshipId, index) => `<p:sldId id="${String(256 + index)}" r:id="${relationshipId}"/>`)
    .join('');
  const width = surfaceLengthToEmu(options.document.surface.size[0], options.document.surface);
  const height = surfaceLengthToEmu(options.document.surface.size[1], options.document.surface);

  return `${XML_DECLARATION}<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="${String(width)}" cy="${String(height)}" type="custom"/><p:notesSz cx="6858000" cy="9144000"/>${options.embeddedFonts}</p:presentation>`;
}

function slideMasterXml(): string {
  return `${XML_DECLARATION}<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
}

function slideLayoutXml(): string {
  return `${XML_DECLARATION}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function themeXml(): string {
  return `${XML_DECLARATION}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Broadset"><a:themeElements><a:clrScheme name="Broadset"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F1F1F"/></a:dk2><a:lt2><a:srgbClr val="EDEDED"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Broadset"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Broadset"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

function registerStaticParts(parts: Map<string, Uint8Array>, contentTypes: ContentTypesBuilder): void {
  parts.set('ppt/slideMasters/slideMaster1.xml', encodeText(slideMasterXml()));
  parts.set('ppt/slideLayouts/slideLayout1.xml', encodeText(slideLayoutXml()));
  parts.set('ppt/theme/theme1.xml', encodeText(themeXml()));

  const masterRels = new RelationshipAllocator();

  masterRels.add(OOXML_REL_TYPES.slideLayout, '../slideLayouts/slideLayout1.xml');
  masterRels.add(OOXML_REL_TYPES.theme, '../theme/theme1.xml');
  parts.set('ppt/slideMasters/_rels/slideMaster1.xml.rels', encodeText(buildRelationshipsXml(masterRels.entries())));

  const layoutRels = new RelationshipAllocator();

  layoutRels.add(OOXML_REL_TYPES.slideMaster, '../slideMasters/slideMaster1.xml');
  parts.set('ppt/slideLayouts/_rels/slideLayout1.xml.rels', encodeText(buildRelationshipsXml(layoutRels.entries())));
  contentTypes.addOverride('/ppt/slideMasters/slideMaster1.xml', OOXML_CONTENT_TYPES.slideMaster);
  contentTypes.addOverride('/ppt/slideLayouts/slideLayout1.xml', OOXML_CONTENT_TYPES.slideLayout);
  contentTypes.addOverride('/ppt/theme/theme1.xml', OOXML_CONTENT_TYPES.theme);
}

function registerMediaType(contentTypes: ContentTypesBuilder, path: string): void {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const mediaType = MEDIA_TYPES[extension];

  if (mediaType !== undefined) contentTypes.addDefault(extension, mediaType);
}

async function attachFonts(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly parts: Map<string, Uint8Array>;
  readonly contentTypes: ContentTypesBuilder;
  readonly relationships: RelationshipAllocator;
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
}): Promise<EmbeddedFontResult> {
  const entries: string[] = [];
  const warnings: PptxV1SerializeWarning[] = [];

  for (const asset of options.project.resources.assets) {
    if (asset.kind !== 'font') continue;

    if (asset.metadata.embeddingPermissions === 'restricted') {
      warnings.push({
        code: 'v1-adapter-loss',
        message: `PPTX v1 export: restricted font ${asset.name} was not embedded.`,
      });
      continue;
    }

    const bytes = await options.resolveBlob(asset.blob.digest);

    if (bytes === undefined) {
      warnings.push({
        code: 'v1-adapter-loss',
        message: `PPTX v1 export: font blob ${asset.blob.digest} is unavailable.`,
      });
      continue;
    }

    const index = entries.length + 1;
    const path = `ppt/fonts/font${String(index)}.fntdata`;
    const relationshipId = options.relationships.add(OOXML_REL_TYPES.font, `fonts/font${String(index)}.fntdata`);

    options.parts.set(path, bytes);
    options.contentTypes.addOverride(`/${path}`, OOXML_CONTENT_TYPES.font);
    entries.push(
      `<p:embeddedFont><p:font typeface="${escapeXmlAttribute(asset.metadata.family)}"/><p:regular r:id="${relationshipId}"/></p:embeddedFont>`,
    );
  }

  return { xml: entries.length === 0 ? '' : `<p:embeddedFontLst>${entries.join('')}</p:embeddedFontLst>`, warnings };
}

export async function serializePptxProjectV1(options: SerializePptxProjectV1Options): Promise<SerializedPptxProjectV1> {
  const parts = new Map<string, Uint8Array>();
  const contentTypes = new ContentTypesBuilder();
  const presentationRelationships = new RelationshipAllocator();
  const warnings: PptxV1SerializeWarning[] = [];
  const slideRelationshipIds: string[] = [];

  presentationRelationships.add(OOXML_REL_TYPES.slideMaster, 'slideMasters/slideMaster1.xml');
  presentationRelationships.add(OOXML_REL_TYPES.theme, 'theme/theme1.xml');
  registerStaticParts(parts, contentTypes);

  for (let index = 0; index < options.pages.length; index += 1) {
    const page = options.pages[index];

    if (page === undefined) continue;

    const slide = await serializeSlideV1({ ...options, page });
    const fileName = `slide${String(index + 1)}.xml`;
    const path = `ppt/slides/${fileName}`;

    parts.set(path, encodeText(slide.xml));
    parts.set(`ppt/slides/_rels/${fileName}.rels`, encodeText(buildRelationshipsXml(slide.relationships)));
    contentTypes.addOverride(`/${path}`, OOXML_CONTENT_TYPES.slide);
    slideRelationshipIds.push(presentationRelationships.add(OOXML_REL_TYPES.slide, `slides/${fileName}`));
    warnings.push(...slide.warnings);

    for (const [mediaPath, bytes] of slide.media) {
      parts.set(mediaPath, bytes);
      registerMediaType(contentTypes, mediaPath);
    }
  }

  const fonts = await attachFonts({
    project: options.project,
    parts,
    contentTypes,
    relationships: presentationRelationships,
    resolveBlob: options.resolveBlob,
  });

  warnings.push(...fonts.warnings);
  parts.set(
    'ppt/presentation.xml',
    encodeText(
      presentationXml({
        document: options.document,
        slideRelationships: slideRelationshipIds,
        embeddedFonts: fonts.xml,
      }),
    ),
  );
  parts.set('ppt/_rels/presentation.xml.rels', encodeText(buildRelationshipsXml(presentationRelationships.entries())));
  contentTypes.addOverride('/ppt/presentation.xml', OOXML_CONTENT_TYPES.presentation);

  const rootRelationships = new RelationshipAllocator();

  rootRelationships.add(OOXML_REL_TYPES.officeDocument, 'ppt/presentation.xml');
  parts.set('_rels/.rels', encodeText(buildRelationshipsXml(rootRelationships.entries())));
  parts.set('[Content_Types].xml', encodeText(contentTypes.build()));

  return { bytes: writeOoxmlPackage(parts), warnings };
}
