import { projectFormatV1 } from '@broadset/model';

import {
  assembleImportedProjectV1,
  createInteropCollectorV1,
  createResourceCollectorV1,
  type ProjectImportResultV1,
} from '../../v1';
import { parsePsdInIsolationV1 } from '../import-isolation';
import type { ParsedPsdV1 } from '../import-parse';
import { preflightPsdV1 } from '../import-preflight';
import { createPsdFontRegistryV1 } from './font-registry';
import { type MappedPsdElementV1, mapPsdLayerTreeV1, type PsdLayerTreeResultV1 } from './map-layer-tree';
import { psdLayerName } from './names';

const IMPORTER_VERSION = 'broadset-psd-v1/1';
const PROJECT_ID = projectFormatV1.idSchema.parse('psd-import-project');
const DOCUMENT_ID = projectFormatV1.idSchema.parse('psd-import-document');
const PAGE_ID = projectFormatV1.idSchema.parse('psd-import-page');
const ROOT_ID = projectFormatV1.idSchema.parse('psd-import-root');
const FALLBACK_SOURCE_ASSET_ID = projectFormatV1.idSchema.parse('psd-fallback-source');
const FALLBACK_SOURCE_ID = projectFormatV1.idSchema.parse('psd-fallback-interop-source');
const FALLBACK_RECORD_ID = projectFormatV1.idSchema.parse('psd-fallback-interop-record');
const FALLBACK_ROOT_HASH = projectFormatV1.sha256DigestSchema.parse(
  'sha256:4a95f230785c5f859d1d43e3fafa8ed7ce56d9cce4727b9cfd619030c4095865',
);
const MINIMUM_SURFACE_SIZE = 1;
const PSD_DPI = 72;
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 100;
const DEFAULT_MAX_TOTAL_PIXELS = 256 * 1024 * 1024;
const DEFAULT_MAX_WIDTH = 100_000;
const DEFAULT_MAX_HEIGHT = 100_000;
const DEFAULT_MAX_CHANNELS = 56;
const DEFAULT_MAX_DECODED_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_LAYERS = 4096;
const DEFAULT_MAX_SECTION_BYTES = 128 * 1024 * 1024;
const DEFAULT_MAX_CHANNEL_BYTES = 64 * 1024 * 1024;
const FALLBACK_DIGEST = projectFormatV1.sha256DigestSchema.parse(
  'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
);

function validPositiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

type PsdPreflightCodeV1 = Extract<ReturnType<typeof preflightPsdV1>, { readonly status: 'rejected' }>['code'];

function preflightDiagnosticCode(code: PsdPreflightCodeV1): string {
  if (code === 'input-size-limit') return 'psd.input-too-large';
  if (code === 'malformed-header') return 'psd.malformed';

  return `psd.${code}`;
}

function psdPreflightMessage(code: PsdPreflightCodeV1, maxBytes: number): string {
  switch (code) {
    case 'input-size-limit':
      return `PSD input exceeded the ${String(maxBytes)} byte limit.`;
    case 'malformed-header':
      return 'PSD import could not parse the malformed byte stream.';
    case 'dimension-limit':
      return 'PSD header dimensions exceeded the configured pre-decode limit.';
    case 'channel-limit':
      return 'PSD header channel count exceeded the configured pre-decode limit.';
    case 'decoded-size-limit':
      return 'PSD decoder output exceeded the configured decoded-byte limit.';
    case 'section-size-limit':
      return 'PSD metadata section exceeded the configured pre-decode byte limit.';
    case 'layer-count-limit':
      return 'PSD layer count exceeded the configured pre-decode limit.';
    case 'layer-channel-limit':
      return 'PSD layer channel payload exceeded the configured pre-decode limit.';
  }
}

function projectName(fileName: string | undefined): string {
  const name = fileName?.replace(/\.psd$/iu, '').trim();

  return name === undefined || name === '' ? 'Imported PSD' : name;
}

function entityAddress(elementId: projectFormatV1.Id): projectFormatV1.EntityAddress {
  return {
    projectId: PROJECT_ID,
    documentId: DOCUMENT_ID,
    entityKind: projectFormatV1.idSchema.parse('element'),
    entityId: elementId,
  };
}

function rootElement(width: number, height: number): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: ROOT_ID,
    name: 'PSD root',
    geometry: projectFormatV1.createElementGeometry({ width, height }),
    kind: 'group',
  });
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

