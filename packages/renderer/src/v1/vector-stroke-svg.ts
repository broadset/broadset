import type { projectFormatV1 } from '@broadset/model';

import { syncAssetPaintLayersV1 } from './asset-paint-dom';
import type { RenderContextV1 } from './element-dom';
import { formatCssNumber } from './paint-css';
import { type PhysicalUnitContextV1, spatialValueToCssPixelsV1 } from './physical-units';
import type { SvgDefinitionIdFactoryV1 } from './svg-definition-ids';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const STROKE_DASH_OUTPUT_BUDGET_V1 = 64;

function pixels(value: number, units: PhysicalUnitContextV1): number {
  return spatialValueToCssPixelsV1(value, units);
}

function strokePaintExtent(stroke: projectFormatV1.StrokeLayer): number {
  let extent = stroke.width;

  if (stroke.alignment === 'inside') extent = 0;
  else if (stroke.alignment === 'center') extent = stroke.width / 2;
  if (stroke.join === 'miter' && stroke.alignment !== 'inside') extent *= stroke.miterLimit;

  for (const arrow of [stroke.startArrow, stroke.endArrow]) {
    if (arrow !== undefined && arrow.kind !== 'none')
      extent = Math.max(extent, arrow.length ?? stroke.width * 3, arrow.width ?? stroke.width * 2);
  }

  return extent;
}

function expandMaskRegion(mask: SVGMaskElement, extent: number, width: number, height: number): void {
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  mask.setAttribute('x', formatCssNumber(-extent));
  mask.setAttribute('y', formatCssNumber(-extent));
  mask.setAttribute('width', formatCssNumber(width + extent * 2));
  mask.setAttribute('height', formatCssNumber(height + extent * 2));
}

function setStrokeMetadata(
  group: SVGGElement,
  stroke: projectFormatV1.StrokeLayer,
  units: PhysicalUnitContextV1,
): void {
  group.dataset['vectorStroke'] = stroke.id;
  group.dataset['strokeWidth'] = formatCssNumber(pixels(stroke.width, units));
  group.dataset['strokeLinecap'] = stroke.cap;
  group.dataset['strokeLinejoin'] = stroke.join;
  group.dataset['strokeMiterlimit'] = formatCssNumber(stroke.miterLimit);
  group.dataset['strokeAlignment'] = stroke.alignment;
  group.dataset['strokeDasharray'] = stroke.dash.map((value) => formatCssNumber(pixels(value, units))).join(' ');
  group.dataset['strokeDashoffset'] = formatCssNumber(pixels(stroke.dashOffset, units));
  group.style.setProperty('opacity', formatCssNumber(stroke.opacity));
  group.style.setProperty('mix-blend-mode', stroke.blendMode);
}

function arrowPath(arrow: projectFormatV1.ArrowEnding, length: number, width: number): string | undefined {
  switch (arrow.kind) {
    case 'none':
      return undefined;
    case 'triangle':
      return `M 0 0 L ${formatCssNumber(length)} ${formatCssNumber(width / 2)} L 0 ${formatCssNumber(width)} Z`;
    case 'stealth':
      return `M 0 0 L ${formatCssNumber(length)} ${formatCssNumber(width / 2)} L 0 ${formatCssNumber(width)} L ${formatCssNumber(length * 0.7)} ${formatCssNumber(width / 2)} Z`;
    case 'diamond':
      return `M 0 ${formatCssNumber(width / 2)} L ${formatCssNumber(length / 2)} 0 L ${formatCssNumber(length)} ${formatCssNumber(width / 2)} L ${formatCssNumber(length / 2)} ${formatCssNumber(width)} Z`;
    case 'circle':
      return `M 0 ${formatCssNumber(width / 2)} A ${formatCssNumber(length / 2)} ${formatCssNumber(width / 2)} 0 1 0 ${formatCssNumber(length)} ${formatCssNumber(width / 2)} A ${formatCssNumber(length / 2)} ${formatCssNumber(width / 2)} 0 1 0 0 ${formatCssNumber(width / 2)} Z`;
    case 'square':
      return `M 0 0 H ${formatCssNumber(length)} V ${formatCssNumber(width)} H 0 Z`;
  }
}

