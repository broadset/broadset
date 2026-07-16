import type { projectFormatV1 } from '@broadset/model';

import type { RenderContextV1 } from './element-dom';
import { formatCssNumber } from './paint-css';
import { pathToSvgD } from './path-to-svg-d';
import type { PhysicalUnitContextV1 } from './physical-units';
import { createSvgDefinitionIdFactoryV1, type SvgDefinitionIdFactoryV1 } from './svg-definition-ids';
import { appendBooleanVectorStrokesV1, appendOrdinaryVectorStrokesV1 } from './vector-stroke-svg';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

export const BOOLEAN_OPERAND_BUDGET_V1 = 64;

function boundsPath(width: number, height: number): string {
  return `M 0 0 H ${formatCssNumber(width)} V ${formatCssNumber(height)} H 0 Z`;
}

function roundedRectanglePath(width: number, height: number, radii: readonly [number, number, number, number]): string {
  const [topLeft, topRight, bottomRight, bottomLeft] = radii;
  const scale = Math.min(
    1,
    width / Math.max(1, topLeft + topRight),
    width / Math.max(1, bottomLeft + bottomRight),
    height / Math.max(1, topLeft + bottomLeft),
    height / Math.max(1, topRight + bottomRight),
  );
  const [tl, tr, br, bl] = radii.map((radius) => radius * scale);
  const number = formatCssNumber;

  return `M ${number(tl ?? 0)} 0 H ${number(width - (tr ?? 0))} A ${number(tr ?? 0)} ${number(tr ?? 0)} 0 0 1 ${number(width)} ${number(tr ?? 0)} V ${number(height - (br ?? 0))} A ${number(br ?? 0)} ${number(br ?? 0)} 0 0 1 ${number(width - (br ?? 0))} ${number(height)} H ${number(bl ?? 0)} A ${number(bl ?? 0)} ${number(bl ?? 0)} 0 0 1 0 ${number(height - (bl ?? 0))} V ${number(tl ?? 0)} A ${number(tl ?? 0)} ${number(tl ?? 0)} 0 0 1 ${number(tl ?? 0)} 0 Z`;
}

function ellipsePath(width: number, height: number): string {
  const centerX = width / 2;
  const centerY = height / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;

  return `M ${formatCssNumber(centerX - radiusX)} ${formatCssNumber(centerY)} A ${formatCssNumber(radiusX)} ${formatCssNumber(radiusY)} 0 1 0 ${formatCssNumber(centerX + radiusX)} ${formatCssNumber(centerY)} A ${formatCssNumber(radiusX)} ${formatCssNumber(radiusY)} 0 1 0 ${formatCssNumber(centerX - radiusX)} ${formatCssNumber(centerY)} Z`;
}

function vectorPath(element: projectFormatV1.VectorElement): string | undefined {
  switch (element.geometryData.kind) {
    case 'rectangle':
      return roundedRectanglePath(
        element.geometry.bounds.width,
        element.geometry.bounds.height,
        element.geometryData.cornerRadii,
      );
    case 'ellipse':
      return ellipsePath(element.geometry.bounds.width, element.geometry.bounds.height);
    case 'path':
      return pathToSvgD(element.geometryData.path);
    case 'boolean':
      return undefined;
  }
}

function svgTransform(element: projectFormatV1.VectorElement): string | undefined {
  if (element.geometry.transform.kind === 'affine2d')
    return `matrix(${element.geometry.transform.matrix.map(formatCssNumber).join(' ')})`;

  const matrix = element.geometry.transform.matrix;

  if (
    matrix[2] !== 0 ||
    matrix[3] !== 0 ||
    matrix[6] !== 0 ||
    matrix[7] !== 0 ||
    matrix[8] !== 0 ||
    matrix[9] !== 0 ||
    matrix[10] !== 1 ||
    matrix[11] !== 0 ||
    matrix[14] !== 0 ||
    matrix[15] !== 1
  )
    return undefined;

  return `matrix(${[matrix[0], matrix[1], matrix[4], matrix[5], matrix[12], matrix[13]].map(formatCssNumber).join(' ')})`;
}

