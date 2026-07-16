import { applyStyleBlocks } from '../import-css';
import { dereferenceUseElements, sanitizeDomInPlace, warnToolNamespaces } from '../import-security';
import type { ImportedElement } from '../import-types';
import { walkSvgDocument } from '../import-walk';
import { serializeSvgElementUpTo } from './bounded-serialization';
import type { SvgSourceDetailsV1 } from './types';

const DEFAULT_MAX_PROVENANCE_BYTES = 32 * 1024 * 1024;

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

interface SourceElementIndexV1 {
  readonly bySourceId: ReadonlyMap<string, Element>;
  readonly byImportedType: ReadonlyMap<string, readonly Element[]>;
}

function indexSourceElements(candidates: readonly Element[]): SourceElementIndexV1 {
  const bySourceId = new Map<string, Element>();
  const byImportedType = new Map<string, Element[]>();

  for (const candidate of candidates) {
    const sourceId = candidate.getAttribute('data-bs-id') ?? candidate.getAttribute('id');
    const importedType = SUPPORTED_TAG_TYPES.get(candidate.tagName.toLowerCase());

    if (sourceId !== null && !bySourceId.has(sourceId)) bySourceId.set(sourceId, candidate);
    if (importedType === undefined) continue;

    const matches = byImportedType.get(importedType) ?? [];

    matches.push(candidate);
    byImportedType.set(importedType, matches);
  }

  return { bySourceId, byImportedType };
}

function matchSourceElements(
  importedElements: readonly ImportedElement[],
  candidates: readonly Element[],
): readonly SvgSourceDetailsV1[] {
  const index = indexSourceElements(candidates);
  const used = new Set<Element>();
  const nextByImportedType = new Map<string, number>();

  return importedElements.map((imported) => {
    const identified = imported.dataBsId === undefined ? undefined : index.bySourceId.get(imported.dataBsId);
    const matchingType = index.byImportedType.get(imported.type) ?? [];
    let nextIndex = nextByImportedType.get(imported.type) ?? 0;

    while (nextIndex < matchingType.length) {
      const candidate = matchingType[nextIndex];

      if (candidate === undefined || !used.has(candidate)) break;

      nextIndex += 1;
    }

    const matched = identified ?? matchingType[nextIndex];

    if (matched !== undefined) {
      used.add(matched);
      if (identified === undefined) nextByImportedType.set(imported.type, nextIndex + 1);
    }

    return details(matched);
  });
}

export interface ParsedSvgSourceV1 {
  readonly imported: readonly ImportedElement[];
  readonly sources: readonly SvgSourceDetailsV1[];
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly warnings: readonly string[];
  readonly sanitizedSvg: string | undefined;
  readonly provenanceLimitExceeded: boolean;
}

export function parseSvgSourceV1(
  svg: string,
  options: { readonly maxDepth?: number; readonly maxProvenanceBytes?: number } = {},
): ParsedSvgSourceV1 {
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

  const provenance = serializeSvgElementUpTo(
    xmlDocument.documentElement,
    options.maxProvenanceBytes ?? DEFAULT_MAX_PROVENANCE_BYTES,
  );
  const walked = walkSvgDocument(xmlDocument, options);
  const candidates = sourceElements(xmlDocument);
  const sources = matchSourceElements(walked.elements, candidates);

  return {
    imported: walked.elements,
    sources,
    canvasWidth: walked.canvasWidth,
    canvasHeight: walked.canvasHeight,
    warnings: [...warnings, ...walked.warnings],
    sanitizedSvg: provenance.value,
    provenanceLimitExceeded: provenance.status === 'exceeded',
  };
}
