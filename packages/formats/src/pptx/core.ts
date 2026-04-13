import type {
  BroadsetDocument,
  BroadsetElement,
  BroadsetElementStyle,
  BroadsetGradient,
  BuiltInElementType,
  Canvas,
} from '@broadset/model';
import { BUILT_IN_ELEMENT_TYPES } from '@broadset/model';
import PizZip from 'pizzip';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** 1 mm = 36000 EMU (English Metric Units) */
const MM_TO_EMU = 36000;

/** 1 inch = 914400 EMU */
const IN_TO_EMU = 914400;

/** OOXML namespace URIs */
const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  rels: 'http://schemas.openxmlformats.org/package/2006/relationships',
} as const;

const RELATIONSHIP_TYPES = {
  slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
  slideLayout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
  slideMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
  theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  officeDoc: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
} as const;

/* ------------------------------------------------------------------ */
/*  Unit Conversion                                                    */
/* ------------------------------------------------------------------ */

function valueToEmu(canvas: Canvas, value: number): number {
  switch (canvas.unit) {
    case 'mm':
      return Math.round(value * MM_TO_EMU);
    case 'in':
      return Math.round(value * IN_TO_EMU);
    case 'px':
      return Math.round((value / canvas.dpi) * IN_TO_EMU);
  }
}

function emuToValue(canvas: Canvas, emu: number): number {
  switch (canvas.unit) {
    case 'mm':
      return emu / MM_TO_EMU;
    case 'in':
      return emu / IN_TO_EMU;
    case 'px':
      return (emu / IN_TO_EMU) * canvas.dpi;
  }
}

/* ------------------------------------------------------------------ */
/*  Color Helpers                                                      */
/* ------------------------------------------------------------------ */

function hexToRgb(color: string): string | undefined {
  // Strip # and handle variations
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
    // Strip alpha
    return hex.slice(0, 6).toUpperCase();
  }

  return undefined;
}

/* ------------------------------------------------------------------ */
/*  Style Analysis                                                     */
/* ------------------------------------------------------------------ */

/**
 * Determine if a rectangle needs SVG fallback (complex styles that native
 * PPTX shapes cannot represent).
 */
function needsSvgFallback(style: BroadsetElementStyle): boolean {
  // Gradient backgrounds need SVG
  if (style.backgroundGradient) return true;

  // Non-uniform corner radii need SVG
  if (style.borderRadius) {
    const [a, b, c, d] = style.borderRadius;

    if (a !== b || b !== c || c !== d) return true;
  }

  // Box shadows need SVG
  if (style.boxShadow) return true;

  // Complex filters need SVG
  if (style.filter) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  SVG Gradient Builder                                               */
/* ------------------------------------------------------------------ */

function buildSvgGradientDef(grad: BroadsetGradient, id: string): string {
  const stops = grad.stops.map((s) => `<stop offset="${String(s.position * 100)}%" stop-color="${s.color}"/>`).join('');

  if (grad.type === 'radial') {
    const cx = grad.center ? String(grad.center[0] * 100) : '50';
    const cy = grad.center ? String(grad.center[1] * 100) : '50';

    return `<radialGradient id="${id}" cx="${cx}%" cy="${cy}%">${stops}</radialGradient>`;
  }

  // Linear (and conic as linear fallback)
  const angle = grad.angle ?? 0;
  const rad = (angle * Math.PI) / 180;
  const x2 = Math.round(Math.cos(rad) * 100);
  const y2 = Math.round(Math.sin(rad) * 100);

  return `<linearGradient id="${id}" x1="0%" y1="0%" x2="${String(x2)}%" y2="${String(y2)}%">${stops}</linearGradient>`;
}

/* ------------------------------------------------------------------ */
/*  SVG Fallback Builder                                               */
/* ------------------------------------------------------------------ */

function buildSvgForElement(el: BroadsetElement): string {
  const w = el.width;
  const h = el.height;
  const style = el.style;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(w)}" height="${String(h)}" viewBox="0 0 ${String(w)} ${String(h)}">`,
  ];

  const defs: string[] = [];
  let fill = 'none';

  // Handle gradient backgrounds
  if (style.backgroundGradient) {
    const grad = style.backgroundGradient;

    if (typeof grad === 'string') {
      // CSS gradient string — embed as-is via foreignObject fallback
      fill = style.backgroundColor ?? 'none';
    } else {
      const gradId = 'grad0';

      defs.push(buildSvgGradientDef(grad, gradId));
      fill = `url(#${gradId})`;
    }
  } else if (style.backgroundColor) {
    fill = style.backgroundColor;
  }

  if (defs.length > 0) {
    parts.push(`  <defs>${defs.join('')}</defs>`);
  }

  // Build rect with styles
  const rectAttrs: string[] = [`width="${String(w)}"`, `height="${String(h)}"`, `fill="${fill}"`];

  if (style.borderRadius) {
    const [tl] = style.borderRadius;

    rectAttrs.push(`rx="${String(tl)}"`);
  }

  parts.push(`  <rect ${rectAttrs.join(' ')}/>`);
  parts.push('</svg>');

  return parts.join('\n');
}