function createSvg(document: Document, width: number, height: number): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');

  svg.setAttribute('viewBox', `0 0 ${formatCssNumber(width)} ${formatCssNumber(height)}`);
  svg.style.setProperty('width', '100%');
  svg.style.setProperty('height', '100%');
  svg.style.setProperty('overflow', 'visible');

  return svg;
}

function appendPaintSurface(options: {
  readonly document: Document;
  readonly svg: SVGSVGElement;
  readonly width: number;
  readonly height: number;
  readonly definitionId: string;
  readonly definitionKind: 'clip-path' | 'mask';
  readonly backgroundImage: string;
  readonly backgroundBlendMode: string;
}): void {
  const foreignObject = options.document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  const paint = options.document.createElement('div');

  foreignObject.setAttribute('x', '0');
  foreignObject.setAttribute('y', '0');
  foreignObject.setAttribute('width', formatCssNumber(options.width));
  foreignObject.setAttribute('height', formatCssNumber(options.height));
  foreignObject.setAttribute(options.definitionKind, `url(#${options.definitionId})`);
  paint.style.setProperty('width', '100%');
  paint.style.setProperty('height', '100%');
  if (options.backgroundImage.length > 0) paint.style.setProperty('background-image', options.backgroundImage);
  if (options.backgroundBlendMode.length > 0)
    paint.style.setProperty('background-blend-mode', options.backgroundBlendMode);
  foreignObject.appendChild(paint);
  options.svg.appendChild(foreignObject);
}

/** Render one ordinary vector with ordered fills and complete ordered stroke layers. */
export function createLayeredVectorSvgV1(options: {
  readonly document: Document;
  readonly element: projectFormatV1.VectorElement;
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
  readonly width: number;
  readonly height: number;
  readonly backgroundImage: string;
  readonly backgroundBlendMode: string;
}): SVGSVGElement | undefined {
  const data = vectorPath(options.element);

  if (data === undefined) return undefined;

  const fillRule = options.element.geometryData.kind === 'path' ? options.element.geometryData.fillRule : 'nonzero';
  const definitionId = createSvgDefinitionIdFactoryV1(options.document);
  const svg = createSvg(options.document, options.width, options.height);
  const definitions = options.document.createElementNS(SVG_NAMESPACE, 'defs');
  const clip = options.document.createElementNS(SVG_NAMESPACE, 'clipPath');
  const clipGeometry = options.document.createElementNS(SVG_NAMESPACE, 'path');
  const outline = options.document.createElementNS(SVG_NAMESPACE, 'path');
  const clipId = definitionId('vector-clip');

  clip.id = clipId;
  clipGeometry.setAttribute('d', data);
  clipGeometry.setAttribute('fill-rule', fillRule);
  clip.appendChild(clipGeometry);
  definitions.appendChild(clip);
  svg.appendChild(definitions);
  appendPaintSurface({ ...options, svg, definitionId: clipId, definitionKind: 'clip-path' });
  outline.dataset['vectorPath'] = 'true';
  outline.setAttribute('d', data);
  outline.setAttribute('fill', 'transparent');
  outline.setAttribute('fill-rule', fillRule);
  svg.appendChild(outline);
  appendOrdinaryVectorStrokesV1({
    svg,
    definitions,
    data,
    fillRule,
    width: options.width,
    height: options.height,
    strokes: options.element.appearance.strokes,
    context: options.context,
    units: options.units,
    definitionId,
  });

  return svg;
}

function operandPath(
  document: Document,
  element: projectFormatV1.VectorElement,
  color: 'black' | 'white',
): SVGPathElement | undefined {
  const data = vectorPath(element);

  if (data === undefined) return undefined;

  const path = document.createElementNS(SVG_NAMESPACE, 'path');

  path.setAttribute('d', data);
  path.setAttribute('fill', color);
  path.setAttribute('fill-rule', element.geometryData.kind === 'path' ? element.geometryData.fillRule : 'nonzero');
  path.setAttribute('clip-rule', element.geometryData.kind === 'path' ? element.geometryData.fillRule : 'nonzero');

  const transform = svgTransform(element);

  if (element.geometry.transform.kind === 'matrix3d' && transform === undefined) return undefined;
  if (transform !== undefined) path.setAttribute('transform', transform);

  return path;
}

