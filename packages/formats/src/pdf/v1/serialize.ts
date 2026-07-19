import { projectFormatV1 } from '@broadset/model';
import fontkit from '@pdf-lib/fontkit';
import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFImage,
  PDFName,
  PDFRawStream,
  PDFString,
  type RGB,
  rgb,
  StandardFonts,
} from 'pdf-lib';

interface PdfWriterOptionsV1 {
  readonly fontBytesByFamily?: ReadonlyMap<string, Uint8Array> | undefined;
  readonly subsetFonts?: boolean | undefined;
  readonly pdfaConformance?: '2b' | '2u' | '2a' | undefined;
}

interface PdfSerializationResultV1 {
  readonly bytes: Uint8Array;
  readonly warnings: readonly string[];
}

interface PdfWriterContextV1 {
  readonly pdf: PDFDocument;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
  readonly options: PdfWriterOptionsV1;
  readonly fonts: Map<projectFormatV1.Id, PDFFont>;
  readonly images: Map<projectFormatV1.Id, PDFImage>;
  readonly warnings: string[];
}

interface ElementFrameV1 {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

function points(document: projectFormatV1.BroadsetDocumentV1, value: number): number {
  if (document.surface.unit === 'in') return value * 72;
  if (document.surface.unit === 'mm') return (value * 72) / 25.4;

  return (value * 72) / document.surface.dpi;
}

function frame(input: {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly element: projectFormatV1.Element;
}): ElementFrameV1 {
  const transform = input.element.geometry.transform;
  const matrix = transform.kind === 'affine2d' ? transform.matrix : [
    transform.matrix[0],
    transform.matrix[1],
    transform.matrix[4],
    transform.matrix[5],
    transform.matrix[12],
    transform.matrix[13],
  ];
  const [a, b, c, d, x, y] = matrix;
  const width = points(input.document, input.element.geometry.bounds.width * Math.hypot(a, b));
  const height = points(input.document, input.element.geometry.bounds.height * Math.hypot(c, d));
  const pageHeight = points(input.document, input.document.surface.size[1]);

  return {
    x: points(input.document, x),
    y: pageHeight - points(input.document, y) - height,
    width: Math.max(0.000001, width),
    height: Math.max(0.000001, height),
    rotation: -(Math.atan2(b, a) * 180) / Math.PI,
  };
}

function concreteColor(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly color: projectFormatV1.ColorValue;
}): projectFormatV1.ConcreteColorValue | undefined {
  const color = input.color;

  if (color.kind === 'color') return color;

  const swatch = input.project.resources.swatches.find(({ id }) => id === color.swatchId);

  if (swatch === undefined) return undefined;

  return swatch.kind === 'process' ? swatch.color : swatch.alternateColor;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pdfColor(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly color: projectFormatV1.ColorValue;
  readonly warnings: string[];
}): RGB {
  const color = concreteColor(input);

  if (color === undefined) {
    input.warnings.push('PDF v1 export: an unresolved swatch used a black fallback.');

    return rgb(0, 0, 0);
  }

  if (color.space === 'gray') {
    const channel = clamp(color.channels[0] ?? 0);

    return rgb(channel, channel, channel);
  }

  if (color.space !== 'srgb' && color.space !== 'display-p3' && color.space !== 'rec2020') {
    input.warnings.push(`PDF v1 export: ${color.space} color used a diagnosed RGB channel fallback.`);
  }

  return rgb(
    clamp(color.channels[0] ?? 0),
    clamp(color.channels[1] ?? 0),
    clamp(color.channels[2] ?? 0),
  );
}

function paintColor(input: {
  readonly context: PdfWriterContextV1;
  readonly paint: projectFormatV1.Paint;
}): RGB | undefined {
  if (input.paint.kind === 'solid') {
    return pdfColor({ project: input.context.project, color: input.paint.color, warnings: input.context.warnings });
  }

  if (input.paint.kind === 'gradient') {
    const stop = input.paint.gradient.stops[0];

    input.context.warnings.push('PDF v1 export: a gradient used its first stop as an editable fallback.');

    return stop === undefined
      ? undefined
      : pdfColor({ project: input.context.project, color: stop.color, warnings: input.context.warnings });
  }

  if (input.paint.kind !== 'none') {
    input.context.warnings.push(`PDF v1 export: ${input.paint.kind} paint used a no-fill fallback.`);
  }

  return undefined;
}

