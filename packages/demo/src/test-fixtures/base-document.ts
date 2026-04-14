import { type BroadsetDocument, createEmptyBroadsetDocument } from '@broadset/model';

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
        overrides: [],
        locale: 'en-GB',
        extensions: {},
      },
    ],
  };
}
