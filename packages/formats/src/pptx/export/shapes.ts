import {
  type BroadsetColor,
  type BroadsetElement,
  type Bullet,
  type Hyperlink,
  isBroadsetColor,
  type Paragraph,
  resolveContentAsPlainString,
  resolveStyleColor,
  rgbColor,
} from '@broadset/model';
import svgpath from 'svgpath';

import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import { canvasLengthToEmu, hexToOoxmlColor } from '../ooxml/units';
import { escapeXmlAttribute, escapeXmlText } from '../ooxml/xml';
import { buildElementExt } from '../semantic/element-ext';
import { encodeShapeName } from '../semantic/shape-name';
import { type ElementMetaExtension } from '../types';
import { allocateMediaIndex, allocateShapeId, type SlideExportContext } from './context';
import { emitColorFill, emitEffects, emitElementFill, emitStroke, emitTransform } from './primitives';

/**
 * Shape emitters. One function per OOXML primitive the exporter needs:
 * text shape, geometry shape (prstGeom + custGeom), picture (`<p:pic>`),
 * group (`<p:grpSp>`). Every emitter owns the `<p:cNvPr>` + `<p:extLst>`
 * tagging so every Broadset element carries its identity and metadata
 * on the wire.
 */

/** Extract per-shape non-visual properties (`<p:cNvPr>` + `<p:extLst>`). */
function emitNonVisualProps(
  ctx: SlideExportContext,
  element: BroadsetElement,
  kind: string,
  options?: { readonly isPicture?: boolean; readonly isGroup?: boolean },
): string {
  const id = allocateShapeId(ctx);

  ctx.shapeIdByElementId.set(element.id, id);

  const dataFieldName = readDataFieldName(element);
  const visibleWhen = readStringOrNull(element.visibleWhen);
  const repeaterField = readRepeaterField(element);
  const tag = dataFieldName !== null ? { id: element.id, kind, dataField: dataFieldName } : { id: element.id, kind };
  const name = encodeShapeName(tag);
  const escapedName = escapeXmlAttribute(name);
  const meta: ElementMetaExtension = {
    id: element.id,
    kind,
    dirty: readDirtyFlag(element),
    ...(dataFieldName !== null ? { dataField: dataFieldName } : {}),
    ...(visibleWhen !== null ? { visibleWhen } : {}),
    ...(repeaterField !== null ? { repeater: repeaterField } : {}),
    ...(kind !== element.type ? { originalKind: element.type } : {}),
  };
  const ext = buildElementExt(meta);
  const extLst = `<p:extLst>${ext}</p:extLst>`;
  const variant = selectVariant(options);

  return `<${variant.wrapper}><p:cNvPr id="${String(id)}" name="${escapedName}">${extLst}</p:cNvPr>${variant.spProps}<p:nvPr/></${variant.wrapper}>`;
}

function selectVariant(
  options: { readonly isPicture?: boolean; readonly isGroup?: boolean } | undefined,
): { readonly wrapper: string; readonly spProps: string } {
  if (options?.isPicture === true) return { wrapper: 'p:nvPicPr', spProps: '<p:cNvPicPr/>' };
  if (options?.isGroup === true) return { wrapper: 'p:nvGrpSpPr', spProps: '<p:cNvGrpSpPr/>' };

  return { wrapper: 'p:nvSpPr', spProps: '<p:cNvSpPr/>' };
}

function readDirtyFlag(element: BroadsetElement): boolean {
  // Tests / external callers may construct elements without the full
  // schema-validated shape — defend against an unpopulated extensions
  // record by round-tripping through `unknown` before indexing.
  const extensions = element.extensions as unknown;

  if (typeof extensions !== 'object' || extensions === null) return true;

  const record = extensions as Record<string, unknown>;
  const pptx = record['pptx'];

  if (typeof pptx !== 'object' || pptx === null) return true;

  const pptxRecord = pptx as Record<string, unknown>;
  const dirty = pptxRecord['dirty'];

  return dirty === undefined ? true : Boolean(dirty);
}

function readDataFieldName(element: BroadsetElement): string | null {
  const value = element.dataField as unknown;

  if (typeof value !== 'object' || value === null) return null;

  const name = (value as Record<string, unknown>)['fieldName'];

  return typeof name === 'string' && name.length > 0 ? name : null;
}

function readStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Pull the preserved raw OOXML blob from `extensions.pptx.raw` when
 * `dirty === false`. Returns `null` for edited elements (the exporter
 * synthesises fresh markup) or elements without a preserved blob.
 */
function readRawBlob(element: BroadsetElement): string | null {
  const extensions = element.extensions as unknown;

  if (typeof extensions !== 'object' || extensions === null) return null;

  const pptx = (extensions as Record<string, unknown>)['pptx'];

  if (typeof pptx !== 'object' || pptx === null) return null;

  const record = pptx as Record<string, unknown>;

  if (record['dirty'] !== false) return null;

  const raw = record['raw'];

  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Element-aware wrapper around {@link emitTransform} that includes
 * `flipH` / `flipV` flags read from `extensions.pptx`. Most shape
 * emitters call this; group emit uses emitTransform directly to
 * include the child offset.
 */
function emitElementXfrm(ctx: SlideExportContext, element: BroadsetElement): string {
  const flip = readFlipFlags(element);

  return emitTransform(ctx, {
    x: element.position.x,
    y: element.position.y,
    width: element.width,
    height: element.height,
    rotationDegrees: element.rotation,
    flipH: flip.flipH,
    flipV: flip.flipV,
  });
}

/**
 * Extract OOXML flip flags from `extensions.pptx.flipH` / `flipV`.
 * Broadset has no native flip field on elements; the PPTX importer
 * stashes the flag on extensions to round-trip mirrored shapes.
 */
function readFlipFlags(element: BroadsetElement): { readonly flipH: boolean; readonly flipV: boolean } {
  const extensions = element.extensions as unknown;

  if (typeof extensions !== 'object' || extensions === null) return { flipH: false, flipV: false };

  const pptx = (extensions as Record<string, unknown>)['pptx'];

  if (typeof pptx !== 'object' || pptx === null) return { flipH: false, flipV: false };

  const record = pptx as Record<string, unknown>;

  return { flipH: record['flipH'] === true, flipV: record['flipV'] === true };
}

function readRepeaterField(element: BroadsetElement): string | null {
  const value = element.repeater as unknown;

  if (typeof value !== 'object' || value === null) return null;

  const name = (value as Record<string, unknown>)['dataArrayField'];

  return typeof name === 'string' && name.length > 0 ? name : null;
}

/**
 * Build a `<p:sp>` text shape with full text-body (paragraphs + runs).
 */
export function emitTextShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'text');
  const xfrm = emitElementXfrm(ctx, element);
  const body = emitTextBody(ctx, element);
  const stroke = emitStroke(element.style, ctx);

  const effects = emitEffects(element.style, ctx);

  return `<p:sp>${nv}<p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>${stroke}${effects}</p:spPr>${body}</p:sp>`;
}

function emitTextBody(ctx: SlideExportContext, element: BroadsetElement): string {
  const paragraphs = resolveParagraphs(element);
  const fontColorCss = resolveStyleColor(element.style.fontColor, { resolveTheme: false });
  const defaultColor = fontColorCss === undefined ? '000000' : hexToOoxmlColor(fontColorCss);
  const defaultSize = element.style.fontSize !== undefined ? Math.round(element.style.fontSize * 100) : 1800;
  const family = element.style.fontFamily;

  const paragraphXml = paragraphs
    .map((paragraph) => emitParagraph(ctx, paragraph, { defaultColor, defaultSize, defaultFamily: family }))
    .join('');

  const align = textAlignAttr(element.style.textAlignment);
  const emptyFallback = `<a:p><a:pPr${align}/><a:endParaRPr lang="en-US"/></a:p>`;
  const body = paragraphXml.length > 0 ? paragraphXml : emptyFallback;

  return `<p:txBody><a:bodyPr wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/>${body}</p:txBody>`;
}

function textAlignAttr(value: string | undefined): string {
  if (value === 'center') return ' algn="ctr"';
  if (value === 'right' || value === 'end') return ' algn="r"';
  if (value === 'justify') return ' algn="just"';

  return '';
}

interface RunLike {
  readonly text: string;
  readonly bold?: boolean | undefined;
  readonly italic?: boolean | undefined;
  readonly underline?: boolean | undefined;
  readonly fontSize?: number | undefined;
  readonly fontFamily?: string | undefined;
  readonly color?: BroadsetColor | undefined;
  readonly hyperlink?: Hyperlink | undefined;
}

