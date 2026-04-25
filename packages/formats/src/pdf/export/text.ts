import type { BroadsetElement, BroadsetElementStyle, Canvas } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import { type PDFFont, type PDFPage, rgb } from 'pdf-lib';

import { elementToPoints } from '../geometry';
import { wrapText } from '../text';
import { resolveOpacity, resolveStyleColor } from './color';
import { lookupFont } from './fonts';
import type { CanvasAbsolutePosition } from './geometry';
import { elementTopLeftPt } from './page-layout';

/** Default line-height multiplier (typical PDF/CSS default). */
const LINE_HEIGHT_MULTIPLIER = 1.2;

/** Default font size when the element style does not declare one. */
const DEFAULT_FONT_SIZE_PT = 12;

type TextAlignment = NonNullable<BroadsetElementStyle['textAlignment']>;

/**
 * Render a Broadset text element onto a PDF page. Wraps the element's
 * resolved plain-string content into lines that fit the element's
 * bounding box, applies left / centre / right alignment per the
 * style's `textAlignment`, and draws each line via `page.drawText`.
 *
 * Real text-run-level fidelity (per-run font / weight / colour /
 * tracking) is Spec-Gapped pending the dedicated text-run pass.
 */
export function renderText(
  page: PDFPage,
  el: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
  fontMap: ReadonlyMap<string, PDFFont>,
  fallbackFont: PDFFont,
): void {
  if (!el.content) {
    return;
  }

  const { xPt, yPt, wPt: maxWidthPt } = elementTopLeftPt(absolute, el, canvas, trimHeightPt);
  const color = resolveStyleColor(el.style, 'fontColor') ?? rgb(0, 0, 0);
  const size = el.style.fontSize !== undefined ? elementToPoints(canvas, el.style.fontSize) : DEFAULT_FONT_SIZE_PT;
  const opacity = resolveOpacity(el.style);
  const font = lookupFont(el, fontMap, fallbackFont);
  const lineHeightPt = size * LINE_HEIGHT_MULTIPLIER;

  const measure = (text: string): number => font.widthOfTextAtSize(text, size);

  const lines = wrapText(resolveContentAsPlainString(el.content), maxWidthPt, measure);
  const alignment = el.style.textAlignment ?? 'left';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line === undefined || line === '') continue;

    const lineX = computeLineX(xPt, line, alignment, maxWidthPt, measure);

    page.drawText(line, {
      x: lineX,
      y: yPt + (lines.length - 1 - i) * lineHeightPt,
      size,
      color,
      opacity,
      font,
    });
  }
}

function computeLineX(
  xPt: number,
  line: string,
  alignment: TextAlignment,
  maxWidthPt: number,
  measure: (text: string) => number,
): number {
  if (alignment === 'center') {
    return xPt + (maxWidthPt - measure(line)) / 2;
  }

  if (alignment === 'right') {
    return xPt + maxWidthPt - measure(line);
  }

  return xPt;
}
