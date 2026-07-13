import {
  type BroadsetColor,
  broadsetColorSchema,
  type BroadsetDocument,
  type BroadsetElement,
  type BroadsetElementStyle,
  type FontAsset,
  isTextBody,
} from '@broadset/model';

export type PptxSourceColor = BroadsetColor;
export type PptxSourceDocument = BroadsetDocument;
export type PptxSourceElement = BroadsetElement;
export type PptxSourceStyle = BroadsetElementStyle;
export type PptxEmbeddedFontAsset = FontAsset;

export const pptxSourceColorSchema = broadsetColorSchema;
export const isPptxSourceTextBody = isTextBody;