interface ParagraphLike {
  readonly runs: readonly RunLike[];
  readonly align?: string | undefined;
  readonly bullet?: Bullet | undefined;
  /** Indent in canvas units (mm by default); negative values valid (hanging). */
  readonly indent?: number | undefined;
  /** Line spacing as a ratio: 1.0 = single, 1.5 = 150%. */
  readonly lineSpacing?: number | undefined;
}

function resolveParagraphs(element: BroadsetElement): readonly ParagraphLike[] {
  const content = element.content;

  if (typeof content === 'string') {
    return content
      .split('\n')
      .map((line) => ({ runs: [{ text: line }] }));
  }

  if (typeof content === 'object' && 'paragraphs' in content) {
    const paragraphs: readonly Paragraph[] = content.paragraphs;

    return paragraphs.map((p) => ({
      runs: p.runs.map((r) => ({
        text: r.text,
        bold: readRunStyleBoolean(r.props?.style, 'bold'),
        italic: readRunStyleBoolean(r.props?.style, 'italic'),
        underline: readRunStyleUnderline(r.props?.style),
        fontSize: readRunStyleNumber(r.props?.style, 'fontSize'),
        fontFamily: readRunStyleString(r.props?.style, 'fontFamily'),
        color: readRunStyleColor(r.props?.style),
        hyperlink: r.props?.hyperlink,
      })),
      align: p.props?.align,
      bullet: p.props?.bullet,
      indent: p.props?.indent,
      lineSpacing: p.props?.lineSpacing,
    }));
  }

  return [{ runs: [{ text: resolveContentAsPlainString(content) }] }];
}

function readRunStyleBoolean(style: Readonly<Record<string, unknown>> | undefined, key: string): boolean | undefined {
  const value = style?.[key];

  return typeof value === 'boolean' ? value : undefined;
}

function readRunStyleNumber(style: Readonly<Record<string, unknown>> | undefined, key: string): number | undefined {
  const value = style?.[key];

  return typeof value === 'number' ? value : undefined;
}

function readRunStyleString(style: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = style?.[key];

  return typeof value === 'string' ? value : undefined;
}

function readRunStyleUnderline(style: Readonly<Record<string, unknown>> | undefined): boolean | undefined {
  const value = style?.['underline'];

  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value !== 'none';

  return undefined;
}

/**
 * Run-level colour can land in `r.props.style.color` two ways: as a
 * structured `BroadsetColor` (importer's preferred shape, preserves
 * theme slots + mods) or as a plain hex string (older edits / hand-
 * authored content). Accept both so we never silently drop the value.
 */
function readRunStyleColor(style: Readonly<Record<string, unknown>> | undefined): BroadsetColor | undefined {
  const value = style?.['color'];

  if (value === undefined) return undefined;
  if (isBroadsetColor(value)) return value;
  if (typeof value === 'string' && value.length > 0) return rgbColor(value);

  return undefined;
}

function emitParagraph(
  ctx: SlideExportContext,
  paragraph: ParagraphLike,
  defaults: { readonly defaultColor: string; readonly defaultSize: number; readonly defaultFamily: string | undefined },
): string {
  const pPrAttrs = buildPPrAttrs(ctx, paragraph);
  const bullet = emitBulletXml(paragraph.bullet);
  const lnSpc = emitLineSpacing(paragraph.lineSpacing);
  const pPr = `<a:pPr${pPrAttrs}>${lnSpc}${bullet}</a:pPr>`;
  const runs = paragraph.runs.map((run) => emitRun(ctx, run, defaults)).join('');

  return `<a:p>${pPr}${runs}</a:p>`;
}

function buildPPrAttrs(ctx: SlideExportContext, paragraph: ParagraphLike): string {
  const parts: string[] = [];
  const align = textAlignAttr(paragraph.align);

  if (align.length > 0) parts.push(align.trim());

  if (paragraph.indent !== undefined) {
    const indentEmu = canvasLengthToEmu(ctx.canvas, paragraph.indent);

    parts.push(`indent="${String(indentEmu)}"`);

    // Pair indent with a non-negative `marL` so PowerPoint reserves
    // space for hanging indents (-indent → +marL of equal magnitude).
    if (paragraph.indent < 0) parts.push(`marL="${String(Math.abs(indentEmu))}"`);
  }

  return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}

const SPC_PCT_SCALE = 100000;

