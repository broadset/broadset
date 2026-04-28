import { type BroadsetElement, type Canvas, createDefaultElement } from '@broadset/model';
import type { PDFDocument } from 'pdf-lib';

import { type ExtractedTextItem, extractTextItemsWithBudget } from './operators';

interface ThirdPartyExtractionResult {
  readonly elements: readonly BroadsetElement[];
  readonly capExceeded: boolean;
  readonly capBytes: number;
}

/**
 * Default approximate character width in PDF points per `fontSize` unit.
 * Matches the prior `STANDARD_FONT_WIDTH_RATIO` in `pdf/core.ts`.
 */
const APPROX_CHAR_WIDTH_RATIO = 0.5;

/**
 * Approximate height-to-font-size multiplier for the element bounding
 * box (line height ~1.2 × font size).
 */
const APPROX_LINE_HEIGHT_MULTIPLIER = 1.2;

/**
 * Minimum default element size when no bounding box can be derived from
 * the extracted text item.
 */
const MIN_ELEMENT_SIDE_PT = 4;

/**
 * Minimum line-height fallback when `fontSize` is missing or zero so
 * extracted elements always have non-trivial height.
 */
const MIN_LINE_HEIGHT_PT = 12;

/**
 * Convert a PDF-point value back into the document's canvas unit (mm / in / px).
 * Inverse of `elementToPoints` in `pdf/geometry.ts`.
 */
const PT_PER_MM = 72 / 25.4;
const PT_PER_IN = 72;

/**
 * Build a list of Broadset elements from a third-party PDF's operator
 * stream. Current P6.4b coverage:
 *
 * - Text-showing operators (`Tj`, single-literal `TJ` strings) become
 *   `text` elements with approximate position, size, and content.
 *
 * Raster images, vector paths / shapes, and rich-text runs ride a
 * dedicated operator engine in a later iteration and are recorded as
 * Spec Gaps in `project/spec/formats/pdf.md`.
 */
/**
 * Cap-aware operator-stream → element extraction. Surfaces the
 * cap-exceeded flag so the caller can emit a structured warning when
 * the operator-stream byte budget fired and the result is partial.
 */
export function extractThirdPartyElementsWithBudget(
  pdf: PDFDocument,
  canvas: Canvas,
  capBytes?: number,
): ThirdPartyExtractionResult {
  const extraction =
    capBytes === undefined ? extractTextItemsWithBudget(pdf) : extractTextItemsWithBudget(pdf, capBytes);
  const { widthPt: _widthPt, heightPt } = canvasTrimSizePt(canvas);
  const elements: BroadsetElement[] = [];

  let index = 0;

  for (const item of extraction.items) {
    const text = item.text.trim();

    if (text === '') continue;

    const element = toTextElement(item, canvas, heightPt, index);

    elements.push(element);
    index += 1;
  }

  return { elements, capExceeded: extraction.capExceeded, capBytes: extraction.capBytes };
}

/**
 * Compute the trim-box size in PDF points for the canvas. Mirrors the
 * conversion in `pdf/geometry.ts → canvasToPoints`.
 */
function canvasTrimSizePt(canvas: Canvas): { readonly widthPt: number; readonly heightPt: number } {
  switch (canvas.unit) {
    case 'mm':
      return { widthPt: canvas.width * PT_PER_MM, heightPt: canvas.height * PT_PER_MM };
    case 'in':
      return { widthPt: canvas.width * PT_PER_IN, heightPt: canvas.height * PT_PER_IN };
    case 'px':
      return {
        widthPt: (canvas.width / canvas.dpi) * PT_PER_IN,
        heightPt: (canvas.height / canvas.dpi) * PT_PER_IN,
      };
  }
}

/**
 * PDF points back to the canvas's declared unit (mm / in / px).
 */
function ptToCanvasUnit(valuePt: number, canvas: Canvas): number {
  switch (canvas.unit) {
    case 'mm':
      return valuePt / PT_PER_MM;
    case 'in':
      return valuePt / PT_PER_IN;
    case 'px':
      return (valuePt / PT_PER_IN) * canvas.dpi;
  }
}

function toTextElement(
  item: ExtractedTextItem,
  canvas: Canvas,
  heightPt: number,
  index: number,
): BroadsetElement {
  const lineHeightPt = Math.max(item.fontSizePt * APPROX_LINE_HEIGHT_MULTIPLIER, MIN_LINE_HEIGHT_PT);
  const approxWidthPt = Math.max(
    item.text.length * item.fontSizePt * APPROX_CHAR_WIDTH_RATIO,
    MIN_ELEMENT_SIDE_PT,
  );
  const approxHeightPt = Math.max(lineHeightPt, MIN_ELEMENT_SIDE_PT);

  // Y-flip: PDF Y is up, Broadset Y is down. The text item's `yPt` is
  // the baseline of the text run; compensate by subtracting from the
  // page height and shifting up by the ascent (approximated as the
  // font size).
  const topYPt = heightPt - item.yPt - item.fontSizePt;

  const positionX = ptToCanvasUnit(item.xPt, canvas);
  const positionY = ptToCanvasUnit(topYPt, canvas);
  const widthCanvas = ptToCanvasUnit(approxWidthPt, canvas);
  const heightCanvas = ptToCanvasUnit(approxHeightPt, canvas);
  const fontSizeCanvas = ptToCanvasUnit(item.fontSizePt, canvas);

  return createDefaultElement('text', {
    id: `pdf-imported-text-${String(index)}`,
    name: `Text ${String(index + 1)}`,
    position: { x: positionX, y: positionY },
    width: widthCanvas,
    height: heightCanvas,
    content: item.text,
    style: {
      fontSize: fontSizeCanvas,
    },
    extensions: {
      pdf: { dirty: false, sourceKind: 'third-party-operator' },
    },
  });
}