function createArrowMarker(options: {
  readonly document: Document;
  readonly definitions: SVGDefsElement;
  readonly arrow: projectFormatV1.ArrowEnding | undefined;
  readonly end: 'start' | 'end';
  readonly strokeWidth: number;
  readonly definitionId: SvgDefinitionIdFactoryV1;
}): string | undefined {
  if (options.arrow === undefined || options.arrow.kind === 'none') return undefined;

  const length = options.arrow.length ?? options.strokeWidth * 3;
  const width = options.arrow.width ?? options.strokeWidth * 2;
  const data = arrowPath(options.arrow, length, width);

  if (data === undefined || length <= 0 || width <= 0) return undefined;

  const marker = options.document.createElementNS(SVG_NAMESPACE, 'marker');
  const shape = options.document.createElementNS(SVG_NAMESPACE, 'path');
  const id = options.definitionId(`stroke-arrow-${options.end}`);

  marker.id = id;
  marker.dataset[options.end === 'start' ? 'arrowStart' : 'arrowEnd'] = options.arrow.kind;
  marker.setAttribute('markerUnits', 'userSpaceOnUse');
  marker.setAttribute('markerWidth', formatCssNumber(length));
  marker.setAttribute('markerHeight', formatCssNumber(width));
  marker.setAttribute('refX', formatCssNumber(length / 2));
  marker.setAttribute('refY', formatCssNumber(width / 2));
  marker.setAttribute('orient', 'auto-start-reverse');
  marker.setAttribute('viewBox', `0 0 ${formatCssNumber(length)} ${formatCssNumber(width)}`);
  shape.setAttribute('d', data);
  shape.setAttribute('fill', 'white');
  marker.appendChild(shape);
  options.definitions.appendChild(marker);

  return id;
}

function configureStrokePath(
  path: SVGPathElement,
  stroke: projectFormatV1.StrokeLayer,
  data: string,
  fillRule: 'nonzero' | 'evenodd',
): void {
  const alignmentScale = stroke.alignment === 'center' ? 1 : 2;

  path.setAttribute('d', data);
  path.setAttribute('fill', 'none');
  path.setAttribute('fill-rule', fillRule);
  path.setAttribute('stroke', 'white');
  path.setAttribute('stroke-width', formatCssNumber(stroke.width * alignmentScale));
  path.setAttribute('stroke-linecap', stroke.cap);
  path.setAttribute('stroke-linejoin', stroke.join);
  path.setAttribute('stroke-miterlimit', formatCssNumber(stroke.miterLimit));
  path.setAttribute('stroke-dasharray', stroke.dash.map(formatCssNumber).join(' '));
  path.setAttribute('stroke-dashoffset', formatCssNumber(stroke.dashOffset));
}

function alignStroke(options: {
  readonly document: Document;
  readonly definitions: SVGDefsElement;
  readonly mask: SVGMaskElement;
  readonly path: SVGPathElement;
  readonly data: string;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly alignment: projectFormatV1.StrokeLayer['alignment'];
  readonly definitionId: SvgDefinitionIdFactoryV1;
  readonly extent: number;
  readonly width: number;
  readonly height: number;
}): void {
  if (options.alignment === 'center') {
    options.mask.appendChild(options.path);

    return;
  }

  const group = options.document.createElementNS(SVG_NAMESPACE, 'g');

  if (options.alignment === 'inside') {
    const clip = options.document.createElementNS(SVG_NAMESPACE, 'clipPath');
    const clipShape = options.document.createElementNS(SVG_NAMESPACE, 'path');
    const id = options.definitionId('inside-stroke-clip');

    clip.id = id;
    clipShape.setAttribute('d', options.data);
    clipShape.setAttribute('fill-rule', options.fillRule);
    clip.appendChild(clipShape);
    options.definitions.appendChild(clip);
    group.setAttribute('clip-path', `url(#${id})`);
  } else {
    const outsideMask = options.document.createElementNS(SVG_NAMESPACE, 'mask');
    const area = options.document.createElementNS(SVG_NAMESPACE, 'rect');
    const shape = options.document.createElementNS(SVG_NAMESPACE, 'path');
    const id = options.definitionId('outside-stroke-mask');

    outsideMask.id = id;
    expandMaskRegion(outsideMask, options.extent, options.width, options.height);
    area.setAttribute('x', formatCssNumber(-options.extent));
    area.setAttribute('y', formatCssNumber(-options.extent));
    area.setAttribute('width', formatCssNumber(options.width + options.extent * 2));
    area.setAttribute('height', formatCssNumber(options.height + options.extent * 2));
    area.setAttribute('fill', 'white');
    shape.setAttribute('d', options.data);
    shape.setAttribute('fill', 'black');
    shape.setAttribute('fill-rule', options.fillRule);
    outsideMask.appendChild(area);
    outsideMask.appendChild(shape);
    options.definitions.appendChild(outsideMask);
    group.setAttribute('mask', `url(#${id})`);
  }

  group.appendChild(options.path);
  options.mask.appendChild(group);
}

