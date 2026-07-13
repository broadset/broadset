import type { projectFormatV1 } from '@broadset/model';

import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import { RelationshipAllocator } from '../ooxml/relationships';
import { escapeXmlAttribute, escapeXmlText } from '../ooxml/xml';

export interface PptxV1SerializeWarning {
  readonly code: 'v1-adapter-loss';
  readonly message: string;
  readonly elementId?: string;
}

interface SerializedSlideV1 {
  readonly xml: string;
  readonly relationships: ReturnType<RelationshipAllocator['entries']>;
  readonly media: ReadonlyMap<string, Uint8Array>;
  readonly warnings: readonly PptxV1SerializeWarning[];
}

interface SerializeSlideOptions {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly page: projectFormatV1.PageDefinition;
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
}

interface ShapeContext {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly elementsById: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Element>;
  readonly childrenByParentId: ReadonlyMap<projectFormatV1.Id, readonly projectFormatV1.Element[]>;
  readonly relationships: RelationshipAllocator;
  readonly media: Map<string, Uint8Array>;
  readonly warnings: PptxV1SerializeWarning[];
  readonly ids: ShapeIdAllocator;
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
}

class ShapeIdAllocator {
  #next = 2;

  next(): number {
    const result = this.#next;

    this.#next += 1;

    return result;
  }
}

function childrenByParentId(
  elements: readonly projectFormatV1.Element[],
): ReadonlyMap<projectFormatV1.Id, readonly projectFormatV1.Element[]> {
  const result = new Map<projectFormatV1.Id, projectFormatV1.Element[]>();

  for (const element of elements) {
    if (element.parentId === null) continue;

    const children = result.get(element.parentId) ?? [];

    children.push(element);
    result.set(element.parentId, children);
  }

  return result;
}

function surfaceLengthToEmu(value: number, surface: projectFormatV1.SurfaceDefinition): number {
  if (surface.unit === 'in') return Math.round(value * 914_400);
  if (surface.unit === 'mm') return Math.round((value / 25.4) * 914_400);

  return Math.round((value / surface.dpi) * 914_400);
}

function transformXml(element: projectFormatV1.Element, document: projectFormatV1.BroadsetDocumentV1): string {
  const transform = element.geometry.transform;
  const x = transform.kind === 'affine2d' ? transform.matrix[4] : transform.matrix[12];
  const y = transform.kind === 'affine2d' ? transform.matrix[5] : transform.matrix[13];
  const width = surfaceLengthToEmu(element.geometry.bounds.width, document.surface);
  const height = surfaceLengthToEmu(element.geometry.bounds.height, document.surface);

  return `<a:xfrm><a:off x="${String(surfaceLengthToEmu(x, document.surface))}" y="${String(surfaceLengthToEmu(y, document.surface))}"/><a:ext cx="${String(width)}" cy="${String(height)}"/></a:xfrm>`;
}

function colorChannel(value: number | undefined): number {
  return Math.round(Math.min(1, Math.max(0, value ?? 0)) * 255);
}

