import type { projectFormatV1 } from '@broadset/model';

import { appearanceAttributes, svgNumber, textColorAttribute } from './export-paint';
import { escapeXml, xmlAttribute } from './xml';

export interface ExportedElementMarkup {
  readonly opening: string;
  readonly closing: string;
}

interface ExportElementContext {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly resolveAssetHref: (assetId: projectFormatV1.Id) => string | undefined;
}

function transformAttribute(transform: projectFormatV1.ElementTransform): string {
  if (transform.kind !== 'affine2d') return '';

  return xmlAttribute('transform', `matrix(${transform.matrix.map(svgNumber).join(',')})`);
}

function commonAttributes(element: projectFormatV1.Element, context: ExportElementContext): string {
  return `${appearanceAttributes(element.appearance, context.project)}${transformAttribute(element.geometry.transform)}`;
}

function pointCoordinates(point: projectFormatV1.PathPoint): string {
  return `${svgNumber(point.x)} ${svgNumber(point.y)}`;
}

function pointCommand(
  command: 'M' | 'L',
  pointId: projectFormatV1.Id,
  points: ReadonlyMap<projectFormatV1.Id, projectFormatV1.PathPoint>,
): string | undefined {
  const point = points.get(pointId);

  return point === undefined ? undefined : `${command} ${pointCoordinates(point)}`;
}

function pathCommand(
  segment: projectFormatV1.PathSegment,
  points: ReadonlyMap<projectFormatV1.Id, projectFormatV1.PathPoint>,
): string | undefined {
  switch (segment.kind) {
    case 'close':
      return 'Z';
    case 'move':
      return pointCommand('M', segment.pointId, points);
    case 'line':
      return pointCommand('L', segment.pointId, points);

    case 'quadratic': {
      const point = points.get(segment.pointId);

      return point === undefined ? undefined : (
          `Q ${svgNumber(segment.control[0])} ${svgNumber(segment.control[1])} ${pointCoordinates(point)}`
        );
    }

    case 'cubic': {
      const point = points.get(segment.pointId);

      return point === undefined ? undefined : (
          `C ${svgNumber(segment.control1[0])} ${svgNumber(segment.control1[1])} ${svgNumber(segment.control2[0])} ${svgNumber(segment.control2[1])} ${pointCoordinates(point)}`
        );
    }
  }
}

function pathData(path: projectFormatV1.StructuredPath): string {
  const points: ReadonlyMap<projectFormatV1.Id, projectFormatV1.PathPoint> = new Map(
    path.points.map((point) => [point.id, point]),
  );
  const commands: readonly string[] = path.segments.flatMap((segment) => {
    const command = pathCommand(segment, points);

    return command === undefined ? [] : [command];
  });
  const hasClose = path.segments.some(({ kind }) => kind === 'close');

  return [...commands, ...(path.closed && !hasClose ? ['Z'] : [])].join(' ');
}

function exportVector(
  element: projectFormatV1.VectorElement,
  context: ExportElementContext,
): ExportedElementMarkup | undefined {
  const width = element.geometry.bounds.width;
  const height = element.geometry.bounds.height;
  const common = commonAttributes(element, context);

  if (element.geometryData.kind === 'rectangle') {
    const radius = Math.min(...element.geometryData.cornerRadii);
    const attributes = `${xmlAttribute('x', '0')}${xmlAttribute('y', '0')}${xmlAttribute('width', svgNumber(width))}${xmlAttribute('height', svgNumber(height))}${xmlAttribute('rx', svgNumber(radius))}${xmlAttribute('ry', svgNumber(radius))}`;

    return { opening: `<rect${attributes}${common}/>`, closing: '' };
  }

  if (element.geometryData.kind === 'ellipse') {
    const radiusX = width / 2;
    const radiusY = height / 2;

    if (radiusX === radiusY) {
      const attributes = `${xmlAttribute('cx', svgNumber(radiusX))}${xmlAttribute('cy', svgNumber(radiusY))}${xmlAttribute('r', svgNumber(radiusX))}`;

      return { opening: `<circle${attributes}${common}/>`, closing: '' };
    }

    const attributes = `${xmlAttribute('cx', svgNumber(radiusX))}${xmlAttribute('cy', svgNumber(radiusY))}${xmlAttribute('rx', svgNumber(radiusX))}${xmlAttribute('ry', svgNumber(radiusY))}`;

    return { opening: `<ellipse${attributes}${common}/>`, closing: '' };
  }

  if (element.geometryData.kind === 'path') {
    const attributes = `${xmlAttribute('d', pathData(element.geometryData.path))}${xmlAttribute('fill-rule', element.geometryData.fillRule)}`;

    return { opening: `<path${attributes}${common}/>`, closing: '' };
  }

  return undefined;
}