function appendDiagnostic(svg: SVGSVGElement, strokeId: projectFormatV1.Id, message: string): void {
  const diagnostic = svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'text');

  diagnostic.dataset['vectorStrokeFallback'] = strokeId;
  diagnostic.setAttribute('x', '0');
  diagnostic.setAttribute('y', '12');
  diagnostic.textContent = message;
  svg.appendChild(diagnostic);
}

function appendPaintSurface(options: {
  readonly svg: SVGSVGElement;
  readonly group: SVGGElement;
  readonly maskId: string;
  readonly width: number;
  readonly height: number;
  readonly stroke: projectFormatV1.StrokeLayer;
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
}): void {
  const foreignObject = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'foreignObject');
  const paint = options.svg.ownerDocument.createElement('div');
  const fill: projectFormatV1.FillLayer = {
    id: options.stroke.id,
    enabled: true,
    opacity: 1,
    blendMode: 'normal',
    paint: options.stroke.paint,
  };
  const extent = strokePaintExtent(options.stroke);

  foreignObject.setAttribute('x', formatCssNumber(-extent));
  foreignObject.setAttribute('y', formatCssNumber(-extent));
  foreignObject.setAttribute('width', formatCssNumber(options.width + extent * 2));
  foreignObject.setAttribute('height', formatCssNumber(options.height + extent * 2));
  foreignObject.setAttribute('mask', `url(#${options.maskId})`);
  paint.style.setProperty('width', '100%');
  paint.style.setProperty('height', '100%');
  foreignObject.appendChild(paint);
  options.group.appendChild(foreignObject);
  syncAssetPaintLayersV1({
    content: paint,
    appearance: { opacity: 1, blendMode: 'normal', isolation: false, fills: [fill], strokes: [], effects: [] },
    context: options.context,
    units: options.units,
    clipToVector: false,
  });

  if (paint.querySelector('.broadset-render-fallback') !== null) {
    foreignObject.remove();
    appendDiagnostic(options.svg, options.stroke.id, 'Stroke paint asset unavailable');
  }
}

export function appendOrdinaryVectorStrokesV1(options: {
  readonly svg: SVGSVGElement;
  readonly definitions: SVGDefsElement;
  readonly data: string;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly width: number;
  readonly height: number;
  readonly strokes: readonly projectFormatV1.StrokeLayer[];
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
  readonly definitionId: SvgDefinitionIdFactoryV1;
}): void {
  for (const stroke of options.strokes) {
    if (!stroke.enabled || stroke.paint.kind === 'none' || stroke.width === 0) continue;

    if (stroke.dash.length > STROKE_DASH_OUTPUT_BUDGET_V1) {
      appendDiagnostic(options.svg, stroke.id, 'Stroke dash output budget exceeded');

      continue;
    }

    const group = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const mask = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'mask');
    const path = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    const maskId = options.definitionId('vector-stroke-mask');

    setStrokeMetadata(group, stroke, options.units);
    mask.id = maskId;
    expandMaskRegion(mask, strokePaintExtent(stroke), options.width, options.height);
    configureStrokePath(path, stroke, options.data, options.fillRule);

    const startMarker = createArrowMarker({
      document: options.svg.ownerDocument,
      definitions: options.definitions,
      arrow: stroke.startArrow,
      end: 'start',
      strokeWidth: stroke.width,
      definitionId: options.definitionId,
    });
    const endMarker = createArrowMarker({
      document: options.svg.ownerDocument,
      definitions: options.definitions,
      arrow: stroke.endArrow,
      end: 'end',
      strokeWidth: stroke.width,
      definitionId: options.definitionId,
    });

    if (startMarker !== undefined) path.setAttribute('marker-start', `url(#${startMarker})`);
    if (endMarker !== undefined) path.setAttribute('marker-end', `url(#${endMarker})`);
    alignStroke({
      ...options,
      document: options.svg.ownerDocument,
      mask,
      path,
      alignment: stroke.alignment,
      extent: strokePaintExtent(stroke),
    });
    options.definitions.appendChild(mask);
    appendPaintSurface({ ...options, group, maskId, stroke });
    options.svg.appendChild(group);
  }
}

