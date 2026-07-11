import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1, sha256DigestSchema, validateBroadsetProjectV1Semantics } from './index';
import {
  createReviewComponent,
  createReviewComponentInstance,
  createReviewGroup,
  createReviewTarget,
  parseReviewProject,
} from './semantic-review-fixtures';

type ValueSite =
  | 'view-default'
  | 'view-sample'
  | 'component-default'
  | 'allowed-value'
  | 'document-instance'
  | 'nested-instance'
  | 'root-value'
  | 'root-override'
  | 'descendant-override'
  | 'expression-literal'
  | 'binding-fallback'
  | 'state-value'
  | 'keyframe'
  | 'cue-payload'
  | 'variable'
  | 'style';

const cases: readonly { readonly site: ValueSite; readonly pointer: string }[] = [
  { site: 'view-default', pointer: '/documents/0/viewModels/0/fields/0/defaultValue/assetId' },
  { site: 'view-sample', pointer: '/documents/0/viewModels/0/sampleDataSets/0/values/media/assetId' },
  { site: 'component-default', pointer: '/documents/0/components/0/exposedProperties/0/defaultValue/assetId' },
  { site: 'allowed-value', pointer: '/documents/0/components/0/exposedProperties/0/constraints/0/values/0/assetId' },
  { site: 'nested-instance', pointer: '/documents/0/components/1/elements/0/propertyValues/0/value/assetId' },
  { site: 'document-instance', pointer: '/documents/0/elements/0/propertyValues/0/value/assetId' },
  { site: 'root-value', pointer: '/documents/0/pages/0/rootInstances/0/componentPropertyValues/0/value/assetId' },
  { site: 'root-override', pointer: '/documents/0/pages/0/rootInstances/0/overrides/0/value/assetId' },
  { site: 'descendant-override', pointer: '/documents/0/pages/0/descendantOverrides/0/overrides/0/value/assetId' },
  { site: 'expression-literal', pointer: '/documents/0/bindings/0/expression/value/assetId' },
  { site: 'binding-fallback', pointer: '/documents/0/bindings/0/fallback/assetId' },
  { site: 'state-value', pointer: '/documents/0/stateMachines/0/states/0/values/0/value/assetId' },
  { site: 'keyframe', pointer: '/documents/0/sequences/0/tracks/0/keyframes/0/value/assetId' },
  { site: 'cue-payload', pointer: '/documents/0/sequences/0/cues/0/payload/assetId' },
  { site: 'variable', pointer: '/resources/variables/0/variables/0/valuesByMode/default/assetId' },
  { site: 'style', pointer: '/resources/styles/0/source/entries/0/value/assetId' },
];

function createDataAsset(): unknown {
  const digest = sha256DigestSchema.parse(`sha256:${'1'.repeat(64)}`);

  return {
    id: 'valid-asset',
    kind: 'data',
    name: 'Valid data',
    blob: {
      digest,
      byteLength: 1,
      mediaType: 'application/octet-stream',
      source: { kind: 'package', path: `blobs/sha256/${'1'.repeat(64)}` },
    },
    metadata: { encoding: 'binary', recordShape: { kind: 'opaque' } },
  };
}

function createValue(site: ValueSite, current: ValueSite): { readonly type: 'asset'; readonly assetId: string } {
  return { type: 'asset', assetId: site === current ? 'missing-asset' : 'valid-asset' };
}

