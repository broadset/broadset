import type { projectFormatV1 } from '@broadset/model';

export type PdfMatrixV1 = readonly [number, number, number, number, number, number];
export type PdfColorV1 =
  | { readonly space: 'gray'; readonly channels: readonly [number] }
  | { readonly space: 'rgb'; readonly channels: readonly [number, number, number] }
  | { readonly space: 'cmyk'; readonly channels: readonly [number, number, number, number] };

export type PdfPathCommandV1 =
  | { readonly kind: 'move' | 'line'; readonly point: readonly [number, number] }
  | {
      readonly kind: 'cubic';
      readonly control1: readonly [number, number];
      readonly control2: readonly [number, number];
      readonly point: readonly [number, number];
    }
  | { readonly kind: 'close' };

export interface PdfPathV1 {
  readonly commands: readonly PdfPathCommandV1[];
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly fill: PdfColorV1 | undefined;
  readonly stroke: PdfColorV1 | undefined;
  readonly lineWidth: number;
}

export interface PdfImageUseV1 {
  readonly resourceName: string;
  readonly transform: PdfMatrixV1;
}

export interface PdfImageResourceV1 {
  readonly bytes: Uint8Array | undefined;
  readonly mediaType: string;
  readonly pixelSize: readonly [number, number];
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
}

export interface PdfTextItemV1 {
  readonly text: string;
  readonly fontName: string;
  readonly fontSize: number;
  readonly color: PdfColorV1;
  readonly transform: PdfMatrixV1;
}

export interface ParsedPdfPageV1 {
  readonly width: number;
  readonly height: number;
  readonly mediaBoxX: number;
  readonly mediaBoxY: number;
  readonly textItems: readonly PdfTextItemV1[];
  readonly fontNames: ReadonlyMap<string, string>;
  readonly paths: readonly PdfPathV1[];
  readonly imageUses: readonly PdfImageUseV1[];
  readonly images: ReadonlyMap<string, PdfImageResourceV1>;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
}

export interface ParsedPdfDocumentV1 {
  readonly page: ParsedPdfPageV1;
  readonly pageCount: number;
}

export interface PdfFontReferenceV1 {
  readonly familyId: projectFormatV1.Id;
  readonly faceId: projectFormatV1.Id;
}

export interface PdfFontRegistryV1 {
  getFont(input: { readonly family: string; readonly weight: number }): PdfFontReferenceV1;
}

export interface PdfMappedElementV1 {
  readonly element: projectFormatV1.Element;
  readonly warnings: readonly projectFormatV1.InteropDiagnostic[];
  readonly mappingConfidence: number;
  readonly editability: 'native' | 'partial' | 'appearance-only';
}
