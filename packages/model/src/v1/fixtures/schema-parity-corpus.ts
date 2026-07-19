import { createMinimalProjectV1 } from './minimal-project';
import { createTextRunWitnessProject } from './schema-parity-constraint-witnesses';

interface ParityCase {
  readonly name: string;
  readonly task: 2 | 3 | 4 | 5 | 6;
  readonly expected: boolean;
  readonly input: unknown;
}

const baseProject = createMinimalProjectV1();
const baseDocument = baseProject.documents[0];

if (baseDocument === undefined) throw new Error('Minimal project must contain a document');

const appearance = { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] } as const;
const geometry = {
  bounds: { width: 100, height: 50 },
  transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
  origin: [0.5, 0.5, 0],
} as const;
const vectorElement = {
  id: 'shape',
  name: 'Shape',
  parentId: null,
  locked: false,
  hiddenInEditor: false,
  geometry,
  appearance,
  sharedStyleIds: [],
  extensions: [],
  kind: 'vector',
  geometryData: { kind: 'rectangle', cornerRadii: [0, 0, 0, 0] },
} as const;
const viewModel = {
  id: 'news',
  name: 'News',
  fields: [
    {
      id: 'headline',
      name: 'Headline',
      schema: { kind: 'string' },
      defaultValue: { type: 'string', value: 'Latest' },
      stalePolicy: 'use-default',
    },
  ],
  sampleDataSets: [{ id: 'sample', name: 'Sample', values: { headline: { type: 'string', value: 'Bulletin' } } }],
} as const;
const sequence = {
  id: 'sequence',
  name: 'Sequence',
  durationTicks: 10,
  loop: { kind: 'none' },
  tracks: [],
  markers: [],
  cues: [],
  childClips: [],
} as const;
const digest = `sha256:${'0'.repeat(64)}`;
const dataAsset = {
  id: 'data',
  name: 'Data',
  kind: 'data',
  blob: {
    digest,
    byteLength: 0,
    mediaType: 'application/json',
    source: { kind: 'package', path: `blobs/sha256/${'0'.repeat(64)}` },
  },
  metadata: { encoding: 'utf-8', recordShape: { kind: 'opaque' } },
} as const;
const motionOutput = {
  id: 'broadcast-hd',
  name: 'Broadcast HD',
  kind: 'motion',
  dimensions: { width: 1_920, height: 1_080 },
  pixelAspectRatio: { numerator: 1, denominator: 1 },
  frameRate: { numerator: 25, denominator: 1 },
  scan: { kind: 'progressive' },
  colorSignal: {
    primaries: 'bt709',
    transfer: 'bt1886',
    matrix: 'bt709',
    range: 'limited',
    dynamicRange: { kind: 'sdr', referenceWhiteNits: 100, peakNits: 100 },
  },
  alpha: { kind: 'none' },
  audioRouting: { kind: 'none' },
  safeArea: { kind: 'preset', preset: 'ebu-r95' },
  targetRuntime: {
    id: 'runtime',
    kind: 'broadcast-player',
    minimumVersion: '1.0',
    requirements: ['exact-ticks'],
  },
} as const;

