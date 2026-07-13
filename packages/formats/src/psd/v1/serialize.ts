import { projectFormatV1 } from '@broadset/model';
import type { Color, Layer, LinkedFile, Psd, TextStyle, TextStyleRun } from 'ag-psd';
import { writePsdUint8Array } from 'ag-psd';

import { ensureCanvasInitialized } from '../runtime-canvas';
import { buildEllipseMask, buildRectangleMask, buildRoundedRectMask, svgPathToPsdVectorMask } from '../vector-mask';

export interface PsdSerializationResultV1 {
  readonly bytes: Uint8Array;
  readonly warnings: readonly string[];
}

interface SerializationContext {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
  readonly warnings: string[];
  readonly linkedFiles: Map<string, LinkedFile>;
}

interface ElementFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

interface LayerStackEntry {
  readonly depth: number;
  readonly children: Layer[];
}

function byte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function concreteColor(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly value: projectFormatV1.ColorValue;
}): projectFormatV1.ConcreteColorValue | undefined {
  if (input.value.kind === 'color') return input.value;

  const swatchId: projectFormatV1.Id = input.value.swatchId;
  const swatch = input.project.resources.swatches.find(({ id }) => id === swatchId);

  if (swatch === undefined) return undefined;

  return swatch.kind === 'process' ? swatch.color : swatch.alternateColor;
}

function psdColor(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly value: projectFormatV1.ColorValue;
}): Color | undefined {
  const color = concreteColor(input);

  if (color === undefined) return undefined;

  if (color.space === 'gray') {
    const channel = byte(color.channels[0] ?? 0);

    return { r: channel, g: channel, b: channel };
  }

  if (color.space === 'cmyk') {
    const cyan = color.channels[0] ?? 0;
    const magenta = color.channels[1] ?? 0;
    const yellow = color.channels[2] ?? 0;
    const black = color.channels[3] ?? 0;

    return {
      r: byte((1 - cyan) * (1 - black)),
      g: byte((1 - magenta) * (1 - black)),
      b: byte((1 - yellow) * (1 - black)),
    };
  }

  return { r: byte(color.channels[0] ?? 0), g: byte(color.channels[1] ?? 0), b: byte(color.channels[2] ?? 0) };
}

function firstSolidColor(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly appearance: projectFormatV1.Appearance;
}): Color | undefined {
  const fill = input.appearance.fills.find(({ enabled, paint }) => enabled && paint.kind === 'solid');

  return fill?.paint.kind === 'solid' ? psdColor({ project: input.project, value: fill.paint.color }) : undefined;
}

