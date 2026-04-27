import svgpath from 'svgpath';

import { findChildren, findDescendant, getAttr, type XmlElement } from '../ooxml/ast';

export interface DetectedGeometry {
  readonly kind: 'rectangle' | 'roundRect' | 'ellipse' | 'path' | 'unknown';
  readonly d?: string;
}

export function detectGeometry(shape: XmlElement): DetectedGeometry | null {
  const prst = findDescendant(shape, 'a:prstGeom');

  if (prst !== null) {
    const preset = getAttr(prst, 'prst') ?? '';

    if (preset === 'rect') return { kind: 'rectangle' };
    if (preset === 'roundRect') return { kind: 'roundRect' };
    if (preset === 'ellipse' || preset === 'circle') return { kind: 'ellipse' };

    const presetD = OOXML_PRESET_TO_SVG_D[preset];

    if (presetD !== undefined) return { kind: 'path', d: presetD };

    return { kind: 'unknown' };
  }

  const custGeom = findDescendant(shape, 'a:custGeom');

  if (custGeom !== null) {
    const d = custGeomToSvgD(custGeom);

    return { kind: 'path', d };
  }

  return null;
}

export function extractPresetName(shape: XmlElement): string | undefined {
  const prst = findDescendant(shape, 'a:prstGeom');

  return prst !== null ? getAttr(prst, 'prst') : undefined;
}

const OOXML_PRESET_TO_SVG_D: Readonly<Record<string, string>> = {
  triangle: 'M 50000 0 L 100000 100000 L 0 100000 Z',
  rtTriangle: 'M 0 0 L 100000 100000 L 0 100000 Z',
  diamond: 'M 50000 0 L 100000 50000 L 50000 100000 L 0 50000 Z',
  parallelogram: 'M 25000 0 L 100000 0 L 75000 100000 L 0 100000 Z',
  trapezoid: 'M 25000 0 L 75000 0 L 100000 100000 L 0 100000 Z',
  pentagon: 'M 50000 0 L 100000 38197 L 80902 100000 L 19098 100000 L 0 38197 Z',
  hexagon: 'M 25000 0 L 75000 0 L 100000 50000 L 75000 100000 L 25000 100000 L 0 50000 Z',
  heptagon: 'M 50000 0 L 89500 19500 L 100000 61100 L 75000 100000 L 25000 100000 L 0 61100 L 10500 19500 Z',
  octagon: 'M 29289 0 L 70711 0 L 100000 29289 L 100000 70711 L 70711 100000 L 29289 100000 L 0 70711 L 0 29289 Z',
  star4:
    'M 50000 0 L 60000 40000 L 100000 50000 L 60000 60000 L 50000 100000 L 40000 60000 L 0 50000 L 40000 40000 Z',
  star5:
    'M 50000 0 L 61803 38197 L 100000 38197 L 69098 61803 L 80902 100000 L 50000 76393 L 19098 100000 L 30902 61803 L 0 38197 L 38197 38197 Z',
  star6:
    'M 50000 0 L 66667 28868 L 100000 25000 L 83333 50000 L 100000 75000 L 66667 71132 L 50000 100000 L 33333 71132 L 0 75000 L 16667 50000 L 0 25000 L 33333 28868 Z',
  star8:
    'M 50000 0 L 61730 23270 L 85355 14645 L 76730 38270 L 100000 50000 L 76730 61730 L 85355 85355 L 61730 76730 L 50000 100000 L 38270 76730 L 14645 85355 L 23270 61730 L 0 50000 L 23270 38270 L 14645 14645 L 38270 23270 Z',
  rightArrow: 'M 0 25000 L 60000 25000 L 60000 0 L 100000 50000 L 60000 100000 L 60000 75000 L 0 75000 Z',
  leftArrow: 'M 100000 25000 L 40000 25000 L 40000 0 L 0 50000 L 40000 100000 L 40000 75000 L 100000 75000 Z',
  upArrow: 'M 25000 100000 L 25000 40000 L 0 40000 L 50000 0 L 100000 40000 L 75000 40000 L 75000 100000 Z',
  downArrow: 'M 25000 0 L 25000 60000 L 0 60000 L 50000 100000 L 100000 60000 L 75000 60000 L 75000 0 Z',
  leftRightArrow: 'M 0 50000 L 25000 0 L 25000 25000 L 75000 25000 L 75000 0 L 100000 50000 L 75000 100000 L 75000 75000 L 25000 75000 L 25000 100000 Z',
  upDownArrow: 'M 50000 0 L 100000 25000 L 75000 25000 L 75000 75000 L 100000 75000 L 50000 100000 L 0 75000 L 25000 75000 L 25000 25000 L 0 25000 Z',
  plus: 'M 35000 0 L 65000 0 L 65000 35000 L 100000 35000 L 100000 65000 L 65000 65000 L 65000 100000 L 35000 100000 L 35000 65000 L 0 65000 L 0 35000 L 35000 35000 Z',
  wedgeRectCallout: 'M 0 0 L 100000 0 L 100000 75000 L 60000 75000 L 50000 100000 L 40000 75000 L 0 75000 Z',
  wedgeRoundRectCallout: 'M 10000 0 L 90000 0 L 100000 10000 L 100000 65000 L 90000 75000 L 60000 75000 L 50000 100000 L 40000 75000 L 10000 75000 L 0 65000 L 0 10000 Z',
  wedgeEllipseCallout: 'M 50000 0 C 22386 0 0 16863 0 37500 C 0 58137 22386 75000 50000 75000 L 60000 75000 L 50000 100000 L 40000 75000 C 36000 75000 32000 74600 28000 73850 Z',
};

function custGeomToSvgD(custGeom: XmlElement): string {
  const path = findDescendant(custGeom, 'a:path');

  if (path === null) return '';

  const ops: string[] = [];

  for (const op of path.children) {
    if (op.kind !== 'element') continue;

    const segment = opToSvgSegment(op);

    if (segment !== null) ops.push(segment);
    else if (op.local === 'close') ops.push('Z');
  }

  const d = ops.join(' ');

  if (d.length === 0) return '';

  try {
    return svgpath(d).abs().toString();
  } catch {
    return d;
  }
}

function opToSvgSegment(op: XmlElement): string | null {
  const pts = findChildren(op, 'a:pt').map((pt) => ({
    x: parseFloat(getAttr(pt, 'x') ?? '0'),
    y: parseFloat(getAttr(pt, 'y') ?? '0'),
  }));
  const p0 = pts[0];
  const p1 = pts[1];
  const p2 = pts[2];

  if (op.local === 'moveTo' && p0 !== undefined) return `M ${String(p0.x)} ${String(p0.y)}`;
  if (op.local === 'lnTo' && p0 !== undefined) return `L ${String(p0.x)} ${String(p0.y)}`;

  if (op.local === 'cubicBezTo' && p0 !== undefined && p1 !== undefined && p2 !== undefined) {
    return `C ${String(p0.x)} ${String(p0.y)} ${String(p1.x)} ${String(p1.y)} ${String(p2.x)} ${String(p2.y)}`;
  }

  if (op.local === 'quadBezTo' && p0 !== undefined && p1 !== undefined) {
    return `Q ${String(p0.x)} ${String(p0.y)} ${String(p1.x)} ${String(p1.y)}`;
  }

  return null;
}
