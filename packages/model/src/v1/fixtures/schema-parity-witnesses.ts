import { createMinimalProjectV1 } from './minimal-project';

interface WitnessVariant {
  readonly discriminant: string;
  readonly project: () => unknown;
}

interface WitnessFamily {
  readonly family: string;
  readonly path: string;
  readonly discriminator: string;
  readonly variants: readonly WitnessVariant[];
}

type JsonObject = Readonly<Record<string, unknown>>;

const baseProject = createMinimalProjectV1();
const baseDocument = baseProject.documents[0];

if (baseDocument === undefined) throw new Error('Minimal project must contain a document');

const digest = `sha256:${'0'.repeat(64)}`;
const color = { kind: 'color', space: 'srgb', channels: [0, 0, 0], alpha: 1 } as const;
const affine = { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] } as const;
const geometry = { bounds: { width: 100, height: 50 }, transform: affine, origin: [0.5, 0.5, 0] } as const;
const appearance = { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] } as const;
const elementBase = {
  id: 'element',
  name: 'Element',
  parentId: null,
  locked: false,
  hiddenInEditor: false,
  geometry,
  appearance,
  sharedStyleIds: [],
  extensions: [],
} as const;
const literalExpression = { kind: 'literal', value: { type: 'boolean', value: true } } as const;
const propertyTarget = {
  entity: { projectId: 'project', documentId: 'document', entityKind: 'element', entityId: 'element' },
  pointer: '/appearance/opacity',
} as const;
const blob = {
  digest,
  byteLength: 0,
  mediaType: 'application/octet-stream',
  source: { kind: 'missing' },
} as const;
const gradientBase = {
  stops: [{ id: 'stop', color, opacity: 1, offset: 0 }],
  coordinateSpace: 'object-bounds',
  transform: affine,
  spread: 'pad',
  interpolation: 'srgb',
} as const;
const effectBase = { id: 'effect', enabled: true, opacity: 1, blendMode: 'normal' } as const;
const paragraphBase = {
  alignment: 'start',
  direction: 'ltr',
  lineSpacing: { kind: 'normal' },
  spaceBefore: 0,
  spaceAfter: 0,
  firstLineIndent: 0,
  startIndent: 0,
  endIndent: 0,
  tabs: [],
  list: { kind: 'none' },
  hyphenation: 'none',
  keepTogether: false,
  keepWithNext: false,
  widowControl: true,
} as const;
const textElement = {
  ...elementBase,
  kind: 'text',
  text: { paragraphs: [{ id: 'paragraph', properties: paragraphBase, runs: [] }] },
  layout: { verticalAlignment: 'top', overflow: 'clip', autoSize: 'none', columns: 1, columnGap: 0 },
} as const;

const vectorElement = {
  ...elementBase,
  kind: 'vector',
  geometryData: { kind: 'rectangle', cornerRadii: [0, 0, 0, 0] },
} as const;
const baseSequence = {
  id: 'sequence',
  name: 'Sequence',
  durationTicks: 10,
  loop: { kind: 'none' },
  tracks: [],
  markers: [],
  cues: [],
  childClips: [],
} as const;
const motionOutput = {
  id: 'motion-output',
  name: 'Motion',
  kind: 'motion',
  dimensions: { width: 1920, height: 1080 },
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
  safeArea: { kind: 'none' },
  targetRuntime: { id: 'runtime', kind: 'broadcast-player', requirements: [] },
} as const;

function withDocument(patch: JsonObject): unknown {
  return { ...baseProject, documents: [{ ...baseDocument, ...patch }] };
}

function withElement(element: JsonObject): unknown {
  return withDocument({ elements: [element] });
}

function withVectorAppearance(patch: JsonObject): unknown {
  return withElement({ ...vectorElement, appearance: { ...appearance, ...patch } });
}

function withSequence(patch: JsonObject): unknown {
  return withDocument({ sequences: [{ ...baseSequence, ...patch }] });
}

function withOutput(patch: JsonObject): unknown {
  return {
    ...baseProject,
    resources: { ...baseProject.resources, outputProfiles: [{ ...motionOutput, ...patch }] },
  };
}

function withAsset(asset: JsonObject): unknown {
  return { ...baseProject, resources: { ...baseProject.resources, assets: [asset] } };
}

