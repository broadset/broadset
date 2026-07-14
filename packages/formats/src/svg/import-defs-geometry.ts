import {
  compose as composeMatrix,
  fromDefinition as matrixFromDefinition,
  fromTransformAttribute as matrixFromTransformAttribute,
  type Matrix,
  type MatrixDescriptor,
} from 'transformation-matrix';

import {
  isSafeSvgPathData,
  type SvgSourceAffineMatrix,
  type SvgSourcePatternFill,
} from './source-model';
import { ellipseAsPathD, polygonAsPathD, rectAsPathD } from './transform';

export function buildClipPathsMap(doc: Document): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const clipPaths = doc.getElementsByTagName('clipPath');

  for (let index = 0; index < clipPaths.length; index += 1) {
    const clipPath = clipPaths[index];

    if (clipPath === undefined) continue;

    const id = clipPath.getAttribute('id');

    if (id === null || id === '') continue;

    const compoundPath = compoundPathFromShapeChildren(clipPath);

    if (compoundPath !== '') map.set(id, compoundPath);
  }

  return map;
}

export function buildMasksMap(doc: Document): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const masks = doc.getElementsByTagName('mask');

  for (let index = 0; index < masks.length; index += 1) {
    const mask = masks[index];

    if (mask === undefined) continue;

    const id = mask.getAttribute('id');

    if (id === null || id === '') continue;

    const compoundPath = compoundPathFromShapeChildren(mask);

    if (compoundPath !== '') map.set(id, compoundPath);
  }

  return map;
}

function compoundPathFromShapeChildren(parent: Element): string {
  const segments: string[] = [];
  const children = parent.getElementsByTagName('*');

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (child === undefined) continue;

    const path = shapeElementToPathData(child);

    if (path !== '' && isSafeSvgPathData(path)) segments.push(path);
  }

  return segments.join(' ');
}

function shapeElementToPathData(element: Element): string {
  const tag = element.tagName.toLowerCase();

  if (tag === 'path') return element.getAttribute('d') ?? '';

  if (tag === 'rect') {
    return rectAsPathD(
      readNumericAttribute(element, 'x', 0),
      readNumericAttribute(element, 'y', 0),
      readNumericAttribute(element, 'width', 0),
      readNumericAttribute(element, 'height', 0),
    );
  }

  if (tag === 'circle') {
    const centerX = readNumericAttribute(element, 'cx', 0);
    const centerY = readNumericAttribute(element, 'cy', 0);
    const radius = readNumericAttribute(element, 'r', 0);

    return radius > 0 ? ellipseAsPathD(centerX, centerY, radius, radius) : '';
  }

  if (tag === 'ellipse') {
    return ellipseAsPathD(
      readNumericAttribute(element, 'cx', 0),
      readNumericAttribute(element, 'cy', 0),
      readNumericAttribute(element, 'rx', 0),
      readNumericAttribute(element, 'ry', 0),
    );
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const points = element.getAttribute('points') ?? '';

    return points === '' ? '' : polygonAsPathD(points, tag === 'polygon');
  }

  return '';
}

function readNumericAttribute(element: Element, name: string, fallback: number): number {
  const value = element.getAttribute(name);

  return value === null ? fallback : Number.parseFloat(value);
}

export function buildPatternsMap(doc: Document): ReadonlyMap<string, SvgSourcePatternFill> {
  const map = new Map<string, SvgSourcePatternFill>();
  const patterns = doc.getElementsByTagName('pattern');

  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index];

    if (pattern === undefined) continue;

    const id = pattern.getAttribute('id');

    if (id === null || id === '') continue;

    const image = pattern.getElementsByTagName('image')[0];

    if (image === undefined) continue;

    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href') ?? '';

    if (href === '') continue;

    const transform = parseSvgTransformToAffine(pattern.getAttribute('patternTransform'));

    map.set(id, {
      kind: 'pattern',
      assetId: href,
      repeat: 'repeat',
      ...(transform === undefined ? {} : { transform }),
    });
  }

  return map;
}

function parseSvgTransformToAffine(transform: string | null): SvgSourceAffineMatrix | undefined {
  if (transform === null || transform.trim() === '') return undefined;

  let descriptors: MatrixDescriptor[];

  try {
    descriptors = matrixFromTransformAttribute(transform);
  } catch {
    return undefined;
  }

  if (descriptors.length === 0) return undefined;

  const matrices: Matrix[] = [];

  for (const descriptor of descriptors) matrices.push(matrixFromDefinition(descriptor));

  const composed = composeMatrix(...matrices);

  if (
    !Number.isFinite(composed.a) ||
    !Number.isFinite(composed.b) ||
    !Number.isFinite(composed.c) ||
    !Number.isFinite(composed.d) ||
    !Number.isFinite(composed.e) ||
    !Number.isFinite(composed.f)
  ) {
    return undefined;
  }

  return [composed.a, composed.b, composed.c, composed.d, composed.e, composed.f];
}
