import { projectFormatV1 } from '@broadset/model';

import {
  containsForbiddenXmlDeclaration,
  inspectMarkupBounds,
  measureUtf8BytesUpTo,
  resolvePositiveIntegerLimit,
} from '../../_shared/import-limits';
import {
  assembleImportedProjectV1,
  createInteropCollectorV1,
  createResourceCollectorV1,
  type ProjectImportResultV1,
} from '../../v1';
import { createSvgFontRegistryV1 } from './font-registry';
import { createSvgImageAssetRegistryV1, mapSvgElementV1 } from './map-element';
import { type ParsedSvgSourceV1, parseSvgSourceV1 } from './source-details';
import type { MappedElementV1 } from './types';

const IMPORTER_VERSION = 'broadset-svg-v1/1';
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_RETAINED_RESOURCE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_NODES = 10_000;
const DEFAULT_MAX_DEPTH = 100;
const MINIMUM_SURFACE_SIZE = 1;
const PROJECT_ID = projectFormatV1.idSchema.parse('svg-import-project');
const DOCUMENT_ID = projectFormatV1.idSchema.parse('svg-import-document');
const PAGE_ID = projectFormatV1.idSchema.parse('svg-import-page');
const ROOT_ID = projectFormatV1.idSchema.parse('svg-root');
const FALLBACK_ASSET_ID = projectFormatV1.idSchema.parse('svg-fallback-source');
const FALLBACK_SOURCE_ID = projectFormatV1.idSchema.parse('svg-fallback-interop-source');
const FALLBACK_RECORD_ID = projectFormatV1.idSchema.parse('svg-fallback-interop-record');
const EMPTY_DIGEST = projectFormatV1.sha256DigestSchema.parse(
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
);

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
  return {
    id: projectFormatV1.idSchema.parse('svg-root-instance'),
    elementId: ROOT_ID,
    overrides: [],
    componentPropertyValues: [],
  };
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

  const baselineSemanticHash = await projectFormatV1.computeCanonicalJsonHashV1(element);

  input.collector.addRecord({
    sourceId: input.sourceId,
    target: entityAddress(element.id),
    baselineSemanticHash,
    mappingConfidence: input.mapped.mappingConfidence,
    editability: input.mapped.editability,
    warnings: input.mapped.warnings,
  });
}

function aggregateTopLevelMappings(mapped: readonly MappedElementV1[]): ReadonlyMap<projectFormatV1.Id, MappedElementV1> {
  const topLevelByElementId = new Map<projectFormatV1.Id, projectFormatV1.Id>();
  const warningsByTopLevel = new Map<projectFormatV1.Id, projectFormatV1.InteropDiagnostic[]>();
  const appearanceFallbacks = new Set<projectFormatV1.Id>();
  const topLevelMappings = new Map<projectFormatV1.Id, MappedElementV1>();

  function resolveTopLevelId(element: projectFormatV1.Element): projectFormatV1.Id | undefined {
    if (element.parentId === ROOT_ID) return element.id;
    if (element.parentId === null) return undefined;

    return topLevelByElementId.get(element.parentId);
  }

  // The SVG walk emits each group before its descendants, enabling one-pass aggregation.
  for (const candidate of mapped) {
    const element = candidate.element;

    if (element === undefined) continue;

    const topLevelId = resolveTopLevelId(element);

    if (topLevelId === undefined) continue;

    topLevelByElementId.set(element.id, topLevelId);

    const warnings = warningsByTopLevel.get(topLevelId) ?? [];

    warnings.push(...candidate.warnings);
    warningsByTopLevel.set(topLevelId, warnings);

    if (candidate.editability === 'appearance-only') appearanceFallbacks.add(topLevelId);
    if (element.id === topLevelId) topLevelMappings.set(topLevelId, candidate);
  }

  const aggregates = new Map<projectFormatV1.Id, MappedElementV1>();

  topLevelMappings.forEach((topLevel: MappedElementV1, topLevelId: projectFormatV1.Id): void => {
    const hasFallback = appearanceFallbacks.has(topLevelId);

    aggregates.set(topLevelId, {
      ...topLevel,
      warnings: warningsByTopLevel.get(topLevelId) ?? [],
      mappingConfidence: hasFallback ? 0.7 : topLevel.mappingConfidence,
      editability: hasFallback ? 'appearance-only' : topLevel.editability,
    });
  });

  return aggregates;
}

