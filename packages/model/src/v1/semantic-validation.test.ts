import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import {
  type Asset,
  assetSchema,
  type BroadsetProjectV1,
  broadsetProjectV1Schema,
  type ComponentDefinition,
  componentDefinitionSchema,
  type Element,
  elementSchema,
  resolvePropertyTargetValueType,
  sha256DigestSchema,
  validateBroadsetProjectV1Semantics,
} from './index';

function createGroupElement(id: string, parentId: string | null = null): Element {
  return elementSchema.parse({
    id,
    kind: 'group',
    name: id,
    parentId,
    locked: false,
    hiddenInEditor: false,
    geometry: {
      bounds: { width: 100, height: 100 },
      transform: { kind: 'affine2d', matrix: [1, 0, 0, 1, 0, 0] },
      origin: [0, 0, 0],
    },
    appearance: { opacity: 1, blendMode: 'normal', isolation: false, fills: [], strokes: [], effects: [] },
    sharedStyleIds: [],
    extensions: [],
    group: { clipChildren: false },
  });
}

function createImageElement(id: string, assetId: string): Element {
  const base = createGroupElement(id);

  return elementSchema.parse({
    id: base.id,
    name: base.name,
    parentId: base.parentId,
    locked: base.locked,
    hiddenInEditor: base.hiddenInEditor,
    geometry: base.geometry,
    appearance: base.appearance,
    sharedStyleIds: base.sharedStyleIds,
    extensions: base.extensions,
    kind: 'image',
    image: { assetId, fit: 'contain' },
  });
}