function appearance(input: {
  readonly context: PdfWriterContextV1;
  readonly element: projectFormatV1.Element;
}): {
  readonly fill: RGB | undefined;
  readonly stroke: RGB | undefined;
  readonly strokeWidth: number;
  readonly opacity: number;
} {
  const fillLayer = input.element.appearance.fills.find(({ enabled }) => enabled);
  const strokeLayer = input.element.appearance.strokes.find(({ enabled }) => enabled);

  return {
    fill: fillLayer === undefined ? undefined : paintColor({ context: input.context, paint: fillLayer.paint }),
    stroke: strokeLayer === undefined ? undefined : paintColor({ context: input.context, paint: strokeLayer.paint }),
    strokeWidth: strokeLayer === undefined ? 0 : points(input.context.document, Math.max(0, strokeLayer.width)),
    opacity: clamp(input.element.appearance.opacity * (fillLayer?.opacity ?? 1)),
  };
}

function structuredPath(path: projectFormatV1.StructuredPath): string {
  const pointsById = new Map(path.points.map((point) => [point.id, point]));
  const commands: string[] = [];

  for (const segment of path.segments) {
    if (segment.kind === 'close') {
      commands.push('Z');
      continue;
    }

    const point = pointsById.get(segment.pointId);

    if (point === undefined) continue;

    if (segment.kind === 'move') commands.push(`M ${String(point.x)} ${String(point.y)}`);
    else if (segment.kind === 'line') commands.push(`L ${String(point.x)} ${String(point.y)}`);
    else if (segment.kind === 'quadratic') {
      commands.push(`Q ${String(segment.control[0])} ${String(segment.control[1])} ${String(point.x)} ${String(point.y)}`);
    } else if ('control1' in segment && 'control2' in segment) {
      commands.push(
        `C ${String(segment.control1[0])} ${String(segment.control1[1])} ${String(segment.control2[0])} ${String(segment.control2[1])} ${String(point.x)} ${String(point.y)}`,
      );
    }
  }

  if (path.closed && commands.at(-1) !== 'Z') commands.push('Z');

  return commands.join(' ');
}

function drawVector(input: {
  readonly context: PdfWriterContextV1;
  readonly page: ReturnType<PDFDocument['addPage']>;
  readonly element: projectFormatV1.VectorElement;
}): void {
  const elementFrame = frame({ document: input.context.document, element: input.element });
  const style = appearance({ context: input.context, element: input.element });
  const options = {
    x: elementFrame.x,
    y: elementFrame.y,
    borderWidth: style.strokeWidth,
    opacity: style.opacity,
    borderOpacity: clamp(input.element.appearance.opacity),
    rotate: degrees(elementFrame.rotation),
    ...(style.fill === undefined ? {} : { color: style.fill }),
    ...(style.stroke === undefined ? {} : { borderColor: style.stroke }),
  };

  if (input.element.geometryData.kind === 'ellipse') {
    input.page.drawEllipse({
      ...options,
      x: elementFrame.x + elementFrame.width / 2,
      y: elementFrame.y + elementFrame.height / 2,
      xScale: elementFrame.width / 2,
      yScale: elementFrame.height / 2,
    });

    return;
  }

  if (input.element.geometryData.kind === 'path') {
    input.page.drawSvgPath(structuredPath(input.element.geometryData.path), {
      ...options,
      scale: points(input.context.document, 1),
    });

    return;
  }

  if (input.element.geometryData.kind === 'boolean') {
    input.context.warnings.push('PDF v1 export: boolean vector geometry used an editable rectangle fallback.');
  }

  input.page.drawRectangle({ ...options, width: elementFrame.width, height: elementFrame.height });
}