function fallbackResult(input: {
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly diagnostic: projectFormatV1.InteropDiagnostic;
}): ProjectImportResultV1 {
  const width = MINIMUM_SURFACE_SIZE;
  const height = MINIMUM_SURFACE_SIZE;
  const root = rootElement(width, height);
  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: {
      ...projectFormatV1.createDefaultSurface(),
      size: [width, height],
      unit: 'px',
      dpi: PSD_DPI,
    },
    elements: [root],
    pages: [
      projectFormatV1.createPageV1({
        id: PAGE_ID,
        rootInstances: [
          {
            id: projectFormatV1.idSchema.parse('psd-root-instance'),
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
    name: psdLayerName(input.fileName, 'source.psd'),
    blob: {
      digest: FALLBACK_DIGEST,
      byteLength: 0,
      mediaType: 'image/vnd.adobe.photoshop',
      source: {
        kind: 'package',
        path: 'blobs/sha256/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      },
    },
    metadata: { intrinsicBounds: { x: 0, y: 0, width, height } },
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
            format: 'psd',
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

async function buildImportedResult(input: {
  readonly bytes: Uint8Array;
  readonly fileName: string | undefined;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly psd: ParsedPsdV1;
  readonly maxDepth: number;
  readonly maxTotalPixels: number;
}): Promise<ProjectImportResultV1> {
  const psd = input.psd;
  const width = Math.max(MINIMUM_SURFACE_SIZE, psd.width);
  const height = Math.max(MINIMUM_SURFACE_SIZE, psd.height);
  const resourceCollector = createResourceCollectorV1();
  const fontRegistry = createPsdFontRegistryV1(resourceCollector);
  const interopCollector = createInteropCollectorV1();
  const sourceAssetId = await resourceCollector.addForeignAsset({
    bytes: input.bytes,
    mediaType: 'image/vnd.adobe.photoshop',
    name: psdLayerName(input.fileName, 'source.psd'),
    intrinsicBounds: { x: 0, y: 0, width, height },
  });
  const sourceId = interopCollector.addSource({
    format: 'psd',
    sourceAssetId,
    importerVersion: IMPORTER_VERSION,
    importedAt: input.importedAt,
  });
  const artboards = (psd.children ?? []).filter(({ artboard }) => artboard !== undefined);
  const mapped: MappedPsdElementV1[] = [];
  const treeWarnings: projectFormatV1.InteropDiagnostic[] = [];
  const roots: projectFormatV1.Element[] = [];
  const orderedElements: projectFormatV1.Element[] = [];
  const pages: projectFormatV1.PageDefinition[] = [];

  if (artboards.length === 0) {
    const root = rootElement(width, height);
    const tree = await mapPsdLayerTreeV1({
      layers: psd.children ?? [],
      parentId: ROOT_ID,
      surfaceSize: [width, height],
      resourceCollector,
      fontRegistry,
      maxDepth: input.maxDepth,
      maxTotalPixels: input.maxTotalPixels,
      idPrefix: 'psd-layer',
    });

    roots.push(root);
    orderedElements.push(root, ...tree.mapped.map(({ element }) => element));
    mapped.push(...tree.mapped);
    treeWarnings.push(...tree.warnings);
    pages.push(
      projectFormatV1.createPageV1({
        id: PAGE_ID,
        rootInstances: [
          {
            id: projectFormatV1.idSchema.parse('psd-root-instance'),
            elementId: ROOT_ID,
            overrides: [],
            componentPropertyValues: [],
          },
        ],
      }),
    );
  } else {
    let remainingPixels = input.maxTotalPixels;

    for (let index = 0; index < artboards.length; index += 1) {
      const artboard = artboards[index];

      if (artboard === undefined) continue;

      const rootId = projectFormatV1.idSchema.parse(`psd-artboard-${String(index + 1)}`);
      const root = projectFormatV1.createElementV1({
        id: rootId,
        name: psdLayerName(artboard.name, `Artboard ${String(index + 1)}`),
        geometry: projectFormatV1.createElementGeometry({ width, height }),
        kind: 'group',
      });
      const tree: PsdLayerTreeResultV1 = await mapPsdLayerTreeV1({
        layers: artboard.children ?? [],
        parentId: rootId,
        surfaceSize: [width, height],
        resourceCollector,
        fontRegistry,
        maxDepth: input.maxDepth,
        maxTotalPixels: remainingPixels,
        idPrefix: `${rootId}-layer`,
      });

      remainingPixels = Math.max(0, remainingPixels - tree.pixelTotal);
      roots.push(root);
      orderedElements.push(root, ...tree.mapped.map(({ element }) => element));
      mapped.push(...tree.mapped);
      treeWarnings.push(...tree.warnings);
      pages.push(
        projectFormatV1.createPageV1({
          id: projectFormatV1.idSchema.parse(`psd-page-${String(index + 1)}`),
          name: root.name,
          rootInstances: [
            {
              id: projectFormatV1.idSchema.parse(`psd-page-${String(index + 1)}-root-instance`),
              elementId: rootId,
              overrides: [],
              componentPropertyValues: [],
            },
          ],
        }),
      );
    }
  }

  const elements: projectFormatV1.Element[] = orderedElements;

  for (let index = 0; index < mapped.length; index += 1) {
    const mappedElement = mapped[index];

    if (mappedElement === undefined) continue;

    const element = mappedElement.element;
    const baselineSemanticHash = await projectFormatV1.computeCanonicalJsonHashV1(element);

    interopCollector.addRecord({
      sourceId,
      target: entityAddress(element.id),
      baselineSemanticHash,
      mappingConfidence: mappedElement.mappingConfidence,
      editability: mappedElement.editability,
      warnings: [...mappedElement.warnings, ...(index === 0 ? treeWarnings : [])],
    });
  }

  if (mapped.length === 0 && treeWarnings.length > 0) {
    const root = roots[0] ?? rootElement(width, height);
    const baselineSemanticHash = await projectFormatV1.computeCanonicalJsonHashV1(root);

    interopCollector.addRecord({
      sourceId,
      target: entityAddress(root.id),
      baselineSemanticHash,
      mappingConfidence: 0,
      editability: 'appearance-only',
      warnings: treeWarnings,
    });
  }

  const document = projectFormatV1.createDocumentV1({
    id: DOCUMENT_ID,
    name: projectName(input.fileName),
    surface: {
      ...projectFormatV1.createDefaultSurface(),
      size: [width, height],
      unit: 'px',
      dpi: PSD_DPI,
    },
    elements,
    pages,
  });

  return assembleImportedProjectV1({
    id: PROJECT_ID,
    name: projectName(input.fileName),
    document,
    resources: resourceCollector.collect(),
    interop: interopCollector.build(),
  });
}

export async function importPsdProjectV1(input: {
  readonly bytes: Uint8Array;
  readonly fileName?: string;
  readonly importedAt: projectFormatV1.UtcTimestamp;
  readonly maxBytes?: number;
  readonly maxDepth?: number;
  readonly maxTotalPixels?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxChannels?: number;
  readonly maxDecodedBytes?: number;
  readonly maxLayers?: number;
  readonly maxSectionBytes?: number;
  readonly maxChannelBytes?: number;
}): Promise<ProjectImportResultV1> {
  const maxBytes = validPositiveInteger(input.maxBytes, DEFAULT_MAX_BYTES);
  const maxDepth =
    input.maxDepth !== undefined && Number.isSafeInteger(input.maxDepth) && input.maxDepth >= 0 ?
      input.maxDepth
    : DEFAULT_MAX_DEPTH;
  const maxTotalPixels =
    input.maxTotalPixels !== undefined && Number.isSafeInteger(input.maxTotalPixels) && input.maxTotalPixels > 0 ?
      input.maxTotalPixels
    : DEFAULT_MAX_TOTAL_PIXELS;
  const maxWidth = validPositiveInteger(input.maxWidth, DEFAULT_MAX_WIDTH);
  const maxHeight = validPositiveInteger(input.maxHeight, DEFAULT_MAX_HEIGHT);
  const maxChannels = validPositiveInteger(input.maxChannels, DEFAULT_MAX_CHANNELS);
  const maxDecodedBytes = validPositiveInteger(input.maxDecodedBytes, DEFAULT_MAX_DECODED_BYTES);
  const maxLayers = validPositiveInteger(input.maxLayers, DEFAULT_MAX_LAYERS);
  const maxSectionBytes = validPositiveInteger(input.maxSectionBytes, DEFAULT_MAX_SECTION_BYTES);
  const maxChannelBytes = validPositiveInteger(input.maxChannelBytes, DEFAULT_MAX_CHANNEL_BYTES);
  const preflight = preflightPsdV1({
    bytes: input.bytes,
    limits: {
      maxInputBytes: maxBytes,
      maxWidth,
      maxHeight,
      maxChannels,
      maxDecodedBytes,
      maxLayers,
      maxSectionBytes,
      maxChannelBytes,
    },
  });

  if (preflight.status === 'rejected') {
    // Oversized bytes are intentionally not hashed or copied after the trust-boundary cap.
    return fallbackResult({
      fileName: input.fileName,
      importedAt: input.importedAt,
      diagnostic: errorDiagnostic({
        code: preflightDiagnosticCode(preflight.code),
        message: psdPreflightMessage(preflight.code, maxBytes),
      }),
    });
  }

  const parsed = await parsePsdInIsolationV1({ bytes: input.bytes, maxResultBytes: maxDecodedBytes });

  if (parsed.kind !== 'ok') {
    return fallbackResult({
      fileName: input.fileName,
      importedAt: input.importedAt,
      diagnostic: errorDiagnostic({
        code: 'psd.malformed',
        message:
          parsed.kind === 'timeout' ?
            'PSD worker exceeded the parser timeout.'
          : parsed.message,
      }),
    });
  }

  try {
    return await buildImportedResult({
      bytes: input.bytes,
      fileName: input.fileName,
      importedAt: input.importedAt,
      psd: parsed.psd,
      maxDepth,
      maxTotalPixels,
    });
  } catch (error: unknown) {
    return fallbackResult({
      fileName: input.fileName,
      importedAt: input.importedAt,
      diagnostic: errorDiagnostic({
        code: 'psd.import-failed',
        message: error instanceof Error ? error.message : 'PSD import failed.',
      }),
    });
  }
}
