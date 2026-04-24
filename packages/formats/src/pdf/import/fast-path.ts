import {
  type BroadsetDocument,
  type BroadsetElement,
  createDefaultElement,
  createEmptyBroadsetDocument,
} from '@broadset/model';

import type { MarkedContentKind, MarkedContentTag } from '../types';

/**
 * Hydrate a `BroadsetDocument` from a recovered XMP document id plus the
 * per-element marked-content tags collected from the PDF. This is the
 * fast-path invoked when a Broadset-exported PDF is re-imported.
 *
 * Element geometry (position / width / height / rotation) is not
 * recoverable from the marked-content property dicts alone — those ride
 * in the PDF content stream and land with the P6.4b operator-extraction
 * pass. Until then elements are hydrated with `createDefaultElement`'s
 * placeholder geometry so the id / type mapping still round-trips.
 */
export function hydrateDocumentFromFastPath(
  documentId: string,
  tags: readonly MarkedContentTag[],
): BroadsetDocument {
  const empty = createEmptyBroadsetDocument();
  const elements: BroadsetElement[] = tags.map((tag, index) =>
    createDefaultElement(elementTypeForKind(tag.kind), {
      id: tag.id,
      name: `Element ${String(index + 1)}`,
      ...(tag.dataField !== undefined
        ? {
            dataField: {
              fieldName: tag.dataField,
              overflow: 'clip',
            },
          }
        : {}),
      extensions: {
        pdf: {
          dirty: tag.dirty,
          ...(tag.preservationBlob !== undefined ? { preservationBlob: tag.preservationBlob } : {}),
        },
      },
    }),
  );

  return {
    ...empty,
    id: documentId,
    elements,
  };
}

function elementTypeForKind(kind: MarkedContentKind): BroadsetElement['type'] {
  // `MarkedContentKind` is a subset of `BroadsetElement['type']` (they
  // mirror one-to-one per `pdf/types.ts`), but TypeScript cannot narrow
  // across the two unions in one step without assignment assertions.
  // The switch statement is exhaustive over `MarkedContentKind` and
  // returns string-literal types the compiler narrows cleanly.
  switch (kind) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'svg':
      return 'svg';
    case 'path':
      return 'path';
    case 'rectangle':
      return 'rectangle';
    case 'ellipse':
      return 'ellipse';
    case 'qrcode':
      return 'qrcode';
    case 'group':
      return 'group';
    case 'video':
      return 'video';
    case 'clock':
      return 'clock';
    case 'ticker':
      return 'ticker';
  }
}