function emitLineSpacing(lineSpacing: number | undefined): string {
  if (lineSpacing === undefined) return '';

  const pct = Math.round(lineSpacing * SPC_PCT_SCALE);

  return `<a:lnSpc><a:spcPct val="${String(pct)}"/></a:lnSpc>`;
}

/**
 * Emit OOXML bullet markup from a Broadset Bullet variant.
 *
 * - `kind: 'none'` → `<a:buNone/>` (suppress inherited bullets).
 * - `kind: 'char'` → `<a:buChar char="•"/>`.
 * - `kind: 'auto'` → `<a:buAutoNum type="…"/>` with format mapping.
 */
function emitBulletXml(bullet: Bullet | undefined): string {
  if (bullet === undefined) return '';
  if (bullet.kind === 'none') return '<a:buNone/>';

  if (bullet.kind === 'char') {
    return `<a:buChar char="${escapeXmlAttribute(bullet.char)}"/>`;
  }

  // 'auto' — map common Broadset format names to OOXML enum values.
  const startAttr = bullet.startAt !== undefined ? ` startAt="${String(bullet.startAt)}"` : '';

  return `<a:buAutoNum type="${escapeXmlAttribute(bullet.format)}"${startAttr}/>`;
}

function emitRun(
  ctx: SlideExportContext,
  run: RunLike,
  defaults: { readonly defaultColor: string; readonly defaultSize: number; readonly defaultFamily: string | undefined },
): string {
  const size = run.fontSize !== undefined ? Math.round(run.fontSize * 100) : defaults.defaultSize;
  const family = run.fontFamily ?? defaults.defaultFamily;
  const attrs: string[] = [`lang="en-US"`, `sz="${String(size)}"`];

  if (run.bold === true) attrs.push('b="1"');
  if (run.italic === true) attrs.push('i="1"');
  if (run.underline === true) attrs.push('u="sng"');

  const fill =
    run.color !== undefined
      ? emitColorFill(run.color)
      : `<a:solidFill><a:srgbClr val="${defaults.defaultColor}"/></a:solidFill>`;
  const latin = family !== undefined ? `<a:latin typeface="${escapeXmlAttribute(family)}"/>` : '';
  const text = escapeXmlText(run.text);
  const hlink = emitHyperlinkRel(ctx, run.hyperlink);

  return `<a:r><a:rPr ${attrs.join(' ')}>${fill}${latin}${hlink}</a:rPr><a:t>${text}</a:t></a:r>`;
}

/**
 * Allocate an external-target relationship for a run-level hyperlink and
 * return the matching `<a:hlinkClick>` XML. OOXML stores the URL on the
 * slide's `_rels` and references it from the run via `r:id`, so the
 * relationship must be allocated on the same slide context the run is
 * being emitted into.
 */
function emitHyperlinkRel(ctx: SlideExportContext, hyperlink: Hyperlink | undefined): string {
  if (hyperlink === undefined) return '';

  const url = hyperlink.url.trim();

  if (url.length === 0) return '';

  const relId = ctx.rels.add(OOXML_REL_TYPES.hyperlink, url, true);
  const tooltip =
    hyperlink.tooltip !== undefined && hyperlink.tooltip.length > 0
      ? ` tooltip="${escapeXmlAttribute(hyperlink.tooltip)}"`
      : '';

  return `<a:hlinkClick r:id="${relId}"${tooltip}/>`;
}

/** Build a `<p:sp>` for a rectangle. Uniform radius → roundRect preset; per-corner → custGeom. */
export function emitRectangleShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'rectangle');
  const xfrm = emitElementXfrm(ctx, element);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);
  const geom = emitRectangleGeometry(element);

  return `<p:sp>${nv}<p:spPr>${xfrm}${geom}${fill}${stroke}${emitEffects(element.style, ctx)}</p:spPr></p:sp>`;
}

function emitRectangleGeometry(element: BroadsetElement): string {
  const radii = element.style.borderRadius;

  if (radii === undefined) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  const [tl, tr, br, bl] = radii;
  const uniform = tl === tr && tr === br && br === bl;

  if (uniform && tl > 0) {
    // Broadset radius is in canvas units; OOXML preset value is 1000ths of the shorter edge.
    const shortEdge = Math.min(element.width, element.height) || 1;
    const percent = Math.round(Math.max(0, Math.min(0.5, tl / shortEdge)) * 100000);

    return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${String(percent)}"/></a:avLst></a:prstGeom>`;
  }

  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }

  // Per-corner — emit custGeom with rounded corners via arcs.
  return emitPerCornerCustGeom(element.width, element.height, radii);
}