function withViewModelField(fieldPatch: JsonObject): unknown {
  return withDocument({
    viewModels: [
      {
        id: 'view-model',
        name: 'View model',
        fields: [{ id: 'field', name: 'Field', schema: { kind: 'boolean' }, ...fieldPatch }],
        sampleDataSets: [],
      },
    ],
  });
}

function withBinding(patch: JsonObject): unknown {
  return withDocument({ bindings: [{ id: 'binding', target: propertyTarget, expression: literalExpression, ...patch }] });
}

function family(
  familyName: string,
  path: string,
  variants: readonly (readonly [string, JsonObject])[],
  embed: (value: JsonObject) => unknown,
  discriminator = 'kind',
): WitnessFamily {
  return {
    family: familyName,
    path,
    discriminator,
    variants: variants.map(([discriminant, value]) => ({ discriminant, project: () => embed(value) })),
  };
}

const typedValues = [
  ['null', { type: 'null', value: null }],
  ['boolean', { type: 'boolean', value: true }],
  ['integer', { type: 'integer', value: 1 }],
  ['number', { type: 'number', value: 1.5 }],
  ['string', { type: 'string', value: 'value' }],
  ['date-time', { type: 'date-time', value: '2025-01-01T00:00:00Z' }],
  ['length', { type: 'length', value: 10 }],
  ['angle', { type: 'angle', value: 90 }],
  ['color', { type: 'color', value: color }],
  ['asset', { type: 'asset', assetId: 'asset' }],
  ['point2d', { type: 'point2d', value: [1, 2] }],
  ['point3d', { type: 'point3d', value: [1, 2, 3] }],
  ['list', { type: 'list', items: [] }],
  ['object', { type: 'object', fields: {} }],
] as const;

const valueSchemas = [
  ['string', { kind: 'string' }],
  ['number', { kind: 'number' }],
  ['integer', { kind: 'integer' }],
  ['boolean', { kind: 'boolean' }],
  ['date-time', { kind: 'date-time' }],
  ['color', { kind: 'color' }],
  ['asset', { kind: 'asset' }],
  ['enum', { kind: 'enum', values: ['one'] }],
  ['object', { kind: 'object', fields: [] }],
  ['array', { kind: 'array', items: { kind: 'boolean' } }],
] as const;

const expressions = [
  ['literal', literalExpression],
  ['field', { kind: 'field', viewModelId: 'view-model', fieldId: 'field' }],
  ['variable', { kind: 'variable', collectionId: 'collection', variableId: 'variable' }],
  ['unary', { kind: 'unary', operator: 'not', operand: literalExpression }],
  ['binary', { kind: 'binary', operator: 'and', left: literalExpression, right: literalExpression }],
  [
    'conditional',
    { kind: 'conditional', condition: literalExpression, whenTrue: literalExpression, whenFalse: literalExpression },
  ],
  ['get', { kind: 'get', source: literalExpression, fieldId: 'field' }],
  ['index', { kind: 'index', source: literalExpression, index: { kind: 'literal', value: { type: 'integer', value: 0 } } }],
  ['safe-function', { kind: 'safe-function', functionId: 'coalesce', arguments: [] }],
] as const;

const elementVariants = [
  ['text', textElement],
  ['image', { ...elementBase, kind: 'image', image: { assetId: 'asset', fit: 'contain' } }],
  ['vector', vectorElement],
  ['group', { ...elementBase, kind: 'group', group: { clipChildren: false } }],
  ['component-instance', { ...elementBase, kind: 'component-instance', componentId: 'component', propertyValues: [] }],
  [
    'video',
    {
      ...elementBase,
      kind: 'video',
      video: { assetId: 'asset', fit: 'contain', autoplay: false, loop: false, muted: true, controls: false },
    },
  ],
  ['audio', { ...elementBase, kind: 'audio', audio: { assetId: 'asset', autoplay: false, loop: false, volume: 1 } }],
  ['clock', { ...elementBase, kind: 'clock', clock: { format: 'HH:mm', timeZone: 'UTC' } }],
  [
    'ticker',
    {
      ...elementBase,
      kind: 'ticker',
      ticker: { items: [{ id: 'item', text: 'News' }], direction: 'left', speed: 10, gap: 5, repeat: true },
    },
  ],
  ['qrcode', { ...elementBase, kind: 'qrcode', qrcode: { value: 'https://example.com', errorCorrection: 'M', quietZone: 4 } }],
  [
    'foreign',
    {
      ...elementBase,
      kind: 'foreign',
      foreign: {
        mediaType: 'application/octet-stream',
        sourceBlob: blob,
        previewAssetId: 'preview',
        safeRenderMode: 'preview-only',
        reason: 'Unsupported',
      },
    },
  ],
  [
    'plugin',
    {
      ...elementBase,
      kind: 'plugin',
      plugin: { pluginId: 'com.example.plugin', elementType: 'example', schemaVersion: 1, payload: {} },
    },
  ],
] as const;

