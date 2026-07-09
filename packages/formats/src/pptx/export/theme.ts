import type { BroadsetColor, BroadsetDocument, BroadsetElement, BroadsetFill } from '@broadset/model';

import { XML_DECLARATION } from '../ooxml/xml';
import type { ThemeColorOverrides, ThemeFontOverrides } from '../types';

/**
 * Project-token-driven theme + master + layout XML emission. The
 * default theme used to be hard-coded Office stubs (Calibri Light /
 * Calibri, generic blue accent), so a Broadset-exported deck lost
 * the user's brand colours when they clicked "Reset to theme" in
 * PowerPoint. This module derives the theme from the document
 * (canvas background, element fill colours, dominant font family)
 * unless the caller supplies explicit overrides via
 * {@link PptxExportOptions.themeColors} / `themeFonts`.
 *
 * The derived palette gives PowerPoint a "Reset to theme" experience
 * that round-trips visually to the document's actual look — accent1
 * really is the user's primary fill colour, not Office's stock blue.
 */

interface DerivedTheme {
  readonly clr: Required<ThemeColorOverrides>;
  readonly fonts: Required<ThemeFontOverrides>;
}

/** Office defaults used when a slot has no document-derived value. */
const DEFAULT_THEME: Required<ThemeColorOverrides> = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '1F1F1F',
  lt2: 'EDEDED',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
};

const DEFAULT_FONTS: Required<ThemeFontOverrides> = {
  major: 'Calibri Light',
  minor: 'Calibri',
};

const ACCENT_SLOTS = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'] as const;

export function deriveTheme(
  document: BroadsetDocument,
  colorOverrides: ThemeColorOverrides | undefined,
  fontOverrides: ThemeFontOverrides | undefined,
): DerivedTheme {
  const elementFills = collectFillFrequencies(document.elements);
  const accentDerived = ACCENT_SLOTS.map((_, i) => elementFills[i]?.hex);
  const canvasBg = normaliseHex(document.canvas.backgroundColor);

  const dominantFont = collectDominantFontFamily(document.elements);

  const clr: Required<ThemeColorOverrides> = {
    dk1: pickHex(colorOverrides?.dk1, DEFAULT_THEME.dk1),
    lt1: pickHex(colorOverrides?.lt1, canvasBg ?? DEFAULT_THEME.lt1),
    dk2: pickHex(colorOverrides?.dk2, DEFAULT_THEME.dk2),
    lt2: pickHex(colorOverrides?.lt2, DEFAULT_THEME.lt2),
    accent1: pickHex(colorOverrides?.accent1, accentDerived[0] ?? DEFAULT_THEME.accent1),
    accent2: pickHex(colorOverrides?.accent2, accentDerived[1] ?? DEFAULT_THEME.accent2),
    accent3: pickHex(colorOverrides?.accent3, accentDerived[2] ?? DEFAULT_THEME.accent3),
    accent4: pickHex(colorOverrides?.accent4, accentDerived[3] ?? DEFAULT_THEME.accent4),
    accent5: pickHex(colorOverrides?.accent5, accentDerived[4] ?? DEFAULT_THEME.accent5),
    accent6: pickHex(colorOverrides?.accent6, accentDerived[5] ?? DEFAULT_THEME.accent6),
    hlink: pickHex(colorOverrides?.hlink, DEFAULT_THEME.hlink),
    folHlink: pickHex(colorOverrides?.folHlink, DEFAULT_THEME.folHlink),
  };

  const fonts: Required<ThemeFontOverrides> = {
    major: fontOverrides?.major ?? dominantFont ?? DEFAULT_FONTS.major,
    minor: fontOverrides?.minor ?? dominantFont ?? DEFAULT_FONTS.minor,
  };

  return { clr, fonts };
}

export function buildThemeXml(theme: DerivedTheme): string {
  const { clr, fonts } = theme;
  const major = escapeAttr(fonts.major);
  const minor = escapeAttr(fonts.minor);

  return `${XML_DECLARATION}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Broadset"><a:themeElements><a:clrScheme name="Broadset"><a:dk1><a:srgbClr val="${clr.dk1}"/></a:dk1><a:lt1><a:srgbClr val="${clr.lt1}"/></a:lt1><a:dk2><a:srgbClr val="${clr.dk2}"/></a:dk2><a:lt2><a:srgbClr val="${clr.lt2}"/></a:lt2><a:accent1><a:srgbClr val="${clr.accent1}"/></a:accent1><a:accent2><a:srgbClr val="${clr.accent2}"/></a:accent2><a:accent3><a:srgbClr val="${clr.accent3}"/></a:accent3><a:accent4><a:srgbClr val="${clr.accent4}"/></a:accent4><a:accent5><a:srgbClr val="${clr.accent5}"/></a:accent5><a:accent6><a:srgbClr val="${clr.accent6}"/></a:accent6><a:hlink><a:srgbClr val="${clr.hlink}"/></a:hlink><a:folHlink><a:srgbClr val="${clr.folHlink}"/></a:folHlink></a:clrScheme><a:fontScheme name="Broadset"><a:majorFont><a:latin typeface="${major}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${minor}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Broadset"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

/**
 * Slide master sets the background to the theme's `bg1` slot rather
 * than a hard-coded white — so when the user clicks "Reset to
 * theme" in PowerPoint, slides return to the document's canvas
 * background colour instead of jumping to white.
 */
export function buildSlideMasterXml(): string {
  return `${XML_DECLARATION}<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>`;
}

export function buildSlideLayoutXml(): string {
  return `${XML_DECLARATION}<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

interface FillCount {
  readonly hex: string;
  readonly count: number;
}

/**
 * Walk elements collecting `style.fill` solid-RGB hexes and rank by
 * usage. The top 6 distinct values fill `accent1`..`accent6` when
 * the caller hasn't supplied explicit overrides. Non-solid fills
 * (gradients, pictures) are skipped because they have no single
 * representative colour. Stroke colours are considered too — they
 * often carry brand accents.
 */
function collectFillFrequencies(elements: readonly BroadsetElement[]): readonly FillCount[] {
  const counts = new Map<string, number>();
  const considerColor = (color: BroadsetColor | null | undefined): void => {
    if (color === null || color === undefined) return;
    if (color.kind !== 'rgb') return;

    const hex = normaliseHex(color.hex);

    if (hex === null) return;

    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  };
  const considerFill = (fill: BroadsetFill | null | undefined): void => {
    if (fill === null || fill === undefined) return;
    if (fill.kind !== 'solid') return;

    considerColor(fill.color);
  };

  for (const element of elements) {
    considerFill(element.style.fill);
    considerColor(element.style.stroke);
  }

  return Array.from(counts.entries())
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
}

function collectDominantFontFamily(elements: readonly BroadsetElement[]): string | null {
  const counts = new Map<string, number>();

  for (const element of elements) {
    const family = element.style.fontFamily;

    if (typeof family !== 'string' || family.length === 0) continue;

    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  let bestFamily: string | null = null;
  let bestCount = 0;

  for (const [family, count] of counts) {
    if (count > bestCount) {
      bestFamily = family;
      bestCount = count;
    }
  }

  return bestFamily;
}

function pickHex(override: string | undefined, fallback: string): string {
  const fromOverride = normaliseHex(override);

  return fromOverride ?? fallback;
}

const HEX_PATTERN = /^[0-9a-f]{6}$/i;

function normaliseHex(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;

  const stripped = value.replace(/^#/, '').toUpperCase();

  if (!HEX_PATTERN.test(stripped)) return null;

  return stripped;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