function emitPerCornerCustGeom(width: number, height: number, radii: readonly number[]): string {
  const [tl = 0, tr = 0, br = 0, bl = 0] = radii;
  const w = 100000;
  const h = 100000;
  const scaleX = (v: number): number => Math.round((v / width) * w);
  const scaleY = (v: number): number => Math.round((v / height) * h);
  const tls = scaleX(tl);
  const trs = scaleX(tr);
  const brs = scaleX(br);
  const bls = scaleX(bl);
  const tlsY = scaleY(tl);
  const trsY = scaleY(tr);
  const brsY = scaleY(br);
  const blsY = scaleY(bl);

  const path = `<a:path w="${String(w)}" h="${String(h)}">
    <a:moveTo><a:pt x="0" y="${String(tlsY)}"/></a:moveTo>
    <a:arcTo wR="${String(tls)}" hR="${String(tlsY)}" stAng="10800000" swAng="5400000"/>
    <a:lnTo><a:pt x="${String(w - trs)}" y="0"/></a:lnTo>
    <a:arcTo wR="${String(trs)}" hR="${String(trsY)}" stAng="16200000" swAng="5400000"/>
    <a:lnTo><a:pt x="${String(w)}" y="${String(h - brsY)}"/></a:lnTo>
    <a:arcTo wR="${String(brs)}" hR="${String(brsY)}" stAng="0" swAng="5400000"/>
    <a:lnTo><a:pt x="${String(bls)}" y="${String(h)}"/></a:lnTo>
    <a:arcTo wR="${String(bls)}" hR="${String(blsY)}" stAng="5400000" swAng="5400000"/>
    <a:close/>
  </a:path>`;

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${String(w)}" b="${String(h)}"/><a:pathLst>${path}</a:pathLst></a:custGeom>`;
}

export function emitEllipseShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'ellipse');
  const xfrm = emitElementXfrm(ctx, element);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);

  return `<p:sp>${nv}<p:spPr>${xfrm}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>${fill}${stroke}${emitEffects(element.style, ctx)}</p:spPr></p:sp>`;
}

/**
 * Emit an SVG path element as OOXML `<a:custGeom>` — native editable path.
 */
export function emitPathShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'path');
  const xfrm = emitElementXfrm(ctx, element);
  const d = resolveContentAsPlainString(element.content);
  const geom = emitCustGeomFromD(d, element.width, element.height);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);

  return `<p:sp>${nv}<p:spPr>${xfrm}${geom}${fill}${stroke}${emitEffects(element.style, ctx)}</p:spPr></p:sp>`;
}

function emitCustGeomFromD(d: string, width: number, height: number): string {
  if (d.length === 0) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  const w = 100000;
  const h = 100000;
  const scaleX = width === 0 ? 1 : w / width;
  const scaleY = height === 0 ? 1 : h / height;
  let path: string;

  try {
    const normalized = svgpath(d).abs().unarc().unshort();
    const ops: string[] = [];

    const pt = (v: unknown): number => (typeof v === 'number' ? v : 0);

    normalized.iterate((segment) => {
      const cmd = segment[0];

      if (cmd === 'M') {
        const x = pt(segment[1]) * scaleX;
        const y = pt(segment[2]) * scaleY;

        ops.push(`<a:moveTo><a:pt x="${String(Math.round(x))}" y="${String(Math.round(y))}"/></a:moveTo>`);
      } else if (cmd === 'L') {
        const x = pt(segment[1]) * scaleX;
        const y = pt(segment[2]) * scaleY;

        ops.push(`<a:lnTo><a:pt x="${String(Math.round(x))}" y="${String(Math.round(y))}"/></a:lnTo>`);
      } else if (cmd === 'C') {
        const c1x = pt(segment[1]) * scaleX;
        const c1y = pt(segment[2]) * scaleY;
        const c2x = pt(segment[3]) * scaleX;
        const c2y = pt(segment[4]) * scaleY;
        const ex = pt(segment[5]) * scaleX;
        const ey = pt(segment[6]) * scaleY;

        ops.push(
          `<a:cubicBezTo><a:pt x="${String(Math.round(c1x))}" y="${String(Math.round(c1y))}"/><a:pt x="${String(Math.round(c2x))}" y="${String(Math.round(c2y))}"/><a:pt x="${String(Math.round(ex))}" y="${String(Math.round(ey))}"/></a:cubicBezTo>`,
        );
      } else if (cmd === 'Q') {
        const cx = pt(segment[1]) * scaleX;
        const cy = pt(segment[2]) * scaleY;
        const ex = pt(segment[3]) * scaleX;
        const ey = pt(segment[4]) * scaleY;

        ops.push(
          `<a:quadBezTo><a:pt x="${String(Math.round(cx))}" y="${String(Math.round(cy))}"/><a:pt x="${String(Math.round(ex))}" y="${String(Math.round(ey))}"/></a:quadBezTo>`,
        );
      } else if (cmd === 'Z' || cmd === 'z') {
        ops.push('<a:close/>');
      }
    });
    path = ops.join('');
  } catch {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }

  if (path.length === 0) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';

  const body = `<a:path w="${String(w)}" h="${String(h)}">${path}</a:path>`;

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${String(w)}" b="${String(h)}"/><a:pathLst>${body}</a:pathLst></a:custGeom>`;
}

