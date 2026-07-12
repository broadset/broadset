import { applyStyleBlocks } from '../import-css';
import { dereferenceUseElements, sanitizeDomInPlace, warnToolNamespaces } from '../import-security';
import type { ImportedElement } from '../import-types';
import { walkSvgDocument } from '../import-walk';
import type { SvgSourceDetailsV1 } from './types';

const SUPPORTED_TAG_TYPES = new Map<string, string>([
  ['rect', 'rectangle'],
  ['circle', 'ellipse'],
  ['ellipse', 'ellipse'],
  ['line', 'path'],
  ['polyline', 'path'],
  ['polygon', 'path'],
  ['path', 'path'],
  ['text', 'text'],
  ['image', 'image'],
  ['g', 'group'],
]);

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function inheritedAttribute(element: Element | undefined, name: string): string | null {
  let cursor = element;

  while (cursor !== undefined) {
    const value = cursor.getAttribute(name);

    if (value !== null && value !== '') return value;

    cursor = cursor.parentElement ?? undefined;
  }

  return null;
}

function details(element: Element | undefined): SvgSourceDetailsV1 {
  const fill = inheritedAttribute(element, 'fill') ?? '';

  return {
    element,
    opacity: optionalNumber(element?.getAttribute('opacity') ?? null),
    fillOpacity: optionalNumber(inheritedAttribute(element, 'fill-opacity')),
    strokeOpacity: optionalNumber(inheritedAttribute(element, 'stroke-opacity')),
    hasPaintServer: fill.startsWith('url('),
    hasFilter: element?.getAttribute('filter') !== null && element?.getAttribute('filter') !== undefined,
    hasClipPath: element?.getAttribute('clip-path') !== null && element?.getAttribute('clip-path') !== undefined,
    hasMask: element?.getAttribute('mask') !== null && element?.getAttribute('mask') !== undefined,
  };
}

function sourceElements(document: Document): readonly Element[] {
  return Array.from(document.querySelectorAll('rect,circle,ellipse,line,polyline,polygon,path,text,image,g'));
}

export interface ParsedSvgSourceV1 {
  readonly imported: readonly ImportedElement[];
  readonly sources: readonly SvgSourceDetailsV1[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
}

export function parseSvgSourceV1(svg: string): ParsedSvgSourceV1 {
  const warnings: string[] = [];
  const xmlDocument = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parseError = xmlDocument.querySelector('parsererror');

  if (parseError !== null) throw new Error('SVG import failed: invalid XML');
  if (xmlDocument.doctype !== null) xmlDocument.removeChild(xmlDocument.doctype);

  const withinCap = sanitizeDomInPlace(xmlDocument, warnings);

  if (withinCap) {
    applyStyleBlocks(xmlDocument, warnings);
    dereferenceUseElements(xmlDocument, warnings);
    warnToolNamespaces(xmlDocument, warnings);
  }

  const walked = walkSvgDocument(xmlDocument);
  const candidates = sourceElements(xmlDocument);
  const used = new Set<Element>();
  const sources = walked.elements.map((imported) => {
    const identified = candidates.find((candidate) => {
      const sourceId = candidate.getAttribute('data-bs-id') ?? candidate.getAttribute('id');

      return sourceId !== null && sourceId === imported.dataBsId;
    });
    const matched = identified ?? candidates.find((candidate) => {
      if (used.has(candidate)) return false;

      return SUPPORTED_TAG_TYPES.get(candidate.tagName.toLowerCase()) === imported.type;
    });

    if (matched !== undefined) used.add(matched);

    return details(matched);
  });

  return {
    imported: walked.elements,
    sources,
    canvasWidth: walked.canvasWidth,
    canvasHeight: walked.canvasHeight,
    warnings: [...warnings, ...walked.warnings],
  };
}