const path = { points: [{ id: 'point', x: 0, y: 0 }], segments: [{ id: 'segment', kind: 'move', pointId: 'point' }], closed: false };

const interpolationVariants = [
  ['hold', { kind: 'hold' }],
  ['step', { kind: 'step', position: 'end' }],
  ['cubic-bezier', { kind: 'cubic-bezier', controlPoints: [0.25, 0.1, 0.25, 1] }],
  ['spring', { kind: 'spring', mass: 1, stiffness: 100, damping: 10, initialVelocity: 0, settleThreshold: 0.01 }],
  ['spatial-path', { kind: 'spatial-path', path, orientToPath: false }],
  ['counting', { kind: 'counting', rounding: 'round', minimumDigits: 1, grouping: false }],
  ['color', { kind: 'color', space: 'srgb' }],
] as const;

const assetBase = { id: 'asset', name: 'Asset', blob } as const;
const assetVariants = [
  [
    'image',
    { ...assetBase, kind: 'image', metadata: { pixelWidth: 1, pixelHeight: 1, orientation: 1, hasAlpha: true, bitDepth: 8, colorModel: 'rgb' } },
  ],
  [
    'video',
    {
      ...assetBase,
      kind: 'video',
      metadata: { pixelWidth: 1, pixelHeight: 1, frameRate: { numerator: 25, denominator: 1 }, durationTicks: 0, videoCodec: 'h264', hasAlpha: false, audioTracks: [] },
    },
  ],
  ['audio', { ...assetBase, kind: 'audio', metadata: { durationTicks: 0, sampleRate: 48000, channelCount: 2, channelLayout: 'stereo', codec: 'pcm' } }],
  [
    'font',
    {
      ...assetBase,
      kind: 'font',
      metadata: { format: 'opentype', postScriptName: 'Example', family: 'Example', weight: 400, style: 'normal', stretch: 1, variableAxes: [], unicodeCoverage: [], embeddingPermissions: 'installable' },
    },
  ],
  ['icc-profile', { ...assetBase, kind: 'icc-profile', metadata: { profileClass: 'display', colorSpace: 'RGB', profileConnectionSpace: 'xyz', description: 'sRGB', identifier: 'srgb' } }],
  ['data', { ...assetBase, kind: 'data', metadata: { encoding: 'utf-8', recordShape: { kind: 'opaque' } } }],
  ['vector', { ...assetBase, kind: 'vector', metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } } }],
  ['foreign', { ...assetBase, kind: 'foreign', metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } } }],
] as const;

