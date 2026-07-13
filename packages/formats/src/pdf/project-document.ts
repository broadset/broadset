import { projectFormatV1 } from '@broadset/model';

import { createPdfSourceElement, type PdfSourceDocument, type PdfSourceElement } from './project-model';
import { toPdfProjectBackgroundV1, toPdfProjectCssColorV1, toPdfProjectStyleV1 } from './project-style';

interface PdfProjectDocumentResultV1 {
  readonly document: PdfSourceDocument;
  readonly warnings: readonly string[];
}

function bytesToDataUri(bytes: Uint8Array, mediaType: string): string {
  let binary = '';

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return `data:${mediaType};base64,${btoa(binary)}`;
}

function pathData(path: projectFormatV1.StructuredPath): string {
  const points = new Map(path.points.map((point) => [point.id, point]));
  const parts: string[] = [];

  for (const segment of path.segments) {
    if (segment.kind === 'close') {
      parts.push('Z');
      continue;
    }

    const point = points.get(segment.pointId);

    if (point === undefined) continue;

    if (segment.kind === 'move') parts.push(`M ${String(point.x)} ${String(point.y)}`);
    else if (segment.kind === 'line') parts.push(`L ${String(point.x)} ${String(point.y)}`);
    else if (segment.kind === 'quadratic') {
      parts.push(`Q ${String(segment.control[0])} ${String(segment.control[1])} ${String(point.x)} ${String(point.y)}`);
    } else if ('control1' in segment && 'control2' in segment) {
      parts.push(
        `C ${String(segment.control1[0])} ${String(segment.control1[1])} ${String(segment.control2[0])} ${String(segment.control2[1])} ${String(point.x)} ${String(point.y)}`,
      );
    }
  }

  if (path.closed && parts.at(-1) !== 'Z') parts.push('Z');

  return parts.join(' ');
}

function transformGeometry(element: projectFormatV1.Element): {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly warning: string | undefined;
} {
  const transform = element.geometry.transform;

  if (transform.kind === 'matrix3d') {
    return {
      x: transform.matrix[12],
      y: transform.matrix[13],
      width: element.geometry.bounds.width * Math.hypot(transform.matrix[0], transform.matrix[1]),
      height: element.geometry.bounds.height * Math.hypot(transform.matrix[4], transform.matrix[5]),
      rotation: (Math.atan2(transform.matrix[1], transform.matrix[0]) * 180) / Math.PI,
      warning: 'PDF v1 export: a 3D transform used its affine projection.',
    };
  }

  const [a, b, c, d, x, y] = transform.matrix;
  const skewed = Math.abs(a * c + b * d) > 0.000001;

  return {
    x,
    y,
    width: element.geometry.bounds.width * Math.hypot(a, b),
    height: element.geometry.bounds.height * Math.hypot(c, d),
    rotation: (Math.atan2(b, a) * 180) / Math.PI,
    warning: skewed ? 'PDF v1 export: skew used its closest rotation-and-scale projection.' : undefined,
  };
}

function legacyType(element: projectFormatV1.Element): string {
  if (element.kind === 'vector') {
    if (element.geometryData.kind === 'rectangle') return 'rectangle';
    if (element.geometryData.kind === 'ellipse') return 'ellipse';
    if (element.geometryData.kind === 'boolean') return 'rectangle';

    return 'path';
  }

  if (element.kind === 'audio' || element.kind === 'foreign' || element.kind === 'plugin') return 'rectangle';
  if (element.kind === 'component-instance') return 'group';

  return element.kind;
}

function semanticWarnings(element: projectFormatV1.Element): readonly string[] {
  const warnings: string[] = [];

  if (element.kind === 'vector' && element.geometryData.kind === 'boolean') {
    warnings.push('PDF v1 export: boolean vector geometry used an editable rectangle placeholder.');
  }

  if (element.kind === 'image' && (element.image.fit !== 'fill' || element.image.crop !== undefined)) {
    warnings.push('PDF v1 export: image fit or crop used the legacy writer stretch fallback.');
  }

  if (element.kind === 'group' && element.group.clipChildren) {
    warnings.push('PDF v1 export: group clipping remains in the v1 source and was omitted.');
  }

  if (element.kind === 'text') {
    const runCount = element.text.paragraphs.reduce((total, paragraph) => total + paragraph.runs.length, 0);

    if (runCount > 1) warnings.push('PDF v1 export: mixed text runs used the first run typography.');
  }

  return warnings;
}

