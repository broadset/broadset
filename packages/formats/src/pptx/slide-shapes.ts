import { type BroadsetElement, type Canvas, getSolidFillColor, resolveStyleColor } from '@broadset/model';

import { RELATIONSHIP_TYPES } from './constants';
import { buildSvgForElement, needsSvgFallback } from './svg-fallback';
import { valueToEmu } from './units';

export interface SlideContext {
  readonly canvas: Canvas;
  readonly relationships: Array<{ readonly id: string; readonly type: string; readonly target: string }>;
  readonly mediaFiles: Array<{ readonly path: string; readonly content: string | Uint8Array }>;
  nextRelId: number;
  nextMediaId: number;
}

interface DecodedData {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

function hexToRgb(color: string): string | undefined {
  const hex = color.replace(/^#/, '');

  if (hex.length === 3) {
    const r = hex[0] ?? '0';
    const g = hex[1] ?? '0';
    const b = hex[2] ?? '0';

    return `${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  if (hex.length === 6) {
    return hex.toUpperCase();
  }

  if (hex.length === 8) {
    return hex.slice(0, 6).toUpperCase();
  }

  return undefined;
}

function decodeDataUriForPptx(uri: string): DecodedData | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);

  if (!match) {
    return undefined;
  }

  const mime = match[1] ?? '';
  const encoding = match[2] ?? '';
  const data = match[3] ?? '';

  if (encoding === 'base64') {
    try {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return { mime, bytes };
    } catch {
      return undefined;
    }
  }

  const encoder = new TextEncoder();

  return { mime, bytes: encoder.encode(decodeURIComponent(data)) };
}

function extensionForMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';

  return 'png';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function addMediaRelationship(
  ctx: SlideContext,
  type: string,
  mediaPath: string,
  content: string | Uint8Array,
): string {
  const relId = `rId${String(ctx.nextRelId)}`;

  ctx.nextRelId++;

  ctx.relationships.push({
    id: relId,
    type,
    target: `../media/${mediaPath}`,
  });

  ctx.mediaFiles.push({
    path: `ppt/media/${mediaPath}`,
    content,
  });

  return relId;
}

function buildTextShapeXml(el: BroadsetElement, x: number, y: number, cx: number, cy: number, rot: number): string {
  const fontColorCss = resolveStyleColor(el.style.fontColor, { resolveTheme: false });
  const color = fontColorCss ? hexToRgb(fontColorCss) : '000000';
  const fontSize = el.style.fontSize ? Math.round(el.style.fontSize * 100) : 1200;

  return [
    `<p:sp>`,
    `  <p:nvSpPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    `    <a:noFill/>`,
    `  </p:spPr>`,
    `  <p:txBody>`,
    `    <a:bodyPr wrap="square"/>`,
    `    <a:p><a:r>`,
    `      <a:rPr lang="en-US" sz="${String(fontSize)}"${color ? ` dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:rPr` : '/'}>`,
    `      <a:t>${escapeXml(el.content)}</a:t>`,
    `    </a:r></a:p>`,
    `  </p:txBody>`,
    `</p:sp>`,
  ].join('\n');
}

function buildRectShapeXml(el: BroadsetElement, x: number, y: number, cx: number, cy: number, rot: number): string {
  const bgColorCss = resolveStyleColor(getSolidFillColor(el.style.fill), { resolveTheme: false });
  const bgColor = bgColorCss ? hexToRgb(bgColorCss) : undefined;

  return [
    `<p:sp>`,
    `  <p:nvSpPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    bgColor ? `    <a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill>` : `    <a:noFill/>`,
    `  </p:spPr>`,
    `</p:sp>`,
  ].join('\n');
}

function buildEllipseShapeXml(el: BroadsetElement, x: number, y: number, cx: number, cy: number, rot: number): string {
  const bgColorCss = resolveStyleColor(getSolidFillColor(el.style.fill), { resolveTheme: false });
  const bgColor = bgColorCss ? hexToRgb(bgColorCss) : undefined;

  return [
    `<p:sp>`,
    `  <p:nvSpPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>`,
    bgColor ? `    <a:solidFill><a:srgbClr val="${bgColor}"/></a:solidFill>` : `    <a:noFill/>`,
    `  </p:spPr>`,
    `</p:sp>`,
  ].join('\n');
}

function buildPathShapeXml(el: BroadsetElement, x: number, y: number, cx: number, cy: number, rot: number): string {
  return [
    `<p:sp>`,
    `  <p:nvSpPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    `    <a:noFill/>`,
    `  </p:spPr>`,
    `</p:sp>`,
  ].join('\n');
}

function buildSvgPicXml(
  el: BroadsetElement,
  x: number,
  y: number,
  cx: number,
  cy: number,
  rot: number,
  ctx: SlideContext,
): string {
  const mediaName = `shape${String(ctx.nextMediaId)}.svg`;

  ctx.nextMediaId++;

  const relId = addMediaRelationship(ctx, RELATIONSHIP_TYPES.image, mediaName, buildSvgForElement(el));

  return [
    `<p:pic>`,
    `  <p:nvPicPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`,
    `  <p:blipFill>`,
    `    <a:blip r:embed="${relId}"/>`,
    `    <a:stretch><a:fillRect/></a:stretch>`,
    `  </p:blipFill>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    `  </p:spPr>`,
    `</p:pic>`,
  ].join('\n');
}

function buildImagePicXml(
  el: BroadsetElement,
  x: number,
  y: number,
  cx: number,
  cy: number,
  rot: number,
  ctx: SlideContext,
): string {
  if (!el.content) {
    return buildRectShapeXml(el, x, y, cx, cy, rot);
  }

  const decoded = decodeDataUriForPptx(el.content);

  if (!decoded) {
    return buildRectShapeXml(el, x, y, cx, cy, rot);
  }

  const ext = extensionForMime(decoded.mime);
  const mediaName = `image${String(ctx.nextMediaId)}.${ext}`;

  ctx.nextMediaId++;

  const relId = addMediaRelationship(ctx, RELATIONSHIP_TYPES.image, mediaName, decoded.bytes);

  return [
    `<p:pic>`,
    `  <p:nvPicPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`,
    `  <p:blipFill>`,
    `    <a:blip r:embed="${relId}"/>`,
    `    <a:stretch><a:fillRect/></a:stretch>`,
    `  </p:blipFill>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    `  </p:spPr>`,
    `</p:pic>`,
  ].join('\n');
}

function buildSvgMediaPicXml(
  el: BroadsetElement,
  x: number,
  y: number,
  cx: number,
  cy: number,
  rot: number,
  ctx: SlideContext,
): string {
  if (!el.content) {
    return buildRectShapeXml(el, x, y, cx, cy, rot);
  }

  const mediaName = `svg${String(ctx.nextMediaId)}.svg`;

  ctx.nextMediaId++;

  const relId = addMediaRelationship(ctx, RELATIONSHIP_TYPES.image, mediaName, el.content);

  return [
    `<p:pic>`,
    `  <p:nvPicPr><p:cNvPr id="0" name="${escapeXml(el.name)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>`,
    `  <p:blipFill>`,
    `    <a:blip r:embed="${relId}"/>`,
    `    <a:stretch><a:fillRect/></a:stretch>`,
    `  </p:blipFill>`,
    `  <p:spPr>`,
    `    <a:xfrm${rot ? ` rot="${String(rot)}"` : ''}>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`,
    `  </p:spPr>`,
    `</p:pic>`,
  ].join('\n');
}

export function buildShapeXml(el: BroadsetElement, ctx: SlideContext): string {
  const x = valueToEmu(ctx.canvas, el.position.x);
  const y = valueToEmu(ctx.canvas, el.position.y);
  const cx = valueToEmu(ctx.canvas, el.width);
  const cy = valueToEmu(ctx.canvas, el.height);
  const rot = Math.round(el.rotation * 60000);

  switch (el.type) {
    case 'text':
      return buildTextShapeXml(el, x, y, cx, cy, rot);
    case 'rectangle':
      if (needsSvgFallback(el.style)) {
        return buildSvgPicXml(el, x, y, cx, cy, rot, ctx);
      }

      return buildRectShapeXml(el, x, y, cx, cy, rot);
    case 'ellipse':
      return buildEllipseShapeXml(el, x, y, cx, cy, rot);
    case 'image':
      return buildImagePicXml(el, x, y, cx, cy, rot, ctx);
    case 'svg':
      return buildSvgMediaPicXml(el, x, y, cx, cy, rot, ctx);
    case 'path':
      return buildPathShapeXml(el, x, y, cx, cy, rot);
    case 'qrcode':
      return buildRectShapeXml(el, x, y, cx, cy, rot);
    default:
      return buildRectShapeXml(el, x, y, cx, cy, rot);
  }
}

export function buildGroupXml(
  groupEl: BroadsetElement,
  children: readonly BroadsetElement[],
  ctx: SlideContext,
): string {
  const x = valueToEmu(ctx.canvas, groupEl.position.x);
  const y = valueToEmu(ctx.canvas, groupEl.position.y);
  const cx = valueToEmu(ctx.canvas, groupEl.width);
  const cy = valueToEmu(ctx.canvas, groupEl.height);

  const childXml = children.map((child) => buildShapeXml(child, ctx)).join('\n');

  return [
    `<p:grpSp>`,
    `  <p:nvGrpSpPr><p:cNvPr id="0" name="${escapeXml(groupEl.name)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `  <p:grpSpPr>`,
    `    <a:xfrm>`,
    `      <a:off x="${String(x)}" y="${String(y)}"/>`,
    `      <a:ext cx="${String(cx)}" cy="${String(cy)}"/>`,
    `      <a:chOff x="${String(x)}" y="${String(y)}"/>`,
    `      <a:chExt cx="${String(cx)}" cy="${String(cy)}"/>`,
    `    </a:xfrm>`,
    `  </p:grpSpPr>`,
    childXml,
    `</p:grpSp>`,
  ].join('\n');
}
