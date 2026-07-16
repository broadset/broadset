import type { projectFormatV1 } from '@broadset/model';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  type PDFDocument,
  PDFName,
  PDFNumber,
  type PDFPage,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';

import { readPageContentChunks, scanContentStreamForText } from '../import/operators';
import { encodeRgbPngV1 } from './encode-png';
import { parsePdfOperatorsV1 } from './parse-operators';
import type { ParsedPdfDocumentV1, PdfImageResourceV1, PdfTextItemV1 } from './types';

const MAX_OPERATOR_BYTES = 16 * 1024 * 1024;
const MAX_DECODED_IMAGE_PIXELS = 16 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 1;

function diagnostic(code: string, message: string, dimension: 'appearance' | 'semantics'): projectFormatV1.InteropDiagnostic {
  return { code, severity: 'warning', message, dimension, pointer: '/' };
}

function filterNames(stream: PDFRawStream): readonly string[] {
  const filter = stream.dict.get(PDFName.of('Filter'));

  if (filter instanceof PDFName) return [filter.decodeText()];
  if (!(filter instanceof PDFArray)) return [];

  const names: string[] = [];

  for (let index = 0; index < filter.size(); index += 1) {
    const entry = filter.get(index);

    if (entry instanceof PDFName) names.push(entry.decodeText());
  }

  return names;
}

function imageMediaType(stream: PDFRawStream): string | undefined {
  const filters = filterNames(stream);

  if (filters.length !== 1) return undefined;
  if (filters[0] === 'DCTDecode') return 'image/jpeg';
  if (filters[0] === 'JPXDecode') return 'image/jp2';
  if (filters[0] === 'JBIG2Decode') return 'image/jbig2';

  return undefined;
}

function decodedRgb(input: {
  readonly stream: PDFRawStream;
  readonly width: number;
  readonly height: number;
}): Uint8Array | undefined {
  const bits = input.stream.dict.lookupMaybe(PDFName.of('BitsPerComponent'), PDFNumber)?.asNumber();
  const colorSpace = input.stream.dict.lookupMaybe(PDFName.of('ColorSpace'), PDFName)?.decodeText();

  if (bits !== 8 || colorSpace === undefined) return undefined;

  if (input.height > MAX_DECODED_IMAGE_PIXELS || input.width > Math.floor(MAX_DECODED_IMAGE_PIXELS / input.height)) {
    return undefined;
  }

  let decoded: Uint8Array;

  try {
    decoded = decodePDFRawStream(input.stream).decode();
  } catch {
    return undefined;
  }

  const pixelCount = input.width * input.height;
  const rgb = new Uint8Array(pixelCount * 3);

  if (colorSpace === 'DeviceRGB' && decoded.byteLength >= rgb.byteLength) {
    rgb.set(decoded.subarray(0, rgb.byteLength));

    return rgb;
  }

  if (colorSpace === 'DeviceGray' && decoded.byteLength >= pixelCount) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const gray = decoded[pixel] ?? 0;
      const offset = pixel * 3;

      rgb[offset] = gray;
      rgb[offset + 1] = gray;
      rgb[offset + 2] = gray;
    }

    return rgb;
  }

  if (colorSpace === 'DeviceCMYK' && decoded.byteLength >= pixelCount * 4) {
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
      const sourceOffset = pixel * 4;
      const targetOffset = pixel * 3;
      const cyan = (decoded[sourceOffset] ?? 0) / 255;
      const magenta = (decoded[sourceOffset + 1] ?? 0) / 255;
      const yellow = (decoded[sourceOffset + 2] ?? 0) / 255;
      const black = (decoded[sourceOffset + 3] ?? 0) / 255;

      rgb[targetOffset] = Math.round(255 * (1 - Math.min(1, cyan + black)));
      rgb[targetOffset + 1] = Math.round(255 * (1 - Math.min(1, magenta + black)));
      rgb[targetOffset + 2] = Math.round(255 * (1 - Math.min(1, yellow + black)));
    }

    return rgb;
  }

  return undefined;
}

function positiveInteger(value: number | undefined): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_PAGE_SIZE;
}

function extractedImageBytes(input: {
  readonly stream: PDFRawStream;
  readonly mediaType: string | undefined;
  readonly rgb: Uint8Array | undefined;
  readonly width: number;
  readonly height: number;
}): Uint8Array | undefined {
  if (input.mediaType !== undefined) return Uint8Array.from(input.stream.contents);
  if (input.rgb === undefined) return undefined;

  return encodeRgbPngV1({ rgb: input.rgb, width: input.width, height: input.height });
}

function finiteDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PAGE_SIZE;
}