/** Build a `<p:pic>` picture shape for image / svg elements. */
export function emitPictureShape(ctx: SlideExportContext, element: BroadsetElement, relId: string, kind: string): string {
  const nv = emitNonVisualProps(ctx, element, kind, { isPicture: true });
  const xfrm = emitElementXfrm(ctx, element);
  const stroke = emitStroke(element.style, ctx);

  return `<p:pic>${nv}<p:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${stroke}${emitEffects(element.style, ctx)}</p:spPr></p:pic>`;
}

interface DecodedMedia {
  readonly mime: string;
  readonly bytes: Uint8Array;
}

/** Decode a data URI into MIME + bytes. Returns undefined for malformed input. */
export function decodeDataUri(uri: string): DecodedMedia | undefined {
  const match = uri.match(/^data:([^;,]+)(?:;([^,]*))?,([\s\S]*)$/);

  if (!match) return undefined;

  const mime = match[1] ?? '';
  const encoding = match[2] ?? '';
  const data = match[3] ?? '';

  try {
    if (encoding === 'base64') {
      const binary = atob(data);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      return { mime, bytes };
    }

    return { mime, bytes: new TextEncoder().encode(decodeURIComponent(data)) };
  } catch {
    return undefined;
  }
}

export function extensionForMime(mime: string): string {
  const lower = mime.toLowerCase();

  if (lower.includes('png')) return 'png';
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpeg';
  if (lower.includes('gif')) return 'gif';
  if (lower.includes('svg')) return 'svg';
  if (lower.includes('webp')) return 'webp';
  if (lower.includes('bmp')) return 'bmp';

  return 'bin';
}

/** Allocate a media path + register the asset on the context. */
export function registerMedia(ctx: SlideExportContext, ext: string, bytes: Uint8Array): string {
  const index = allocateMediaIndex(ctx);
  const fileName = `media${String(index)}.${ext}`;
  const path = `ppt/media/${fileName}`;

  ctx.media.set(path, bytes);

  return path;
}

/** Build a `<p:grpSp>` group shape wrapping the given rendered-child XML. */
export function emitGroupShape(ctx: SlideExportContext, element: BroadsetElement, childrenXml: string): string {
  const nv = emitNonVisualProps(ctx, element, 'group', { isGroup: true });
  const flip = readFlipFlags(element);
  const xfrm = emitTransform(ctx, {
    x: element.position.x,
    y: element.position.y,
    width: element.width,
    height: element.height,
    rotationDegrees: element.rotation,
    flipH: flip.flipH,
    flipV: flip.flipV,
    includeChildOffset: true,
  });

  return `<p:grpSp>${nv}<p:grpSpPr>${xfrm}</p:grpSpPr>${childrenXml}</p:grpSp>`;
}

