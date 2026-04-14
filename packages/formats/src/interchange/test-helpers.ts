import {
  type BroadsetDocument,
  broadsetDocumentSchema,
  type BroadsetElement,
  type BroadsetProject,
  broadsetProjectSchema,
  createEmptyBroadsetDocument,
} from '@broadset/model';

/** Returns the first element of an array, throwing if the array is empty. */
export function first<T>(arr: readonly T[]): T {
  const item = arr[0];

  if (item === undefined) {
    throw new Error('Expected non-empty array');
  }

  return item;
}

export function makeElement(overrides: Partial<BroadsetElement> & { readonly type: string }): BroadsetElement {
  return {
    id: `el-${String(Math.random()).slice(2, 8)}`,
    name: overrides.type,
    position: { x: 0, y: 0 },
    width: 100,
    height: 50,
    rotation: 0,
    locked: false,
    visible: true,
    content: '',
    style: {},
    parentId: null,
    groupId: null,
    assetId: null,
    dataField: null,
    visibleWhen: null,
    repeater: null,
    ...overrides,
  } as BroadsetElement;
}

export function makeDocument(overrides: Partial<BroadsetDocument> = {}): BroadsetDocument {
  return broadsetDocumentSchema.parse({
    ...createEmptyBroadsetDocument(),
    ...overrides,
  });
}

export function makeProject(documents: readonly BroadsetDocument[] = [makeDocument()]): BroadsetProject {
  return broadsetProjectSchema.parse({
    schemaVersion: 1,
    id: 'proj-test',
    name: 'Test Project',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {},
    assets: [],
    documents: [...documents],
  });
}