function normalizeFamily(value: string): string {
  return value.trim().replace(/^['"]|['"]$/gu, '').toLowerCase();
}

async function fontForRun(input: {
  readonly context: PdfWriterContextV1;
  readonly run: projectFormatV1.TextRun;
}): Promise<PDFFont> {
  const cached = input.context.fonts.get(input.run.properties.fontFaceId);

  if (cached !== undefined) return cached;

  const family = input.context.project.resources.fonts.find(({ id }) => id === input.run.properties.fontFamilyId);
  const face = family?.faces.find(({ id }) => id === input.run.properties.fontFaceId) ?? family?.faces[0];
  let bytes = family === undefined ? undefined : input.context.options.fontBytesByFamily?.get(normalizeFamily(family.familyName));

  if (bytes === undefined && face?.source.kind === 'asset') {
    const assetId = face.source.assetId;
    const asset = input.context.project.resources.assets.find(
      (candidate) => candidate.id === assetId && candidate.kind === 'font',
    );

    if (asset?.kind === 'font') bytes = await input.context.resolveBlob(asset.blob.digest);
  }

  let font: PDFFont;

  if (bytes === undefined) {
    font = await input.context.pdf.embedFont(StandardFonts.Helvetica);
  } else {
    try {
      font = await input.context.pdf.embedFont(bytes, { subset: input.context.options.subsetFonts ?? true });
    } catch {
      input.context.warnings.push(`PDF v1 export: font ${family?.familyName ?? face?.id ?? 'unknown'} failed to embed; falling back to Helvetica.`);
      font = await input.context.pdf.embedFont(StandardFonts.Helvetica);
    }
  }

  input.context.fonts.set(input.run.properties.fontFaceId, font);

  return font;
}

async function drawText(input: {
  readonly context: PdfWriterContextV1;
  readonly page: ReturnType<PDFDocument['addPage']>;
  readonly element: projectFormatV1.TextElement;
}): Promise<void> {
  const elementFrame = frame({ document: input.context.document, element: input.element });
  let y = elementFrame.y + elementFrame.height;

  for (const paragraph of input.element.text.paragraphs) {
    let x = elementFrame.x;
    let lineHeight = 0;

    for (const run of paragraph.runs) {
      if (run.text === '') continue;

      const font = await fontForRun({ context: input.context, run });
      const size = points(input.context.document, run.properties.size);
      const color = pdfColor({
        project: input.context.project,
        color: run.properties.color,
        warnings: input.context.warnings,
      });

      input.page.drawText(run.text, {
        x,
        y: y - size,
        size,
        font,
        color,
        opacity: clamp(input.element.appearance.opacity),
        rotate: degrees(elementFrame.rotation),
      });
      x += font.widthOfTextAtSize(run.text, size);
      lineHeight = Math.max(lineHeight, size * 1.2);
    }

    y -= lineHeight;
  }
}

async function imageForElement(input: {
  readonly context: PdfWriterContextV1;
  readonly element: projectFormatV1.ImageElement;
}): Promise<PDFImage | undefined> {
  const cached = input.context.images.get(input.element.image.assetId);

  if (cached !== undefined) return cached;

  const asset = input.context.project.resources.assets.find(
    (candidate) => candidate.id === input.element.image.assetId && candidate.kind === 'image',
  );

  if (asset?.kind !== 'image') {
    input.context.warnings.push(`PDF v1 export: image asset ${input.element.image.assetId} is missing.`);

    return undefined;
  }

  const bytes = await input.context.resolveBlob(asset.blob.digest);

  if (bytes === undefined) {
    input.context.warnings.push(`PDF v1 export: blob ${asset.blob.digest} is unavailable.`);

    return undefined;
  }

  try {
    let image: PDFImage | undefined;

    if (asset.blob.mediaType === 'image/png') image = await input.context.pdf.embedPng(bytes);
    else if (asset.blob.mediaType === 'image/jpeg') image = await input.context.pdf.embedJpg(bytes);

    if (image === undefined) {
      input.context.warnings.push(`PDF v1 export: ${asset.blob.mediaType} image used an omitted fallback.`);

      return undefined;
    }

    input.context.images.set(input.element.image.assetId, image);

    return image;
  } catch {
    input.context.warnings.push(`PDF v1 export: image asset ${asset.id} could not be embedded.`);

    return undefined;
  }
}

async function drawImage(input: {
  readonly context: PdfWriterContextV1;
  readonly page: ReturnType<PDFDocument['addPage']>;
  readonly element: projectFormatV1.ImageElement;
}): Promise<void> {
  const image = await imageForElement({ context: input.context, element: input.element });

  if (image === undefined) return;

  const elementFrame = frame({ document: input.context.document, element: input.element });

  input.page.drawImage(image, {
    x: elementFrame.x,
    y: elementFrame.y,
    width: elementFrame.width,
    height: elementFrame.height,
    opacity: clamp(input.element.appearance.opacity),
    rotate: degrees(elementFrame.rotation),
  });
}

async function attachOutputIntent(context: PdfWriterContextV1): Promise<void> {
  if (context.options.pdfaConformance === undefined) return;

  const declared = context.document.color.outputIntent;
  const asset = declared === undefined
    ? undefined
    : context.project.resources.assets.find(
        (candidate) => candidate.id === declared.iccProfileAssetId && candidate.kind === 'icc-profile',
      );
  const bytes = asset?.kind === 'icc-profile' ? await context.resolveBlob(asset.blob.digest) : undefined;

  if (bytes === undefined || asset?.kind !== 'icc-profile') {
    context.warnings.push('PDF v1 export: PDF/A output intent profile is unavailable.');

    return;
  }

  const colorSpace = asset.metadata.colorSpace.toLowerCase();
  let components = 3;

  if (colorSpace.includes('cmyk')) components = 4;
  else if (colorSpace.includes('gray')) components = 1;

  const profile = PDFRawStream.of(context.pdf.context.obj({ N: components, Length: bytes.byteLength }), bytes);
  const profileRef = context.pdf.context.register(profile);
  const identifier = asset.metadata.identifier;
  const dictionary = context.pdf.context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of(identifier),
    Info: PDFString.of(identifier),
    DestOutputProfile: profileRef,
  });

  context.pdf.catalog.set(PDFName.of('OutputIntents'), context.pdf.context.obj([dictionary]));
}