/* ------------------------------------------------------------------ */
/*  XML Builders — OOXML Slide Content                                 */
/* ------------------------------------------------------------------ */

interface SlideContext {
  readonly canvas: Canvas;
  readonly relationships: Array<{ readonly id: string; readonly type: string; readonly target: string }>;
  readonly mediaFiles: Array<{ readonly path: string; readonly content: string | Uint8Array }>;
  nextRelId: number;
  nextMediaId: number;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildShapeXml(el: BroadsetElement, ctx: SlideContext): string {
  const x = valueToEmu(ctx.canvas, el.position.x);
  const y = valueToEmu(ctx.canvas, el.position.y);
  const cx = valueToEmu(ctx.canvas, el.width);
  const cy = valueToEmu(ctx.canvas, el.height);
  const rot = Math.round(el.rotation * 60000); // PPTX uses 60000ths of a degree

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

function buildTextShapeXml(el: BroadsetElement, x: number, y: number, cx: number, cy: number, rot: number): string {
  const color = el.style.fontColor ? hexToRgb(el.style.fontColor) : '000000';
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
  const bgColor = el.style.backgroundColor ? hexToRgb(el.style.backgroundColor) : undefined;

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
  const bgColor = el.style.backgroundColor ? hexToRgb(el.style.backgroundColor) : undefined;

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

function addMediaRelationship(
  ctx: SlideContext,
  type: string,
  mediaPath: string,
  content: string | Uint8Array,
): string {
  const relId = `rId${String(ctx.nextRelId)}`;

  ctx.nextRelId++;

  const target = `../media/${mediaPath}`;
  const rel: { readonly id: string; readonly type: string; readonly target: string } = {
    id: relId,
    type,
    target,
  };

  ctx.relationships.push(rel);

  const media: { readonly path: string; readonly content: string | Uint8Array } = {
    path: `ppt/media/${mediaPath}`,
    content,
  };

  ctx.mediaFiles.push(media);

  return relId;
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
  const svgContent = buildSvgForElement(el);
  const mediaName = `shape${String(ctx.nextMediaId)}.svg`;

  ctx.nextMediaId++;

  const relId = addMediaRelationship(ctx, RELATIONSHIP_TYPES.image, mediaName, svgContent);

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

  // Decode data URI
  const decoded = decodeDataUriForPptx(el.content);

  if (!decoded) {
    return buildRectShapeXml(el, x, y, cx, cy, rot);
  }

  const ext =
    decoded.mime.includes('png') ? 'png'
    : decoded.mime.includes('jpeg') || decoded.mime.includes('jpg') ? 'jpg'
    : 'png';
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

function buildGroupXml(groupEl: BroadsetElement, children: readonly BroadsetElement[], ctx: SlideContext): string {
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

/* ------------------------------------------------------------------ */
/*  Data URI Helper                                                    */
/* ------------------------------------------------------------------ */

interface DecodedData {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

function decodeDataUriForPptx(uri: string): DecodedData | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,(.*)/s);

  if (!match) return undefined;

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

/* ------------------------------------------------------------------ */
/*  PPTX Package Assembly                                              */
/* ------------------------------------------------------------------ */

function buildContentTypesXml(hasSvg: boolean, imageExts: readonly string[]): string {
  const parts = [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Types xmlns="${NS.ct}">`,
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
    `  <Default Extension="xml" ContentType="application/xml"/>`,
  ];

  if (hasSvg) {
    parts.push(`  <Default Extension="svg" ContentType="image/svg+xml"/>`);
  }

  for (const ext of imageExts) {
    if (ext === 'png') {
      parts.push(`  <Default Extension="png" ContentType="image/png"/>`);
    } else if (ext === 'jpg') {
      parts.push(`  <Default Extension="jpg" ContentType="image/jpeg"/>`);
    }
  }

  parts.push(
    `  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
    `  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
    `  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`,
    `  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`,
    `  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
    `</Types>`,
  );

  return parts.join('\n');
}

function buildRootRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.officeDoc}" Target="ppt/presentation.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

function buildPresentationXml(cx: number, cy: number): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:presentation xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}">`,
    `  <p:sldMasterIdLst>`,
    `    <p:sldMasterId id="2147483648" r:id="rId2"/>`,
    `  </p:sldMasterIdLst>`,
    `  <p:sldIdLst>`,
    `    <p:sldId id="256" r:id="rId1"/>`,
    `  </p:sldIdLst>`,
    `  <p:sldSz cx="${String(cx)}" cy="${String(cy)}"/>`,
    `  <p:notesSz cx="${String(cx)}" cy="${String(cy)}"/>`,
    `</p:presentation>`,
  ].join('\n');
}

function buildPresentationRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.slide}" Target="slides/slide1.xml"/>`,
    `  <Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.slideMaster}" Target="slideMasters/slideMaster1.xml"/>`,
    `  <Relationship Id="rId3" Type="${RELATIONSHIP_TYPES.theme}" Target="theme/theme1.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

function buildSlideXml(shapesXml: string): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sld xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}">`,
    `  <p:cSld>`,
    `    <p:spTree>`,
    `      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `      <p:grpSpPr/>`,
    shapesXml,
    `    </p:spTree>`,
    `  </p:cSld>`,
    `</p:sld>`,
  ].join('\n');
}

function buildSlideRels(
  relationships: ReadonlyArray<{ readonly id: string; readonly type: string; readonly target: string }>,
): string {
  const rels = relationships.map((r) => `  <Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`);

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId0" Type="${RELATIONSHIP_TYPES.slideLayout}" Target="../slideLayouts/slideLayout1.xml"/>`,
    ...rels,
    `</Relationships>`,
  ].join('\n');
}

function buildSlideLayoutXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sldLayout xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}" type="blank">`,
    `  <p:cSld><p:spTree>`,
    `    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `    <p:grpSpPr/>`,
    `  </p:spTree></p:cSld>`,
    `</p:sldLayout>`,
  ].join('\n');
}

function buildSlideLayoutRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.slideMaster}" Target="../slideMasters/slideMaster1.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

function buildSlideMasterXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<p:sldMaster xmlns:a="${NS.a}" xmlns:p="${NS.p}" xmlns:r="${NS.r}">`,
    `  <p:cSld><p:spTree>`,
    `    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`,
    `    <p:grpSpPr/>`,
    `  </p:spTree></p:cSld>`,
    `  <p:sldLayoutIdLst>`,
    `    <p:sldLayoutId id="2147483649" r:id="rId1"/>`,
    `  </p:sldLayoutIdLst>`,
    `</p:sldMaster>`,
  ].join('\n');
}

function buildSlideMasterRels(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<Relationships xmlns="${NS.rels}">`,
    `  <Relationship Id="rId1" Type="${RELATIONSHIP_TYPES.slideLayout}" Target="../slideLayouts/slideLayout1.xml"/>`,
    `  <Relationship Id="rId2" Type="${RELATIONSHIP_TYPES.theme}" Target="../theme/theme1.xml"/>`,
    `</Relationships>`,
  ].join('\n');
}

function buildThemeXml(): string {
  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<a:theme xmlns:a="${NS.a}" name="Broadset">`,
    `  <a:themeElements>`,
    `    <a:clrScheme name="Broadset">`,
    `      <a:dk1><a:srgbClr val="000000"/></a:dk1>`,
    `      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>`,
    `      <a:dk2><a:srgbClr val="333333"/></a:dk2>`,
    `      <a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>`,
    `      <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>`,
    `      <a:accent2><a:srgbClr val="C0504D"/></a:accent2>`,
    `      <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>`,
    `      <a:accent4><a:srgbClr val="8064A2"/></a:accent4>`,
    `      <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>`,
    `      <a:accent6><a:srgbClr val="F79646"/></a:accent6>`,
    `      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>`,
    `      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>`,
    `    </a:clrScheme>`,
    `    <a:fontScheme name="Broadset">`,
    `      <a:majorFont><a:latin typeface="Calibri"/></a:majorFont>`,
    `      <a:minorFont><a:latin typeface="Calibri"/></a:minorFont>`,
    `    </a:fontScheme>`,
    `    <a:fmtScheme name="Broadset">`,
    `      <a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>`,
    `      <a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>`,
    `      <a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>`,
    `      <a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>`,
    `    </a:fmtScheme>`,
    `  </a:themeElements>`,
    `</a:theme>`,
  ].join('\n');
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

