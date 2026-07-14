import { projectFormatV1 } from '@broadset/model';

import {
  assembleImportedProjectV1,
  createInteropCollectorV1,
  createResourceCollectorV1,
  type ProjectImportResultV1,
} from '../../v1';
import { readOoxmlPackageWithCaps } from '../ooxml/zip';
import { importPptxSourceWithReport } from '../source-import';
import type { PptxImportOptions, PptxImportWarning } from '../types';
import { createPptxFontRegistryV1 } from './font-registry';
import { type MappedPptxElementV1, mapPptxElementsV1 } from './map-elements';
import { collectMetadataBlobs, readProjectMetadataV1 } from './metadata';
import { reconcileMetadataProjectV1 } from './reconcile-metadata';

const IMPORTER_VERSION = 'broadset-pptx-v1/1';
const PROJECT_ID = projectFormatV1.idSchema.parse('pptx-import-project');
const DOCUMENT_ID = projectFormatV1.idSchema.parse('pptx-import-document');
const FALLBACK_ROOT_ID = projectFormatV1.idSchema.parse('pptx-fallback-root');
const DEFAULT_MAX_INPUT_BYTES = 200 * 1024 * 1024;
const PPTX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const FALLBACK_ASSET_ID = projectFormatV1.idSchema.parse('pptx-fallback-source');
const FALLBACK_SOURCE_ID = projectFormatV1.idSchema.parse('pptx-fallback-interop-source');
const FALLBACK_RECORD_ID = projectFormatV1.idSchema.parse('pptx-fallback-interop-record');
const FALLBACK_HASH = projectFormatV1.sha256DigestSchema.parse(
  'sha256:a656d6a0cfe01994e28993fba7cbffd197a2f51e072ff52913559a7ae7f000f4',
);
const EMPTY_DIGEST = projectFormatV1.sha256DigestSchema.parse(
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
);

function projectName(fileName: string | undefined): string {
  const name = fileName?.replace(/\.pptx$/iu, '').trim();

  return name === undefined || name === '' ? 'Imported PPTX' : name;
}

function sourceName(fileName: string | undefined): string {
  return fileName === undefined || fileName.trim() === '' ? 'source.pptx' : fileName;
}

function diagnostic(source: PptxImportWarning): projectFormatV1.InteropDiagnostic {
  return {
    code: `pptx.${source.code}`,
    severity: source.code === 'malformed-xml' || source.code === 'size-cap' ? 'error' : 'warning',
    message: source.message,
    dimension: 'semantics',
    pointer: '/',
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

function fallbackRoot(width: number, height: number): MappedPptxElementV1 {
  return {
    element: projectFormatV1.createElementV1({
      id: FALLBACK_ROOT_ID,
      name: 'PPTX fallback',
      geometry: projectFormatV1.createElementGeometry({ width, height }),
      kind: 'group',
    }),
    sourceId: 'fallback',
    warnings: [],
  };
}

function fallbackResult(input: {
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly diagnostic: projectFormatV1.InteropDiagnostic;
}): ProjectImportResultV1 {
  const root = fallbackRoot(1, 1).element;
  const sourceAsset: projectFormatV1.ForeignAsset = {
    id: FALLBACK_ASSET_ID,
    kind: 'foreign',
    name: sourceName(input.fileName),
    blob: {
      digest: EMPTY_DIGEST,
      byteLength: 0,
      mediaType: PPTX_MEDIA_TYPE,
      source: { kind: 'package', path: `blobs/${EMPTY_DIGEST.replace(':', '/')}` },
    },
    metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } },
  };
  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: { ...projectFormatV1.createDefaultSurface(), size: [1, 1] },
    elements: [root],
    pages: [
      projectFormatV1.createPageV1({
        id: projectFormatV1.idSchema.parse('pptx-page-1'),
        rootInstances: [
          {
            id: projectFormatV1.idSchema.parse('pptx-page-1-root-1'),
            elementId: root.id,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    ],
  });
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
            format: 'pptx',
            sourceAssetId: FALLBACK_ASSET_ID,
            importerVersion: IMPORTER_VERSION,
            importedAt: input.importedAt,
          },
        ],
        records: [
          {
            id: FALLBACK_RECORD_ID,
            sourceId: FALLBACK_SOURCE_ID,
            target: entityAddress(root.id),
            baselineSemanticHash: FALLBACK_HASH,
            mappingConfidence: 0,
            editability: 'appearance-only',
            warnings: [input.diagnostic],
            sourceIdentity: { legacyElementId: 'fallback' },
          },
        ],
      },
    },
    blobs: new Map([[EMPTY_DIGEST, new Uint8Array()]]),
  };
}

