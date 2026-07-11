import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { elementSchema, idSchema, validateBroadsetProjectV1Semantics } from './index';
import { createPageAddressScope, resolveTargetEntityAddress } from './resolved-address';
import { createSemanticIndexes } from './semantic-index';
import {
  createReviewComponent,
  createReviewComponentInstance,
  createReviewGroup,
  createReviewTarget,
  parseReviewProject,
} from './semantic-review-fixtures';

function createNestedProject(): ReturnType<typeof createMinimalProjectV1> {
  const project = createMinimalProjectV1();
  const document = project.documents[0];
  const page = document?.pages[0];

  if (document === undefined || page === undefined) return project;

  const leafElement = createReviewGroup('local');
  const leaf = createReviewComponent({
    id: 'leaf',
    name: 'Leaf',
    elements: [leafElement],
    rootElementIds: ['local'],
    sequences: [],
    exposedProperties: [
      {
        id: 'opacity',
        label: 'Opacity',
        group: 'Appearance',
        valueSchema: { kind: 'number', minimum: 0, maximum: 1 },
        defaultValue: { type: 'number', value: 1 },
        constraints: [{ kind: 'numeric-range', minimum: 0, maximum: 1 }],
        bindings: [
          {
            id: 'binding',
            target: createReviewTarget(project, 'local', '/appearance/opacity'),
          },
        ],
      },
    ],
    extensions: [],
  });
  const nestedInstance = createReviewComponentInstance('nested', 'leaf');
  const parent = createReviewComponent({
    id: 'parent',
    name: 'Parent',
    elements: [nestedInstance],
    rootElementIds: ['nested'],
    sequences: [],
    exposedProperties: [],
    extensions: [],
  });
  const repeated = createReviewComponent({
    id: 'repeated',
    name: 'Repeated IDs are local',
    elements: [createReviewGroup('local')],
    rootElementIds: ['local'],
    sequences: [],
    exposedProperties: [],
    extensions: [],
  });
  const rootElement = createReviewComponentInstance('root-element', 'parent');
  const rootInstance = {
    id: 'root-instance',
    elementId: 'root-element',
    overrides: [],
    componentPropertyValues: [],
  };

  return parseReviewProject({
    ...project,
    documents: [
      {
        ...document,
        elements: [rootElement],
        components: [leaf, parent, repeated],
        pages: [{ ...page, rootInstances: [rootInstance] }],
      },
    ],
  });
}