/**
 * Export a BroadsetDocument to PPTX (OOXML) bytes.
 */
export function exportPptxBytes(doc: BroadsetDocument): Uint8Array {
  const { canvas } = doc;
  const cx = valueToEmu(canvas, canvas.width);
  const cy = valueToEmu(canvas, canvas.height);

  const ctx: SlideContext = {
    canvas,
    relationships: [],
    mediaFiles: [],
    nextRelId: 1,
    nextMediaId: 1,
  };

  // Build shapes XML — handle groups separately
  const groupIds = new Set(doc.elements.filter((el) => el.type === 'group').map((el) => el.id));

  const shapeParts: string[] = [];

  for (const el of doc.elements) {
    // Skip children of groups — they'll be included via the group
    if (el.groupId && groupIds.has(el.groupId)) continue;

    if (el.type === 'group') {
      const children = doc.elements.filter((child) => child.groupId === el.id);

      shapeParts.push(buildGroupXml(el, children, ctx));
    } else {
      shapeParts.push(buildShapeXml(el, ctx));
    }
  }

  const shapesXml = shapeParts.join('\n');

  // Determine media types for [Content_Types].xml
  const hasSvg = ctx.mediaFiles.some((f) => f.path.endsWith('.svg'));
  const imageExts = [
    ...new Set(
      ctx.mediaFiles
        .map((f) => {
          if (f.path.endsWith('.png')) return 'png';
          if (f.path.endsWith('.jpg')) return 'jpg';

          return '';
        })
        .filter(Boolean),
    ),
  ];

  // Assemble ZIP
  const zip = new PizZip();

  zip.file('[Content_Types].xml', buildContentTypesXml(hasSvg, imageExts));
  zip.file('_rels/.rels', buildRootRels());
  zip.file('ppt/presentation.xml', buildPresentationXml(cx, cy));
  zip.file('ppt/_rels/presentation.xml.rels', buildPresentationRels());
  zip.file('ppt/slides/slide1.xml', buildSlideXml(shapesXml));
  zip.file('ppt/slides/_rels/slide1.xml.rels', buildSlideRels(ctx.relationships));
  zip.file('ppt/slideLayouts/slideLayout1.xml', buildSlideLayoutXml());
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', buildSlideLayoutRels());
  zip.file('ppt/slideMasters/slideMaster1.xml', buildSlideMasterXml());
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', buildSlideMasterRels());
  zip.file('ppt/theme/theme1.xml', buildThemeXml());

  // Add media files
  for (const media of ctx.mediaFiles) {
    zip.file(media.path, media.content);
  }

  const output: unknown = zip.generate({ type: 'uint8array' });

  return output as Uint8Array;
}

/* ------------------------------------------------------------------ */
/*  Import                                                             */
/* ------------------------------------------------------------------ */

/**
 * Simple XML text extractor using regex.
 * Not a full parser — handles the subset needed for PPTX shape recovery.
 */
