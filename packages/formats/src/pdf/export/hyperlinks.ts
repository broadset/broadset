import type { BroadsetElement, Canvas } from '@broadset/model';
import { type PDFDocument, PDFName, type PDFPage, PDFString } from 'pdf-lib';

import type { CanvasAbsolutePosition } from './geometry';
import { elementTopLeftPt } from './page-layout';

/**
 * Read the URL hyperlink an element opts into via
 * `extensions.pdf.link`. The exporter wraps the element's painted
 * region with a `/Annot /Subtype /Link /A << /S /URI /URI <url> >>`
 * annotation so PDF readers turn the area into a clickable target.
 *
 * Returns `undefined` when the element doesn't carry a link
 * extension or the value is not a non-empty string.
 */
export function readElementLink(element: BroadsetElement): string | undefined {
  const extensions = element.extensions as Readonly<Record<string, unknown>> | undefined;

  if (extensions === undefined) return undefined;

  const pdfExt = extensions['pdf'];

  if (pdfExt === null || pdfExt === undefined || typeof pdfExt !== 'object') return undefined;

  const link = (pdfExt as Record<string, unknown>)['link'];

  if (typeof link !== 'string' || link.length === 0) return undefined;

  return link;
}

/**
 * Emit a `/Annot /Subtype /Link` annotation covering the element's
 * painted bounding box, pointing at `url`. The annotation is
 * registered with the document context and appended to the page's
 * `/Annots` array (created if absent). PDF readers turn the
 * annotation region into a clickable hyperlink that opens `url` via
 * the URI action.
 *
 * Borders are forced to zero (`/Border [0 0 0]`) so the annotation
 * doesn't paint a default outline over the element's own visual.
 */
export function emitLinkAnnotation(
  pdf: PDFDocument,
  page: PDFPage,
  element: BroadsetElement,
  absolute: CanvasAbsolutePosition,
  canvas: Canvas,
  trimHeightPt: number,
  url: string,
): void {
  const { xPt, yPt, wPt, hPt } = elementTopLeftPt(absolute, element, canvas, trimHeightPt);
  const annotationDict = pdf.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    // /Rect is [llx lly urx ury] — lower-left and upper-right in
    // page coordinates (origin bottom-left).
    Rect: [xPt, yPt, xPt + wPt, yPt + hPt],
    // No visible border; the annotation just makes the region
    // clickable.
    Border: [0, 0, 0],
    A: pdf.context.obj({
      Type: 'Action',
      S: 'URI',
      URI: PDFString.of(url),
    }),
  });
  const annotationRef = pdf.context.register(annotationDict);
  const annotsArray = readOrCreateAnnotsArray(pdf, page);

  annotsArray.push(annotationRef);
}

interface PageAnnotsLike {
  push(ref: unknown): void;
}

function readOrCreateAnnotsArray(pdf: PDFDocument, page: PDFPage): PageAnnotsLike {
  const ANNOTS_KEY = PDFName.of('Annots');
  const existing = page.node.get(ANNOTS_KEY);

  if (existing !== undefined && hasPushMethod(existing)) {
    return existing;
  }

  const fresh = pdf.context.obj([]);

  page.node.set(ANNOTS_KEY, fresh);

  if (!hasPushMethod(fresh)) {
    throw new TypeError('expected pdf.context.obj([]) to produce a PDFArray with .push');
  }

  return fresh;
}

function hasPushMethod(value: unknown): value is PageAnnotsLike {
  return value !== null && typeof value === 'object' && 'push' in value && typeof (value as { push: unknown }).push === 'function';
}
