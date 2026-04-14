import {
  type BroadsetDocument,
  type BroadsetElement,
  createEmptyBroadsetDocument,
  type PageElementInstance,
} from '@broadset/model';

export function createRootPageInstances(elements: readonly BroadsetElement[]): readonly PageElementInstance[] {
  return elements
    .filter((element) => element.parentId === null)
    .map((element) => ({
      elementId: element.id,
      transform: {
        position: { x: element.position.x, y: element.position.y, z: 0 },
        rotation: { x: 0, y: 0, z: element.rotation },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
    }));
}

export function createBaseFixtureDocument(name: string): BroadsetDocument {
  const base = createEmptyBroadsetDocument();

  return {
    ...base,
    name,
    canvas: {
      ...base.canvas,
      width: 1920,
      height: 1080,
      backgroundColor: '#0b1320',
      backgroundMode: 'solid',
    },
    pages: [
      {
        id: 'page-live',
        name: 'Live',
        elements: [],
        locale: 'en-GB',
        extensions: {},
      },
    ],
  };
}
