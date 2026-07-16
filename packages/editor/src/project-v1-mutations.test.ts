import { projectFormatV1 } from '@broadset/model';
import { describe, expect, it } from 'vitest';

import { removeDocumentElementsV1 } from './project-v1-mutations';

function id(value: string): projectFormatV1.Id {
  return projectFormatV1.idSchema.parse(value);
}

function createVectorElement(options: {
  readonly id: string;
  readonly parentId?: projectFormatV1.Id | null;
}): projectFormatV1.Element {
  const base = {
    id: id(options.id),
    name: options.id,
    kind: 'vector',
    geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
    geometryData: projectFormatV1.createRectangleGeometry(),
  } satisfies Omit<Extract<projectFormatV1.CreateElementV1Input, { readonly kind: 'vector' }>, 'parentId'>;

  return projectFormatV1.createElementV1(
    options.parentId === undefined ? base : { ...base, parentId: options.parentId },
  );
}

function createGroupElement(elementId: string): projectFormatV1.Element {
  return projectFormatV1.createElementV1({
    id: id(elementId),
    name: elementId,
    kind: 'group',
    geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
  });
}

describe('removeDocumentElementsV1', () => {
  it('purges a deleted subtree and every target that would dangle', () => {
    const parent = createVectorElement({ id: 'parent' });
    const child = createVectorElement({ id: 'child', parentId: parent.id });
    const survivor = createVectorElement({ id: 'survivor' });
    const documentId = id('document');
    const pageId = id('page');
    const projectId = id('project');
    const target = {
      entity: {
        projectId,
        documentId,
        entityKind: 'element',
        entityId: child.id,
      },
      pointer: '/appearance/opacity',
    } satisfies projectFormatV1.PropertyTarget;
    const document = {
      ...projectFormatV1.createDocumentV1({
        id: documentId,
        elements: [parent, child, survivor],
        pages: [
          projectFormatV1.createPageV1({
            id: pageId,
            rootInstances: [
              {
                id: id('parent-instance'),
                elementId: parent.id,
                overrides: [],
                componentPropertyValues: [],
              },
              {
                id: id('survivor-instance'),
                elementId: survivor.id,
                overrides: [],
                componentPropertyValues: [],
              },
            ],
          }),
        ],
      }),
      sequences: [
        {
          id: id('sequence'),
          name: 'Sequence',
          durationTicks: 10,
          loop: { kind: 'none' },
          tracks: [
            {
              id: id('track'),
              name: 'Opacity',
              target,
              valueType: 'number',
              keyframes: [{ id: id('keyframe'), tick: 0, value: { type: 'number', value: 1 } }],
            },
          ],
          markers: [],
          cues: [],
          childClips: [],
        },
      ],
      bindings: [
        {
          id: id('binding'),
          target,
          expression: { kind: 'literal', value: { type: 'number', value: 1 } },
        },
      ],
    } satisfies projectFormatV1.BroadsetDocumentV1;
    const project = projectFormatV1.createProjectV1({ id: projectId, documents: [document] });

    const result = removeDocumentElementsV1({ project, documentId, elementIds: [parent.id] });
    const actualDocument = result.documents[0];

    expect(actualDocument?.elements.map((element) => element.id)).toEqual([survivor.id]);
    expect(actualDocument?.pages[0]?.rootInstances.map((instance) => instance.elementId)).toEqual([survivor.id]);
    expect(actualDocument?.sequences[0]?.tracks).toEqual([]);
    expect(actualDocument?.bindings).toEqual([]);
    expect(projectFormatV1.parseProjectV1Unknown(result).diagnostics).not.toContainEqual(
      expect.objectContaining({ code: 'structural-invalid' }),
    );
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result)).toEqual([]);
  });

  it('returns the original project when the document or deletion set does not exist', () => {
    const project = projectFormatV1.createProjectV1();

    expect(
      removeDocumentElementsV1({ project, documentId: id('missing-document'), elementIds: [id('missing-element')] }),
    ).toBe(project);
    expect(
      removeDocumentElementsV1({ project, documentId: project.documents[0]?.id ?? id('document'), elementIds: [] }),
    ).toBe(project);
  });

  it('purges page overrides and state values targeting a removed descendant', () => {
    const parent = createGroupElement('parent');
    const child = createVectorElement({ id: 'child', parentId: parent.id });
    const projectId = id('project');
    const documentId = id('document');
    const pageId = id('page');
    const rootInstanceId = id('root-instance');
    const documentTarget = {
      entity: { projectId, documentId, entityKind: 'element', entityId: child.id },
      pointer: '/appearance/opacity',
    } satisfies projectFormatV1.PropertyTarget;
    const pageTarget = {
      entity: {
        projectId,
        documentId,
        pageId,
        entityKind: 'element',
        entityId: child.id,
        instancePath: [rootInstanceId],
      },
      pointer: '/appearance/opacity',
    } satisfies projectFormatV1.PropertyTarget;
    const document = {
      ...projectFormatV1.createDocumentV1({
        id: documentId,
        elements: [parent, child],
        pages: [
          projectFormatV1.createPageV1({
            id: pageId,
            rootInstances: [
              {
                id: rootInstanceId,
                elementId: parent.id,
                overrides: [],
                componentPropertyValues: [],
              },
            ],
          }),
        ],
      }),
      pages: [
        {
          ...projectFormatV1.createPageV1({
            id: pageId,
            rootInstances: [
              {
                id: rootInstanceId,
                elementId: parent.id,
                overrides: [],
                componentPropertyValues: [],
              },
            ],
          }),
          descendantOverrides: [
            {
              address: { rootInstanceId, componentInstancePath: [], elementId: child.id },
              overrides: [{ target: pageTarget, value: { type: 'number', value: 0.25 } }],
            },
          ],
        },
      ],
      stateMachines: [
        {
          id: id('machine'),
          name: 'Machine',
          initialStateId: id('state'),
          states: [
            {
              id: id('state'),
              name: 'State',
              values: [{ id: id('state-value'), target: documentTarget, value: { type: 'number', value: 1 } }],
              entryActions: [],
              exitActions: [],
            },
          ],
          transitions: [],
        },
      ],
    } satisfies projectFormatV1.BroadsetDocumentV1;
    const project = projectFormatV1.createProjectV1({ id: projectId, documents: [document] });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);

    const result = removeDocumentElementsV1({ project, documentId, elementIds: [child.id] });
    const actualDocument = result.documents[0];

    expect(actualDocument?.pages[0]?.descendantOverrides).toEqual([]);
    expect(actualDocument?.stateMachines[0]?.states[0]?.values).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result)).toEqual([]);
  });

  it('purges targets owned by nested entities of a deleted element', () => {
    const fillId = id('fill');
    const element = projectFormatV1.createElementV1({
      id: id('element'),
      name: 'Element',
      kind: 'vector',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
      geometryData: projectFormatV1.createRectangleGeometry(),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        fills: [
          {
            id: fillId,
            enabled: true,
            opacity: 1,
            blendMode: 'normal',
            paint: { kind: 'solid', color: projectFormatV1.createBlackColorValue() },
          },
        ],
      },
    });
    const projectId = id('project');
    const documentId = id('document');
    const target = {
      entity: { projectId, documentId, entityKind: 'fill', entityId: fillId },
      pointer: '/opacity',
    } satisfies projectFormatV1.PropertyTarget;
    const document = {
      ...projectFormatV1.createDocumentV1({ id: documentId, elements: [element] }),
      sequences: [
        {
          id: id('sequence'),
          name: 'Sequence',
          durationTicks: 1,
          loop: { kind: 'none' },
          tracks: [
            {
              id: id('track'),
              name: 'Fill opacity',
              target,
              valueType: 'number',
              keyframes: [{ id: id('keyframe'), tick: 0, value: { type: 'number', value: 1 } }],
            },
          ],
          markers: [],
          cues: [],
          childClips: [],
        },
      ],
    } satisfies projectFormatV1.BroadsetDocumentV1;
    const project = projectFormatV1.createProjectV1({ id: projectId, documents: [document] });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);

    const result = removeDocumentElementsV1({ project, documentId, elementIds: [element.id] });

    expect(result.documents[0]?.sequences[0]?.tracks).toEqual([]);
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result)).toEqual([]);
  });

  it('repairs surviving element references to deleted vectors', () => {
    const firstOperand = createVectorElement({ id: 'first-operand' });
    const secondOperand = createVectorElement({ id: 'second-operand' });
    const booleanElement = projectFormatV1.createElementV1({
      id: id('boolean-element'),
      name: 'Boolean',
      kind: 'vector',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
      geometryData: {
        kind: 'boolean',
        operation: 'union',
        operandIds: [firstOperand.id, secondOperand.id],
      },
    });
    const clippedElement = projectFormatV1.createElementV1({
      id: id('clipped-element'),
      name: 'Clipped',
      kind: 'vector',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 100 }),
      geometryData: projectFormatV1.createRectangleGeometry(),
      appearance: {
        ...projectFormatV1.createDefaultAppearance(),
        clip: { kind: 'vector', vectorElementId: firstOperand.id, fillRule: 'nonzero' },
        mask: { kind: 'vector', vectorElementId: firstOperand.id, mode: 'alpha' },
      },
    });
    const document = projectFormatV1.createDocumentV1({
      id: id('document'),
      elements: [firstOperand, secondOperand, booleanElement, clippedElement],
    });
    const project = projectFormatV1.createProjectV1({ documents: [document] });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);

    const result = removeDocumentElementsV1({
      project,
      documentId: document.id,
      elementIds: [firstOperand.id],
    });
    const actualBoolean = result.documents[0]?.elements.find((element) => element.id === booleanElement.id);
    const actualClipped = result.documents[0]?.elements.find((element) => element.id === clippedElement.id);

    expect(actualBoolean?.kind === 'vector' ? actualBoolean.geometryData : undefined).toEqual(
      projectFormatV1.createRectangleGeometry(),
    );
    expect(actualClipped?.appearance.clip).toBeUndefined();
    expect(actualClipped?.appearance.mask).toBeUndefined();
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result)).toEqual([]);
  });

  it('removes a text path whose vector is deleted', () => {
    const vector = createVectorElement({ id: 'path-vector' });
    const fontFamilyId = id('font-family');
    const fontFaceId = id('font-face');
    const baseText = projectFormatV1.createElementV1({
      id: id('text'),
      name: 'Text',
      kind: 'text',
      geometry: projectFormatV1.createElementGeometry({ width: 100, height: 20 }),
      text: projectFormatV1.createEmptyTextBody({
        paragraphId: id('paragraph'),
        runId: id('run'),
        fontFamilyId,
        fontFaceId,
        text: 'Text on path',
      }),
    });

    if (baseText.kind !== 'text') throw new Error('Expected the text factory to return a text element');

    const text = {
      ...baseText,
      textPath: { vectorElementId: vector.id, startOffset: 0, side: 'left' },
    } satisfies projectFormatV1.Element;
    const document = projectFormatV1.createDocumentV1({ id: id('document'), elements: [vector, text] });
    const project = projectFormatV1.createProjectV1({
      documents: [document],
      resources: {
        assets: [],
        fonts: [
          {
            id: fontFamilyId,
            familyName: 'Arial',
            fallbackFontIds: [],
            faces: [
              {
                id: fontFaceId,
                source: { kind: 'system', postScriptName: 'ArialMT' },
                weight: 400,
                style: 'normal',
                stretch: 1,
              },
            ],
          },
        ],
        swatches: [],
        variables: [],
        styles: [],
        outputProfiles: [],
      },
    });

    expect(projectFormatV1.validateBroadsetProjectV1Semantics(project)).toEqual([]);

    const result = removeDocumentElementsV1({ project, documentId: document.id, elementIds: [vector.id] });
    const actualText = result.documents[0]?.elements.find((element) => element.id === text.id);

    expect(actualText?.kind === 'text' ? actualText.textPath : undefined).toBeUndefined();
    expect(projectFormatV1.validateBroadsetProjectV1Semantics(result)).toEqual([]);
  });
});