function finiteCoordinate(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function imageResource(stream: PDFRawStream): PdfImageResourceV1 | undefined {
  const subtype = stream.dict.lookupMaybe(PDFName.of('Subtype'), PDFName);

  if (subtype?.decodeText() !== 'Image') return undefined;

  const width = stream.dict.lookupMaybe(PDFName.of('Width'), PDFNumber)?.asNumber();
  const height = stream.dict.lookupMaybe(PDFName.of('Height'), PDFNumber)?.asNumber();
  const mediaType = imageMediaType(stream);
  const pixelWidth = positiveInteger(width);
  const pixelHeight = positiveInteger(height);
  const rgb = mediaType === undefined ? decodedRgb({ stream, width: pixelWidth, height: pixelHeight }) : undefined;
  const warnings: projectFormatV1.InteropDiagnostic[] = [];

  if (stream.dict.has(PDFName.of('SMask')) || stream.dict.has(PDFName.of('Mask'))) {
    warnings.push(diagnostic(
      'pdf.image-transparency-omitted',
      'PDF image transparency could not be represented in the decoded raster fallback.',
      'appearance',
    ));
  }

  if (stream.dict.has(PDFName.of('Decode'))) {
    warnings.push(diagnostic(
      'pdf.image-decode-range-omitted',
      'PDF image decode ranges could not be applied to the decoded raster fallback.',
      'appearance',
    ));
  }

  return {
    bytes: extractedImageBytes({ stream, mediaType, rgb, width: pixelWidth, height: pixelHeight }),
    mediaType: mediaType ?? (rgb === undefined ? 'application/octet-stream' : 'image/png'),
    pixelSize: [pixelWidth, pixelHeight],
    warnings,
  };
}

function resolveStream(pdf: PDFDocument, value: unknown): PDFRawStream | undefined {
  if (value instanceof PDFRawStream) return value;
  if (!(value instanceof PDFRef)) return undefined;

  const resolved = pdf.context.lookup(value);

  return resolved instanceof PDFRawStream ? resolved : undefined;
}

interface PdfXObjectResourcesV1 {
  readonly images: ReadonlyMap<string, PdfImageResourceV1>;
  readonly nonImageNames: ReadonlySet<string>;
}

function collectImageResources(pdf: PDFDocument, page: PDFPage): PdfXObjectResourcesV1 {
  const images = new Map<string, PdfImageResourceV1>();
  const nonImageNames = new Set<string>();
  const resources = page.node.Resources();
  const xObjects = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);

  if (xObjects === undefined) return { images, nonImageNames };

  for (const [name, value] of xObjects.entries()) {
    const stream = resolveStream(pdf, value);
    const image = stream === undefined ? undefined : imageResource(stream);

    if (image === undefined) nonImageNames.add(name.decodeText());
    else images.set(name.decodeText(), image);
  }

  return { images, nonImageNames };
}

function resolveDictionary(pdf: PDFDocument, value: unknown): PDFDict | undefined {
  if (value instanceof PDFDict) return value;
  if (!(value instanceof PDFRef)) return undefined;

  const resolved = pdf.context.lookup(value);

  return resolved instanceof PDFDict ? resolved : undefined;
}

function removeSubsetPrefix(name: string): string {
  const plus = name.indexOf('+');
  const prefix = plus < 0 ? '' : name.slice(0, plus);
  const subsetPrefix = prefix.length === 6 && Array.from(prefix).every((character) => character >= 'A' && character <= 'Z');

  return subsetPrefix ? name.slice(plus + 1) : name;
}

function collectFontNames(pdf: PDFDocument, page: PDFPage): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);

  if (fonts === undefined) return names;

  for (const [alias, value] of fonts.entries()) {
    const dictionary = resolveDictionary(pdf, value);
    const baseFont = dictionary?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText();

    if (baseFont !== undefined) names.set(alias.decodeText(), removeSubsetPrefix(baseFont));
  }

  return names;
}

function safePages(pdf: PDFDocument): readonly PDFPage[] {
  try {
    return pdf.getPages();
  } catch {
    return [];
  }
}

export function parsePdfDocumentV1(pdf: PDFDocument): ParsedPdfDocumentV1 | undefined {
  const pages = safePages(pdf);
  const page = pages[0];

  if (page === undefined) return undefined;

  const mediaBox = page.getMediaBox();
  const read = readPageContentChunks(pdf, page, 0);
  const acceptedChunks: Uint8Array[] = [];
  const warnings: projectFormatV1.InteropDiagnostic[] = read.warnings.map((message) =>
    diagnostic('pdf.content-stream-warning', message, 'semantics'),
  );
  let byteLength = 0;

  for (const chunk of read.chunks) {
    if (byteLength + chunk.byteLength > MAX_OPERATOR_BYTES) {
      warnings.push(diagnostic(
        'pdf.operator-limit',
        `PDF content exceeded the ${String(MAX_OPERATOR_BYTES)} byte operator limit; page content is partial.`,
        'semantics',
      ));
      break;
    }

    acceptedChunks.push(chunk);
    byteLength += chunk.byteLength;
  }

  const content = acceptedChunks.map((chunk) => new TextDecoder('latin1').decode(chunk)).join('\n');
  const parsed = parsePdfOperatorsV1(content);
  const extractedText = scanContentStreamForText(content);
  const textItems: PdfTextItemV1[] = extractedText.map((item, index) => {
    const state = parsed.textStates[index];

    return state === undefined
      ? {
          text: item.text,
          fontName: item.fontName,
          fontSize: item.fontSizePt,
          color: { space: 'gray', channels: [0] },
          transform: [1, 0, 0, 1, item.xPt, item.yPt],
        }
      : { text: item.text, ...state };
  });
  const xObjects = collectImageResources(pdf, page);

  for (const resourceName of xObjects.nonImageNames) {
    if (parsed.imageUses.some((use) => use.resourceName === resourceName)) {
      warnings.push(diagnostic(
        'pdf.form-xobject-omitted',
        `PDF Form XObject ${resourceName} could not be mapped as a native image and was omitted.`,
        'semantics',
      ));
    }
  }

  return {
    pageCount: pages.length,
    page: {
      width: finiteDimension(mediaBox.width),
      height: finiteDimension(mediaBox.height),
      mediaBoxX: finiteCoordinate(mediaBox.x),
      mediaBoxY: finiteCoordinate(mediaBox.y),
      textItems,
      fontNames: collectFontNames(pdf, page),
      paths: parsed.paths,
      imageUses: parsed.imageUses.filter(({ resourceName }) => xObjects.images.has(resourceName)),
      images: xObjects.images,
      warnings,
    },
  };
}