export const parityCorpus: readonly ParityCase[] = [
  {
    name: 'Task 2 accepts versioned extension JSON',
    task: 2,
    expected: true,
    input: {
      ...baseProject,
      extensions: [
        {
          namespace: 'com.example.parity',
          schema: 'https://example.com/parity.schema.json',
          version: 1,
          payload: { enabled: true },
        },
      ],
    },
  },
  {
    name: 'Task 2 rejects unknown metadata fields',
    task: 2,
    expected: false,
    input: { ...baseProject, metadata: { ...baseProject.metadata, extra: true } },
  },
  {
    name: 'Task 3 accepts a closed vector element',
    task: 3,
    expected: true,
    input: { ...baseProject, documents: [{ ...baseDocument, elements: [vectorElement] }] },
  },
  {
    name: 'Task 3 rejects unknown surface fields',
    task: 3,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, surface: { ...baseDocument.surface, extra: true } }] },
  },
  {
    name: 'Task 4 accepts a closed view model',
    task: 4,
    expected: true,
    input: { ...baseProject, documents: [{ ...baseDocument, viewModels: [viewModel] }] },
  },
  {
    name: 'Task 4 rejects unknown page fields',
    task: 4,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, pages: [{ ...baseDocument.pages[0], extra: true }] }] },
  },
  {
    name: 'Task 5 accepts a closed sequence',
    task: 5,
    expected: true,
    input: { ...baseProject, documents: [{ ...baseDocument, sequences: [sequence] }] },
  },
  {
    name: 'Task 5 rejects an incomplete sequence',
    task: 5,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, sequences: [{ id: 'incomplete' }] }] },
  },
  {
    name: 'Task 6 accepts aggregate template groups',
    task: 6,
    expected: true,
    input: {
      ...baseProject,
      templateGroups: [
        {
          id: 'group',
          name: 'Group',
          members: [
            {
              id: 'member',
              documentId: baseDocument.id,
              role: { kind: 'named', name: 'Primary' },
              outputProfileIds: [],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Task 6 rejects unknown aggregate fields',
    task: 6,
    expected: false,
    input: { ...baseProject, interop: { ...baseProject.interop, extra: true } },
  },
  {
    name: 'Task 2 rejects control characters in IDs',
    task: 2,
    expected: false,
    input: { ...baseProject, id: 'bad\u0000id' },
  },
  {
    name: 'Task 2 rejects control characters in ID-keyed records',
    task: 2,
    expected: false,
    input: {
      ...baseProject,
      documents: [{ ...baseDocument, selectedVariableModes: { 'bad\u007fid': 'mode' } }],
    },
  },
  {
    name: 'Task 2 rejects non-HTTPS extension schema URLs',
    task: 2,
    expected: false,
    input: {
      ...baseProject,
      extensions: [
        {
          namespace: 'com.example.parity',
          schema: 'http://example.com/parity.schema.json',
          version: 1,
          payload: null,
        },
      ],
    },
  },
  {
    name: 'Task 2 delegates malformed HTTPS authority to semantics',
    task: 2,
    expected: true,
    input: {
      ...baseProject,
      extensions: [
        {
          namespace: 'com.example.parity',
          schema: 'https://:',
          version: 1,
          payload: null,
        },
      ],
    },
  },
  {
    name: 'Task 2 rejects impossible UTC timestamps',
    task: 2,
    expected: false,
    input: { ...baseProject, metadata: { ...baseProject.metadata, createdAt: '2025-02-30T00:00:00Z' } },
  },
  {
    name: 'Task 5 requires a timebase for motion documents',
    task: 5,
    expected: false,
    input: { ...baseProject, documents: [{ ...baseDocument, kind: 'motion' }] },
  },
  {
    name: 'Task 5 rejects fractional safe-integer timebase fields',
    task: 5,
    expected: false,
    input: {
      ...baseProject,
      documents: [
        {
          ...baseDocument,
          kind: 'motion',
          timebase: {
            frameRate: { numerator: 25, denominator: 1 },
            ticksPerSecond: 1.5,
            timecode: { nominalFramesPerSecond: 25, dropFrame: false },
          },
        },
      ],
    },
  },
  {
    name: 'Task 6 leaves timestamp ordering to semantic validation',
    task: 6,
    expected: true,
    input: {
      ...baseProject,
      metadata: {
        ...baseProject.metadata,
        createdAt: '2025-01-02T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      },
    },
  },
  {
    name: 'Task 6 leaves projected ID uniqueness to semantic validation',
    task: 6,
    expected: true,
    input: { ...baseProject, documents: [baseDocument, { ...baseDocument, name: 'Duplicate ID' }] },
  },
  {
    name: 'Task 4 rejects duplicate primitive accepted-asset kinds',
    task: 4,
    expected: false,
    input: {
      ...baseProject,
      documents: [
        {
          ...baseDocument,
          viewModels: [
            {
              id: 'assets',
              name: 'Assets',
              fields: [
                {
                  id: 'hero',
                  name: 'Hero',
                  schema: { kind: 'asset', acceptedAssetKinds: ['image', 'image'] },
                },
              ],
              sampleDataSets: [],
            },
          ],
        },
      ],
    },
  },
  {
    name: 'Task 6 rejects duplicate runtime requirement strings',
    task: 6,
    expected: false,
    input: {
      ...baseProject,
      resources: {
        ...baseProject.resources,
        outputProfiles: [
          {
            ...motionOutput,
            targetRuntime: { ...motionOutput.targetRuntime, requirements: ['same', 'same'] },
          },
        ],
      },
    },
  },
  {
    name: 'Task 6 rejects an incompatible SDR transfer function',
    task: 6,
    expected: false,
    input: {
      ...baseProject,
      resources: {
        ...baseProject.resources,
        outputProfiles: [{ ...motionOutput, colorSignal: { ...motionOutput.colorSignal, transfer: 'pq' } }],
      },
    },
  },
  {
    name: 'Task 6 requires HDR10 light-level metadata',
    task: 6,
    expected: false,
    input: {
      ...baseProject,
      resources: {
        ...baseProject.resources,
        outputProfiles: [
          {
            ...motionOutput,
            colorSignal: {
              ...motionOutput.colorSignal,
              primaries: 'bt2020',
              transfer: 'pq',
              matrix: 'bt2020-ncl',
              dynamicRange: { kind: 'hdr', format: 'hdr10', referenceWhiteNits: 203, peakNits: 1_000 },
            },
          },
        ],
      },
    },
  },
  {
    name: 'Task 6 requires an interop diagnostic pointer or entity',
    task: 6,
    expected: false,
    input: {
      ...baseProject,
      interop: {
        sources: [],
        records: [
          {
            id: 'record',
            sourceId: 'source',
            target: { projectId: baseProject.id, entityKind: 'project', entityId: baseProject.id },
            baselineSemanticHash: `sha256:${'0'.repeat(64)}`,
            mappingConfidence: 1,
            editability: 'native',
            warnings: [
              { code: 'warning', severity: 'warning', message: 'Warning', dimension: 'appearance' },
            ],
          },
        ],
      },
    },
  },
  {
    name: 'Task 6 rejects malformed RFC 6901 interop pointers',
    task: 6,
    expected: false,
    input: {
      ...baseProject,
      interop: {
        sources: [],
        records: [
          {
            id: 'record',
            sourceId: 'source',
            target: { projectId: baseProject.id, entityKind: 'project', entityId: baseProject.id },
            baselineSemanticHash: `sha256:${'0'.repeat(64)}`,
            mappingConfidence: 1,
            editability: 'native',
            warnings: [
              {
                code: 'warning',
                severity: 'warning',
                message: 'Warning',
                dimension: 'appearance',
                pointer: '/bad~pointer',
              },
            ],
          },
        ],
      },
    },
  },
  {
    name: 'Task 2 rejects missing required metadata',
    task: 2,
    expected: false,
    input: { ...baseProject, metadata: { createdAt: baseProject.metadata.createdAt, updatedAt: baseProject.metadata.updatedAt } },
  },
  { name: 'Task 2 rejects root literal mismatch', task: 2, expected: false, input: { ...baseProject, format: 'other' } },
  { name: 'Task 3 rejects document enum mismatch', task: 3, expected: false, input: { ...baseProject, documents: [{ ...baseDocument, kind: 'other' }] } },
  { name: 'Task 2 rejects numeric minimum', task: 2, expected: false, input: { ...baseProject, extensions: [{ namespace: 'com.example.bounds', schema: 'https://example.com/schema.json', version: 0, payload: null }] } },
  { name: 'Task 2 rejects array minimum', task: 2, expected: false, input: { ...baseProject, documents: [] } },
  { name: 'Task 3 rejects fixed tuple overflow', task: 3, expected: false, input: { ...baseProject, documents: [{ ...baseDocument, surface: { ...baseDocument.surface, size: [1920, 1080, 1] } }] } },
  { name: 'Task 3 rejects malformed digest pattern', task: 3, expected: false, input: { ...baseProject, resources: { ...baseProject.resources, assets: [{ ...dataAsset, blob: { ...dataAsset.blob, digest: 'sha256:bad' } }] } } },
  { name: 'Task 3 rejects malformed package path pattern', task: 3, expected: false, input: { ...baseProject, resources: { ...baseProject.resources, assets: [{ ...dataAsset, blob: { ...dataAsset.blob, source: { kind: 'package', path: '../blob' } } }] } } },
  { name: 'Task 3 rejects malformed media type pattern', task: 3, expected: false, input: { ...baseProject, resources: { ...baseProject.resources, assets: [{ ...dataAsset, blob: { ...dataAsset.blob, mediaType: 'invalid' } }] } } },
  { name: 'Task 3 rejects malformed axis tag pattern', task: 3, expected: false, input: { ...baseProject, resources: { ...baseProject.resources, assets: [{ id: 'font', name: 'Font', kind: 'font', blob: dataAsset.blob, metadata: { format: 'opentype', postScriptName: 'Example', family: 'Example', weight: 400, style: 'normal', stretch: 100, variableAxes: [{ id: 'axis', tag: 'bad', minimum: 100, defaultValue: 400, maximum: 900 }], unicodeCoverage: [], embeddingPermissions: 'installable' } }] } } },
  { name: 'Task 3 rejects authored markup pattern', task: 3, expected: false, input: createTextRunWitnessProject('<script>') },
];
