import { describe, expect, it } from 'vitest';

import {
  assetSchema,
  createMinimalProjectV1,
  sha256DigestSchema,
  validateBroadsetProjectV1Semantics,
} from './index';
import {
  createReviewComponent,
  createReviewGroup,
  createReviewTarget,
  parseReviewProject,
} from './semantic-review-fixtures';

function createMissingDataAsset(id = 'asset'): ReturnType<typeof assetSchema.parse> {
  return assetSchema.parse({
    id,
    kind: 'data',
    name: id,
    blob: {
      digest: sha256DigestSchema.parse(`sha256:${'0'.repeat(64)}`),
      byteLength: 0,
      mediaType: 'application/json',
      source: { kind: 'missing' },
    },
    metadata: { encoding: 'utf-8', recordShape: { kind: 'opaque' } },
  });
}

function createPrintProfile(): unknown {
  return {
    id: 'print',
    name: 'Print',
    kind: 'print',
    pageSize: { width: 210, height: 297, unit: 'mm' },
    orientation: 'portrait',
    outputIntent: {
      iccAssetId: 'missing-icc',
      renderingIntent: 'relative-colorimetric',
      blackPointCompensation: true,
    },
    bleed: { top: 0, right: 0, bottom: 0, left: 0 },
    trim: { top: 0, right: 0, bottom: 0, left: 0 },
    spotColorPolicy: 'preserve',
    overprintPolicy: 'preserve',
    pdf: { standard: 'pdf-x-4', conformance: 'strict' },
  };
}

describe('resource and shared-style semantic traversal', () => {
  it('reports an explicitly missing blob source', () => {
    const project = createMinimalProjectV1();
    const actual = parseReviewProject({ ...project, resources: { ...project.resources, assets: [createMissingDataAsset()] } });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'resource.missing-source', pointer: '/resources/assets/0/blob/source' }),
    );
  });

  it('traverses surface background swatch references', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, surface: { ...document.surface, background: { kind: 'solid', color: { kind: 'swatch', swatchId: 'missing' } } } }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/surface/background/color/swatchId' }),
    );
  });

  it('checks duplicate extension namespaces on elements', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const element = createReviewGroup('element');
    const extension = { namespace: 'com.example.test', schema: 'https://example.com/schema.json', version: 1, payload: null };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, elements: [{ ...element, extensions: [extension, extension] }] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'extension.duplicate-namespace', pointer: '/documents/0/elements/0/extensions/1/namespace' }),
    );
  });

  it('uses exact fills and strokes pointers for resource errors', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const element = createReviewGroup('element');
    const picture = { kind: 'picture', assetId: 'missing', fit: 'contain' };
    const fill = { id: 'fill', enabled: true, opacity: 1, blendMode: 'normal', paint: picture };
    const stroke = {
      ...fill,
      id: 'stroke',
      width: 1,
      alignment: 'center',
      cap: 'butt',
      join: 'miter',
      miterLimit: 4,
      dash: [],
      dashOffset: 0,
    };
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, elements: [{ ...element, appearance: { ...element.appearance, fills: [fill], strokes: [stroke] } }] }],
    });
    const diagnostics = validateBroadsetProjectV1Semantics(actual);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/elements/0/appearance/fills/0/paint/assetId' }),
      expect.objectContaining({ code: 'resource.missing-reference', pointer: '/documents/0/elements/0/appearance/strokes/0/paint/assetId' }),
    ]));
  });

  it('rejects invalid shared-style pointers and values', () => {
    const project = createMinimalProjectV1();
    const style = {
      id: 'style',
      name: 'Style',
      kind: 'appearance',
      source: { kind: 'properties', entries: [{ id: 'entry', pointer: '/id', value: { type: 'string', value: 'x' } }] },
    };
    const actual = parseReviewProject({ ...project, resources: { ...project.resources, styles: [style] } });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'style.invalid-pointer', pointer: '/resources/styles/0/source/entries/0/pointer' }),
    );
  });

  it('rejects shared-style inheritance across incompatible kinds', () => {
    const project = createMinimalProjectV1();
    const styles = [
      { id: 'text', name: 'Text', kind: 'text', source: { kind: 'properties', entries: [] } },
      { id: 'appearance', name: 'Appearance', kind: 'appearance', source: { kind: 'properties', inheritedStyleId: 'text', entries: [] } },
    ];
    const actual = parseReviewProject({ ...project, resources: { ...project.resources, styles } });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'style.incompatible-inheritance', pointer: '/resources/styles/1/source/inheritedStyleId' }),
    );
  });

  it('uses collision-safe typed-value equality for allowed values', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const targetElement = createReviewGroup('element');
    const first = { type: 'object', fields: { a: { type: 'string', value: 'x' }, b: { type: 'string', value: 'y' } } };
    const second = { type: 'object', fields: { 'a:string:"x",b': { type: 'string', value: 'y' } } };
    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [targetElement], rootElementIds: ['element'], sequences: [],
      exposedProperties: [{
        id: 'object', label: 'Object', group: 'Data',
        valueSchema: { kind: 'object', fields: [] },
        defaultValue: { type: 'object', fields: {} },
        constraints: [{ kind: 'allowed-values', values: [first, second] }],
        bindings: [{ id: 'binding', target: createReviewTarget(project, 'element', '/appearance/opacity') }],
      }],
      extensions: [],
    });
    const actual = parseReviewProject({ ...project, documents: [{ ...document, components: [component] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).not.toContainEqual(
      expect.objectContaining({ code: 'component.duplicate-allowed-value' }),
    );
  });

  it('requires every component-local root exactly once', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const component = createReviewComponent({
      id: 'component', name: 'Component', elements: [createReviewGroup('root')], rootElementIds: [],
      sequences: [], exposedProperties: [], extensions: [],
    });
    const actual = parseReviewProject({ ...project, documents: [{ ...document, components: [component] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'component.missing-root', pointer: '/documents/0/components/0/elements/0/id' }),
    );
  });
});

