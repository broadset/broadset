import {
  type Bullet,
  type Canvas,
  type Hyperlink,
  type Paragraph,
  type ParagraphAlign,
  type ParagraphProps,
  type Run,
  type TextBody,
} from '@broadset/model';

import {
  findChild,
  findChildren,
  findDescendant,
  getAttr,
  getText,
  parseOoxml,
  rootElement,
  type XmlElement,
} from '../ooxml/ast';
import { emuToCanvasLength } from '../ooxml/units';
import { parseColorElement } from './style';

const PML_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const DML_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * Recover text content from a `<p:sp>` body as a structured TextBody
 * with per-run styling. Public API takes a raw XML body string for
 * backward compatibility.
 */
export function extractTextBody(
  canvas: Canvas,
  body: string,
  hyperlinks?: ReadonlyMap<string, Hyperlink>,
): TextBody | null {
  // Wrap the body fragment so fast-xml-parser sees a single root, then
  // navigate down to the `<p:txBody>` via the AST.
  const wrapped = `<sp xmlns:p="${PML_NS}" xmlns:a="${DML_NS}" xmlns:r="${REL_NS}">${body}</sp>`;
  const root = rootElement(parseOoxml(wrapped));

  if (root === null) return null;

  return extractTextBodyFromNode(canvas, root, hyperlinks);
}

function extractTextBodyFromNode(
  canvas: Canvas,
  shape: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): TextBody | null {
  const txBody = findDescendant(shape, 'p:txBody');

  if (txBody === null) return null;

  const paragraphs: Paragraph[] = [];

  for (const p of findChildren(txBody, 'a:p')) {
    const runs = extractRuns(p, hyperlinks);
    const props = extractParagraphProps(canvas, p);
    const finalRuns: readonly Run[] = runs.length === 0 ? [{ text: '' }] : runs;

    paragraphs.push(props === null ? { runs: finalRuns } : { runs: finalRuns, props });
  }

  if (paragraphs.length === 0) return null;

  return { paragraphs };
}

function extractParagraphProps(canvas: Canvas, p: XmlElement): ParagraphProps | null {
  const pPr = findChild(p, 'a:pPr');

  if (pPr === null) return null;

  const props: { -readonly [K in keyof ParagraphProps]?: ParagraphProps[K] } = {};

  const algn = getAttr(pPr, 'algn');
  const align = ooxmlAlignToBroadset(algn);

  if (align !== undefined) props.align = align;

  const indentAttr = getAttr(pPr, 'indent');

  if (indentAttr !== undefined) props.indent = emuToCanvasLength(canvas, parseInt(indentAttr, 10));

  const marLAttr = getAttr(pPr, 'marL');

  if (marLAttr !== undefined) {
    props.indent ??= emuToCanvasLength(canvas, parseInt(marLAttr, 10));
  }

  const bullet = parseBulletFromPPr(pPr);

  if (bullet !== null) props.bullet = bullet;

  const lnSpc = findChild(pPr, 'a:lnSpc');

  if (lnSpc !== null) {
    const spcPct = findChild(lnSpc, 'a:spcPct');

    if (spcPct !== null) {
      props.lineSpacing = parseInt(getAttr(spcPct, 'val') ?? '100000', 10) / 100000;
    }
  }

  return Object.keys(props).length === 0 ? null : (props);
}

function ooxmlAlignToBroadset(algn: string | undefined): ParagraphAlign | undefined {
  if (algn === 'l') return 'start';
  if (algn === 'r') return 'end';
  if (algn === 'ctr') return 'center';
  if (algn === 'just') return 'justify';

  return undefined;
}

function parseBulletFromPPr(pPr: XmlElement): Bullet | null {
  if (findChild(pPr, 'a:buNone') !== null) return { kind: 'none' };

  const buChar = findChild(pPr, 'a:buChar');

  if (buChar !== null) {
    const char = getAttr(buChar, 'char') ?? '•';

    return { kind: 'char', char };
  }

  const buAuto = findChild(pPr, 'a:buAutoNum');

  if (buAuto !== null) {
    const format = getAttr(buAuto, 'type') ?? 'arabicPeriod';
    const startAtAttr = getAttr(buAuto, 'startAt');

    return startAtAttr !== undefined
      ? { kind: 'auto', format, startAt: parseInt(startAtAttr, 10) }
      : { kind: 'auto', format };
  }

  return null;
}

function extractRuns(
  paragraph: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Run[] {
  const runs: Run[] = [];

  for (const r of findChildren(paragraph, 'a:r')) {
    runs.push(buildRunFromElement(r, hyperlinks));
  }

  // Fallback: paragraphs without `<a:r>` wrapper but with raw `<a:t>`
  // text — emit a single unstyled run.
  if (runs.length === 0) {
    for (const t of findChildren(paragraph, 'a:t')) {
      runs.push({ text: getText(t) });
    }
  }

  return runs;
}

function buildRunFromElement(
  r: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Run {
  const t = findChild(r, 'a:t');
  const text = t !== null ? getText(t) : '';
  const rPr = findChild(r, 'a:rPr');

  if (rPr === null) return { text };

  const style = runStyleFromRPr(rPr);
  const lang = getAttr(rPr, 'lang');
  const hyperlink = parseRunHyperlink(rPr, hyperlinks);
  const hasStyle = Object.keys(style).length > 0;

  if (!hasStyle && lang === undefined && hyperlink === undefined) return { text };

  const props = {
    ...(hasStyle ? { style } : {}),
    ...(lang !== undefined ? { lang } : {}),
    ...(hyperlink !== undefined ? { hyperlink } : {}),
  };

  return { text, props };
}

function parseRunHyperlink(
  rPr: XmlElement,
  hyperlinks: ReadonlyMap<string, Hyperlink> | undefined,
): Hyperlink | undefined {
  if (hyperlinks === undefined) return undefined;

  const hlink = findChild(rPr, 'a:hlinkClick');

  if (hlink === null) return undefined;

  const relId = getAttr(hlink, 'id') ?? '';

  if (relId.length === 0) return undefined;

  const target = hyperlinks.get(relId);

  if (target === undefined) return undefined;

  const tooltip = getAttr(hlink, 'tooltip');

  if (tooltip !== undefined && tooltip.length > 0 && target.tooltip !== tooltip) {
    return { ...target, tooltip };
  }

  return target;
}

function runStyleFromRPr(rPr: XmlElement): Record<string, unknown> {
  const style: Record<string, unknown> = {};

  if (getAttr(rPr, 'b') === '1') style['bold'] = true;
  if (getAttr(rPr, 'i') === '1') style['italic'] = true;

  const uAttr = getAttr(rPr, 'u');

  if (uAttr !== undefined && uAttr !== 'none') style['underline'] = true;

  const szAttr = getAttr(rPr, 'sz');

  if (szAttr !== undefined) style['fontSize'] = parseInt(szAttr, 10) / 100;

  const latin = findChild(rPr, 'a:latin');

  if (latin !== null) {
    const typeface = getAttr(latin, 'typeface');

    if (typeface !== undefined) style['fontFamily'] = typeface;
  }

  const solid = findChild(rPr, 'a:solidFill');

  if (solid !== null) {
    const color = parseColorElement(solid);

    if (color !== null) style['color'] = color;
  }

  return style;
}