async function drawElement(input: {
  readonly context: PdfWriterContextV1;
  readonly page: ReturnType<PDFDocument['addPage']>;
  readonly element: projectFormatV1.Element;
}): Promise<void> {
  if (input.element.kind === 'vector') drawVector({ ...input, element: input.element });
  else if (input.element.kind === 'text') await drawText({ ...input, element: input.element });
  else if (input.element.kind === 'image') await drawImage({ ...input, element: input.element });
  else if (input.element.kind !== 'group') {
    input.context.warnings.push(`PDF v1 export: ${input.element.kind} used an omitted fallback.`);
  }
}

export async function serializePdfProjectV1(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly page: projectFormatV1.PageDefinition;
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
  readonly options: PdfWriterOptionsV1;
}): Promise<PdfSerializationResultV1> {
  const pdf = await PDFDocument.create();

  pdf.registerFontkit(fontkit);

  const page = pdf.addPage([
    points(input.document, input.document.surface.size[0]),
    points(input.document, input.document.surface.size[1]),
  ]);
  const context: PdfWriterContextV1 = {
    pdf,
    project: input.project,
    document: input.document,
    resolveBlob: input.resolveBlob,
    options: input.options,
    fonts: new Map(),
    images: new Map(),
    warnings: [],
  };
  const background = paintColor({ context, paint: input.document.surface.background });

  if (background !== undefined) {
    page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: background });
  }

  const instances = projectFormatV1.resolvePageInstanceTree({
    project: input.project,
    documentId: input.document.id,
    pageId: input.page.id,
  });

  for (const instance of instances) {
    if (instance.visible) await drawElement({ context, page, element: instance.element });
  }

  await attachOutputIntent(context);

  return { bytes: await pdf.save({ useObjectStreams: false }), warnings: context.warnings };
}