function elementFrame(element: projectFormatV1.Element): ElementFrame {
  const transform = element.geometry.transform;
  const matrix = transform.kind === 'affine2d' ? transform.matrix : undefined;

  return {
    x: matrix?.[4] ?? 0,
    y: matrix?.[5] ?? 0,
    width: Math.max(1, element.geometry.bounds.width),
    height: Math.max(1, element.geometry.bounds.height),
    rotation: matrix === undefined ? 0 : (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI,
  };
}

function transparentPixels(width: number, height: number): {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
} {
  const pixelWidth = Math.max(1, Math.round(width));
  const pixelHeight = Math.max(1, Math.round(height));

  return { width: pixelWidth, height: pixelHeight, data: new Uint8ClampedArray(pixelWidth * pixelHeight * 4) };
}

function colorPixels(width: number, height: number, color: Color | undefined): {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
} {
  const image = transparentPixels(width, height);

  if (color === undefined || !('r' in color)) return image;

  for (let index = 0; index < image.width * image.height; index += 1) {
    const offset = index * 4;

    image.data[offset] = color.r;
    image.data[offset + 1] = color.g;
    image.data[offset + 2] = color.b;
    image.data[offset + 3] = 255;
  }

  return image;
}

function pathData(path: projectFormatV1.StructuredPath): string {
  const points = new Map(path.points.map((point) => [point.id, point]));

  return path.segments
    .map((segment) => {
      if (segment.kind === 'close') return 'Z';

      const point = points.get(segment.pointId);

      if (point === undefined) return '';
      if (segment.kind === 'move') return `M ${String(point.x)} ${String(point.y)}`;
      if (segment.kind === 'line') return `L ${String(point.x)} ${String(point.y)}`;

      if (segment.kind === 'quadratic') {
        return `Q ${String(segment.control[0])} ${String(segment.control[1])} ${String(point.x)} ${String(point.y)}`;
      }

      if ('control1' in segment) {
        return `C ${String(segment.control1[0])} ${String(segment.control1[1])} ${String(segment.control2[0])} ${String(segment.control2[1])} ${String(point.x)} ${String(point.y)}`;
      }

      return '';
    })
    .filter((command) => command !== '')
    .join(' ');
}

function vectorLayer(input: {
  readonly context: SerializationContext;
  readonly element: projectFormatV1.VectorElement;
  readonly frame: ElementFrame;
}): Partial<Layer> {
  const color = firstSolidColor({ project: input.context.project, appearance: input.element.appearance });
  const data = input.element.geometryData;
  let mask = null;

  if (data.kind === 'rectangle') {
    mask = data.cornerRadii.some((radius) => radius > 0)
      ? buildRoundedRectMask(input.frame.width, input.frame.height, data.cornerRadii)
      : buildRectangleMask(input.frame.width, input.frame.height);
  } else if (data.kind === 'ellipse') {
    mask = buildEllipseMask(input.frame.width, input.frame.height);
  } else if (data.kind === 'path') {
    mask = svgPathToPsdVectorMask(pathData(data.path), input.frame.width, input.frame.height);
  } else {
    input.context.warnings.push(`PSD v1 export: boolean vector ${input.element.id} was emitted as a visual fallback.`);
  }

  return {
    ...(color === undefined ? {} : { vectorFill: { type: 'color', color } }),
    ...(mask === null ? {} : { vectorMask: { paths: [mask] } }),
    imageData: colorPixels(input.frame.width, input.frame.height, color),
  };
}

function textStyle(input: {
  readonly context: SerializationContext;
  readonly properties: projectFormatV1.RunProperties;
}): TextStyle {
  const family = input.context.project.resources.fonts.find(({ id }) => id === input.properties.fontFamilyId);
  const color = psdColor({ project: input.context.project, value: input.properties.color });

  return {
    fontSize: input.properties.size,
    fauxBold: input.properties.weight >= 600,
    fauxItalic: input.properties.semanticRole === 'emphasis',
    underline: input.properties.decoration.underline,
    strikethrough: input.properties.decoration.strikeThrough,
    tracking: input.properties.tracking,
    ...(family === undefined ? {} : { font: { name: family.familyName } }),
    ...(color === undefined ? {} : { fillColor: color }),
  };
}

function textLayer(input: {
  readonly context: SerializationContext;
  readonly element: projectFormatV1.TextElement;
  readonly frame: ElementFrame;
}): Partial<Layer> {
  const parts: string[] = [];
  const styleRuns: TextStyleRun[] = [];

  input.element.text.paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) {
      parts.push('\r');
      styleRuns.push({ length: 1, style: {} });
    }

    paragraph.runs.forEach((run) => {
      if (run.text === '') return;
      parts.push(run.text);
      styleRuns.push({ length: run.text.length, style: textStyle({ context: input.context, properties: run.properties }) });
    });
  });

  const fallbackStyle = styleRuns[0]?.style ?? { fontSize: 12 };
  const theta = (input.frame.rotation * Math.PI) / 180;
  const transform = input.frame.rotation === 0
    ? undefined
    : [Math.cos(theta), Math.sin(theta), -Math.sin(theta), Math.cos(theta), input.frame.x, input.frame.y];

  return {
    text: {
      text: parts.join(''),
      style: fallbackStyle,
      styleRuns,
      ...(transform === undefined ? {} : { transform }),
    },
    imageData: transparentPixels(input.frame.width, input.frame.height),
  };
}