interface BooleanMemoV1 {
  readonly data: string;
  readonly mask: string;
  readonly operation: 'union' | 'subtract' | 'intersect' | 'exclude';
}

interface BooleanFrameV1 {
  readonly element: projectFormatV1.VectorElement;
  nextOperand: number;
}

type BooleanStepV1 =
  | { readonly kind: 'invalid' | 'complete' | 'continue' }
  | { readonly kind: 'nested'; readonly operand: projectFormatV1.VectorElement };

function nextBooleanStep(options: {
  readonly frame: BooleanFrameV1;
  readonly operandMap: ReadonlyMap<projectFormatV1.Id, projectFormatV1.VectorElement>;
  readonly active: ReadonlySet<projectFormatV1.Id>;
  readonly complete: ReadonlySet<projectFormatV1.Id>;
  readonly discovered: Set<projectFormatV1.Id>;
}): BooleanStepV1 {
  if (options.frame.element.geometryData.kind !== 'boolean') return { kind: 'invalid' };
  if (options.frame.nextOperand >= options.frame.element.geometryData.operandIds.length) return { kind: 'complete' };

  const operandId = options.frame.element.geometryData.operandIds[options.frame.nextOperand];

  options.frame.nextOperand += 1;
  if (operandId === undefined) return { kind: 'invalid' };

  const operand = options.operandMap.get(operandId);

  if (operand === undefined) return { kind: 'invalid' };
  options.discovered.add(operandId);
  if (options.discovered.size > BOOLEAN_OPERAND_BUDGET_V1) return { kind: 'invalid' };
  if (operand.geometryData.kind !== 'boolean' || options.complete.has(operand.id)) return { kind: 'continue' };
  if (options.active.has(operand.id)) return { kind: 'invalid' };

  return { kind: 'nested', operand };
}

function booleanPostorder(
  root: projectFormatV1.VectorElement,
  operandMap: ReadonlyMap<projectFormatV1.Id, projectFormatV1.VectorElement>,
): readonly projectFormatV1.VectorElement[] | undefined {
  if (root.geometryData.kind !== 'boolean') return undefined;

  const postorder: projectFormatV1.VectorElement[] = [];
  const stack: BooleanFrameV1[] = [{ element: root, nextOperand: 0 }];
  const active = new Set<projectFormatV1.Id>([root.id]);
  const complete = new Set<projectFormatV1.Id>();
  const discovered = new Set<projectFormatV1.Id>();

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame === undefined) return undefined;

    const step = nextBooleanStep({ frame, operandMap, active, complete, discovered });

    switch (step.kind) {
      case 'invalid':
        return undefined;
      case 'continue':
        break;
      case 'complete':
        active.delete(frame.element.id);
        complete.add(frame.element.id);
        postorder.push(frame.element);
        stack.pop();
        break;
      case 'nested':
        active.add(step.operand.id);
        stack.push({ element: step.operand, nextOperand: 0 });
        break;
    }
  }

  return postorder;
}

function intersectionMaskId(options: {
  readonly document: Document;
  readonly definitions: SVGDefsElement;
  readonly operands: readonly projectFormatV1.VectorElement[];
  readonly width: number;
  readonly height: number;
  readonly definitionId: SvgDefinitionIdFactoryV1;
  readonly createOperand: (
    operand: projectFormatV1.VectorElement,
    color: 'black' | 'white',
  ) => SVGPathElement | undefined;
}): string | undefined {
  if (options.operands.length === 0) return undefined;

  let previousId: string | undefined;

  for (const operand of options.operands) {
    const geometry = options.createOperand(operand, 'white');

    if (geometry === undefined) return undefined;

    const mask = options.document.createElementNS(SVG_NAMESPACE, 'mask');
    const black = options.document.createElementNS(SVG_NAMESPACE, 'path');
    const maskId = options.definitionId('boolean-intersection');

    mask.id = maskId;
    black.setAttribute('d', boundsPath(options.width, options.height));
    black.setAttribute('fill', 'black');
    mask.appendChild(black);

    if (previousId === undefined) mask.appendChild(geometry);
    else {
      const group = options.document.createElementNS(SVG_NAMESPACE, 'g');

      group.setAttribute('mask', `url(#${previousId})`);
      group.appendChild(geometry);
      mask.appendChild(group);
    }

    options.definitions.appendChild(mask);
    previousId = maskId;
  }

  return previousId;
}