export const EXPECTED_DISCRIMINATED_UNION_VARIANTS = {
  typedValue: ['null', 'boolean', 'integer', 'number', 'string', 'date-time', 'length', 'angle', 'color', 'asset', 'point2d', 'point3d', 'list', 'object'],
  loopDefinition: ['none', 'repeat', 'ping-pong'],
  interpolation: ['hold', 'step', 'cubic-bezier', 'spring', 'spatial-path', 'counting', 'color'],
  cue: ['audio', 'event'],
  clipRemap: ['linear', 'freeze'],
  sequenceAction: ['play-sequence', 'stop-sequence', 'seek-sequence', 'send-event'],
  transitionTrigger: ['event', 'lifecycle', 'after'],
  elementTransform: ['affine2d', 'matrix3d'],
  pathSegment: ['move', 'line', 'quadratic', 'cubic', 'close'],
  vectorGeometryData: ['rectangle', 'ellipse', 'path', 'boolean'],
  element: ['text', 'image', 'vector', 'group', 'component-instance', 'video', 'audio', 'clock', 'ticker', 'qrcode', 'foreign', 'plugin'],
  templateGroupRole: ['aspect-ratio', 'named'],
  lineSpacing: ['normal', 'multiple', 'absolute'],
  textList: ['none', 'unordered', 'ordered'],
  valueSchema: ['string', 'number', 'integer', 'boolean', 'date-time', 'color', 'asset', 'enum', 'object', 'array'],
  expressionAst: ['literal', 'field', 'variable', 'unary', 'binary', 'conditional', 'get', 'index', 'safe-function'],
  formatterStep: ['number', 'date-time', 'duration', 'prefix', 'suffix', 'truncate'],
  gradient: ['linear', 'radial', 'conic', 'diamond', 'producer-preserved'],
  paint: ['none', 'solid', 'gradient', 'pattern', 'picture'],
  effect: ['blur', 'drop-shadow', 'inner-shadow', 'glow', 'color-matrix', 'bevel', 'displacement', 'opacity', 'backdrop-blur'],
  clipDefinition: ['vector', 'component-path'],
  maskDefinition: ['vector', 'component-path', 'asset'],
  exposedPropertyConstraint: ['numeric-range', 'string-length', 'allowed-values'],
  colorSpaceDefinition: ['named', 'icc'],
  blobSource: ['package', 'external', 'missing'],
  assetProvenance: ['created', 'imported'],
  asset: ['image', 'video', 'audio', 'font', 'icc-profile', 'data', 'vector', 'foreign'],
  fontSource: ['asset', 'system'],
  swatch: ['process', 'spot'],
  sharedStyleSource: ['properties', 'alias'],
  dynamicRange: ['sdr', 'hdr'],
  motionAlpha: ['none', 'embedded', 'separate-key'],
  audioRouting: ['none', 'pcm'],
  safeArea: ['none', 'preset', 'custom'],
  scan: ['progressive', 'interlaced'],
} as const;

