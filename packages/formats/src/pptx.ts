/**
 * @module pptx
 * @description PPTX export/import for BroadsetDocument.
 *
 * Uses Office Open XML (OOXML) format with PizZip for zip packaging.
 * Styled rectangles (gradients, box-shadow, non-uniform radii) use SVG
 * picture fallback. Simple rectangles export as native PPTX shapes.
 */
import type { BroadsetDocument, PageElement } from '@broadset/model';
import PizZip from 'pizzip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** EMU (English Metric Units) per millimetre: 914400 / 25.4 */
const EMU_PER_MM = 36000;

/** Slide dimensions default to the document canvas size. */
const DEFAULT_WIDTH_MM = 254;
const DEFAULT_HEIGHT_MM = 190.5;

// OOXML namespaces
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe accessor for element style properties. */
function getStyleProp(el: PageElement, key: string): unknown {
  return el.style?.[key];
}

/** Convert mm to EMU. */
function mmToEmu(mm: number): number {
  return Math.round(mm * EMU_PER_MM);
}

/**
 * Determine whether a rectangle element needs SVG picture fallback.
 * Styled rects (gradient, box-shadow, complex borders, non-uniform radii)
 * cannot be represented as native PPTX shapes.
 */
function needsSvgFallback(el: PageElement): boolean {
  const gradient = getStyleProp(el, 'backgroundGradient');

  if (typeof gradient === 'string' && gradient.length > 0) {
    return true;
  }

  const shadow = getStyleProp(el, 'boxShadow');

  if (typeof shadow === 'string' && shadow.length > 0) {
    return true;
  }

  const radii = getStyleProp(el, 'borderRadius');

  if (Array.isArray(radii)) {
    return true;
  }

  return false;
}

/** Parse a CSS hex color (#rgb, #rrggbb) to 6-digit uppercase hex without #. */
function colorToRrggbb(color: string): string {
  const c = color.trim().replace(/^#/, '');

  if (c.length === 3) {
    return (c.charAt(0) + c.charAt(0) + c.charAt(1) + c.charAt(1) + c.charAt(2) + c.charAt(2)).toUpperCase();
  }

  return c.substring(0, 6).toUpperCase();
}

/** Escape XML special characters in text content. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface GradientStop {
  readonly offset: string;
  readonly color: string;
}

/**
 * Parse CSS linear-gradient() string into SVG-compatible color stops.
 * Handles common forms: linear-gradient(angle, color1, color2, ...)
 */
function parseCssGradientStops(gradient: string): readonly GradientStop[] {
  const match = /linear-gradient\(([^)]+)\)/.exec(gradient);

  if (!match) {
    return [];
  }

  const args = match[1] ?? '';
  // Split by commas, but preserve commas inside rgb()/rgba() functions
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const ch of args) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;

    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  // Skip the first part if it's an angle/direction
  let startIdx = 0;

  if (parts.length > 0) {
    const first = parts[0] ?? '';

    if (/^\d+deg$|^to\s/i.test(first)) {
      startIdx = 1;
    }
  }

  const colorParts = parts.slice(startIdx);

  if (colorParts.length === 0) {
    return [];
  }

  return colorParts.map((part, i) => ({
    offset: `${String(Math.round((i / Math.max(colorParts.length - 1, 1)) * 100))}%`,
    color: part.trim(),
  }));
}

/**
 * Build an SVG string representing a styled element for use as picture
 * fallback media in PPTX.
 */