function createMemoOperand(
  document: Document,
  element: projectFormatV1.VectorElement,
  memo: BooleanMemoV1,
  color: 'black' | 'white',
): SVGPathElement | undefined {
  const path = document.createElementNS(SVG_NAMESPACE, 'path');

  path.dataset['booleanCombined'] = memo.operation;
  path.setAttribute('d', memo.data);
  path.setAttribute('mask', memo.mask);
  path.setAttribute('fill', color);

  const transform = svgTransform(element);

  if (element.geometry.transform.kind === 'matrix3d' && transform === undefined) return undefined;
  if (transform !== undefined) path.setAttribute('transform', transform);

  return path;
}

function createBooleanOperand(
  document: Document,
  memo: ReadonlyMap<projectFormatV1.Id, BooleanMemoV1>,
  operand: projectFormatV1.VectorElement,
  color: 'black' | 'white',
): SVGPathElement | undefined {
  if (operand.geometryData.kind !== 'boolean') return operandPath(document, operand, color);

  const nested = memo.get(operand.id);

  return nested === undefined ? undefined : createMemoOperand(document, operand, nested, color);
}

interface BooleanOperationContextV1 {
  readonly document: Document;
  readonly definitions: SVGDefsElement;
  readonly mask: SVGMaskElement;
  readonly operands: readonly projectFormatV1.VectorElement[];
  readonly width: number;
  readonly height: number;
  readonly definitionId: SvgDefinitionIdFactoryV1;
  readonly createOperand: (
    operand: projectFormatV1.VectorElement,
    color: 'black' | 'white',
  ) => SVGPathElement | undefined;
}

function appendUniformBooleanOperands(options: BooleanOperationContextV1, blendMode: string | undefined): boolean {
  for (const operand of options.operands) {
    const path = options.createOperand(operand, 'white');

    if (path === undefined) return false;
    if (blendMode !== undefined) path.style.setProperty('mix-blend-mode', blendMode);
    options.mask.appendChild(path);
  }

  return true;
}

function appendSubtractOperands(options: BooleanOperationContextV1): boolean {
  for (let index = 0; index < options.operands.length; index += 1) {
    const operand = options.operands[index];

    if (operand === undefined) return false;

    const path = options.createOperand(operand, index === 0 ? 'white' : 'black');

    if (path === undefined) return false;
    options.mask.appendChild(path);
  }

  return true;
}

function appendIntersectOperands(options: BooleanOperationContextV1): boolean {
  const maskId = intersectionMaskId(options);

  if (maskId === undefined) return false;

  const white = options.document.createElementNS(SVG_NAMESPACE, 'path');

  white.setAttribute('d', boundsPath(options.width, options.height));
  white.setAttribute('fill', 'white');
  white.setAttribute('mask', `url(#${maskId})`);
  options.mask.appendChild(white);

  return true;
}

function appendBooleanOperation(operation: BooleanMemoV1['operation'], options: BooleanOperationContextV1): boolean {
  switch (operation) {
    case 'union':
      return appendUniformBooleanOperands(options, undefined);
    case 'subtract':
      return appendSubtractOperands(options);
    case 'intersect':
      return appendIntersectOperands(options);
    case 'exclude':
      options.mask.style.setProperty('isolation', 'isolate');

      return appendUniformBooleanOperands(options, 'exclusion');
  }
}