function deterministicGuid(value: string): string {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  }

  return `${(hash >>> 0).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function rotatedQuad(frame: ElementFrame): [number, number, number, number, number, number, number, number] {
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  const theta = (frame.rotation * Math.PI) / 180;
  const cosine = Math.cos(theta);
  const sine = Math.sin(theta);
  const rotate = (x: number, y: number): readonly [number, number] => {
    const deltaX = x - centerX;
    const deltaY = y - centerY;

    return [centerX + deltaX * cosine - deltaY * sine, centerY + deltaX * sine + deltaY * cosine];
  };
  const topLeft = rotate(frame.x, frame.y);
  const topRight = rotate(frame.x + frame.width, frame.y);
  const bottomRight = rotate(frame.x + frame.width, frame.y + frame.height);
  const bottomLeft = rotate(frame.x, frame.y + frame.height);

  return [...topLeft, ...topRight, ...bottomRight, ...bottomLeft];
}

async function imageLayer(input: {
  readonly context: SerializationContext;
  readonly element: projectFormatV1.ImageElement;
  readonly frame: ElementFrame;
  readonly instanceKey: string;
}): Promise<Partial<Layer>> {
  const asset = input.context.project.resources.assets.find(({ id }) => id === input.element.image.assetId);

  if (asset?.kind !== 'image') {
    input.context.warnings.push(`PSD v1 export: image asset ${input.element.image.assetId} was not found.`);

    return { imageData: transparentPixels(input.frame.width, input.frame.height) };
  }

  const bytes = await input.context.resolveBlob(asset.blob.digest);

  if (bytes === undefined) {
    input.context.warnings.push(`PSD v1 export: blob ${asset.blob.digest} was not found for image ${input.element.id}.`);

    return { imageData: transparentPixels(input.frame.width, input.frame.height) };
  }

  const guid = deterministicGuid(input.instanceKey);

  input.context.linkedFiles.set(guid, { id: guid, name: asset.name, type: asset.blob.mediaType, data: bytes });

  return {
    imageData: colorPixels(input.frame.width, input.frame.height, { r: 200, g: 200, b: 200 }),
    placedLayer: {
      id: guid,
      type: 'raster',
      width: Math.max(1, Math.round(input.frame.width)),
      height: Math.max(1, Math.round(input.frame.height)),
      transform: rotatedQuad(input.frame),
    },
  };
}

function isContainer(element: projectFormatV1.Element): boolean {
  return element.kind === 'group' || element.kind === 'component-instance';
}

async function layerForInstance(input: {
  readonly context: SerializationContext;
  readonly instance: projectFormatV1.ResolvedSceneInstance;
  readonly pageId: projectFormatV1.Id;
}): Promise<Layer> {
  const element = input.instance.element;
  const frame = elementFrame(element);
  const layer: Layer = {
    name: element.name,
    left: Math.round(frame.x),
    top: Math.round(frame.y),
    right: Math.round(frame.x + frame.width),
    bottom: Math.round(frame.y + frame.height),
    opacity: element.appearance.opacity,
    hidden: false,
  };

  if (isContainer(element)) return { ...layer, opened: true, children: [] };
  if (element.kind === 'vector') return { ...layer, ...vectorLayer({ context: input.context, element, frame }) };
  if (element.kind === 'text') return { ...layer, ...textLayer({ context: input.context, element, frame }) };

  if (element.kind === 'image') {
    return {
      ...layer,
      ...(await imageLayer({
        context: input.context,
        element,
        frame,
        instanceKey: `${input.pageId}:${input.instance.rootInstanceId}:${element.id}`,
      })),
    };
  }

  input.context.warnings.push(`PSD v1 export: ${element.kind} element ${element.id} was emitted as an empty fallback layer.`);

  return { ...layer, imageData: transparentPixels(frame.width, frame.height) };
}

async function pageLayers(input: {
  readonly context: SerializationContext;
  readonly page: projectFormatV1.PageDefinition;
}): Promise<readonly Layer[]> {
  const instances = projectFormatV1
    .resolvePageInstanceTree({
      project: input.context.project,
      documentId: input.context.document.id,
      pageId: input.page.id,
    })
    .filter(({ visible }) => visible);
  const roots: Layer[] = [];
  const stack: LayerStackEntry[] = [];

  for (const instance of instances) {
    while ((stack.at(-1)?.depth ?? -1) >= instance.depth) stack.pop();

    const target = stack.at(-1)?.children ?? roots;
    const layer = await layerForInstance({ context: input.context, instance, pageId: input.page.id });

    target.push(layer);

    if (layer.children !== undefined) stack.push({ depth: instance.depth, children: layer.children });
  }

  return roots;
}

function surfacePixels(document: projectFormatV1.BroadsetDocumentV1): readonly [number, number] {
  const [width, height] = document.surface.size;
  let scale = 1;

  if (document.surface.unit === 'in') scale = document.surface.dpi;
  else if (document.surface.unit === 'mm') scale = document.surface.dpi / 25.4;

  const pixelWidth = width * scale;
  const pixelHeight = height * scale;

  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) || pixelWidth <= 0 || pixelHeight <= 0) {
    throw new Error('PSD surface dimensions must be finite and positive');
  }

  return [Math.max(1, Math.round(pixelWidth)), Math.max(1, Math.round(pixelHeight))];
}

export async function serializePsdProjectV1(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly pages: readonly projectFormatV1.PageDefinition[];
  readonly resolveBlob: (digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>;
}): Promise<PsdSerializationResultV1> {
  ensureCanvasInitialized();

  const warnings: string[] = [];
  const linkedFiles = new Map<string, LinkedFile>();
  const context: SerializationContext = { ...input, warnings, linkedFiles };
  const [width, height] = surfacePixels(input.document);
  const children: Layer[] = [];

  for (const page of input.pages) {
    const layers = await pageLayers({ context, page });

    if (input.pages.length === 1) children.push(...layers);
    else {
      children.push({
        name: page.name,
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        artboard: { rect: { top: 0, left: 0, bottom: height, right: width } },
        children: [...layers],
      });
    }
  }

  const psd: Psd = {
    width,
    height,
    colorMode: 3,
    children,
    ...(input.pages.length > 1 ? { artboards: { count: input.pages.length } } : {}),
    ...(linkedFiles.size === 0 ? {} : { linkedFiles: [...linkedFiles.values()] }),
  };

  return { bytes: writePsdUint8Array(psd), warnings };
}
