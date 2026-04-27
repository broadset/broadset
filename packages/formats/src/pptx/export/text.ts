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

import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import { canvasLengthToEmu, hexToOoxmlColor } from '../ooxml/units';
import { escapeXmlAttribute, escapeXmlText } from '../ooxml/xml';
import { type SlideExportContext } from './context';
import { emitColorFill, emitEffects, emitStroke } from './primitives';
import { emitElementXfrm, emitNonVisualProps } from './shape-common';

/** Build a `<p:sp>` text shape with full text-body (paragraphs + runs). */
export function emitTextShape(ctx: SlideExportContext, element: BroadsetElement): string {
  const nv = emitNonVisualProps(ctx, element, 'text');
  const xfrm = emitElementXfrm(ctx, element);
  const body = emitTextBody(ctx, element);
  const stroke = emitStroke(element.style, ctx);
  const effects = emitEffects(element.style, ctx, element.id);

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
  readonly indent?: number | undefined;
  readonly lineSpacing?: number | undefined;
}

function resolveParagraphs(element: BroadsetElement): readonly ParagraphLike[] {
  const content = element.content;

  if (typeof content === 'string') {
    return content.split('\n').map((line) => ({ runs: [{ text: line }] }));
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

function emitBulletXml(bullet: Bullet | undefined): string {
  if (bullet === undefined) return '';
  if (bullet.kind === 'none') return '<a:buNone/>';

  if (bullet.kind === 'char') {
    return `<a:buChar char="${escapeXmlAttribute(bullet.char)}"/>`;
  }

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