function buildBooleanMask(options: {
  readonly document: Document;
  readonly element: projectFormatV1.VectorElement;
  readonly operandMap: ReadonlyMap<projectFormatV1.Id, projectFormatV1.VectorElement>;
  readonly definitions: SVGDefsElement;
  readonly memo: ReadonlyMap<projectFormatV1.Id, BooleanMemoV1>;
  readonly definitionId: SvgDefinitionIdFactoryV1;
}): BooleanMemoV1 | undefined {
  if (options.element.geometryData.kind !== 'boolean') return undefined;

  const operands: projectFormatV1.VectorElement[] = [];

  for (const operandId of options.element.geometryData.operandIds) {
    const operand = options.operandMap.get(operandId);

    if (operand === undefined) return undefined;
    operands.push(operand);
  }

  if (operands.length < 2) return undefined;

  const width = options.element.geometry.bounds.width;
  const height = options.element.geometry.bounds.height;
  const mask = options.document.createElementNS(SVG_NAMESPACE, 'mask');
  const black = options.document.createElementNS(SVG_NAMESPACE, 'path');
  const maskId = options.definitionId('boolean-mask');
  const createOperand = (
    operand: projectFormatV1.VectorElement,
    color: 'black' | 'white',
  ): SVGPathElement | undefined => createBooleanOperand(options.document, options.memo, operand, color);

  mask.id = maskId;
  black.setAttribute('d', boundsPath(width, height));
  black.setAttribute('fill', 'black');
  mask.appendChild(black);

  if (
    !appendBooleanOperation(options.element.geometryData.operation, {
      ...options,
      mask,
      operands,
      width,
      height,
      createOperand,
    })
  )
    return undefined;

  options.definitions.appendChild(mask);

  return {
    data: boundsPath(width, height),
    mask: `url(#${maskId})`,
    operation: options.element.geometryData.operation,
  };
}

/** Compose a complete typed boolean DAG iteratively through shared SVG mask definitions. */
export function createBooleanSvgV1(options: {
  readonly document: Document;
  readonly element: projectFormatV1.VectorElement;
  readonly operands: readonly projectFormatV1.VectorElement[];
  readonly operandMap?: ReadonlyMap<projectFormatV1.Id, projectFormatV1.VectorElement> | undefined;
  readonly backgroundImage: string;
  readonly backgroundBlendMode: string;
  readonly context: RenderContextV1;
  readonly units: PhysicalUnitContextV1;
}): SVGSVGElement | undefined {
  if (options.element.geometryData.kind !== 'boolean') return undefined;

  const operandMap = new Map(options.operandMap);

  for (const operand of options.operands) operandMap.set(operand.id, operand);

  const postorder = booleanPostorder(options.element, operandMap);

  if (postorder === undefined) return undefined;

  const definitions = options.document.createElementNS(SVG_NAMESPACE, 'defs');
  const memo = new Map<projectFormatV1.Id, BooleanMemoV1>();
  const definitionId = createSvgDefinitionIdFactoryV1(options.document);

  for (const element of postorder) {
    const result = buildBooleanMask({
      document: options.document,
      element,
      operandMap,
      definitions,
      memo,
      definitionId,
    });

    if (result === undefined) return undefined;
    memo.set(element.id, result);
  }

  const root = memo.get(options.element.id);

  if (root === undefined) return undefined;

  const width = options.element.geometry.bounds.width;
  const height = options.element.geometry.bounds.height;
  const maskId = root.mask.slice('url(#'.length, -1);
  const svg = createSvg(options.document, width, height);

  svg.appendChild(definitions);
  appendPaintSurface({ ...options, svg, width, height, definitionId: maskId, definitionKind: 'mask' });

  const combined = options.document.createElementNS(SVG_NAMESPACE, 'path');

  combined.dataset['booleanCombined'] = root.operation;
  combined.setAttribute('d', root.data);
  combined.setAttribute('fill', 'transparent');
  combined.setAttribute('mask', root.mask);
  svg.appendChild(combined);
  appendBooleanVectorStrokesV1({
    svg,
    definitions,
    booleanMaskId: maskId,
    boundsData: root.data,
    width,
    height,
    strokes: options.element.appearance.strokes,
    context: options.context,
    units: options.units,
    definitionId,
  });

  return svg;
}
