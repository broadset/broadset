import { projectFormatV1 } from '@broadset/model';

import {
  assembleImportedProjectV1,
  createInteropCollectorV1,
  createResourceCollectorV1,
  type ProjectImportResultV1,
} from '../../v1';
import { parsePdfInIsolationV1 } from '../import/isolation';
import { createPdfFontRegistryV1 } from './font-registry';
import { createPdfImageAssetRegistryV1, mapPdfImageV1 } from './map-image';
import { mapPdfPathV1 } from './map-path';
import { mapPdfTextV1 } from './map-text';
import type { ParsedPdfDocumentV1, PdfMappedElementV1 } from './types';

const IMPORTER_VERSION = 'broadset-pdf-v1/1';
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const MINIMUM_SURFACE_SIZE = 1;
const PDF_POINTS_PER_INCH = 72;
const PROJECT_ID = projectFormatV1.idSchema.parse('pdf-import-project');
const DOCUMENT_ID = projectFormatV1.idSchema.parse('pdf-import-document');
const PAGE_ID = projectFormatV1.idSchema.parse('pdf-import-page');
const ROOT_ID = projectFormatV1.idSchema.parse('pdf-root');
const FALLBACK_SOURCE_ASSET_ID = projectFormatV1.idSchema.parse('pdf-fallback-source');
const FALLBACK_SOURCE_ID = projectFormatV1.idSchema.parse('pdf-fallback-interop-source');
const FALLBACK_RECORD_ID = projectFormatV1.idSchema.parse('pdf-fallback-interop-record');
const FALLBACK_ROOT_HASH = projectFormatV1.sha256DigestSchema.parse(
  'sha256:054fcbd2a39a8c63a8dd6bb4153aaeaeabb0e1ed80b6137d4ef667b8e993f123',
);
const FALLBACK_DIGEST = projectFormatV1.sha256DigestSchema.parse(
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
);

function projectName(fileName: string | undefined): string {
  const value = fileName?.replace(/\.pdf$/iu, '').trim();

  return value === undefined || value === '' ? 'Imported PDF' : value;
}

function dimensions(parsed: ParsedPdfDocumentV1 | undefined): readonly [number, number] {
  return [
    Math.max(MINIMUM_SURFACE_SIZE, parsed?.page.width ?? MINIMUM_SURFACE_SIZE),
    Math.max(MINIMUM_SURFACE_SIZE, parsed?.page.height ?? MINIMUM_SURFACE_SIZE),
  ];
}

function rootElement(parsed: ParsedPdfDocumentV1 | undefined): projectFormatV1.Element {
  const [width, height] = dimensions(parsed);

  return projectFormatV1.createElementV1({
    id: ROOT_ID,
    name: 'PDF page root',
    geometry: projectFormatV1.createElementGeometry({ width, height }),
    kind: 'group',
  });
}