function extractAll(xml: string, pattern: RegExp): readonly string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);

  while ((m = re.exec(xml)) !== null) {
    if (m[0]) results.push(m[0]);
  }

  return results;
}

function extractTextContent(shapeXml: string): string {
  // Extract text from <a:t>...</a:t> elements
  const texts: string[] = [];
  const re = /<a:t>([\s\S]*?)<\/a:t>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(shapeXml)) !== null) {
    if (m[1] !== undefined) texts.push(m[1]);
  }

  return texts.join('');
}

function extractTransform(shapeXml: string): {
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
} {
  const offMatch = shapeXml.match(/<a:off\s+x="(\d+)"\s+y="(\d+)"\/>/);
  const extMatch = shapeXml.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"\/>/);

  return {
    x: offMatch ? parseInt(offMatch[1] ?? '0', 10) : 0,
    y: offMatch ? parseInt(offMatch[2] ?? '0', 10) : 0,
    cx: extMatch ? parseInt(extMatch[1] ?? '0', 10) : 0,
    cy: extMatch ? parseInt(extMatch[2] ?? '0', 10) : 0,
  };
}

/**
 * Determine if SVG content is a high-confidence single path
 * suitable for native path recovery.
 */
function isSinglePathSvg(svgContent: string): boolean {
  // Count shape elements
  const paths = (svgContent.match(/<path\b/g) ?? []).length;
  const rects = (svgContent.match(/<rect\b/g) ?? []).length;
  const circles = (svgContent.match(/<circle\b/g) ?? []).length;
  const ellipses = (svgContent.match(/<ellipse\b/g) ?? []).length;
  const foreignObjs = (svgContent.match(/<foreignObject\b/g) ?? []).length;

  const totalShapes = paths + rects + circles + ellipses;

  // High confidence: exactly one path, no other shapes, no foreignObject
  return paths === 1 && totalShapes === 1 && foreignObjs === 0;
}

function extractPathD(svgContent: string): string | undefined {
  const match = svgContent.match(/<path[^>]*\bd=['"]([^'"]+)['"]/);

  return match ? (match[1] ?? undefined) : undefined;
}

function parseSlideRelationships(relsXml: string): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\s+Id="([^"]+)"\s+Type="[^"]*"\s+Target="([^"]+)"\/>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(relsXml)) !== null) {
    const id = m[1];
    const target = m[2];

    if (id && target) {
      map.set(id, target);
    }
  }

  return map;
}

function importShapeElement(
  shapeXml: string,
  canvas: Canvas,
  svgMediaMap: ReadonlyMap<string, string>,
): BroadsetElement | undefined {
  const xfrm = extractTransform(shapeXml);

  const position = {
    x: emuToValue(canvas, xfrm.x),
    y: emuToValue(canvas, xfrm.y),
  };
  const width = emuToValue(canvas, xfrm.cx);
  const height = emuToValue(canvas, xfrm.cy);

  // Is it a text shape?
  const textContent = extractTextContent(shapeXml);

  if (textContent) {
    return createImportedElement('text', textContent, position, width, height);
  }

  // Is it a picture with media relationship?
  const blipMatch = shapeXml.match(/<a:blip\s+r:embed="([^"]+)"\/>/);

  if (blipMatch) {
    const relId = blipMatch[1] ?? '';
    const svgContent = svgMediaMap.get(relId);

    if (svgContent) {
      // SVG media — check for path recovery
      if (isSinglePathSvg(svgContent)) {
        const d = extractPathD(svgContent);

        if (d) {
          return createImportedElement('path', d, position, width, height);
        }
      }

      // Complex SVG — preserve as svg element
      return createImportedElement('svg', svgContent, position, width, height);
    }

    // Regular image — mark as image with empty content (data not preserved in import)
    return createImportedElement('image', `pptx-media:${relId}`, position, width, height);
  }

  // Check for solid fill → rectangle
  const hasFill = shapeXml.includes('<a:solidFill') || shapeXml.includes('<a:noFill');
  const geomMatch = shapeXml.match(/prst="([^"]+)"/);
  const geometry = geomMatch ? (geomMatch[1] ?? 'rect') : 'rect';

  if (geometry === 'ellipse') {
    return createImportedElement('ellipse', '', position, width, height, extractFillColor(shapeXml));
  }

  if (hasFill || geometry === 'rect') {
    return createImportedElement('rectangle', '', position, width, height, extractFillColor(shapeXml));
  }

  return createImportedElement('rectangle', '', position, width, height);
}