async function buildImportedResult(input: {
  readonly parsed: ParsedSvgSourceV1;
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly maxRetainedResourceBytes?: number;
  readonly boundaryFailure?: { readonly code: string; readonly message: string };
}): Promise<ProjectImportResultV1> {
  const resourceCollector = createResourceCollectorV1();
  const interopCollector = createInteropCollectorV1();
  const fontRegistry = createSvgFontRegistryV1(resourceCollector);
  const imageAssetRegistry = createSvgImageAssetRegistryV1(
    resourceCollector,
    input.maxRetainedResourceBytes ?? DEFAULT_MAX_RETAINED_RESOURCE_BYTES,
  );
  const sourceBytes =
    input.parsed.sanitizedSvg === undefined ? new Uint8Array() : new TextEncoder().encode(input.parsed.sanitizedSvg);
  // The sanitized source remains provenance only. Keeping it as a foreign
  // asset prevents any residual CSS/URL surface from entering a renderer.
  const sourceAssetId = await resourceCollector.addForeignAsset({
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
  const mapped = await Promise.all(
    input.parsed.imported.map(async (imported, index) => {
      const elementId = elementIds[index] ?? projectFormatV1.idSchema.parse(`svg-element-${String(index + 1)}`);
      const sourceParentId = imported.parentDataBsId;
      const parentId =
        sourceParentId === null || sourceParentId === undefined ?
          ROOT_ID
        : (idBySourceId.get(sourceParentId) ?? ROOT_ID);

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
        imageAssetRegistry,
        fontRegistry,
      });
    }),
  );
  const elements = [
    rootElement(input.parsed),
    ...mapped.flatMap(({ element }) => (element === undefined ? [] : [element])),
  ];
  const topLevelMapped = mapped.filter(({ element }) => element?.parentId === ROOT_ID);
  const topLevelAggregates = aggregateTopLevelMappings(mapped);
  const globalWarnings = globalImportWarnings(input.parsed, input.boundaryFailure);

  for (let index = 0; index < topLevelMapped.length; index += 1) {
    const item = topLevelMapped[index];

    if (item === undefined) continue;

    const elementId = item.element?.id;
    const aggregated = elementId === undefined ? item : (topLevelAggregates.get(elementId) ?? item);

    await addInteropRecord({
      collector: interopCollector,
      sourceId,
      mapped: index === 0 ? { ...aggregated, warnings: [...aggregated.warnings, ...globalWarnings] } : aggregated,
    });
  }

  if (topLevelMapped.length === 0 && globalWarnings.length > 0) {
    const root = elements[0];

    if (root !== undefined) {
      await addInteropRecord({
        collector: interopCollector,
        sourceId,
        mapped: {
          element: root,
          mappingConfidence: 0,
          editability: 'appearance-only',
          warnings: globalWarnings,
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

function globalImportWarnings(
  parsed: ParsedSvgSourceV1,
  boundaryFailure: { readonly code: string; readonly message: string } | undefined,
): readonly projectFormatV1.InteropDiagnostic[] {
  const sanitizerWarnings: projectFormatV1.InteropDiagnostic[] = parsed.warnings.map((message) => ({
    code: 'svg.sanitized',
    severity: 'warning',
    message,
    dimension: 'semantics',
    pointer: '/',
  }));
  const provenanceWarnings: readonly projectFormatV1.InteropDiagnostic[] =
    parsed.provenanceLimitExceeded ?
      [
        {
          code: 'svg.provenance-too-large',
          severity: 'warning',
          message: 'Sanitized SVG provenance exceeded the configured byte limit and was not retained.',
          dimension: 'semantics',
          pointer: '/',
        },
      ]
    : [];

  if (boundaryFailure === undefined) return [...sanitizerWarnings, ...provenanceWarnings];

  return [
    ...sanitizerWarnings,
    ...provenanceWarnings,
    {
      code: boundaryFailure.code,
      severity: 'error',
      message: boundaryFailure.message,
      dimension: 'semantics',
      pointer: '/',
    },
  ];
}

function emptyParsedSource(): ParsedSvgSourceV1 {
  return {
    imported: [],
    sources: [],
    canvasWidth: 1,
    canvasHeight: 1,
    warnings: [],
    sanitizedSvg: undefined,
    provenanceLimitExceeded: false,
  };
}

function absoluteFallbackResult(input: {
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly message: string;
}): ProjectImportResultV1 {
  const root = rootElement(emptyParsedSource());
  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: surface(emptyParsedSource()),
    elements: [root],
    pages: [projectFormatV1.createPageV1({ id: PAGE_ID, rootInstances: [rootInstance()] })],
  });
  const sourceAsset: projectFormatV1.VectorAsset = {
    id: FALLBACK_ASSET_ID,
    kind: 'vector',
    name: input.fileName ?? 'source.svg',
    blob: {
      digest: EMPTY_DIGEST,
      byteLength: 0,
      mediaType: 'image/svg+xml',
      source: { kind: 'package', path: `blobs/sha256/${EMPTY_DIGEST.slice('sha256:'.length)}` },
    },
    metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } },
  };
  const project = projectFormatV1.createProjectV1({
    id: PROJECT_ID,
    name: projectName(input.fileName),
    documents: [document],
    resources: {
      assets: [sourceAsset],
      fonts: [],
      swatches: [],
      variables: [],
      styles: [],
      outputProfiles: [],
    },
  });

  return {
    project: {
      ...project,
      interop: {
        sources: [
          {
            id: FALLBACK_SOURCE_ID,
            format: 'svg',
            sourceAssetId: FALLBACK_ASSET_ID,
            importerVersion: IMPORTER_VERSION,
            importedAt: input.importedAt,
          },
        ],
        records: [
          {
            id: FALLBACK_RECORD_ID,
            sourceId: FALLBACK_SOURCE_ID,
            target: entityAddress(ROOT_ID),
            baselineSemanticHash: EMPTY_DIGEST,
            mappingConfidence: 0,
            editability: 'appearance-only',
            warnings: [
              {
                code: 'svg.import-failed',
                severity: 'error',
                message: input.message,
                dimension: 'semantics',
                pointer: '/',
              },
            ],
          },
        ],
      },
    },
    blobs: new Map([[EMPTY_DIGEST, new Uint8Array()]]),
  };
}

export async function importSvgProjectV1(input: {
  readonly svg: string;
  readonly fileName?: string;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly maxBytes?: number;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxRetainedResourceBytes?: number;
}): Promise<ProjectImportResultV1> {
  try {
    const maxBytes = resolvePositiveIntegerLimit(input.maxBytes, DEFAULT_MAX_BYTES);
    const maxNodes = resolvePositiveIntegerLimit(input.maxNodes, DEFAULT_MAX_NODES);
    const maxDepth = resolvePositiveIntegerLimit(input.maxDepth, DEFAULT_MAX_DEPTH);
    const maxRetainedResourceBytes = resolvePositiveIntegerLimit(
      input.maxRetainedResourceBytes,
      DEFAULT_MAX_RETAINED_RESOURCE_BYTES,
    );
    const byteLength = measureUtf8BytesUpTo(input.svg, maxBytes);

    if (byteLength.status === 'exceeded') {
      return await buildImportedResult({
        parsed: emptyParsedSource(),
        fileName: input.fileName,
        importedAt: input.importedAt,
        boundaryFailure: {
          code: 'svg.input-too-large',
          message: `SVG input exceeded the ${String(maxBytes)} byte limit.`,
        },
      });
    }

    if (containsForbiddenXmlDeclaration(input.svg)) {
      return await buildImportedResult({
        parsed: emptyParsedSource(),
        fileName: input.fileName,
        importedAt: input.importedAt,
        boundaryFailure: {
          code: 'svg.dtd-rejected',
          message: 'SVG input contained a DTD or entity declaration and was rejected before XML parsing.',
        },
      });
    }

    const markupBounds = inspectMarkupBounds(input.svg, { maxNodes, maxDepth });

    if (markupBounds.status === 'rejected') {
      const label = markupBounds.reason === 'node-limit' ? 'node' : 'depth';

      return await buildImportedResult({
        parsed: emptyParsedSource(),
        fileName: input.fileName,
        importedAt: input.importedAt,
        boundaryFailure: {
          code: `svg.${markupBounds.reason}`,
          message: `SVG input exceeded the configured ${label} limit before XML parsing.`,
        },
      });
    }

    return await buildImportedResult({
      parsed: parseSvgSourceV1(input.svg, { maxDepth, maxProvenanceBytes: maxBytes }),
      fileName: input.fileName,
      importedAt: input.importedAt,
      maxRetainedResourceBytes,
    });
  } catch (error: unknown) {
    try {
      return await buildImportedResult({
        parsed: emptyParsedSource(),
        fileName: input.fileName,
        importedAt: input.importedAt,
        boundaryFailure: {
          code: 'svg.import-failed',
          message: error instanceof Error ? error.message : 'SVG import failed.',
        },
      });
    } catch {
      return absoluteFallbackResult({
        fileName: input.fileName,
        importedAt: input.importedAt,
        message: error instanceof Error ? error.message : 'SVG import failed.',
      });
    }
  }
}
