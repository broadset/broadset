import { projectFormatV1 } from '@broadset/model';

import {
  assembleImportedProjectV1,
  computeSha256DigestV1,
  createInteropCollectorV1,
  createResourceCollectorV1,
  type ProjectImportResultV1,
} from '../../v1';
import { createSvgFontRegistryV1 } from './font-registry';
import { mapSvgElementV1 } from './map-element';
import { type ParsedSvgSourceV1,parseSvgSourceV1 } from './source-details';
import type { MappedElementV1 } from './types';

const IMPORTER_VERSION = 'broadset-svg-v1/1';
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const MINIMUM_SURFACE_SIZE = 1;
const PROJECT_ID = projectFormatV1.idSchema.parse('svg-import-project');
const DOCUMENT_ID = projectFormatV1.idSchema.parse('svg-import-document');
const PAGE_ID = projectFormatV1.idSchema.parse('svg-import-page');
const ROOT_ID = projectFormatV1.idSchema.parse('svg-root');

function projectName(fileName: string | undefined): string {
  const value = fileName?.replace(/\.svg$/iu, '').trim();

  return value === undefined || value === '' ? 'Imported SVG' : value;
}

function validDimension(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : MINIMUM_SURFACE_SIZE;
}

function rootElement(parsed: ParsedSvgSourceV1): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: ROOT_ID,
    name: 'SVG root',
    geometry: projectFormatV1.createElementGeometry({
      width: validDimension(parsed.canvasWidth),
      height: validDimension(parsed.canvasHeight),
    }),
    kind: 'group',
  });
}

function surface(parsed: ParsedSvgSourceV1): projectFormatV1.SurfaceDefinition {
  return {
    ...projectFormatV1.createDefaultSurface(),
    size: [validDimension(parsed.canvasWidth), validDimension(parsed.canvasHeight)],
  };
}

function rootInstance(): projectFormatV1.PageRootInstance {
  return { id: projectFormatV1.idSchema.parse('svg-root-instance'), elementId: ROOT_ID, overrides: [], componentPropertyValues: [] };
}

function entityAddress(elementId: projectFormatV1.Id): projectFormatV1.EntityAddress {
  return {
    projectId: PROJECT_ID,
    documentId: DOCUMENT_ID,
    entityKind: projectFormatV1.idSchema.parse('element'),
    entityId: elementId,
  };
}

async function addInteropRecord(input: {
  readonly collector: ReturnType<typeof createInteropCollectorV1>;
  readonly sourceId: projectFormatV1.Id;
  readonly mapped: MappedElementV1;
}): Promise<void> {
  const element = input.mapped.element;

  if (element === undefined) return;

  // D2 hashes the factory-produced element directly; canonical JSON ordering is deferred.
  const baselineSemanticHash = await computeSha256DigestV1(
    new TextEncoder().encode(JSON.stringify(element)),
  );

  input.collector.addRecord({
    sourceId: input.sourceId,
    target: entityAddress(element.id),
    baselineSemanticHash,
    mappingConfidence: input.mapped.mappingConfidence,
    editability: input.mapped.editability,
    warnings: input.mapped.warnings,
  });
}

function belongsToTopLevel(input: {
  readonly element: projectFormatV1.Element | undefined;
  readonly topLevelId: projectFormatV1.Id;
  readonly elementsById: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Element>;
}): boolean {
  let current = input.element;

  for (let depth = 0; current !== undefined && depth <= input.elementsById.size; depth += 1) {
    if (current.id === input.topLevelId) return true;
    if (current.parentId === null || current.parentId === ROOT_ID) return false;

    current = input.elementsById.get(current.parentId);
  }

  return false;
}

function aggregateTopLevelMapping(input: {
  readonly topLevel: MappedElementV1;
  readonly allMapped: readonly MappedElementV1[];
  readonly elementsById: ReadonlyMap<projectFormatV1.Id, projectFormatV1.Element>;
}): MappedElementV1 {
  const element = input.topLevel.element;

  if (element === undefined) return input.topLevel;

  const descendants = input.allMapped.filter((candidate) =>
    belongsToTopLevel({ element: candidate.element, topLevelId: element.id, elementsById: input.elementsById }),
  );
  const warnings = descendants.flatMap((candidate) => candidate.warnings);
  const hasFallback = descendants.some((candidate) => candidate.editability === 'appearance-only');

  return {
    ...input.topLevel,
    warnings,
    mappingConfidence: hasFallback ? 0.7 : input.topLevel.mappingConfidence,
    editability: hasFallback ? 'appearance-only' : input.topLevel.editability,
  };
}

