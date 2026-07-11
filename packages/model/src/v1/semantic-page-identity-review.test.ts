import { describe, expect, it } from 'vitest';

import { createMinimalProjectV1 } from './fixtures/minimal-project';
import { elementSchema, idSchema, validateBroadsetProjectV1Semantics } from './index';
import {
  createReviewComponent,
  createReviewComponentInstance,
  createReviewGroup,
  createReviewTarget,
  parseReviewProject,
} from './semantic-review-fixtures';

function createMixedRootProject(): ReturnType<typeof createMinimalProjectV1> {
  const project = createMinimalProjectV1();
  const document = project.documents[0];
  const page = document?.pages[0];

  if (document === undefined || page === undefined) return project;

  const root = createReviewGroup('ordinary-root');
  const firstBase = createReviewComponentInstance('first-instance', 'leaf');
  const secondBase = createReviewComponentInstance('second-instance', 'leaf');
  const first = elementSchema.parse({ ...firstBase, parentId: root.id });
  const second = elementSchema.parse({ ...secondBase, parentId: root.id });
  const leaf = createReviewComponent({
    id: 'leaf',
    name: 'Leaf',
    elements: [createReviewGroup('local')],
    rootElementIds: ['local'],
    sequences: [],
    exposedProperties: [],
    extensions: [],
  });

  return parseReviewProject({
    ...project,
    documents: [{
      ...document,
      elements: [root, first, second],
      components: [leaf],
      pages: [{
        ...page,
        rootInstances: [{
          id: 'root-instance',
          elementId: root.id,
          overrides: [],
          componentPropertyValues: [],
        }],
      }],
    }],
  });
}

function createPageTarget(
  project: ReturnType<typeof createMinimalProjectV1>,
  pageId: string,
  instanceId: string,
): ReturnType<typeof createReviewTarget> {
  const target = createReviewTarget(project, 'local', '/appearance/opacity', ['root-instance', instanceId]);

  return { ...target, entity: { ...target.entity, pageId: idSchema.parse(pageId) } };
}

describe('page-aware semantic identity', () => {
  it('traverses descendant component instances under an ordinary root with repeated local IDs', () => {
    const project = createMixedRootProject();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected mixed-root fixture');

    const descendants = ['first-instance', 'second-instance'].map((instanceId) => ({
      address: { rootInstanceId: 'root-instance', componentInstancePath: [instanceId], elementId: 'local' },
      overrides: [{ target: createPageTarget(project, page.id, instanceId), value: { type: 'number', value: 0.5 } }],
    }));
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, pages: [{ ...page, descendantOverrides: descendants }] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toEqual([]);
  });

  it('rejects a page target that names another page reusing the same root-instance ID', () => {
    const project = createMixedRootProject();
    const document = project.documents[0];
    const firstPage = document?.pages[0];

    if (document === undefined || firstPage === undefined) throw new Error('Expected mixed-root fixture');

    const secondPage = { ...firstPage, id: 'page-2', name: 'Page 2' };
    const descendant = {
      address: { rootInstanceId: 'root-instance', componentInstancePath: ['first-instance'], elementId: 'local' },
      overrides: [{ target: createPageTarget(project, secondPage.id, 'first-instance'), value: { type: 'number', value: 0.5 } }],
    };
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, pages: [{ ...firstPage, descendantOverrides: [descendant] }, secondPage] }],
    });

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({
        code: 'page.override-address-mismatch',
        pointer: '/documents/0/pages/0/descendantOverrides/0/overrides/0/target',
      }),
    );
  });

  it.each([
    ['missing view model', { missing: 'sample' }, 'page.missing-view-model'],
    ['sample owned by another view model', { first: 'second-sample' }, 'page.missing-sample-data'],
  ])('rejects %s in selected sample data sets', (_name, selectedSampleDataSets, code) => {
    const project = createMinimalProjectV1();
    const document = project.documents[0];
    const page = document?.pages[0];

    if (document === undefined || page === undefined) throw new Error('Expected fixture page');

    const viewModels = [
      { id: 'first', name: 'First', fields: [], sampleDataSets: [{ id: 'first-sample', name: 'First sample', values: {} }] },
      { id: 'second', name: 'Second', fields: [], sampleDataSets: [{ id: 'second-sample', name: 'Second sample', values: {} }] },
    ];
    const actual = parseReviewProject({
      ...project,
      documents: [{ ...document, viewModels, pages: [{ ...page, selectedSampleDataSets }] }],
    });
    const viewModelId = Object.keys(selectedSampleDataSets)[0];

    if (viewModelId === undefined) throw new Error('Expected selected view model');

    expect(validateBroadsetProjectV1Semantics(actual)).toContainEqual(
      expect.objectContaining({ code, pointer: `/documents/0/pages/0/selectedSampleDataSets/${viewModelId}` }),
    );
  });
});