function pages(input: {
  readonly sourcePages: ReturnType<typeof importPptxSourceWithReport>['document']['pages'];
  readonly sourceElements: ReturnType<typeof importPptxSourceWithReport>['document']['elements'];
  readonly mapped: readonly MappedPptxElementV1[];
}): readonly projectFormatV1.PageDefinition[] {
  const mappedIdBySource = new Map(input.mapped.map(({ sourceId, element }) => [sourceId, element.id]));
  const sourceById = new Map(input.sourceElements.map((element) => [element.id, element]));

  if (input.sourcePages.length === 0) {
    const root = input.mapped.find(({ element }) => element.parentId === null)?.element;

    return root === undefined ?
        []
      : [
          projectFormatV1.createPageV1({
            id: projectFormatV1.idSchema.parse('pptx-page-1'),
            rootInstances: [
              {
                id: projectFormatV1.idSchema.parse('pptx-page-1-root-1'),
                elementId: root.id,
                overrides: [],
                componentPropertyValues: [],
              },
            ],
          }),
        ];
  }

  return input.sourcePages.map((page, pageIndex) => {
    const roots = page.elements.filter(({ elementId }) => sourceById.get(elementId)?.parentId === null);

    return projectFormatV1.createPageV1({
      id: projectFormatV1.idSchema.parse(`pptx-page-${String(pageIndex + 1)}`),
      name: page.name.trim() === '' ? `Slide ${String(pageIndex + 1)}` : page.name,
      rootInstances: roots.flatMap(({ elementId }, rootIndex) => {
        const mappedId = mappedIdBySource.get(elementId);

        return mappedId === undefined ?
            []
          : [
              {
                id: projectFormatV1.idSchema.parse(`pptx-page-${String(pageIndex + 1)}-root-${String(rootIndex + 1)}`),
                elementId: mappedId,
                overrides: [],
                componentPropertyValues: [],
              },
            ];
      }),
    });
  });
}

interface PptxMetadataContextV1 {
  readonly pkg: ReturnType<typeof readOoxmlPackageWithCaps>['pkg'];
  readonly project: projectFormatV1.BroadsetProjectV1;
}

async function readMetadataContextV1(
  bytes: Uint8Array,
  options: PptxImportOptions,
): Promise<PptxMetadataContextV1 | undefined> {
  try {
    const pkg = readOoxmlPackageWithCaps(bytes, options).pkg;
    const project = await readProjectMetadataV1(pkg);

    return project === undefined ? undefined : { pkg, project };
  } catch {
    return undefined;
  }
}