describe('resolved page and component address scopes', () => {
  it('keeps duplicate nested entities ambiguous in an ordinary page-root scope', () => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture document and page');

    const root = createReviewGroup('root');
    const effect = { id: 'effect', enabled: true, opacity: 1, blendMode: 'normal', kind: 'blur', radius: 1 };
    const children = ['first', 'second'].map((id) => {
      const group = createReviewGroup(id, root.id);

      return elementSchema.parse({ ...group, appearance: { ...group.appearance, effects: [effect] } });
    });
    const rootInstance = { id: 'root-instance', elementId: root.id, overrides: [], componentPropertyValues: [] };
    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        elements: [root, ...children],
        pages: [{ ...page, rootInstances: [rootInstance] }],
      }],
    });
    const index = createSemanticIndexes(actual).documentList[0];
    const actualPage = index?.document.pages[0];
    const actualRoot = actualPage?.rootInstances[0];

    if (index === undefined || actualPage === undefined || actualRoot === undefined) throw new Error('Expected indexed page root');

    expect(resolveTargetEntityAddress(createPageAddressScope(index, actualPage, actualRoot), {
      projectId: actual.id,
      documentId: index.document.id,
      pageId: actualPage.id,
      entityKind: 'effect',
      entityId: idSchema.parse('effect'),
      instancePath: [actualRoot.id],
    })).toBeUndefined();
  });

  it('accepts a valid nested instance path despite repeated component-local IDs', () => {
    const project = createNestedProject();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture document and page');

    const target = createReviewTarget(project, 'local', '/appearance/opacity', ['root-instance', 'nested']);
    const descendant = {
      address: { rootInstanceId: 'root-instance', componentInstancePath: ['nested'], elementId: 'local' },
      overrides: [
        {
          target: { ...target, entity: { ...target.entity, pageId: page.id } },
          value: { type: 'number', value: 0.5 },
        },
      ],
    };
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, pages: [{ ...page, descendantOverrides: [descendant] }] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual([]);
  });

  it('rejects an unresolved nested component instance path', () => {
    const project = createNestedProject();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture document and page');

    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        pages: [{
          ...page,
          descendantOverrides: [{
            address: { rootInstanceId: 'root-instance', componentInstancePath: ['missing'], elementId: 'local' },
            overrides: [],
          }],
        }],
      }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'page.orphan-override', pointer: '/documents/0/pages/0/descendantOverrides/0/address' }),
    );
  });

  it('rejects a descendant override target outside its addressed descendant', () => {
    const project = createNestedProject();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture document and page');

    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        pages: [{
          ...page,
          descendantOverrides: [{
            address: { rootInstanceId: 'root-instance', componentInstancePath: ['nested'], elementId: 'local' },
            overrides: [{
              target: createReviewTarget(project, 'root-element', '/appearance/opacity'),
              value: { type: 'number', value: 0.5 },
            }],
          }],
        }],
      }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'page.override-address-mismatch', pointer: '/documents/0/pages/0/descendantOverrides/0/overrides/0/target' }),
    );
  });

  it('rejects a root override targeting an unrelated entity', () => {
    const project = createNestedProject();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture document and page');

    const extra = createReviewGroup('unrelated');
    const root = page.rootInstances[0];

    if (root === undefined) throw new Error('Expected root instance');

    const actual = parseReviewProject({
      ...project,
      documents: [{
        ...document,
        elements: [...document.elements, extra],
        pages: [{
          ...page,
          rootInstances: [{
            ...root,
            overrides: [{ target: createReviewTarget(project, 'unrelated', '/appearance/opacity'), value: { type: 'number', value: 0.5 } }],
          }],
        }],
      }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'page.override-address-mismatch', pointer: '/documents/0/pages/0/rootInstances/0/overrides/0/target' }),
    );
  });

  it('rejects an exposed binding that escapes its owning component', () => {
    const project = createNestedProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const leaf = document.components[0];

    if (leaf === undefined) throw new Error('Expected leaf component');

    const escaped = { ...leaf, exposedProperties: leaf.exposedProperties.map((property) => ({ ...property, bindings: [{ id: 'binding', target: createReviewTarget(project, 'root-element', '/appearance/opacity') }] })) };
    const actual = parseReviewProject({ ...project, documents: [{ ...document, components: [escaped, ...document.components.slice(1)] }] });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'component.target-outside-scope', pointer: '/documents/0/components/0/exposedProperties/0/bindings/0/target' }),
    );
  });

  it('rejects invalid property values on nested component instances', () => {
    const project = createNestedProject();
    const document = project.documents[0];

    if (document === undefined) throw new Error('Expected fixture document');

    const parent = document.components[1];

    if (parent === undefined) throw new Error('Expected parent component');

    const nested = createReviewComponentInstance('nested', 'leaf', [
      { exposedPropertyId: 'opacity', value: { type: 'string', value: 'invalid' } },
    ]);
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, components: [document.components[0], { ...parent, elements: [nested] }, document.components[2]] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code: 'component.incompatible-property-value', pointer: '/documents/0/components/1/elements/0/propertyValues/0/value' }),
    );
  });

  it.each(['/accessibility/label', '/image/focalPoint', '/textPath/startOffset'])(
    'rejects absent optional target %s',
    (pointer) => {
      const project = createNestedProject();
      const document = project.documents[0];

      if (document === undefined) throw new Error('Expected fixture document');

      const target = createReviewTarget(project, 'root-element', pointer);

      expect(validateBroadsetProjectV1Semantics(parseReviewProject({
        ...project,
        documents: [{ ...document, bindings: [{ id: 'binding', target, expression: { kind: 'literal', value: { type: 'string', value: 'x' } } }] }],
      }))).toContainEqual(expect.objectContaining({ code: 'target.invalid-pointer', pointer: '/documents/0/bindings/0/target' }));
    },
  );
});
