import {
  type BroadsetProjectV1,
  broadsetProjectV1Schema,
  type ComponentDefinition,
  componentDefinitionSchema,
  type Element,
  elementSchema,
  idSchema,
  type PropertyTarget,
} from './index';

export function createReviewGroup(id: string, parentId: string | null = null): Element {
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

export function createReviewComponentInstance(id: string, componentId: string, propertyValues: readonly unknown[] = []): Element {
  const base = createReviewGroup(id);

  return elementSchema.parse({
    id: base.id,
    kind: 'component-instance',
    name: base.name,
    parentId: base.parentId,
    locked: base.locked,
    hiddenInEditor: base.hiddenInEditor,
    geometry: base.geometry,
    appearance: base.appearance,
    sharedStyleIds: [],
    extensions: [],
    componentId,
    propertyValues,
  });
}

export function createReviewTarget(
  project: BroadsetProjectV1,
  entityId: string,
  pointer: string,
  instancePath?: readonly string[],
  entityKind = 'element',
): PropertyTarget {
  const document = project.documents[0];

  if (document === undefined) throw new Error('Review fixture requires a document');

  return {
    entity: {
      projectId: project.id,
      documentId: document.id,
      entityKind,
      entityId: idSchema.parse(entityId),
      instancePath: instancePath?.map((id) => idSchema.parse(id)),
    },
    pointer,
  };
}

export function parseReviewProject(value: unknown): BroadsetProjectV1 {
  return broadsetProjectV1Schema.parse(value);
}

export function createReviewComponent(value: unknown): ComponentDefinition {
  return componentDefinitionSchema.parse(value);
}