function buildElementSvg(el: PageElement): string {
  if (el.type === 'svg') {
    return el.content;
  }

  const w = String(el.width);
  const h = String(el.height);

  if (el.type === 'path') {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
      `viewBox="0 0 ${w} ${h}">` +
      `<path d="${escapeXml(el.content)}" fill="currentColor"/>` +
      `</svg>`
    );
  }

  // Rectangle with complex styles → render as SVG rect
  const bg = getStyleProp(el, 'backgroundColor');
  const gradient = getStyleProp(el, 'backgroundGradient');
  const fill = typeof bg === 'string' ? bg : '#000000';
  const radii = getStyleProp(el, 'borderRadius');

  let rx = '0';
  let ry = '0';

  if (Array.isArray(radii) && radii.length >= 1) {
    const r = typeof radii[0] === 'number' ? radii[0] : 0;

    rx = String(r);
    ry = String(r);
  } else if (typeof radii === 'number') {
    rx = String(radii);
    ry = String(radii);
  }

  let defs = '';
  let rectFill = escapeXml(fill);

  if (typeof gradient === 'string' && gradient.length > 0) {
    const stops = parseCssGradientStops(gradient);

    if (stops.length > 0) {
      const stopsXml = stops
        .map((s) => `<stop offset="${s.offset}" style="stop-color:${escapeXml(s.color)}"/>`)
        .join('');

      defs = `<defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="0%">${stopsXml}</linearGradient></defs>`;
      rectFill = 'url(#g1)';
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
    `viewBox="0 0 ${w} ${h}">` +
    defs +
    `<rect width="${w}" height="${h}" rx="${rx}" ry="${ry}" fill="${rectFill}"/>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Relationship tracking
// ---------------------------------------------------------------------------

interface RelEntry {
  readonly id: string;
  readonly type: string;
  readonly target: string;
}

// ---------------------------------------------------------------------------
// Export helpers (shape XML builders)
// ---------------------------------------------------------------------------

/** Build the a:xfrm element for positioning/sizing. */
function buildXfrm(x: number, y: number, cx: number, cy: number, rot: number): string {
  return (
    `<a:xfrm rot="${String(rot)}">` +
    `<a:off x="${String(x)}" y="${String(y)}"/>` +
    `<a:ext cx="${String(cx)}" cy="${String(cy)}"/>` +
    `</a:xfrm>`
  );
}

/** Build group shape XML subtree. */
function buildGroupXml(x: number, y: number, cx: number, cy: number, childXml: string): string {
  return (
    `<p:grpSp>` +
    `<p:grpSpPr>` +
    `<a:xfrm>` +
    `<a:off x="${String(x)}" y="${String(y)}"/>` +
    `<a:ext cx="${String(cx)}" cy="${String(cy)}"/>` +
    `<a:chOff x="0" y="0"/>` +
    `<a:chExt cx="${String(cx)}" cy="${String(cy)}"/>` +
    `</a:xfrm>` +
    `</p:grpSpPr>` +
    childXml +
    `</p:grpSp>`
  );
}

/** Build native rectangle shape XML. */
function buildNativeRectXml(el: PageElement, xfrm: string): string {
  const bg = getStyleProp(el, 'backgroundColor');
  let fillXml = '<a:noFill/>';

  if (typeof bg === 'string' && bg.length > 0) {
    fillXml = `<a:solidFill><a:srgbClr val="${colorToRrggbb(bg)}"/></a:solidFill>`;
  }

  const borderColor = getStyleProp(el, 'borderColor');
  const borderWidth = getStyleProp(el, 'borderWidth');
  let lnXml = '';

  if (typeof borderColor === 'string' || typeof borderWidth === 'number') {
    const w = typeof borderWidth === 'number' ? Math.round(borderWidth * EMU_PER_MM) : 12700;
    const c = typeof borderColor === 'string' ? colorToRrggbb(borderColor) : '000000';

    lnXml = `<a:ln w="${String(w)}"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:ln>`;
  }

  const radii = getStyleProp(el, 'borderRadius');
  let prstGeom = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  if (typeof radii === 'number' && radii > 0) {
    prstGeom = '<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>';
  }

  return `<p:sp><p:spPr>${xfrm}${prstGeom}${fillXml}${lnXml}</p:spPr></p:sp>`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Export a BroadsetDocument to PPTX format (Uint8Array).
 *
 * @param doc - The document to export
 * @returns Uint8Array of the PPTX zip archive
 */
export function exportPptx(doc: BroadsetDocument): Promise<Uint8Array> {
  const zip = new PizZip();

  const slideW = mmToEmu(doc.canvas.width || DEFAULT_WIDTH_MM);
  const slideH = mmToEmu(doc.canvas.height || DEFAULT_HEIGHT_MM);

  const page = doc.pages[0];
  const elements = page ? page.elements : [];

  const slideRels: RelEntry[] = [];
  const contentTypeOverrides: string[] = [];
  let relCounter = 1;
  let mediaCounter = 1;

  // Separate top-level from grouped children
  const topLevel = elements.filter((el) => !el.parentId);
  const childrenByParent = new Map<string, PageElement[]>();

  for (const el of elements) {
    if (el.parentId) {
      const existing = childrenByParent.get(el.parentId) ?? [];

      existing.push(el);
      childrenByParent.set(el.parentId, existing);
    }
  }

  function addSvgMedia(name: string, content: string, rId: string): void {
    zip.file(`ppt/media/${name}`, content);

    slideRels.push({
      id: rId,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
      target: `../media/${name}`,
    });

    contentTypeOverrides.push(`<Override PartName="/ppt/media/${name}" ContentType="image/svg+xml"/>`);
  }

  function buildSvgPictureXml(el: PageElement, x: number, y: number, cx: number, cy: number, rot: number): string {
    const rId = `rId${String(relCounter)}`;

    relCounter += 1;

    const mediaName = `media${String(mediaCounter)}.svg`;

    mediaCounter += 1;
    addSvgMedia(mediaName, buildElementSvg(el), rId);

    return (
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:nvPicPr>` +
      `<pic:cNvPr id="0" name="${escapeXml(mediaName)}"/>` +
      `<pic:cNvPicPr/>` +
      `</pic:nvPicPr>` +
      `<pic:blipFill>` +
      `<a:blip r:embed="${rId}"/>` +
      `<a:stretch><a:fillRect/></a:stretch>` +
      `</pic:blipFill>` +
      `<pic:spPr>${buildXfrm(x, y, cx, cy, rot)}</pic:spPr>` +
      `</pic:pic>`
    );
  }

  function buildShapeXml(el: PageElement): string {
    const x = mmToEmu(el.position.x);
    const y = mmToEmu(el.position.y);
    const cx = mmToEmu(el.width);
    const cy = mmToEmu(el.height);
    const rot = Math.round(el.rotation * 60000);
    const xfrm = buildXfrm(x, y, cx, cy, rot);

    if (el.type === 'group') {
      const children = childrenByParent.get(el.id) ?? [];

      return buildGroupXml(x, y, cx, cy, children.map(buildShapeXml).join(''));
    }

    if (el.type === 'text') {
      return (
        `<p:sp>` +
        `<p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
        `<p:txBody>` +
        `<a:bodyPr/>` +
        `<a:p><a:r><a:t>${escapeXml(el.content)}</a:t></a:r></a:p>` +
        `</p:txBody>` +
        `</p:sp>`
      );
    }

    if (el.type === 'image') {
      const rId = `rId${String(relCounter)}`;

      relCounter += 1;

      const mediaName = `image${String(mediaCounter)}.png`;

      mediaCounter += 1;

      const base64Match = /^data:image\/[^;]+;base64,(.+)$/s.exec(el.content);

      if (base64Match) {
        const b64 = base64Match[1];

        if (b64) {
          zip.file(`ppt/media/${mediaName}`, b64, { base64: true });
        }
      }

      slideRels.push({
        id: rId,
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
        target: `../media/${mediaName}`,
      });

      return (
        `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:nvPicPr>` +
        `<pic:cNvPr id="0" name="${escapeXml(mediaName)}"/>` +
        `<pic:cNvPicPr/>` +
        `</pic:nvPicPr>` +
        `<pic:blipFill>` +
        `<a:blip r:embed="${rId}"/>` +
        `<a:stretch><a:fillRect/></a:stretch>` +
        `</pic:blipFill>` +
        `<pic:spPr>${xfrm}</pic:spPr>` +
        `</pic:pic>`
      );
    }

    if (el.type === 'svg' || el.type === 'path') {
      return buildSvgPictureXml(el, x, y, cx, cy, rot);
    }

    if (el.type === 'rectangle') {
      if (needsSvgFallback(el)) {
        return buildSvgPictureXml(el, x, y, cx, cy, rot);
      }

      return buildNativeRectXml(el, xfrm);
    }

    return `<p:sp><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:sp>`;
  }

  const shapeXmlParts = topLevel.map(buildShapeXml);

  // ---------------------------------------------------------------------------
  // Assemble PPTX ZIP structure
  // ---------------------------------------------------------------------------

  const sW = String(slideW);
  const sH = String(slideH);

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="${NS_CT}">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Default Extension="png" ContentType="image/png"/>` +
      `<Default Extension="svg" ContentType="image/svg+xml"/>` +
      `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>` +
      `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>` +
      contentTypeOverrides.join('') +
      `</Types>`,
  );

  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${NS_REL}">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>` +
      `</Relationships>`,
  );

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
      `<p:sldMasterIdLst/>` +
      `<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>` +
      `<p:sldSz cx="${sW}" cy="${sH}"/>` +
      `</p:presentation>`,
  );

  zip.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="${NS_REL}">` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>` +
      `</Relationships>`,
  );

  zip.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}">` +
      `<p:cSld><p:spTree>` +
      `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr>` +
      `<a:xfrm><a:off x="0" y="0"/><a:ext cx="${sW}" cy="${sH}"/><a:chOff x="0" y="0"/><a:chExt cx="${sW}" cy="${sH}"/></a:xfrm>` +
      `</p:grpSpPr>` +
      shapeXmlParts.join('') +
      `</p:spTree></p:cSld></p:sld>`,
  );

  let slideRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` + `<Relationships xmlns="${NS_REL}">`;

  for (const rel of slideRels) {
    slideRelsXml += `<Relationship Id="${rel.id}" Type="${rel.type}" Target="${rel.target}"/>`;
  }

  slideRelsXml += `</Relationships>`;
  zip.file('ppt/slides/_rels/slide1.xml.rels', slideRelsXml);

  const buffer: Uint8Array = zip.generate({ type: 'uint8array' });

  return Promise.resolve(buffer);
}

// Re-export import functionality from split module
export type { ImportedPptxElement } from './pptx-import';
export { importPptx } from './pptx-import';
