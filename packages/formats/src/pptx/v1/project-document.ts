import type { projectFormatV1 } from '@broadset/model';

import type { PptxSourceDocument, PptxSourceElement } from '../project-model';
import { toPptxSourceDocumentV1 } from '../project-source-document';

interface PptxProjectDocumentResultV1 {
  readonly document: PptxSourceDocument;
  readonly warnings: readonly string[];
}

function pageElement(
  element: PptxSourceElement,
  visible: boolean,
): PptxSourceDocument['pages'][number]['elements'][number] {
  return {
    elementId: element.id,
    transform: {
      position: { x: element.position.x, y: element.position.y, z: 0 },
      rotation: { x: 0, y: 0, z: element.rotation },
      scale: { x: 1, y: 1, z: 1 },
    },
    visible,
  };
}

export async function toPptxProjectDocumentV1(input: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly document: projectFormatV1.BroadsetDocumentV1;
  readonly pages: readonly projectFormatV1.PageDefinition[];
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly resolveBlob: ((digest: projectFormatV1.Sha256Digest) => Promise<Uint8Array | undefined>) | undefined;
}): Promise<PptxProjectDocumentResultV1> {
  // Temporary format-owned bridge; Slice E removes it with the legacy serializers.
  const mapped = await toPptxSourceDocumentV1(input);
  const elements = mapped.document.elements.map((element) => ({
    ...element,
    groupId: element.parentId,
  }));
  const pages = mapped.document.pages.map((page, pageIndex) => {
    const ownPrefix = `psd-v1-page-${String(pageIndex + 1)}-`;
    const ownInstances = new Map(page.elements.map((instance) => [instance.elementId, instance]));

    return {
      ...page,
      elements: elements.map(
        (element) => ownInstances.get(element.id) ?? pageElement(element, element.id.startsWith(ownPrefix)),
      ),
    };
  });

  return {
    document: { ...mapped.document, elements, pages },
    warnings: mapped.warnings.map((warning) => warning.replace(/^PSD v1 export:/u, 'PPTX v1 export:')),
  };
}