function staticContent(element: projectFormatV1.Element): string {
  if (element.kind === 'text') {
    return element.text.paragraphs.map(({ runs }) => runs.map(({ text }) => text).join('')).join('\n');
  }

  if (element.kind === 'vector' && element.geometryData.kind === 'path') return pathData(element.geometryData.path);
  if (element.kind === 'qrcode') return element.qrcode.value;
  if (element.kind === 'clock') return element.clock.format;
  if (element.kind === 'ticker') return element.ticker.items.map(({ text }) => text).join(' ');
  if (element.kind === 'video') return 'Video';

  return '';
}

function fontWeight(value: number): 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 {
  const rounded = Math.min(900, Math.max(100, Math.round(value / 100) * 100));

  if (rounded === 100) return 100;
  if (rounded === 200) return 200;
  if (rounded === 300) return 300;
  if (rounded === 500) return 500;
  if (rounded === 600) return 600;
  if (rounded === 700) return 700;
  if (rounded === 800) return 800;
  if (rounded === 900) return 900;

  return 400;
}

function legacyAlignment(
  alignment: projectFormatV1.ParagraphProperties['alignment'] | undefined,
): 'left' | 'center' | 'right' | 'justify' | undefined {
  if (alignment === 'start') return 'left';
  if (alignment === 'end') return 'right';

  return alignment;
}