function createBooleanEdgeFilter(options: {
  readonly document: Document;
  readonly definitions: SVGDefsElement;
  readonly width: number;
  readonly alignment: projectFormatV1.StrokeLayer['alignment'];
  readonly definitionId: SvgDefinitionIdFactoryV1;
}): string {
  const filter = options.document.createElementNS(SVG_NAMESPACE, 'filter');
  const outer = options.document.createElementNS(SVG_NAMESPACE, 'feMorphology');
  const inner = options.document.createElementNS(SVG_NAMESPACE, 'feMorphology');
  const edge = options.document.createElementNS(SVG_NAMESPACE, 'feComposite');
  const id = options.definitionId('boolean-stroke-edge');
  const radius = formatCssNumber(options.alignment === 'center' ? options.width / 2 : options.width);

  filter.id = id;
  filter.setAttribute('x', '-50%');
  filter.setAttribute('y', '-50%');
  filter.setAttribute('width', '200%');
  filter.setAttribute('height', '200%');
  outer.setAttribute('in', 'SourceAlpha');
  outer.setAttribute('operator', 'dilate');
  outer.setAttribute('radius', radius);
  outer.setAttribute('result', 'outer');
  inner.setAttribute('in', 'SourceAlpha');
  inner.setAttribute('operator', 'erode');
  inner.setAttribute('radius', radius);
  inner.setAttribute('result', 'inner');
  edge.setAttribute('operator', 'xor');
  edge.setAttribute('in', options.alignment === 'inside' ? 'SourceAlpha' : 'outer');
  edge.setAttribute('in2', options.alignment === 'outside' ? 'SourceAlpha' : 'inner');
  filter.appendChild(outer);
  filter.appendChild(inner);
  filter.appendChild(edge);
  options.definitions.appendChild(filter);

  return id;
}

export function appendBooleanVectorStrokesV1(options: {
  readonly svg: SVGSVGElement;
  readonly definitions: SVGDefsElement;
  readonly booleanMaskId: string;
  readonly boundsData: string;
  readonly width: number;
  readonly height: number;
  readonly strokes: readonly projectFormatV1.StrokeLayer[];
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
  readonly definitionId: SvgDefinitionIdFactoryV1;
}): void {
  for (const stroke of options.strokes) {
    if (!stroke.enabled || stroke.paint.kind === 'none' || stroke.width === 0) continue;

    if (
      stroke.dash.length > 0 ||
      (stroke.startArrow !== undefined && stroke.startArrow.kind !== 'none') ||
      (stroke.endArrow !== undefined && stroke.endArrow.kind !== 'none')
    ) {
      appendDiagnostic(options.svg, stroke.id, 'Implicit boolean boundary cannot represent dashed or arrow strokes');

      continue;
    }

    const group = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const strokeMask = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'mask');
    const source = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    const edgeGroup = options.svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'g');
    const strokeMaskId = options.definitionId('boolean-stroke-mask');
    const filterId = createBooleanEdgeFilter({
      document: options.svg.ownerDocument,
      definitions: options.definitions,
      width: stroke.width,
      alignment: stroke.alignment,
      definitionId: options.definitionId,
    });

    setStrokeMetadata(group, stroke, options.units);
    strokeMask.id = strokeMaskId;
    expandMaskRegion(strokeMask, strokePaintExtent(stroke), options.width, options.height);
    source.setAttribute('d', options.boundsData);
    source.setAttribute('fill', 'white');
    source.setAttribute('mask', `url(#${options.booleanMaskId})`);
    edgeGroup.setAttribute('filter', `url(#${filterId})`);
    edgeGroup.appendChild(source);
    strokeMask.appendChild(edgeGroup);
    options.definitions.appendChild(strokeMask);
    appendPaintSurface({ ...options, group, maskId: strokeMaskId, stroke });
    options.svg.appendChild(group);
  }
}