describe('output, template, interop, and deterministic ordering', () => {
  it('rejects duplicate document output profile references', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, outputProfiles: [createPrintProfile()] },
      documents: [{ ...document, outputProfileIds: ['print', 'print'] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'output.duplicate-profile', pointer: '/documents/0/outputProfileIds/1' }),
    );
  });

  it('rejects print output profiles on static documents', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, outputProfiles: [createPrintProfile()] },
      documents: [{ ...document, outputProfileIds: ['print'] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'output.invalid-profile', pointer: '/documents/0/outputProfileIds/0' }),
    );
  });

  it('checks template-member output compatibility and uniqueness', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, outputProfiles: [createPrintProfile()] },
      templateGroups: [{
        id: 'group', name: 'Group', members: [{
          id: 'member', documentId: document.id, role: { kind: 'named', name: 'Screen' },
          outputProfileIds: ['print', 'print'],
        }],
      }],
    });
    const diagnostics = validateBroadsetProjectV1Semantics(actual);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'template-group.duplicate-profile', pointer: '/templateGroups/0/members/0/outputProfileIds/1' }),
      expect.objectContaining({ code: 'template-group.incompatible-profile', pointer: '/templateGroups/0/members/0/outputProfileIds/0' }),
    ]));
  });

  it('validates interop warning entity instance paths', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const asset = createMissingDataAsset('source');
    const entity = {
      projectId: project.id,
      documentId: document.id,
      entityKind: 'element',
      entityId: 'missing',
      instancePath: ['missing-root'],
    };
    const actual = parseReviewProject({
      ...project,
      resources: { ...project.resources, assets: [asset] },
      interop: {
        sources: [{ id: 'source-record', format: 'test', sourceAssetId: 'source', importerVersion: '1', importedAt: project.metadata.createdAt }],
        records: [{
          id: 'record', sourceId: 'source-record', target: { projectId: project.id, entityKind: 'project', entityId: project.id },
          baselineSemanticHash: sha256DigestSchema.parse(`sha256:${'0'.repeat(64)}`), mappingConfidence: 1,
          editability: 'native', warnings: [{ code: 'warning', severity: 'warning', message: 'Warning', dimension: 'semantics', entity }],
        }],
      },
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'interop.invalid-warning-address', pointer: '/interop/records/0/warnings/0/entity' }),
    );
  });

  it('sorts diagnostics by UTF-16 code units rather than locale', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, selectedVariableModes: { 'ä': 'missing', z: 'missing' } }],
    });
    const pointers = validateBroadsetProjectV1Semantics(actual)
      .filter(({ code }) => code === 'variable.invalid-mode-selection')
      .map(({ pointer }) => pointer);

    expect(pointers).toEqual(['/documents/0/selectedVariableModes/z', '/documents/0/selectedVariableModes/ä']);
  });
});
