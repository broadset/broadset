import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { createTextRunWitnessProject } from './fixtures/schema-parity-constraint-witnesses';
import { broadsetProjectV1Schema, parseProjectV1Unknown } from './index';
import { validateProjectUrls } from './semantic-validation-urls';

const digest = `sha256:${'0'.repeat(64)}`;
const invalidHttps = 'https://[:]';
const maximumDnsHostname = [63, 63, 63, 61].map((length) => 'a'.repeat(length)).join('.');
const oversizedDnsHostname = [63, 63, 63, 62].map((length) => 'a'.repeat(length)).join('.');
const externalBlob = {
  digest,
  byteLength: 0,
  mediaType: 'application/octet-stream',
  source: { kind: 'external' as const, url: invalidHttps, integrity: digest },
};

function diagnosticPointers(input: unknown): readonly string[] {
  const result = parseProjectV1Unknown(input);

  expect(result.status).toBe('quarantined');

  return result.diagnostics.filter(({ code }) => code.startsWith('url.')).map(({ pointer = '' }) => pointer);
}

describe('semantic URL validation', () => {
  it.each([
    'https://[:]', 'https://[:::]', 'https://example.com:99999', 'https://example.com:0',
    'https://example.com:', 'https://user:pass@example.com', 'https://a_b.example',
    'https://a..b.example', 'https://-bad.example', 'https://example.com\\@evil.com',
    'https://example.com/%zz', 'https://@example.com/path', 'https://:@example.com/path',
    `https://${oversizedDnsHostname}/schema`,
  ])('delegates structurally shaped %s to exact semantic rejection', (schema) => {
    const project = createMinimalProjectV1();
    const input = { ...project, extensions: [{ namespace: 'com.example.invalid', schema, version: 1, payload: null }] };

    expect(broadsetProjectV1Schema.safeParse(input).success).toBe(true);
    expect(diagnosticPointers(input)).toContain('/extensions/0/schema');
  });

  it('rejects malformed percent escapes in generic absolute URI fields', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Minimal document required');

    const asset = {
      id: 'data', name: 'Data', kind: 'data' as const,
      blob: { digest, byteLength: 0, mediaType: 'application/json', source: { kind: 'missing' as const, lastKnownName: 'source.json' } },
      provenance: { kind: 'imported' as const, sourceName: 'source', sourceUri: 'urn:example:%zz', importer: 'test', importedAt: project.metadata.createdAt },
      metadata: { encoding: 'utf-8', recordShape: { kind: 'opaque' as const } },
    };

    expect(diagnosticPointers({ ...project, resources: { ...project.resources, assets: [asset] } }))
      .toContain('/resources/assets/0/provenance/sourceUri');
  });

  it.each(['https:###', 'http://example.com'])('rejects non-hierarchical or non-HTTPS shape %s at the structural boundary', (schema) => {
    const project = createMinimalProjectV1();

    expect(broadsetProjectV1Schema.safeParse({ ...project, extensions: [{ namespace: 'com.example.invalid', schema, version: 1, payload: null }] }).success).toBe(false);
  });

  it('visits every asset and blob URL-bearing occurrence with exact pointers', () => {
    const project = createMinimalProjectV1();
    const asset = {
      id: 'data', name: 'Data', kind: 'data' as const, blob: externalBlob,
      provenance: { kind: 'imported' as const, sourceName: 'source', sourceUri: invalidHttps, importer: 'test', importedAt: project.metadata.createdAt },
      license: { name: 'License', url: invalidHttps, permissions: { embedding: true, modification: true, redistribution: true } },
      derivatives: [{ id: 'preview', role: 'preview' as const, name: 'Preview', blob: externalBlob }],
      metadata: { encoding: 'utf-8', schemaUri: invalidHttps, recordShape: { kind: 'opaque' as const } },
    };
    const pointers = diagnosticPointers({ ...project, resources: { ...project.resources, assets: [asset] } });

    expect(pointers).toEqual(expect.arrayContaining([
      '/resources/assets/0/blob/source/url', '/resources/assets/0/provenance/sourceUri',
      '/resources/assets/0/license/url', '/resources/assets/0/derivatives/0/blob/source/url',
      '/resources/assets/0/metadata/schemaUri',
    ]));
  });

  it('visits text hyperlinks in document elements, component elements, and page notes', () => {
    const textProject = broadsetProjectV1Schema.parse(createTextRunWitnessProject('Link', invalidHttps));
    const document = textProject.documents[0];
    const element = document?.elements[0];

    if (document === undefined || element?.kind !== 'text') throw new Error('Text witness is required');

    const component = { id: 'component', name: 'Component', elements: [{ ...element, id: 'component-text' }], rootElementIds: ['component-text'], sequences: [], exposedProperties: [], extensions: [] };
    const page = document.pages[0];
    const input = page === undefined ? textProject : {
      ...textProject,
      documents: [{ ...document, components: [component], pages: [{ ...page, notes: element.text }] }],
    };
    const pointers = diagnosticPointers(input);

    expect(pointers).toEqual(expect.arrayContaining([
      '/documents/0/elements/0/text/paragraphs/0/runs/0/properties/hyperlink',
      '/documents/0/components/0/elements/0/text/paragraphs/0/runs/0/properties/hyperlink',
      '/documents/0/pages/0/notes/paragraphs/0/runs/0/properties/hyperlink',
    ]));
  });

  it('visits extension schemas at every ownership level', () => {
    const project = broadsetProjectV1Schema.parse(createTextRunWitnessProject('Text'));
    const document = project.documents[0];
    const element = document?.elements[0];
    const page = document?.pages[0];

    if (document === undefined || element === undefined || page === undefined) throw new Error('Complete witness required');

    const extension = { namespace: 'com.example.invalid', schema: invalidHttps, version: 1, payload: null };
    const componentElement = { ...element, id: 'component-element', extensions: [extension] };
    const component = { id: 'component', name: 'Component', elements: [componentElement], rootElementIds: ['component-element'], sequences: [], exposedProperties: [], extensions: [extension] };
    const pointers = diagnosticPointers({
      ...project,
      extensions: [extension],
      documents: [{ ...document, extensions: [extension], elements: [{ ...element, extensions: [extension] }], pages: [{ ...page, extensions: [extension] }], components: [component] }],
    });

    expect(pointers).toEqual(expect.arrayContaining([
      '/extensions/0/schema', '/documents/0/extensions/0/schema', '/documents/0/pages/0/extensions/0/schema',
      '/documents/0/elements/0/extensions/0/schema', '/documents/0/components/0/extensions/0/schema',
      '/documents/0/components/0/elements/0/extensions/0/schema',
    ]));
  });

  it('visits foreign source blobs and interop preserved blobs', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Minimal document required');

    const foreign = {
      ...groupLikeElement(),
      kind: 'foreign' as const,
      foreign: { mediaType: 'application/octet-stream', sourceBlob: externalBlob, previewAssetId: 'preview', safeRenderMode: 'preview-only' as const, reason: 'Unsupported' },
    };
    const input = {
      ...project,
      documents: [{ ...document, elements: [foreign] }],
      interop: { sources: [], records: [{ id: 'record', sourceId: 'source', target: { projectId: project.id, entityKind: 'project', entityId: project.id }, baselineSemanticHash: digest, mappingConfidence: 1, editability: 'native', warnings: [], preservedBlob: externalBlob }] },
    };

    expect(diagnosticPointers(input)).toEqual(expect.arrayContaining([
      '/documents/0/elements/0/foreign/sourceBlob/source/url',
      '/interop/records/0/preservedBlob/source/url',
    ]));
  });

  it('validates static hyperlink values in text shared styles', () => {
    const project = createMinimalProjectV1();
    const input = {
      ...project,
      resources: {
        ...project.resources,
        styles: [{ id: 'link', name: 'Link', kind: 'text', source: { kind: 'properties', entries: [{ id: 'hyperlink', pointer: '/hyperlink', value: { type: 'string', value: invalidHttps } }] } }],
      },
    };

    expect(diagnosticPointers(input)).toContain('/resources/styles/0/source/entries/0/value/value');
  });

  it('validates persisted values targeting hyperlinks through every indirection', () => {
    const project = broadsetProjectV1Schema.parse(createTextRunWitnessProject('Link', 'https://example.com'));
    const document = project.documents[0];
    const element = document?.elements[0];
    const page = document?.pages[0];

    if (document === undefined || element?.kind !== 'text' || page === undefined) throw new Error('Text witness required');

    const target = {
      entity: { projectId: project.id, documentId: document.id, entityKind: 'text-run', entityId: 'run' },
      pointer: '/properties/hyperlink',
    };
    const value = { type: 'string' as const, value: invalidHttps };
    const sequence = {
      id: 'sequence', name: 'Sequence', durationTicks: 1, loop: { kind: 'none' as const }, markers: [], cues: [], childClips: [],
      tracks: [{ id: 'track', name: 'Link', target, valueType: 'string' as const, keyframes: [{ id: 'keyframe', tick: 0, value }] }],
    };
    const stateMachine = {
      id: 'machine', name: 'Machine', initialStateId: 'state',
      states: [{ id: 'state', name: 'State', values: [{ id: 'value', target, value }], entryActions: [], exitActions: [] }],
      transitions: [],
    };
    const root = { id: 'root', elementId: element.id, overrides: [{ target, value }], componentPropertyValues: [] };
    const input = {
      ...project,
      documents: [{
        ...document,
        pages: [{ ...page, rootInstances: [root] }],
        sequences: [sequence],
        stateMachines: [stateMachine],
        bindings: [
          { id: 'binding', target, expression: { kind: 'literal' as const, value }, fallback: value },
          { id: 'dynamic-binding', target, expression: { kind: 'field' as const, viewModelId: 'missing', fieldId: 'missing' } },
        ],
      }],
    };

    expect(diagnosticPointers(input)).toEqual(expect.arrayContaining([
      '/documents/0/pages/0/rootInstances/0/overrides/0/value/value',
      '/documents/0/sequences/0/tracks/0/keyframes/0/value/value',
      '/documents/0/stateMachines/0/states/0/values/0/value/value',
      '/documents/0/bindings/0/expression/value/value',
      '/documents/0/bindings/0/fallback/value',
      '/documents/0/bindings/1/expression',
    ]));
  });

  it('validates component defaults and instance values bound to hyperlinks', () => {
    const project = broadsetProjectV1Schema.parse(createTextRunWitnessProject('Link', 'https://example.com'));
    const document = project.documents[0];
    const textElement = document?.elements[0];
    const page = document?.pages[0];

    if (document === undefined || textElement?.kind !== 'text' || page === undefined) throw new Error('Text witness required');

    const localText = { ...textElement, id: 'component-text' };
    const target = {
      entity: { projectId: project.id, documentId: document.id, entityKind: 'text-run', entityId: 'run' },
      pointer: '/properties/hyperlink',
    };
    const value = { type: 'string' as const, value: invalidHttps };
    const component = {
      id: 'component', name: 'Component', elements: [localText], rootElementIds: [localText.id], sequences: [], extensions: [],
      exposedProperties: [{ id: 'link', label: 'Link', group: 'Text', valueSchema: { kind: 'string' as const }, defaultValue: value, constraints: [], bindings: [{ id: 'link-target', target }] }],
    };
    const { layout: _layout, text: _text, textPath: _textPath, ...elementBase } = textElement;
    const instance = { ...elementBase, id: 'instance', kind: 'component-instance' as const, componentId: component.id, propertyValues: [{ exposedPropertyId: 'link', value }] };
    const root = { id: 'root', elementId: instance.id, overrides: [], componentPropertyValues: [{ exposedPropertyId: 'link', value }] };
    const input = { ...project, documents: [{ ...document, elements: [instance], components: [component], pages: [{ ...page, rootInstances: [root] }] }] };
    const structural = broadsetProjectV1Schema.safeParse(input);

    if (!structural.success) throw new Error(JSON.stringify(structural.error.issues));

    expect(diagnosticPointers(input)).toEqual(expect.arrayContaining([
      '/documents/0/components/0/exposedProperties/0/defaultValue/value',
      '/documents/0/elements/0/propertyValues/0/value/value',
      '/documents/0/pages/0/rootInstances/0/componentPropertyValues/0/value/value',
    ]));
  });

  it('accepts robust absolute URI and HTTPS forms without rewriting', () => {
    const project = createMinimalProjectV1();
    const input = {
      ...project,
      extensions: [
        { namespace: 'com.example.valid', schema: 'HTTPS://example.com:65535/schema', version: 1, payload: null },
        { namespace: 'com.example.fqdn', schema: 'https://example.com./schema', version: 1, payload: null },
        { namespace: 'com.example.maximum', schema: `https://${maximumDnsHostname}/schema`, version: 1, payload: null },
      ],
      resources: { ...project.resources, assets: [{ id: 'data', name: 'Data', kind: 'data', blob: { ...externalBlob, source: { ...externalBlob.source, url: 'https://[::1]/data' } }, provenance: { kind: 'imported', sourceName: 'source', sourceUri: 'file:///source.json', importer: 'test', importedAt: project.metadata.createdAt }, metadata: { encoding: 'utf-8', schemaUri: 'urn:example:schema', recordShape: { kind: 'opaque' } } }] },
    };

    expect(parseProjectV1Unknown(input).status).toBe('loaded');
  });

  it('scales linearly across large component-property and page-root fanout', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Minimal document required');

    const target = { entity: { projectId: project.id, documentId: document.id, entityKind: 'text-run', entityId: 'run' }, pointer: '/properties/hyperlink' };
    const component = {
      id: 'component', name: 'Component', elements: [], rootElementIds: [], sequences: [], extensions: [],
      exposedProperties: Array.from({ length: 5_000 }, (_, index) => ({
        id: `property-${String(index)}`, label: 'Link', group: 'Text', valueSchema: { kind: 'string' as const },
        defaultValue: { type: 'string' as const, value: 'https://example.com' }, constraints: [],
        bindings: [{ id: `binding-${String(index)}`, target }],
      })),
    };
    const instance = { ...groupLikeElement(), id: 'instance', kind: 'component-instance' as const, componentId: component.id, propertyValues: [] };
    const roots = Array.from({ length: 5_000 }, (_, index) => ({ id: `root-${String(index)}`, elementId: instance.id, overrides: [], componentPropertyValues: [] }));
    const input = broadsetProjectV1Schema.parse({ ...project, documents: [{ ...document, elements: [instance], components: [component], pages: [{ ...page, rootInstances: roots }] }] });
    const startedAt = performance.now();

    expect(validateProjectUrls(input)).toEqual([]);
    expect(performance.now() - startedAt).toBeLessThan(1_000);
  });
});

function groupLikeElement() {
  return {
    id: 'foreign', name: 'Foreign', parentId: null, locked: false, hiddenInEditor: false,
    geometry: { bounds: { width: 1, height: 1 }, transform: { kind: 'affine2d' as const, matrix: [1, 0, 0, 1, 0, 0] as const }, origin: [0, 0, 0] as const },
    appearance: { opacity: 1, blendMode: 'normal' as const, isolation: false, fills: [], strokes: [], effects: [] },
    sharedStyleIds: [], extensions: [],
  };
}
