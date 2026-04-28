import type { Canvas } from '@broadset/model';

import { findChild, getAttr, parseOoxml, rootElement } from '../ooxml/ast';
import { OOXML_REL_TYPES } from '../ooxml/namespaces';
import { parseRelationshipsXml } from '../ooxml/relationships';
import { emuToMm } from '../ooxml/units';
import { type OoxmlPackage, readTextPart } from '../ooxml/zip';

/**
 * Package-level resolution — given an OoxmlPackage, find the slide
 * paths, the master / layout / theme parts they reference, and the
 * slide-size from `ppt/presentation.xml`.
 *
 * Tolerant of malformed packages: returns empty slide arrays rather
 * than throwing, so the importer can still report partial content.
 */

interface ResolvedPackage {
  readonly slidePaths: readonly string[];
  readonly slideRelsByPath: ReadonlyMap<string, string>;
  readonly canvas: Canvas;
  readonly themePath: string | null;
  readonly masterPath: string | null;
  readonly layoutPaths: readonly string[];
}

const DEFAULT_CANVAS: Canvas = {
  width: 254, // 10 inches in mm
  height: 190.5, // 7.5 inches in mm
  unit: 'mm',
  dpi: 72,
  padding: [0, 0, 0, 0],
  backgroundMode: 'solid',
};

export function resolvePackage(pkg: OoxmlPackage): ResolvedPackage {
  const presXml = readTextPart(pkg, 'ppt/presentation.xml') ?? '';
  const presRelsXml = readTextPart(pkg, 'ppt/_rels/presentation.xml.rels') ?? '';
  const canvas = parseCanvasFromPresentation(presXml);
  const presRels = parseRelationshipsXml(presRelsXml);

  const slidePaths: string[] = [];
  const slideRelsByPath = new Map<string, string>();
  const layoutPaths: string[] = [];
  let themePath: string | null = null;
  let masterPath: string | null = null;

  for (const rel of presRels) {
    if (rel.type === OOXML_REL_TYPES.slide) {
      const target = resolveRelTarget('ppt', rel.target);

      slidePaths.push(target);
    } else if (rel.type === OOXML_REL_TYPES.theme) {
      themePath = resolveRelTarget('ppt', rel.target);
    } else if (rel.type === OOXML_REL_TYPES.slideMaster) {
      masterPath = resolveRelTarget('ppt', rel.target);
    }
  }

  // Map each slide → its rels file so the caller can resolve media.
  for (const slidePath of slidePaths) {
    const fileName = slidePath.split('/').pop() ?? '';
    const relsPath = `ppt/slides/_rels/${fileName}.rels`;

    slideRelsByPath.set(slidePath, relsPath);
  }

  // Walk master rels to find layouts.
  if (masterPath !== null) {
    const masterFile = masterPath.split('/').pop() ?? '';
    const masterRelsPath = `ppt/slideMasters/_rels/${masterFile}.rels`;
    const masterRelsXml = readTextPart(pkg, masterRelsPath) ?? '';

    for (const rel of parseRelationshipsXml(masterRelsXml)) {
      if (rel.type === OOXML_REL_TYPES.slideLayout) {
        layoutPaths.push(resolveRelTarget('ppt/slideMasters', rel.target));
      } else if (rel.type === OOXML_REL_TYPES.theme && themePath === null) {
        themePath = resolveRelTarget('ppt/slideMasters', rel.target);
      }
    }
  }

  return { slidePaths, slideRelsByPath, canvas, themePath, masterPath, layoutPaths };
}

function parseCanvasFromPresentation(xml: string): Canvas {
  const root = rootElement(parseOoxml(xml));

  if (root === null) return DEFAULT_CANVAS;

  const sldSz = findChild(root, 'p:sldSz');

  if (sldSz === null) return DEFAULT_CANVAS;

  const cx = parseInt(getAttr(sldSz, 'cx') ?? '0', 10);
  const cy = parseInt(getAttr(sldSz, 'cy') ?? '0', 10);

  if (cx <= 0 || cy <= 0) return DEFAULT_CANVAS;

  return {
    width: emuToMm(cx),
    height: emuToMm(cy),
    unit: 'mm',
    dpi: 72,
    padding: [0, 0, 0, 0],
    backgroundMode: 'solid',
  };
}

/**
 * Resolve a relationship target relative to the referring part's
 * directory. OOXML rels use paths like `../media/image1.png` or
 * `slideMasters/slideMaster1.xml`. The root part is always in `ppt/`.
 */
export function resolveRelTarget(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);

  const baseParts = baseDir.split('/').filter((p) => p.length > 0);
  const targetParts = target.split('/');
  const stack = [...baseParts];

  for (const part of targetParts) {
    if (part === '..') {
      stack.pop();
    } else if (part !== '.' && part.length > 0) {
      stack.push(part);
    }
  }

  return stack.join('/');
}