function surface(parsed: ParsedPdfDocumentV1 | undefined): projectFormatV1.SurfaceDefinition {
  return {
    ...projectFormatV1.createDefaultSurface(),
    size: dimensions(parsed),
    unit: 'px',
    dpi: PDF_POINTS_PER_INCH,
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

function errorDiagnostic(input: {
  readonly code: string;
  readonly message: string;
}): projectFormatV1.InteropDiagnostic {
  return {
    code: input.code,
    severity: 'error',
    message: input.message,
    dimension: 'semantics',
    pointer: '/',
  };
}

function globalWarnings(parsed: ParsedPdfDocumentV1 | undefined): readonly projectFormatV1.InteropDiagnostic[] {
  if (parsed === undefined) return [];

  const pageWarning: readonly projectFormatV1.InteropDiagnostic[] =
    parsed.pageCount > 1 ?
      [
        {
          code: 'pdf.additional-pages-omitted',
          severity: 'warning',
          message: `PDF import mapped the first page and omitted ${String(parsed.pageCount - 1)} additional page(s).`,
          dimension: 'semantics',
          pointer: '/documents/0/pages',
        },
      ]
    : [];

  return [...parsed.page.warnings, ...pageWarning];
}

async function mapElements(input: {
  readonly parsed: ParsedPdfDocumentV1 | undefined;
  readonly resourceCollector: ReturnType<typeof createResourceCollectorV1>;
}): Promise<readonly PdfMappedElementV1[]> {
  if (input.parsed === undefined) return [];

  const parsed = input.parsed;
  const page = parsed.page;
  const fontRegistry = createPdfFontRegistryV1(input.resourceCollector);
  const imageAssetRegistry = createPdfImageAssetRegistryV1(page, input.resourceCollector);
  const mappedText = page.textItems
    .filter(({ text }) => text.trim() !== '')
    .map((item, index) =>
      mapPdfTextV1({
        item,
        page,
        elementId: projectFormatV1.idSchema.parse(`pdf-text-${String(index + 1)}`),
        parentId: ROOT_ID,
        fontRegistry,
      }),
    );
  const mappedPaths = page.paths.map((path, index) =>
    mapPdfPathV1({
      path,
      page,
      elementId: projectFormatV1.idSchema.parse(`pdf-path-${String(index + 1)}`),
      parentId: ROOT_ID,
    }),
  );
  const mappedImages = await Promise.all(
    page.imageUses.map(async (use, index) =>
      mapPdfImageV1({
        use,
        page,
        elementId: projectFormatV1.idSchema.parse(`pdf-image-${String(index + 1)}`),
        parentId: ROOT_ID,
        assetRegistry: imageAssetRegistry,
      }),
    ),
  );

  return [...mappedText, ...mappedPaths, ...mappedImages];
}

async function addInteropRecord(input: {
  readonly collector: ReturnType<typeof createInteropCollectorV1>;
  readonly sourceId: projectFormatV1.Id;
  readonly mapped: PdfMappedElementV1;
  readonly extraWarnings?: readonly projectFormatV1.InteropDiagnostic[];
}): Promise<void> {
  const baselineSemanticHash = await projectFormatV1.computeCanonicalJsonHashV1(input.mapped.element);

  input.collector.addRecord({
    sourceId: input.sourceId,
    target: entityAddress(input.mapped.element.id),
    baselineSemanticHash,
    mappingConfidence: input.mapped.mappingConfidence,
    editability: input.mapped.editability,
    warnings: [...input.mapped.warnings, ...(input.extraWarnings ?? [])],
  });
}

async function buildResult(input: {
  readonly bytes: Uint8Array;
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly parsed?: ParsedPdfDocumentV1;
  readonly failure?: projectFormatV1.InteropDiagnostic;
}): Promise<ProjectImportResultV1> {
  const resourceCollector = createResourceCollectorV1();
  const interopCollector = createInteropCollectorV1();
  const [width, height] = dimensions(input.parsed);
  const sourceAssetId = await resourceCollector.addForeignAsset({
    bytes: input.bytes,
    mediaType: 'application/pdf',
    name: input.fileName ?? 'source.pdf',
    intrinsicBounds: { x: 0, y: 0, width, height },
  });
  const sourceId = interopCollector.addSource({
    format: 'pdf',
    sourceAssetId,
    importerVersion: IMPORTER_VERSION,
    importedAt: input.importedAt,
  });
  const mapped = await mapElements({ parsed: input.parsed, resourceCollector });
  const root = rootElement(input.parsed);
  const warnings = [...globalWarnings(input.parsed), ...(input.failure === undefined ? [] : [input.failure])];

  for (let index = 0; index < mapped.length; index += 1) {
    const item = mapped[index];

    if (item === undefined) continue;

    await addInteropRecord({
      collector: interopCollector,
      sourceId,
      mapped: item,
      extraWarnings: index === 0 ? warnings : [],
    });
  }

  if (mapped.length === 0 && warnings.length > 0) {
    await addInteropRecord({
      collector: interopCollector,
      sourceId,
      mapped: {
        element: root,
        warnings: [],
        mappingConfidence: 0,
        editability: 'appearance-only',
      },
      extraWarnings: warnings,
    });
  }

  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: surface(input.parsed),
    elements: [root, ...mapped.map(({ element }) => element)],
    pages: [
      projectFormatV1.createPageV1({
        id: PAGE_ID,
        rootInstances: [
          {
            id: projectFormatV1.idSchema.parse('pdf-root-instance'),
            elementId: ROOT_ID,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    ],
  });

  return assembleImportedProjectV1({
    id: PROJECT_ID,
    name: projectName(input.fileName),
    document,
    resources: resourceCollector.collect(),
    interop: interopCollector.build(),
  });
}

function absoluteFallbackResult(input: {
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly diagnostic: projectFormatV1.InteropDiagnostic;
}): ProjectImportResultV1 {
  const root = rootElement(undefined);
  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: surface(undefined),
    elements: [root],
    pages: [
      projectFormatV1.createPageV1({
        id: PAGE_ID,
        rootInstances: [
          {
            id: projectFormatV1.idSchema.parse('pdf-root-instance'),
            elementId: ROOT_ID,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    ],
  });
  const sourceAsset: projectFormatV1.ForeignAsset = {
    id: FALLBACK_SOURCE_ASSET_ID,
    kind: 'foreign',
    name: input.fileName ?? 'source.pdf',
    blob: {
      digest: FALLBACK_DIGEST,
      byteLength: 0,
      mediaType: 'application/pdf',
      source: {
        kind: 'package',
        path: 'blobs/sha256/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
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
            format: 'pdf',
            sourceAssetId: FALLBACK_SOURCE_ASSET_ID,
            importerVersion: IMPORTER_VERSION,
            importedAt: input.importedAt,
          },
        ],
        records: [
          {
            id: FALLBACK_RECORD_ID,
            sourceId: FALLBACK_SOURCE_ID,
            target: entityAddress(ROOT_ID),
            baselineSemanticHash: FALLBACK_ROOT_HASH,
            mappingConfidence: 0,
            editability: 'appearance-only',
            warnings: [input.diagnostic],
          },
        ],
      },
    },
    blobs: new Map([[FALLBACK_DIGEST, new Uint8Array()]]),
  };
}

type PdfLoadFailureKind = 'encrypted' | 'malformed' | 'isolation-failed' | 'timeout';

function loadFailureDiagnostic(kind: PdfLoadFailureKind): projectFormatV1.InteropDiagnostic {
  return errorDiagnostic({
    code: loadFailureCode(kind),
    message: loadFailureMessage(kind),
  });
}

function loadFailureCode(kind: PdfLoadFailureKind): string {
  if (kind === 'encrypted') return 'pdf.encrypted';
  if (kind === 'malformed') return 'pdf.malformed';

  return 'pdf.isolation-failed';
}

function loadFailureMessage(kind: PdfLoadFailureKind): string {
  switch (kind) {
    case 'encrypted':
      return 'PDF import rejected an encrypted document.';
    case 'malformed':
      return 'PDF import could not parse the malformed byte stream.';
    case 'timeout':
      return 'PDF import worker exceeded its time limit.';
    case 'isolation-failed':
      return 'PDF import worker failed in isolation.';
  }
}

export async function importPdfProjectV1(input: {
  readonly bytes: Uint8Array;
  readonly fileName?: string;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly maxBytes?: number;
}): Promise<ProjectImportResultV1> {
  try {
    const maxBytes =
      input.maxBytes !== undefined && Number.isSafeInteger(input.maxBytes) && input.maxBytes > 0 ?
        input.maxBytes
      : DEFAULT_MAX_BYTES;

    if (input.bytes.byteLength > maxBytes) {
      // Oversized bytes are intentionally not hashed or copied after the trust-boundary cap.
      return absoluteFallbackResult({
        fileName: input.fileName,
        importedAt: input.importedAt,
        diagnostic: errorDiagnostic({
          code: 'pdf.input-too-large',
          message: `PDF input exceeded the ${String(maxBytes)} byte limit.`,
        }),
      });
    }

    const loaded = await parsePdfInIsolationV1({ bytes: input.bytes });

    if (loaded.kind !== 'ok') {
      return await buildResult({
        bytes: input.bytes,
        fileName: input.fileName,
        importedAt: input.importedAt,
        failure: loadFailureDiagnostic(loaded.kind),
      });
    }

    const parsed = loaded.parsed;

    return await buildResult({
      bytes: input.bytes,
      fileName: input.fileName,
      importedAt: input.importedAt,
      ...(parsed === undefined ?
        {
          failure: errorDiagnostic({ code: 'pdf.no-pages', message: 'PDF import found no readable pages.' }),
        }
      : { parsed }),
    });
  } catch (error: unknown) {
    try {
      return await buildResult({
        bytes: input.bytes,
        fileName: input.fileName,
        importedAt: input.importedAt,
        failure: errorDiagnostic({
          code: 'pdf.import-failed',
          message: error instanceof Error ? error.message : 'PDF import failed.',
        }),
      });
    } catch {
      return absoluteFallbackResult({
        fileName: input.fileName,
        importedAt: input.importedAt,
        diagnostic: errorDiagnostic({
          code: 'pdf.import-failed',
          message: error instanceof Error ? error.message : 'PDF import failed.',
        }),
      });
    }
  }
}