function textAnchor(alignment: projectFormatV1.ParagraphProperties['alignment']): string {
  if (alignment === 'center') return 'middle';
  if (alignment === 'end') return 'end';

  return 'start';
}

function textX(alignment: projectFormatV1.ParagraphProperties['alignment'], width: number): number {
  if (alignment === 'center') return width / 2;
  if (alignment === 'end') return width;

  return 0;
}

function fontFamilyName(project: projectFormatV1.BroadsetProjectV1, fontFamilyId: projectFormatV1.Id): string {
  return project.resources.fonts.find(({ id }) => id === fontFamilyId)?.familyName ?? 'sans-serif';
}

function exportText(element: projectFormatV1.TextElement, context: ExportElementContext): ExportedElementMarkup {
  const firstParagraph: projectFormatV1.TextParagraph | undefined = element.text.paragraphs[0];
  const alignment = firstParagraph?.properties.alignment ?? 'start';
  const opening = `<text${xmlAttribute('x', svgNumber(textX(alignment, element.geometry.bounds.width)))}${xmlAttribute('text-anchor', textAnchor(alignment))}${transformAttribute(element.geometry.transform)}>`;
  const paragraphs = element.text.paragraphs.map(
    (paragraph, paragraphIndex) =>
      paragraph.runs
        .map((run) => {
          const properties: projectFormatV1.RunProperties = run.properties;
          const attributes = `${xmlAttribute('font-family', fontFamilyName(context.project, properties.fontFamilyId))}${xmlAttribute('font-size', svgNumber(properties.size))}${xmlAttribute('font-weight', svgNumber(properties.weight))}${textColorAttribute(properties.color, context.project)}`;

          return `<tspan${attributes}>${escapeXml(run.text)}</tspan>`;
        })
        .join('') + (paragraphIndex < element.text.paragraphs.length - 1 ? '<tspan x="0" dy="1em"></tspan>' : ''),
  );

  return { opening: `${opening}${paragraphs.join('')}`, closing: '</text>' };
}

function defaultAssetHref(project: projectFormatV1.BroadsetProjectV1, assetId: projectFormatV1.Id): string | undefined {
  const asset: projectFormatV1.Asset | undefined = project.resources.assets.find(({ id }) => id === assetId);

  if (asset?.blob.source.kind === 'package') return asset.blob.source.path;

  return asset?.blob.source.kind === 'external' ? asset.blob.source.url : undefined;
}

function exportImage(element: projectFormatV1.ImageElement, context: ExportElementContext): ExportedElementMarkup {
  const href =
    context.resolveAssetHref(element.image.assetId) ?? defaultAssetHref(context.project, element.image.assetId) ?? '';
  const attributes = `${xmlAttribute('href', href)}${xmlAttribute('x', '0')}${xmlAttribute('y', '0')}${xmlAttribute('width', svgNumber(element.geometry.bounds.width))}${xmlAttribute('height', svgNumber(element.geometry.bounds.height))}`;

  return { opening: `<image${attributes}${commonAttributes(element, context)}/>`, closing: '' };
}

export function exportElementMarkup(
  element: projectFormatV1.Element,
  context: ExportElementContext,
): ExportedElementMarkup | undefined {
  if (element.kind === 'vector') return exportVector(element, context);
  if (element.kind === 'text') return exportText(element, context);
  if (element.kind === 'image') return exportImage(element, context);

  if (element.kind === 'group') {
    return { opening: `<g${commonAttributes(element, context)}>`, closing: '</g>' };
  }

  return undefined;
}