function textStyle(input: {
  readonly element: projectFormatV1.Element;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): {
  readonly fontFamily?: string;
  readonly fontSize?: number;
  readonly fontWeight?: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  readonly fontColor?: string;
  readonly textAlignment?: 'left' | 'center' | 'right' | 'justify';
  readonly textDecoration?: string;
} {
  if (input.element.kind !== 'text') return {};

  const run = input.element.text.paragraphs[0]?.runs[0];

  if (run === undefined) return {};

  const family = input.project.resources.fonts.find(({ id }) => id === run.properties.fontFamilyId);
  const paragraph = input.element.text.paragraphs[0];
  const textAlignment = legacyAlignment(paragraph?.properties.alignment);
  const fontColor = toPdfProjectCssColorV1({ color: run.properties.color, project: input.project });

  return {
    ...(family === undefined ? {} : { fontFamily: family.familyName }),
    fontSize: run.properties.size,
    fontWeight: fontWeight(run.properties.weight),
    ...(fontColor === undefined ? {} : { fontColor }),
    ...(textAlignment === undefined ? {} : { textAlignment }),
    ...(run.properties.decoration.underline ? { textDecoration: 'underline' } : {}),
  };
}

async function imageContent(input: {
  readonly element: projectFormatV1.Element;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob: ((digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>) | undefined;
}): Promise<{ readonly content: string; readonly warning: string | undefined }> {
  if (input.element.kind !== 'image') return { content: staticContent(input.element), warning: undefined };

  const image = input.element;
  const asset = input.project.resources.assets.find(
    (candidate) => candidate.id === image.image.assetId && candidate.kind === 'image',
  );

  if (asset?.kind !== 'image') {
    return { content: '', warning: `PDF v1 export: image asset ${image.image.assetId} is missing.` };
  }

  let bytes = input.blobs.get(asset.blob.digest);

  if (bytes === undefined && input.resolveBlob !== undefined) {
    try {
      bytes = await input.resolveBlob(asset.blob.digest);
    } catch {
      bytes = undefined;
    }
  }

  if (bytes === undefined) {
    return { content: '', warning: `PDF v1 export: blob ${asset.blob.digest} is unavailable.` };
  }

  return { content: bytesToDataUri(bytes, asset.blob.mediaType), warning: undefined };
}

async function mapElement(input: {
  readonly instance: projectFormatV1.ResolvedSceneInstance;
  readonly legacyId: string;
  readonly parentId: string | null;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob: ((digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>) | undefined;
}): Promise<{ readonly element: PdfSourceElement; readonly warnings: readonly string[] }> {
  const source = input.instance.element;
  const geometry = transformGeometry(source);
  const mappedStyle = toPdfProjectStyleV1({ appearance: source.appearance, project: input.project });
  const content = await imageContent({
    element: source,
    project: input.project,
    blobs: input.blobs,
    resolveBlob: input.resolveBlob,
  });
  const fallbackKind = ['audio', 'foreign', 'plugin', 'component-instance'].includes(source.kind);
  const warnings = [
    ...mappedStyle.warnings,
    ...(geometry.warning === undefined ? [] : [geometry.warning]),
    ...(content.warning === undefined ? [] : [content.warning]),
    ...(fallbackKind ? [`PDF v1 export: ${source.kind} used an editable placeholder.`] : []),
    ...semanticWarnings(source),
  ];

  return {
    element: createPdfSourceElement(legacyType(source), {
      id: input.legacyId,
      name: source.name,
      locked: source.locked,
      parentId: input.parentId,
      position: { x: geometry.x, y: geometry.y },
      width: Math.max(0.000001, geometry.width),
      height: Math.max(0.000001, geometry.height),
      rotation: geometry.rotation,
      content: content.content,
      style: { ...mappedStyle.style, ...textStyle({ element: source, project: input.project }) },
    }),
    warnings,
  };
}

function insetTuple(insets: projectFormatV1.Insets): readonly [number, number, number, number] {
  return [insets.top, insets.right, insets.bottom, insets.left];
}

function legacyIccColorSpace(value: string): 'rgb' | 'cmyk' | 'gray' | 'lab' {
  const normalized = value.toLowerCase();

  if (normalized.includes('cmyk')) return 'cmyk';
  if (normalized.includes('gray')) return 'gray';
  if (normalized.includes('lab')) return 'lab';

  return 'rgb';
}

function outputIntent(input: {
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): PdfSourceDocument['outputIntent'] {
  const intent = input.document.color.outputIntent;

  if (intent === undefined) return undefined;

  const asset = input.project.resources.assets.find(
    (candidate) => candidate.id === intent.iccProfileAssetId && candidate.kind === 'icc-profile',
  );

  if (asset?.kind !== 'icc-profile') return undefined;

  return {
    iccProfileAssetId: asset.id,
    colorSpace: legacyIccColorSpace(asset.metadata.colorSpace),
    identifier: asset.metadata.identifier,
  };
}

export async function toPdfProjectDocumentV1(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly page: projectFormatV1.PageDefinition;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob: ((digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>) | undefined;
}): Promise<PdfProjectDocumentResultV1> {
  const instances = projectFormatV1
    .resolvePageInstanceTree({
      project: input.project,
      documentId: input.document.id,
      pageId: input.page.id,
    })
    .filter(({ visible }) => visible);
  const elements: PdfSourceElement[] = [];
  const warnings: string[] = [];
  const idAtDepth = new Map<number, string>();

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index];

    if (instance === undefined) continue;

    const legacyId = `pdf-v1-element-${String(index + 1)}`;
    const parentId = instance.depth === 0 ? null : (idAtDepth.get(instance.depth - 1) ?? null);
    const mapped = await mapElement({
      instance,
      legacyId,
      parentId,
      project: input.project,
      blobs: input.blobs,
      resolveBlob: input.resolveBlob,
    });

    idAtDepth.set(instance.depth, legacyId);
    elements.push(mapped.element);
    warnings.push(...mapped.warnings);
  }

  const background = toPdfProjectBackgroundV1({
    paint: input.document.surface.background,
    project: input.project,
  });

  warnings.push(...background.warnings);

  const prepress = input.document.surface.prepress;
  const legacyOutputIntent = outputIntent(input);
  const document: PdfSourceDocument = {
    id: input.document.id,
    name: input.document.name,
    documentMode: input.document.kind === 'print' ? 'print' : 'screen',
    canvas: {
      width: input.document.surface.size[0],
      height: input.document.surface.size[1],
      unit: input.document.surface.unit,
      dpi: input.document.surface.dpi,
      padding: insetTuple(input.document.surface.padding),
      backgroundMode: background.backgroundMode,
      ...(background.backgroundColor === undefined ? {} : { backgroundColor: background.backgroundColor }),
      ...(background.backgroundGradient === undefined ? {} : { backgroundGradient: background.backgroundGradient }),
      ...(prepress === undefined ?
        {}
      : {
          bleed: insetTuple(prepress.bleed),
          trim: insetTuple(prepress.trim),
          safeArea: insetTuple(prepress.safe),
        }),
    },
    elements,
    animations: [],
    pages: [
      {
        id: input.page.id,
        name: input.page.name,
        elements: elements.map((element, index) => ({
          elementId: element.id,
          transform: {
            position: { x: element.position.x, y: element.position.y, z: 0 },
            rotation: { x: 0, y: 0, z: element.rotation },
            scale: { x: 1, y: 1, z: 1 },
          },
          visible: instances[index]?.visible ?? true,
        })),
        locale: null,
        extensions: {},
      },
    ],
    dataSchema: { fields: [] },
    ...(legacyOutputIntent === undefined ? {} : { outputIntent: legacyOutputIntent }),
    ...(input.document.metadata === undefined ?
      {}
    : {
        metadata: {
          title: input.document.name,
          author: input.document.metadata.authors.join(', '),
          subject: input.document.metadata.description,
          keywords: input.document.metadata.keywords,
          rights: input.document.metadata.rights,
        },
      }),
    extensions: {},
  };

  return { document, warnings };
}