function createProjectWithMissingValue(site: ValueSite): ReturnType<typeof parseReviewProject> {
  const project = createMinimalProjectV1();
  const document = project.documents[0];
  const page = document?.pages[0];

  if (document === undefined || page === undefined) throw new Error('Expected fixture document and page');

  const local = createReviewGroup('local');
  const localTarget = createReviewTarget(project, local.id, '/appearance/opacity');
  const exposed = {
    id: 'media',
    label: 'Media',
    group: 'Data',
    valueSchema: { kind: 'asset' },
    defaultValue: createValue(site, 'component-default'),
    constraints: [{ kind: 'allowed-values', values: [createValue(site, 'allowed-value')] }],
    bindings: [{ id: 'binding', target: localTarget }],
  };
  const leaf = createReviewComponent({
    id: 'leaf',
    name: 'Leaf',
    elements: [local],
    rootElementIds: [local.id],
    sequences: [],
    exposedProperties: [exposed],
    extensions: [],
  });
  const nested = createReviewComponentInstance('nested', leaf.id, [
    { exposedPropertyId: exposed.id, value: createValue(site, 'nested-instance') },
  ]);
  const parent = createReviewComponent({
    id: 'parent',
    name: 'Parent',
    elements: [nested],
    rootElementIds: [nested.id],
    sequences: [],
    exposedProperties: [{ ...exposed, bindings: [{ id: 'binding', target: createReviewTarget(project, nested.id, '/appearance/opacity') }] }],
    extensions: [],
  });
  const documentInstance = createReviewComponentInstance('document-instance', leaf.id, [
    { exposedPropertyId: exposed.id, value: createValue(site, 'document-instance') },
  ]);
  const rootElement = createReviewComponentInstance('root-element', parent.id);
  const pageTarget = createReviewTarget(project, local.id, '/appearance/opacity', ['root-instance', nested.id]);
  const addressedPageTarget = { ...pageTarget, entity: { ...pageTarget.entity, pageId: page.id } };
  const sequence = {
    id: 'sequence',
    name: 'Sequence',
    durationTicks: 10,
    loop: { kind: 'none' },
    tracks: [{
      id: 'track',
      name: 'Track',
      target: createReviewTarget(project, documentInstance.id, '/appearance/opacity'),
      valueType: 'asset',
      keyframes: [{ id: 'key', tick: 0, value: createValue(site, 'keyframe') }],
    }],
    markers: [],
    cues: [{
      id: 'cue',
      kind: 'event',
      tick: 0,
      eventId: 'event',
      payload: createValue(site, 'cue-payload'),
      firing: 'forward-only',
    }],
    childClips: [],
  };
  const binding = {
    id: 'document-binding',
    target: createReviewTarget(project, documentInstance.id, '/appearance/opacity'),
    expression: { kind: 'literal', value: createValue(site, 'expression-literal') },
    formatter: { steps: [{ id: 'formatter', formatterId: 'prefix', arguments: [{ type: 'string', value: 'Prefix' }] }] },
    fallback: createValue(site, 'binding-fallback'),
  };

  return parseReviewProject({
    ...project,
    resources: {
      ...project.resources,
      assets: [createDataAsset()],
      variables: [{
        id: 'variables',
        name: 'Variables',
        modes: [{ id: 'default', name: 'Default' }],
        defaultModeId: 'default',
        variables: [{
          id: 'media',
          name: 'Media',
          valueType: 'asset',
          valuesByMode: { default: createValue(site, 'variable') },
        }],
      }],
      styles: [{
        id: 'style',
        name: 'Style',
        kind: 'appearance',
        source: { kind: 'properties', entries: [{ id: 'entry', pointer: '/opacity', value: createValue(site, 'style') }] },
      }],
    },
    documents: [{
      ...document,
      elements: [documentInstance, rootElement],
      components: [leaf, parent],
      pages: [{
        ...page,
        rootInstances: [{
          id: 'root-instance',
          elementId: rootElement.id,
          overrides: [{ target: addressedPageTarget, value: createValue(site, 'root-override') }],
          componentPropertyValues: [{ exposedPropertyId: exposed.id, value: createValue(site, 'root-value') }],
        }],
        descendantOverrides: [{
          address: { rootInstanceId: 'root-instance', componentInstancePath: [nested.id], elementId: local.id },
          overrides: [{ target: addressedPageTarget, value: createValue(site, 'descendant-override') }],
        }],
      }],
      viewModels: [{
        id: 'view-model',
        name: 'View model',
        fields: [{
          id: 'media',
          name: 'Media',
          schema: { kind: 'asset' },
          defaultValue: createValue(site, 'view-default'),
        }],
        sampleDataSets: [{
          id: 'sample',
          name: 'Sample',
          values: { media: createValue(site, 'view-sample') },
        }],
      }],
      bindings: [binding],
      sequences: [sequence],
      stateMachines: [{
        id: 'machine',
        name: 'Machine',
        initialStateId: 'state',
        states: [{
          id: 'state',
          name: 'State',
          values: [{
            id: 'value',
            target: createReviewTarget(project, documentInstance.id, '/appearance/opacity'),
            value: createValue(site, 'state-value'),
          }],
          entryActions: [],
          exitActions: [],
        }],
        transitions: [],
      }],
    }],
  });
}

describe('recursive typed-value resource validation', () => {
  it.each(cases)('reports a missing asset at $site with its exact pointer', ({ site, pointer }) => {
    expect(validateBroadsetProjectV1Semantics(createProjectWithMissingValue(site))).toContainEqual(
      expect.objectContaining({ code: 'resource.missing-reference', pointer }),
    );
  });

  it('reports a swatch nested through object and list typed values at its exact pointer', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const defaultValue = {
      type: 'object',
      fields: {
        colors: {
          type: 'list',
          items: [{ type: 'color', value: { kind: 'swatch', swatchId: 'missing-swatch' } }],
        },
      },
    };
    const viewModel = {
      id: 'view-model',
      name: 'View model',
      fields: [{
        id: 'palette',
        name: 'Palette',
        schema: {
          kind: 'object',
          fields: [{
            id: 'colors',
            name: 'Colors',
            required: true,
            schema: { kind: 'array', items: { kind: 'color' } },
          }],
        },
        defaultValue,
      }],
      sampleDataSets: [],
    };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, viewModels: [viewModel] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({
        code: 'resource.missing-reference',
        pointer: '/documents/0/viewModels/0/fields/0/defaultValue/fields/colors/items/0/value/swatchId',
      }),
    );
  });
});