function createDataAsset(id: string): Asset {
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

function withElements(project: BroadsetProjectV1, elements: readonly Element[]): BroadsetProjectV1 {
  const document = project.documents[0];

  if (document === undefined) return project;

  return { ...project, documents: [{ ...document, elements }] };
}

function createSelfReferencingComponent(): ComponentDefinition {
  const base = createGroupElement('nested-instance');
  const instance = elementSchema.parse({
    id: base.id,
    name: base.name,
    parentId: base.parentId,
    locked: base.locked,
    hiddenInEditor: base.hiddenInEditor,
    geometry: base.geometry,
    appearance: base.appearance,
    sharedStyleIds: base.sharedStyleIds,
    extensions: base.extensions,
    kind: 'component-instance',
    componentId: 'component',
    propertyValues: [],
  });

  return componentDefinitionSchema.parse({
    id: 'component',
    name: 'Component',
    elements: [instance],
    rootElementIds: [instance.id],
    sequences: [],
    exposedProperties: [],
    extensions: [],
  });
}

interface SemanticCase {
  readonly name: string;
  readonly code: string;
  readonly pointer: string;
  readonly create: () => unknown;
}

const semanticCases: readonly SemanticCase[] = [
  {
    name: 'duplicate document ID',
    code: 'identity.duplicate',
    pointer: '/documents/1/id',
    create: () => {
      const project = createMinimalProjectV1();
      const document = project.documents[0];

      return document === undefined ? project : { ...project, documents: [document, document] };
    },
  },
  {
    name: 'missing asset reference',
    code: 'resource.missing-reference',
    pointer: '/documents/0/elements/0/image/assetId',
    create: () => withElements(createMinimalProjectV1(), [createImageElement('image', 'missing')]),
  },
  {
    name: 'wrong-kind asset reference',
    code: 'resource.wrong-kind',
    pointer: '/documents/0/elements/0/image/assetId',
    create: () => {
      const project = createMinimalProjectV1();

      return withElements({ ...project, resources: { ...project.resources, assets: [createDataAsset('asset')] } }, [
        createImageElement('image', 'asset'),
      ]);
    },
  },
  {
    name: 'non-preorder hierarchy',
    code: 'hierarchy.non-preorder',
    pointer: '/documents/0/elements/0/parentId',
    create: () =>
      withElements(createMinimalProjectV1(), [createGroupElement('child', 'parent'), createGroupElement('parent')]),
  },
  {
    name: 'orphan parent',
    code: 'hierarchy.orphan-parent',
    pointer: '/documents/0/elements/0/parentId',
    create: () => withElements(createMinimalProjectV1(), [createGroupElement('child', 'missing')]),
  },
  {
    name: 'element cycle',
    code: 'hierarchy.cycle',
    pointer: '/documents/0/elements/0/parentId',
    create: () => withElements(createMinimalProjectV1(), [createGroupElement('a', 'b'), createGroupElement('b', 'a')]),
  },
  {
    name: 'component cycle',
    code: 'component.cycle',
    pointer: '/documents/0/components/0/elements/0/componentId',
    create: () => {
      const project = createMinimalProjectV1();
      const document = project.documents[0];

      if (document === undefined) return project;

      return { ...project, documents: [{ ...document, components: [createSelfReferencingComponent()] }] };
    },
  },
  {
    name: 'variable alias cycle',
    code: 'variable.alias-cycle',
    pointer: '/resources/variables/0/variables/0/aliasOf',
    create: () => {
      const project = createMinimalProjectV1();

      return {
        ...project,
        resources: {
          ...project.resources,
          variables: [
            {
              id: 'collection',
              name: 'Variables',
              modes: [{ id: 'mode', name: 'Default' }],
              defaultModeId: 'mode',
              variables: [
                {
                  id: 'variable',
                  name: 'Variable',
                  valueType: 'string',
                  valuesByMode: { mode: { type: 'string', value: 'value' } },
                  aliasOf: { collectionId: 'collection', variableId: 'variable' },
                },
              ],
            },
          ],
        },
      };
    },
  },
  {
    name: 'missing page root',
    code: 'page.missing-root',
    pointer: '/documents/0/pages/0/rootInstances/0/elementId',
    create: () => {
      const project = createMinimalProjectV1();
      const document = project.documents[0];
      const page = document?.pages[0];

      if (document === undefined || page === undefined) return project;

      return {
        ...project,
        documents: [
          {
            ...document,
            pages: [
              {
                ...page,
                rootInstances: [{ id: 'root', elementId: 'missing', overrides: [], componentPropertyValues: [] }],
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'orphan descendant override',
    code: 'page.orphan-override',
    pointer: '/documents/0/pages/0/descendantOverrides/0/address',
    create: () => {
      const project = withElements(createMinimalProjectV1(), [createGroupElement('element')]);
      const document = project.documents[0];
      const page = document?.pages[0];

      if (document === undefined || page === undefined) return project;

      return {
        ...project,
        documents: [
          {
            ...document,
            pages: [
              {
                ...page,
                descendantOverrides: [
                  {
                    address: { rootInstanceId: 'missing', componentInstancePath: [], elementId: 'element' },
                    overrides: [],
                  },
                ],
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'invalid override pointer',
    code: 'target.invalid-pointer',
    pointer: '/documents/0/pages/0/rootInstances/0/overrides/0/target/pointer',
    create: () => {
      const project = withElements(createMinimalProjectV1(), [createGroupElement('element')]);
      const document = project.documents[0];
      const page = document?.pages[0];

      if (document === undefined || page === undefined) return project;

      return {
        ...project,
        documents: [
          {
            ...document,
            pages: [
              {
                ...page,
                rootInstances: [
                  {
                    id: 'root',
                    elementId: 'element',
                    overrides: [
                      {
                        target: {
                          entity: {
                            projectId: project.id,
                            documentId: document.id,
                            entityKind: 'element',
                            entityId: 'element',
                          },
                          pointer: '/id',
                        },
                        value: { type: 'string', value: 'new-id' },
                      },
                    ],
                    componentPropertyValues: [],
                  },
                ],
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'missing binding field',
    code: 'binding.missing-field',
    pointer: '/documents/0/bindings/0/expression/fieldId',
    create: () => {
      const project = withElements(createMinimalProjectV1(), [createGroupElement('element')]);
      const document = project.documents[0];

      if (document === undefined) return project;

      return {
        ...project,
        documents: [
          {
            ...document,
            bindings: [
              {
                id: 'binding',
                target: {
                  entity: {
                    projectId: project.id,
                    documentId: document.id,
                    entityKind: 'element',
                    entityId: 'element',
                  },
                  pointer: '/appearance/opacity',
                },
                expression: { kind: 'field', viewModelId: 'missing', fieldId: 'missing' },
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'incompatible binding result',
    code: 'binding.incompatible-result',
    pointer: '/documents/0/bindings/0/target',
    create: () => {
      const project = withElements(createMinimalProjectV1(), [createGroupElement('element')]);
      const document = project.documents[0];

      if (document === undefined) return project;

      return {
        ...project,
        documents: [
          {
            ...document,
            bindings: [
              {
                id: 'binding',
                target: {
                  entity: {
                    projectId: project.id,
                    documentId: document.id,
                    entityKind: 'element',
                    entityId: 'element',
                  },
                  pointer: '/appearance/opacity',
                },
                expression: { kind: 'literal', value: { type: 'string', value: 'opaque' } },
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'missing sequence',
    code: 'sequence.missing-reference',
    pointer: '/documents/0/pages/0/sequenceId',
    create: () => {
      const project = createMinimalProjectV1();
      const document = project.documents[0];
      const page = document?.pages[0];

      if (document === undefined || page === undefined) return project;

      return { ...project, documents: [{ ...document, pages: [{ ...page, sequenceId: 'missing' }] }] };
    },
  },
  {
    name: 'invalid output profile',
    code: 'output.invalid-profile',
    pointer: '/documents/0/outputProfileIds/0',
    create: () => {
      const project = createMinimalProjectV1();
      const document = project.documents[0];

      if (document === undefined) return project;

      return { ...project, documents: [{ ...document, outputProfileIds: ['missing'] }] };
    },
  },
  {
    name: 'invalid interop target',
    code: 'interop.invalid-target',
    pointer: '/interop/records/0/target',
    create: () => {
      const project = createMinimalProjectV1();

      return {
        ...project,
        resources: { ...project.resources, assets: [createDataAsset('source-asset')] },
        interop: {
          sources: [
            {
              id: 'source',
              format: 'test',
              sourceAssetId: 'source-asset',
              importerVersion: '1',
              importedAt: project.metadata.createdAt,
            },
          ],
          records: [
            {
              id: 'record',
              sourceId: 'source',
              target: { projectId: project.id, documentId: 'missing', entityKind: 'document', entityId: 'missing' },
              baselineSemanticHash: sha256DigestSchema.parse(`sha256:${'0'.repeat(64)}`),
              mappingConfidence: 1,
              editability: 'native',
              warnings: [],
            },
          ],
        },
      };
    },
  },
  {
    name: 'invalid template-group member',
    code: 'template-group.invalid-member',
    pointer: '/templateGroups/0/members/0/documentId',
    create: () => {
      const project = createMinimalProjectV1();

      return {
        ...project,
        templateGroups: [
          {
            id: 'group',
            name: 'Group',
            members: [
              {
                id: 'member',
                documentId: 'missing',
                role: { kind: 'named', name: 'Horizontal' },
                outputProfileIds: [],
              },
            ],
          },
        ],
      };
    },
  },
  {
    name: 'duplicate extension namespace',
    code: 'extension.duplicate-namespace',
    pointer: '/extensions/1/namespace',
    create: () => {
      const project = createMinimalProjectV1();
      const extension = {
        namespace: 'com.example.test',
        schema: 'https://example.com/schema.json',
        version: 1,
        payload: null,
      };

      return { ...project, extensions: [extension, extension] };
    },
  },
  {
    name: 'invalid selected variable mode',
    code: 'variable.invalid-mode-selection',
    pointer: '/documents/0/selectedVariableModes/missing',
    create: () => {
      const project = createMinimalProjectV1();
      const document = project.documents[0];

      return document === undefined ? project : (
          { ...project, documents: [{ ...document, selectedVariableModes: { missing: 'mode' } }] }
        );
    },
  },
];

describe('validateBroadsetProjectV1Semantics', () => {
  it('accepts the canonical minimal fixture without throwing', () => {
    expect(validateBroadsetProjectV1Semantics(createMinimalProjectV1())).toEqual([]);
  });
  it.each(semanticCases)('reports $name with a stable code and pointer', ({ create, code, pointer }) => {
    const project = broadsetProjectV1Schema.parse(create());

    expect(validateBroadsetProjectV1Semantics(project)).toContainEqual(
      expect.objectContaining({ code, severity: 'error', pointer }),
    );
  });

  it('sorts diagnostics by pointer then code', () => {
    const project = broadsetProjectV1Schema.parse(semanticCases[0]?.create() ?? createMinimalProjectV1());
    const diagnostics = validateBroadsetProjectV1Semantics(project);
    const keys = diagnostics.map(({ pointer = '', code }) => `${pointer}\u0000${code}`);

    expect(keys).toEqual([...keys].sort((left, right) => left.localeCompare(right)));
  });

  it('resolves only approved pointers for the actual entity variant', () => {
    const project = withElements(createMinimalProjectV1(), [createGroupElement('element')]);
    const document = project.documents[0];
    const entity = {
      projectId: project.id,
      documentId: document?.id,
      entityKind: 'element',
      entityId: document?.elements[0]?.id ?? project.id,
    };

    expect(resolvePropertyTargetValueType(project, { entity, pointer: '/appearance/opacity' })).toBe('number');
    expect(resolvePropertyTargetValueType(project, { entity, pointer: '/id' })).toBeUndefined();
    expect(resolvePropertyTargetValueType(project, { entity, pointer: '/image/assetId' })).toBeUndefined();
  });
});