function extractFillColor(xml: string): string | undefined {
  const match = xml.match(/<a:srgbClr\s+val="([^"]+)"\/>/);

  return match ? `#${match[1] ?? '000000'}` : undefined;
}

let importIdCounter = 0;

function isValidElementType(type: string): type is BuiltInElementType {
  return (BUILT_IN_ELEMENT_TYPES as readonly string[]).includes(type);
}

function createImportedElement(
  type: string,
  content: string,
  position: { readonly x: number; readonly y: number },
  width: number,
  height: number,
  backgroundColor?: string,
): BroadsetElement {
  const validType = isValidElementType(type) ? type : 'rectangle';

  importIdCounter++;

  return {
    id: `import-${String(importIdCounter)}`,
    type: validType,
    name: validType,
    locked: false,
    position,
    width,
    height,
    rotation: 0,
    content,
    style: {
      opacity: 1,
      ...(backgroundColor ? { backgroundColor } : undefined),
    },
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    typeConfig: null,
    componentRef: null,
    autoSize: 'fixed',
    textPathElementId: null,
    booleanOperation: null,
    extensions: {},
  } as BroadsetElement;
}

/**
 * Import a PPTX file and recover BroadsetDocument elements.
 */
export function importPptx(data: Uint8Array): BroadsetDocument {
  const zip = new PizZip(data);

  // Read slide dimensions from presentation.xml
  const presXml = zip.file('ppt/presentation.xml')?.asText() ?? '';
  const sldSzMatch = presXml.match(/<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"\/>/);
  const cxEmu = sldSzMatch ? parseInt(sldSzMatch[1] ?? '0', 10) : 0;
  const cyEmu = sldSzMatch ? parseInt(sldSzMatch[2] ?? '0', 10) : 0;

  // Default canvas in mm
  const canvas: Canvas = {
    width: cxEmu / MM_TO_EMU,
    height: cyEmu / MM_TO_EMU,
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
  };

  // Read slide relationships to resolve media
  const slideRelsXml = zip.file('ppt/slides/_rels/slide1.xml.rels')?.asText() ?? '';
  const relMap = parseSlideRelationships(slideRelsXml);

  // Build SVG media map: relId → SVG content
  const svgMediaMap = new Map<string, string>();

  for (const [relId, target] of relMap) {
    if (target.endsWith('.svg')) {
      // Resolve relative path from slides/ directory
      const mediaPath = target.startsWith('..') ? `ppt/${target.slice(3)}` : target;
      const svgContent = zip.file(mediaPath)?.asText();

      if (svgContent) {
        svgMediaMap.set(relId, svgContent);
      }
    }
  }

  // Read slide XML
  const slideXml = zip.file('ppt/slides/slide1.xml')?.asText() ?? '';

  // Extract shapes from spTree
  const elements: BroadsetElement[] = [];

  // Extract sp (shape) elements
  const spShapes = extractAll(slideXml, /<p:sp>[\s\S]*?<\/p:sp>/);

  for (const shapeXml of spShapes) {
    const el = importShapeElement(shapeXml, canvas, svgMediaMap);

    if (el) elements.push(el);
  }

  // Extract pic (picture) elements
  const picShapes = extractAll(slideXml, /<p:pic>[\s\S]*?<\/p:pic>/);

  for (const picXml of picShapes) {
    const el = importShapeElement(picXml, canvas, svgMediaMap);

    if (el) elements.push(el);
  }

  return {
    id: 'imported-doc',
    name: 'Imported PPTX',
    documentMode: 'screen',
    canvas,
    elements,
    pages: [{ id: 'page-1', name: 'Page 1', overrides: [], locale: null, extensions: {} }],
    animations: [],
    dataSchema: { fields: [] },
  } as BroadsetDocument;
}