export const schemaParityWitnessRegistry: readonly WitnessFamily[] = [
  family('typedValue', '/documents/0/viewModels/0/fields/0/defaultValue', typedValues, (value) => withViewModelField({ defaultValue: value }), 'type'),
  family('loopDefinition', '/documents/0/sequences/0/loop', [
    ['none', { kind: 'none' }],
    ['repeat', { kind: 'repeat', count: 2, gapTicks: 0 }],
    ['ping-pong', { kind: 'ping-pong', count: 2, gapTicks: 0, endpoint: 'once' }],
  ], (value) => withSequence({ loop: value })),
  family('interpolation', '/documents/0/sequences/0/tracks/0/keyframes/0/interpolation', interpolationVariants, (value) => withSequence({ tracks: [{ id: 'track', name: 'Track', target: propertyTarget, valueType: 'number', keyframes: [{ id: 'keyframe', tick: 0, value: { type: 'number', value: 0 }, interpolation: value }] }] })),
  family('cue', '/documents/0/sequences/0/cues/0', [
    ['audio', { id: 'cue', kind: 'audio', tick: 0, assetId: 'asset', gain: 1, firing: 'forward-only' }],
    ['event', { id: 'cue', kind: 'event', tick: 0, eventId: 'event', firing: 'forward-only' }],
  ], (value) => withSequence({ cues: [value] })),
  family('clipRemap', '/documents/0/sequences/0/childClips/0/remap', [
    ['linear', { kind: 'linear', sourceRange: [0, 1], direction: 'forward' }],
    ['freeze', { kind: 'freeze', sourceTick: 0 }],
  ], (value) => withSequence({ childClips: [{ id: 'clip', sequenceId: 'sequence', outputRange: [0, 1], remap: value }] })),
  family('sequenceAction', '/documents/0/lifecycle/in/0', [
    ['play-sequence', { kind: 'play-sequence', sequenceId: 'sequence', behavior: 'restart' }],
    ['stop-sequence', { kind: 'stop-sequence', sequenceId: 'sequence' }],
    ['seek-sequence', { kind: 'seek-sequence', sequenceId: 'sequence', tick: 0 }],
    ['send-event', { kind: 'send-event', stateMachineId: 'machine', eventId: 'event' }],
  ], (value) => withDocument({ lifecycle: { id: 'lifecycle', in: [value], hold: [], update: [], out: [] } })),
  family('transitionTrigger', '/documents/0/stateMachines/0/transitions/0/trigger', [
    ['event', { kind: 'event', eventId: 'event' }],
    ['lifecycle', { kind: 'lifecycle', phase: 'in' }],
    ['after', { kind: 'after', ticks: 1 }],
  ], (value) => withDocument({ stateMachines: [{ id: 'machine', name: 'Machine', initialStateId: 'state', states: [{ id: 'state', name: 'State', values: [], entryActions: [], exitActions: [] }], transitions: [{ id: 'transition', sourceStateId: 'state', targetStateId: 'state', trigger: value, priority: 0, actions: [] }] }] })),
  family('elementTransform', '/documents/0/elements/0/geometry/transform', [
    ['affine2d', affine],
    ['matrix3d', { kind: 'matrix3d', matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
  ], (value) => withElement({ ...vectorElement, geometry: { ...geometry, transform: value } })),
  family('pathSegment', '/documents/0/elements/0/geometryData/path/segments/0', [
    ['move', { id: 'segment', kind: 'move', pointId: 'point' }],
    ['line', { id: 'segment', kind: 'line', pointId: 'point' }],
    ['quadratic', { id: 'segment', kind: 'quadratic', control: [0, 0], pointId: 'point' }],
    ['cubic', { id: 'segment', kind: 'cubic', control1: [0, 0], control2: [1, 1], pointId: 'point' }],
    ['close', { id: 'segment', kind: 'close' }],
  ], (value) => withElement({ ...vectorElement, geometryData: { kind: 'path', path: { points: [{ id: 'point', x: 0, y: 0 }], segments: [value], closed: false }, fillRule: 'nonzero' } })),
  family('vectorGeometryData', '/documents/0/elements/0/geometryData', [
    ['rectangle', { kind: 'rectangle', cornerRadii: [0, 0, 0, 0] }],
    ['ellipse', { kind: 'ellipse' }],
    ['path', { kind: 'path', path, fillRule: 'nonzero' }],
    ['boolean', { kind: 'boolean', operation: 'union', operandIds: [] }],
  ], (value) => withElement({ ...vectorElement, geometryData: value })),
  family('element', '/documents/0/elements/0', elementVariants, withElement),
  family('templateGroupRole', '/templateGroups/0/members/0/role', [
    ['aspect-ratio', { kind: 'aspect-ratio', ratio: [16, 9] }],
    ['named', { kind: 'named', name: 'Primary' }],
  ], (value) => ({ ...baseProject, templateGroups: [{ id: 'group', name: 'Group', members: [{ id: 'member', documentId: baseDocument.id, role: value, outputProfileIds: [] }] }] })),
  family('lineSpacing', '/documents/0/elements/0/text/paragraphs/0/properties/lineSpacing', [
    ['normal', { kind: 'normal' }],
    ['multiple', { kind: 'multiple', value: 1.2 }],
    ['absolute', { kind: 'absolute', value: 12 }],
  ], (value) => withElement({ ...textElement, text: { paragraphs: [{ id: 'paragraph', properties: { ...paragraphBase, lineSpacing: value }, runs: [] }] } })),
  family('textList', '/documents/0/elements/0/text/paragraphs/0/properties/list', [
    ['none', { kind: 'none' }],
    ['unordered', { kind: 'unordered', level: 0, marker: 'disc' }],
    ['ordered', { kind: 'ordered', level: 0, startAt: 1, style: 'decimal' }],
  ], (value) => withElement({ ...textElement, text: { paragraphs: [{ id: 'paragraph', properties: { ...paragraphBase, list: value }, runs: [] }] } })),
  family('valueSchema', '/documents/0/viewModels/0/fields/0/schema', valueSchemas, (value) => withViewModelField({ schema: value })),
  family('expressionAst', '/documents/0/bindings/0/expression', expressions, (value) => withBinding({ expression: value })),
  family('formatterStep', '/documents/0/bindings/0/formatter/steps/0', [
    ['number', { id: 'step', formatterId: 'number', arguments: [{ type: 'string', value: '0.0' }] }],
    ['date-time', { id: 'step', formatterId: 'date-time', arguments: [{ type: 'string', value: 'yyyy' }, { type: 'string', value: 'en' }, { type: 'string', value: 'UTC' }] }],
    ['duration', { id: 'step', formatterId: 'duration', arguments: [{ type: 'string', value: 'seconds' }, { type: 'string', value: '0:00' }] }],
    ['prefix', { id: 'step', formatterId: 'prefix', arguments: [{ type: 'string', value: '$' }] }],
    ['suffix', { id: 'step', formatterId: 'suffix', arguments: [{ type: 'string', value: '%' }] }],
    ['truncate', { id: 'step', formatterId: 'truncate', arguments: [{ type: 'integer', value: 10 }] }],
  ], (value) => withBinding({ formatter: { steps: [value] } }), 'formatterId'),
  family('gradient', '/documents/0/elements/0/appearance/fills/0/paint/gradient', [
    ['linear', { ...gradientBase, kind: 'linear', start: [0, 0], end: [1, 1] }],
    ['radial', { ...gradientBase, kind: 'radial', center: [0.5, 0.5], radius: [0.5, 0.5] }],
    ['conic', { ...gradientBase, kind: 'conic', center: [0.5, 0.5], startAngle: 0 }],
    ['diamond', { ...gradientBase, kind: 'diamond', center: [0.5, 0.5], radius: [0.5, 0.5] }],
    ['producer-preserved', { ...gradientBase, kind: 'producer-preserved', producer: 'Example', typeName: 'custom' }],
  ], (value) => withVectorAppearance({ fills: [{ id: 'fill', enabled: true, opacity: 1, blendMode: 'normal', paint: { kind: 'gradient', gradient: value } }] })),
  family('paint', '/documents/0/elements/0/appearance/fills/0/paint', [
    ['none', { kind: 'none' }],
    ['solid', { kind: 'solid', color }],
    ['gradient', { kind: 'gradient', gradient: { ...gradientBase, kind: 'linear', start: [0, 0], end: [1, 1] } }],
    ['pattern', { kind: 'pattern', assetId: 'asset', transform: affine, repeat: 'repeat' }],
    ['picture', { kind: 'picture', assetId: 'asset', fit: 'contain' }],
  ], (value) => withVectorAppearance({ fills: [{ id: 'fill', enabled: true, opacity: 1, blendMode: 'normal', paint: value }] })),
  family('effect', '/documents/0/elements/0/appearance/effects/0', [
    ['blur', { ...effectBase, kind: 'blur', radius: 1 }],
    ['drop-shadow', { ...effectBase, kind: 'drop-shadow', offset: [0, 0], radius: 1, spread: 0, color }],
    ['inner-shadow', { ...effectBase, kind: 'inner-shadow', offset: [0, 0], radius: 1, spread: 0, color }],
    ['glow', { ...effectBase, kind: 'glow', radius: 1, spread: 0, color, inner: false }],
    ['color-matrix', { ...effectBase, kind: 'color-matrix', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] }],
    ['bevel', { ...effectBase, kind: 'bevel', depth: 1, angle: 45, altitude: 30, soften: 0, highlightColor: color, shadowColor: color }],
    ['displacement', { ...effectBase, kind: 'displacement', assetId: 'asset', scale: [1, 1], channelX: 'red', channelY: 'green' }],
    ['opacity', { ...effectBase, kind: 'opacity', amount: 0.5 }],
    ['backdrop-blur', { ...effectBase, kind: 'backdrop-blur', radius: 1 }],
  ], (value) => withVectorAppearance({ effects: [value] })),
  family('clipDefinition', '/documents/0/elements/0/appearance/clip', [
    ['vector', { kind: 'vector', vectorElementId: 'vector', fillRule: 'nonzero' }],
    ['component-path', { kind: 'component-path', componentInstanceId: 'instance', vectorElementId: 'vector', fillRule: 'nonzero' }],
  ], (value) => withVectorAppearance({ clip: value })),
  family('maskDefinition', '/documents/0/elements/0/appearance/mask', [
    ['vector', { kind: 'vector', vectorElementId: 'vector', mode: 'alpha' }],
    ['component-path', { kind: 'component-path', componentInstanceId: 'instance', vectorElementId: 'vector', mode: 'alpha' }],
    ['asset', { kind: 'asset', assetId: 'asset', mode: 'alpha' }],
  ], (value) => withVectorAppearance({ mask: value })),
  family('exposedPropertyConstraint', '/documents/0/components/0/exposedProperties/0/constraints/0', [
    ['numeric-range', { kind: 'numeric-range', minimum: 0, maximum: 1 }],
    ['string-length', { kind: 'string-length', minimum: 0, maximum: 10 }],
    ['allowed-values', { kind: 'allowed-values', values: [{ type: 'boolean', value: true }] }],
  ], (value) => withDocument({ components: [{ id: 'component', name: 'Component', elements: [], rootElementIds: [], sequences: [], exposedProperties: [{ id: 'property', label: 'Property', group: 'General', valueSchema: { kind: 'boolean' }, defaultValue: { type: 'boolean', value: true }, constraints: [value], bindings: [{ id: 'property-binding', target: propertyTarget }] }], extensions: [] }] })),
  family('colorSpaceDefinition', '/documents/0/color/workingSpace', [
    ['named', { kind: 'named', space: 'srgb' }],
    ['icc', { kind: 'icc', iccProfileAssetId: 'icc', model: 'rgb' }],
  ], (value) => withDocument({ color: { ...baseDocument.color, workingSpace: value } })),
  family('blobSource', '/resources/assets/0/blob/source', [
    ['package', { kind: 'package', path: `blobs/sha256/${'0'.repeat(64)}` }],
    ['external', { kind: 'external', url: 'https://example.com/file.bin', integrity: digest }],
    ['missing', { kind: 'missing' }],
  ], (value) => withAsset({ ...assetBase, kind: 'foreign', blob: { ...blob, source: value }, metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } } })),
  family('assetProvenance', '/resources/assets/0/provenance', [
    ['created', { kind: 'created', application: 'Broadset' }],
    ['imported', { kind: 'imported', sourceName: 'file.bin', importer: 'Broadset', importedAt: '2025-01-01T00:00:00Z' }],
  ], (value) => withAsset({ ...assetBase, kind: 'foreign', provenance: value, metadata: { intrinsicBounds: { x: 0, y: 0, width: 1, height: 1 } } })),
  family('asset', '/resources/assets/0', assetVariants, withAsset),
  family('fontSource', '/resources/fonts/0/faces/0/source', [
    ['asset', { kind: 'asset', assetId: 'font-asset' }],
    ['system', { kind: 'system', postScriptName: 'ArialMT' }],
  ], (value) => ({ ...baseProject, resources: { ...baseProject.resources, fonts: [{ id: 'font-family', familyName: 'Example', fallbackFontIds: [], faces: [{ id: 'face', source: value, weight: 400, style: 'normal', stretch: 1 }] }] } })),
  family('swatch', '/resources/swatches/0', [
    ['process', { id: 'swatch', kind: 'process', name: 'Black', color, producerAliases: [] }],
    ['spot', { id: 'swatch', kind: 'spot', name: 'Spot', inkName: 'Spot', alternateColor: color, tintBehavior: 'linear', producerAliases: [] }],
  ], (value) => ({ ...baseProject, resources: { ...baseProject.resources, swatches: [value] } })),
  family('sharedStyleSource', '/resources/styles/0/source', [
    ['properties', { kind: 'properties', entries: [] }],
    ['alias', { kind: 'alias', styleId: 'other-style' }],
  ], (value) => ({ ...baseProject, resources: { ...baseProject.resources, styles: [{ id: 'style', name: 'Style', kind: 'appearance', source: value }] } })),
  family('dynamicRange', '/resources/outputProfiles/0/colorSignal/dynamicRange', [
    ['sdr', { kind: 'sdr', referenceWhiteNits: 100, peakNits: 100 }],
    ['hdr', { kind: 'hdr', format: 'hlg', referenceWhiteNits: 203, peakNits: 1000 }],
  ], (value) => withOutput({ colorSignal: { ...motionOutput.colorSignal, transfer: value['kind'] === 'hdr' ? 'hlg' : 'bt1886', dynamicRange: value } })),
  family('motionAlpha', '/resources/outputProfiles/0/alpha', [
    ['none', { kind: 'none' }],
    ['embedded', { kind: 'embedded', mode: 'straight' }],
    ['separate-key', { kind: 'separate-key', polarity: 'normal' }],
  ], (value) => withOutput({ alpha: value })),
  family('audioRouting', '/resources/outputProfiles/0/audioRouting', [
    ['none', { kind: 'none' }],
    ['pcm', { kind: 'pcm', layout: 'stereo', sampleRate: 48000, bitDepth: 24 }],
  ], (value) => withOutput({ audioRouting: value })),
  family('safeArea', '/resources/outputProfiles/0/safeArea', [
    ['none', { kind: 'none' }],
    ['preset', { kind: 'preset', preset: 'ebu-r95' }],
    ['custom', { kind: 'custom', action: { x: 0.05, y: 0.05, width: 0.9, height: 0.9 }, title: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }],
  ], (value) => withOutput({ safeArea: value })),
  family('scan', '/resources/outputProfiles/0/scan', [
    ['progressive', { kind: 'progressive' }],
    ['interlaced', { kind: 'interlaced', fieldOrder: 'top-first' }],
  ], (value) => withOutput({ scan: value })),
];