async function buildResult(input: {
  readonly bytes: Uint8Array;
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly options: PptxImportOptions;
}): Promise<ProjectImportResultV1> {
  const metadata = await readMetadataContextV1(input.bytes, input.options);
  const authoredSurface = metadata?.project.documents[0]?.surface;
  const report = importPptxSourceWithReport(input.bytes, {
    ...input.options,
    ...(authoredSurface === undefined ? {} : { authoredSurface: { unit: authoredSurface.unit, dpi: authoredSurface.dpi } }),
  });
  const width = Math.max(1, report.document.canvas.width);
  const height = Math.max(1, report.document.canvas.height);
  const resources = createResourceCollectorV1();
  const fonts = await createPptxFontRegistryV1({
    resourceCollector: resources,
    embeddedFonts: report.fontAssets,
  });
  const mappedElements = await mapPptxElementsV1({ document: report.document, resources, fontRegistry: fonts });
  const mapped = mappedElements.length === 0 ? [fallbackRoot(width, height)] : mappedElements;
  const currentDocument = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: {
      ...projectFormatV1.createDefaultSurface(),
      size: [width, height],
      unit: report.document.canvas.unit,
      dpi: report.document.canvas.dpi,
    },
    elements: mapped.map(({ element }) => element),
    pages: pages({ sourcePages: report.document.pages, sourceElements: report.document.elements, mapped }),
  });

  if (metadata !== undefined) {
    const reconciled = reconcileMetadataProjectV1({
      preservedProject: metadata.project,
      currentDocument,
      currentResources: resources.collect(),
      preservedBlobs: collectMetadataBlobs(metadata.pkg, metadata.project),
    });

    if (reconciled !== undefined) return reconciled;
  }

  const sourceAssetId = await resources.addForeignAsset({
    bytes: input.bytes,
    mediaType: PPTX_MEDIA_TYPE,
    name: sourceName(input.fileName),
    intrinsicBounds: { x: 0, y: 0, width, height },
  });
  const interop = createInteropCollectorV1();
  const sourceId = interop.addSource({
    format: 'pptx',
    sourceAssetId,
    importerVersion: IMPORTER_VERSION,
    importedAt: input.importedAt,
  });
  const reportWarnings = report.warnings.map(diagnostic);

  for (let index = 0; index < mapped.length; index += 1) {
    const entry = mapped[index];

    if (entry === undefined) continue;

    interop.addRecord({
      sourceId,
      target: entityAddress(entry.element.id),
      baselineSemanticHash: await projectFormatV1.computeCanonicalJsonHashV1(entry.element),
      mappingConfidence: entry.warnings.length === 0 ? 1 : 0.75,
      editability: entry.warnings.length === 0 ? 'native' : 'partial',
      warnings: [...entry.warnings, ...(index === 0 ? reportWarnings : [])],
      sourceIdentity: { legacyElementId: entry.sourceId },
    });
  }

  return assembleImportedProjectV1({
    id: PROJECT_ID,
    name: projectName(input.fileName),
    document: currentDocument,
    resources: resources.collect(),
    interop: interop.build(),
  });
}

export async function importPptxProjectV1(input: {
  readonly bytes: Uint8Array;
  readonly fileName?: string;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly maxInputBytes?: number;
  readonly maxPartBytes?: number;
  readonly maxEntries?: number;
  readonly maxTotalUncompressedBytes?: number;
  readonly maxDepth?: number;
}): Promise<ProjectImportResultV1> {
  const maxInputBytes =
    input.maxInputBytes !== undefined && Number.isSafeInteger(input.maxInputBytes) && input.maxInputBytes > 0 ?
      input.maxInputBytes
    : DEFAULT_MAX_INPUT_BYTES;
  const options: PptxImportOptions = {
    maxInputBytes,
    ...(input.maxPartBytes === undefined ? {} : { maxPartBytes: input.maxPartBytes }),
    ...(input.maxEntries === undefined ? {} : { maxEntries: input.maxEntries }),
    ...(input.maxTotalUncompressedBytes === undefined ?
      {}
    : { maxTotalUncompressedBytes: input.maxTotalUncompressedBytes }),
    ...(input.maxDepth === undefined ? {} : { maxDepth: input.maxDepth }),
  };

  if (input.bytes.byteLength > maxInputBytes) {
    // Oversized bytes are intentionally not hashed or copied after the trust-boundary cap.
    return fallbackResult({
      fileName: input.fileName,
      importedAt: input.importedAt,
      diagnostic: {
        code: 'pptx.size-cap',
        severity: 'error',
        message: `PPTX input exceeded the ${String(maxInputBytes)} byte limit.`,
        dimension: 'semantics',
        pointer: '/',
      },
    });
  }

  try {
    return await buildResult({ bytes: input.bytes, fileName: input.fileName, importedAt: input.importedAt, options });
  } catch (error: unknown) {
    return fallbackResult({
      fileName: input.fileName,
      importedAt: input.importedAt,
      diagnostic: {
        code: 'pptx.import-failed',
        severity: 'error',
        message: error instanceof Error ? error.message : 'PPTX import failed.',
        dimension: 'semantics',
        pointer: '/',
      },
    });
  }
}