async function buildImportedResult(input: {
  readonly parsed: ParsedSvgSourceV1;
  readonly svg: string;
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly errorMessage?: string;
}): Promise<ProjectImportResultV1> {
  const resourceCollector = createResourceCollectorV1();
  const interopCollector = createInteropCollectorV1();
  const fontRegistry = createSvgFontRegistryV1(resourceCollector);
  const sourceBytes = new TextEncoder().encode(input.svg);
  const sourceAssetId = await resourceCollector.addVectorAsset({
    bytes: sourceBytes,
    mediaType: 'image/svg+xml',
    name: input.fileName ?? 'source.svg',
    intrinsicBounds: {
      x: 0,
      y: 0,
      width: validDimension(input.parsed.canvasWidth),
      height: validDimension(input.parsed.canvasHeight),
    },
  });
  const sourceId = interopCollector.addSource({
    format: 'svg',
    sourceAssetId,
    importerVersion: IMPORTER_VERSION,
    importedAt: input.importedAt,
  });
  const idBySourceId = new Map<string, projectFormatV1.Id>();
  const elementIds = input.parsed.imported.map((imported, index) => {
    const elementId = projectFormatV1.idSchema.parse(`svg-element-${String(index + 1)}`);

    if (imported.dataBsId !== undefined && !idBySourceId.has(imported.dataBsId)) {
      idBySourceId.set(imported.dataBsId, elementId);
    }

    return elementId;
  });
  const mapped = await Promise.all(input.parsed.imported.map(async (imported, index) => {
    const elementId = elementIds[index] ?? projectFormatV1.idSchema.parse(`svg-element-${String(index + 1)}`);
    const sourceParentId = imported.parentDataBsId;
    const parentId = sourceParentId === null || sourceParentId === undefined
      ? ROOT_ID
      : idBySourceId.get(sourceParentId) ?? ROOT_ID;

    return mapSvgElementV1({
      imported,
      source: input.parsed.sources[index] ?? {
        element: undefined,
        opacity: undefined,
        fillOpacity: undefined,
        strokeOpacity: undefined,
        hasPaintServer: false,
        hasFilter: false,
        hasClipPath: false,
        hasMask: false,
      },
      elementId,
      parentId,
      resourceCollector,
      fontRegistry,
    });
  }));
  const elements = [rootElement(input.parsed), ...mapped.flatMap(({ element }) => element === undefined ? [] : [element])];
  const topLevelMapped = mapped.filter(({ element }) => element?.parentId === ROOT_ID);
  const elementsById = new Map(elements.map((element) => [element.id, element]));

  for (const item of topLevelMapped) {
    await addInteropRecord({
      collector: interopCollector,
      sourceId,
      mapped: aggregateTopLevelMapping({ topLevel: item, allMapped: mapped, elementsById }),
    });
  }

  if (input.errorMessage !== undefined) {
    const root = elements[0];

    if (root !== undefined) {
      await addInteropRecord({
        collector: interopCollector,
        sourceId,
        mapped: {
          element: root,
          mappingConfidence: 0,
          editability: 'appearance-only',
          warnings: [{
            code: 'svg.import-failed',
            severity: 'error',
            message: input.errorMessage,
            dimension: 'semantics',
            pointer: '/',
          }],
        },
      });
    }
  }

  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: surface(input.parsed),
    elements,
    pages: [projectFormatV1.createPageV1({ id: PAGE_ID, rootInstances: [rootInstance()] })],
  });

  return assembleImportedProjectV1({
    id: PROJECT_ID,
    name: projectName(input.fileName),
    document,
    resources: resourceCollector.collect(),
    interop: interopCollector.build(),
  });
}

function emptyParsedSource(): ParsedSvgSourceV1 {
  return { imported: [], sources: [], canvasWidth: 1, canvasHeight: 1, warnings: [] };
}

export async function importSvgProjectV1(input: {
  readonly svg: string;
  readonly fileName?: string;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly maxBytes?: number;
}): Promise<ProjectImportResultV1> {
  try {
    const byteLength = new TextEncoder().encode(input.svg).byteLength;
    const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;

    if (maxBytes > 0 && byteLength > maxBytes) {
      return await buildImportedResult({
        parsed: emptyParsedSource(),
        svg: input.svg,
        fileName: input.fileName,
        importedAt: input.importedAt,
        errorMessage: `SVG input exceeded the ${String(maxBytes)} byte limit.`,
      });
    }

    return await buildImportedResult({
      parsed: parseSvgSourceV1(input.svg),
      svg: input.svg,
      fileName: input.fileName,
      importedAt: input.importedAt,
    });
  } catch (error: unknown) {
    try {
      return await buildImportedResult({
        parsed: emptyParsedSource(),
        svg: input.svg,
        fileName: input.fileName,
        importedAt: input.importedAt,
        errorMessage: error instanceof Error ? error.message : 'SVG import failed.',
      });
    } catch {
      return { project: projectFormatV1.createProjectV1({ id: PROJECT_ID, name: projectName(input.fileName) }), blobs: new Map() };
    }
  }
}
