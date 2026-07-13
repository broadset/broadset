import {
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyleInput,
  type BroadsetGradient,
  createDefaultElement,
  parseColor,
} from '@broadset/model';

export type PdfSourceDocument = BroadsetDocument;
export type PdfSourceElement = BroadsetElement;
export type PdfSourceStyleInput = BroadsetElementStyleInput;
export type PdfSourceGradient = BroadsetGradient;

export const createPdfSourceElement = createDefaultElement;
export const parsePdfSourceColor = parseColor;