/** Fallback shape for elements Broadset doesn't map to OOXML natively (clock, ticker, video, qrcode when no renderer). */
export function emitFallbackShape(ctx: SlideExportContext, element: BroadsetElement, originalKind: string): string {
  const nv = emitNonVisualProps(ctx, element, originalKind);
  const xfrm = emitElementXfrm(ctx, element);
  const fill = emitElementFill(element);
  const stroke = emitStroke(element.style, ctx);

  // A labelled placeholder rectangle with the element's display name.
  const label = escapeXmlText(element.name.length > 0 ? element.name : originalKind);
  const body = `<p:txBody><a:bodyPr wrap="square" anchor="ctr"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1200">${emitColorFill({ kind: 'rgb', hex: '#666666' })}</a:rPr><a:t>${label}</a:t></a:r></a:p></p:txBody>`;

  return `<p:sp>${nv}<p:spPr>${xfrm}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${stroke}</p:spPr>${body}</p:sp>`;
}

/** Emit the full `<p:spTree>` shape tree for a slide from a flat element list + parent map. */
export function emitShapeTree(ctx: SlideExportContext, elements: readonly BroadsetElement[]): string {
  const byGroupId = new Map<string, BroadsetElement[]>();
  const roots: BroadsetElement[] = [];

  for (const el of elements) {
    const gid = el.groupId;

    if (typeof gid === 'string' && gid.length > 0) {
      const arr = byGroupId.get(gid) ?? [];

      arr.push(el);
      byGroupId.set(gid, arr);
    } else {
      roots.push(el);
    }
  }

  const rendered = roots.map((el) => renderElement(ctx, el, byGroupId)).join('');

  return rendered;
}

function renderElement(
  ctx: SlideExportContext,
  element: BroadsetElement,
  byGroupId: ReadonlyMap<string, readonly BroadsetElement[]>,
): string {
  // Preservation re-emission (IO-D-18): when the element carries a raw
  // OOXML blob in `extensions.pptx.raw` AND has not been edited
  // (`dirty: false`), emit the original blob verbatim rather than
  // synthesising a new shape from the Broadset state. This is what
  // makes round-trip lossless for unsupported shape types (callouts,
  // tables, charts, ink, …) preserved by the operator-level importer.
  const raw = readRawBlob(element);

  if (raw !== null) {
    // Allocate a shape id so timing references still work, then emit
    // the preserved blob wrapped in a fresh `<p:sp>` shell.
    ctx.shapeIdByElementId.set(element.id, allocateShapeId(ctx));

    return `<p:sp>${raw}</p:sp>`;
  }

  switch (element.type) {
    case 'text':
      return emitTextShape(ctx, element);
    case 'rectangle':
      return emitRectangleShape(ctx, element);
    case 'ellipse':
      return emitEllipseShape(ctx, element);
    case 'path':
      return emitPathShape(ctx, element);

    case 'group': {
      const children = byGroupId.get(element.id) ?? [];
      const childrenXml = children.map((child) => renderElement(ctx, child, byGroupId)).join('');

      return emitGroupShape(ctx, element, childrenXml);
    }

    case 'image': {
      const picRelId = registerImageElement(ctx, element, 'png');

      if (picRelId === null) return emitFallbackShape(ctx, element, 'image');

      return emitPictureShape(ctx, element, picRelId, 'image');
    }

    case 'svg': {
      const relId = registerSvgElement(ctx, element);

      if (relId === null) return emitFallbackShape(ctx, element, 'svg');

      return emitPictureShape(ctx, element, relId, 'svg');
    }

    case 'qrcode':
    case 'clock':
    case 'ticker':
    case 'video':
      return emitFallbackShape(ctx, element, element.type);
    default:
      return emitFallbackShape(ctx, element, element.type);
  }
}

function registerImageElement(ctx: SlideExportContext, element: BroadsetElement, defaultExt: string): string | null {
  const content = resolveContentAsPlainString(element.content);

  if (content.length === 0) return null;

  const decoded = decodeDataUri(content);

  if (!decoded) return null;

  const ext = extensionForMime(decoded.mime) === 'bin' ? defaultExt : extensionForMime(decoded.mime);
  const path = registerMedia(ctx, ext, decoded.bytes);
  const target = `../media/${path.replace('ppt/media/', '')}`;
  const relId = ctx.rels.add('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target);

  return relId;
}

function registerSvgElement(ctx: SlideExportContext, element: BroadsetElement): string | null {
  const content = resolveContentAsPlainString(element.content);

  if (content.length === 0) return null;

  const bytes = new TextEncoder().encode(content);
  const path = registerMedia(ctx, 'svg', bytes);
  const target = `../media/${path.replace('ppt/media/', '')}`;
  const relId = ctx.rels.add('http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', target);

  return relId;
}