function byteHex(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function concreteColorHex(color: projectFormatV1.ConcreteColorValue): string {
  if (color.space === 'gray') {
    const channel = byteHex(colorChannel(color.channels[0]));

    return `${channel}${channel}${channel}`;
  }

  if (color.space === 'cmyk') {
    const cyan = color.channels[0] ?? 0;
    const magenta = color.channels[1] ?? 0;
    const yellow = color.channels[2] ?? 0;
    const black = color.channels[3] ?? 0;

    return [1 - Math.min(1, cyan + black), 1 - Math.min(1, magenta + black), 1 - Math.min(1, yellow + black)]
      .map((channel) => byteHex(colorChannel(channel)))
      .join('');
  }

  return [color.channels[0], color.channels[1], color.channels[2]]
    .map((channel) => byteHex(colorChannel(channel)))
    .join('');
}

function colorHex(ctx: ShapeContext, color: projectFormatV1.ColorValue): string {
  if (color.kind === 'color') return concreteColorHex(color);

  const swatch = ctx.project.resources.swatches.find(({ id }) => id === color.swatchId);

  if (swatch === undefined) return '000000';

  return concreteColorHex(swatch.kind === 'process' ? swatch.color : swatch.alternateColor);
}

function fillXml(ctx: ShapeContext, element: projectFormatV1.Element): string {
  const layer = element.appearance.fills.find(({ enabled, paint }) => enabled && paint.kind === 'solid');

  if (layer?.paint.kind !== 'solid') return '<a:noFill/>';

  return `<a:solidFill><a:srgbClr val="${colorHex(ctx, layer.paint.color)}"/></a:solidFill>`;
}

function nonVisualXml(shapeId: number, element: projectFormatV1.Element, kind: 'sp' | 'pic'): string {
  const name = escapeXmlAttribute(element.name);

  if (kind === 'pic') {
    return `<p:nvPicPr><p:cNvPr id="${String(shapeId)}" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`;
  }

  return `<p:nvSpPr><p:cNvPr id="${String(shapeId)}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`;
}

function paragraphAlignment(alignment: projectFormatV1.ParagraphProperties['alignment']): string {
  if (alignment === 'center') return 'ctr';
  if (alignment === 'end') return 'r';
  if (alignment === 'justify') return 'just';

  return 'l';
}

function fontFamily(ctx: ShapeContext, run: projectFormatV1.TextRun): string {
  return ctx.project.resources.fonts.find(({ id }) => id === run.properties.fontFamilyId)?.familyName ?? 'Arial';
}

function textBodyXml(ctx: ShapeContext, element: projectFormatV1.TextElement): string {
  const paragraphs = element.text.paragraphs
    .map((paragraph) => {
      const runs = paragraph.runs
        .map((run) => {
          const properties = run.properties;
          const attributes = ['lang="en-US"', `sz="${String(Math.max(100, Math.round(properties.size * 100)))}"`];

          if (properties.weight >= 600 || properties.semanticRole === 'strong') attributes.push('b="1"');
          if (properties.semanticRole === 'emphasis' || properties.semanticRole === 'citation')
            attributes.push('i="1"');
          if (properties.decoration.underline) attributes.push('u="sng"');

          const family = escapeXmlAttribute(fontFamily(ctx, run));
          const color = colorHex(ctx, properties.color);

          return `<a:r><a:rPr ${attributes.join(' ')}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${family}"/></a:rPr><a:t>${escapeXmlText(run.text)}</a:t></a:r>`;
        })
        .join('');

      return `<a:p><a:pPr algn="${paragraphAlignment(paragraph.properties.alignment)}"/>${runs}<a:endParaRPr lang="en-US"/></a:p>`;
    })
    .join('');

  return `<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody>`;
}

function shapeXml(ctx: ShapeContext, element: projectFormatV1.Element): string {
  const shapeId = ctx.ids.next();
  const geometry = element.kind === 'vector' && element.geometryData.kind === 'ellipse' ? 'ellipse' : 'rect';
  const text = element.kind === 'text' ? textBodyXml(ctx, element) : '';

  if (element.kind !== 'text' && element.kind !== 'vector') {
    ctx.warnings.push({
      code: 'v1-adapter-loss',
      message: `PPTX v1 export preserved ${element.kind} element ${element.id} as an editable rectangle fallback.`,
      elementId: element.id,
    });
  }

  return `<p:sp>${nonVisualXml(shapeId, element, 'sp')}<p:spPr>${transformXml(element, ctx.document)}<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${fillXml(ctx, element)}</p:spPr>${text}</p:sp>`;
}

function imageExtension(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg';
  if (mediaType === 'image/gif') return 'gif';
  if (mediaType === 'image/webp') return 'webp';
  if (mediaType === 'image/bmp') return 'bmp';
  if (mediaType === 'image/svg+xml') return 'svg';

  return 'png';
}

async function imageXml(ctx: ShapeContext, element: projectFormatV1.ImageElement): Promise<string> {
  const asset = ctx.project.resources.assets.find(
    (candidate): candidate is projectFormatV1.ImageAsset =>
      candidate.id === element.image.assetId && candidate.kind === 'image',
  );

  if (asset === undefined) {
    ctx.warnings.push({
      code: 'v1-adapter-loss',
      message: `PPTX v1 export: image asset ${element.image.assetId} was not found.`,
      elementId: element.id,
    });

    return shapeXml(ctx, element);
  }

  const bytes = await ctx.resolveBlob(asset.blob.digest);

  if (bytes === undefined) {
    ctx.warnings.push({
      code: 'v1-adapter-loss',
      message: `PPTX v1 export: image blob ${asset.blob.digest} is unavailable.`,
      elementId: element.id,
    });

    return shapeXml(ctx, element);
  }

  const extension = imageExtension(asset.blob.mediaType);
  const path = `ppt/media/image${String(ctx.media.size + 1)}.${extension}`;
  const relId = ctx.relationships.add(OOXML_REL_TYPES.image, `../media/${path.split('/').pop() ?? ''}`);

  ctx.media.set(path, bytes);

  return `<p:pic>${nonVisualXml(ctx.ids.next(), element, 'pic')}<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transformXml(element, ctx.document)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

async function elementXml(ctx: ShapeContext, element: projectFormatV1.Element): Promise<string> {
  if (element.kind === 'image') return imageXml(ctx, element);

  if (element.kind !== 'group') return shapeXml(ctx, element);

  const children = ctx.childrenByParentId.get(element.id) ?? [];
  const childXml = (await Promise.all(children.map(async (child) => elementXml(ctx, child)))).join('');
  const xfrm = transformXml(element, ctx.document).replace(
    '</a:xfrm>',
    '<a:chOff x="0" y="0"/><a:chExt cx="914400" cy="914400"/></a:xfrm>',
  );

  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${String(ctx.ids.next())}" name="${escapeXmlAttribute(element.name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrm}</p:grpSpPr>${childXml}</p:grpSp>`;
}

export async function serializeSlideV1(options: SerializeSlideOptions): Promise<SerializedSlideV1> {
  const relationships = new RelationshipAllocator();

  relationships.add(OOXML_REL_TYPES.slideLayout, '../slideLayouts/slideLayout1.xml');

  const ctx: ShapeContext = {
    project: options.project,
    document: options.document,
    elementsById: new Map(options.document.elements.map((element) => [element.id, element])),
    childrenByParentId: childrenByParentId(options.document.elements),
    relationships,
    media: new Map(),
    warnings: [],
    ids: new ShapeIdAllocator(),
    resolveBlob: options.resolveBlob,
  };
  const roots: string[] = [];

  for (const instance of options.page.rootInstances) {
    if (instance.visible === false) continue;

    const element = ctx.elementsById.get(instance.elementId);

    if (element !== undefined) roots.push(await elementXml(ctx, element));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${roots.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

  return { xml, relationships: relationships.entries(), media: ctx.media, warnings: ctx.warnings };
}
