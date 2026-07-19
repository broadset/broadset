import { projectFormatV1 } from '@broadset/model';

import { type ExportedElementMarkup, exportElementMarkup } from './export-element';
import { svgNumber } from './export-paint';
import { xmlAttribute } from './xml';

interface SvgExportInputV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly documentId?: projectFormatV1.Id;
  readonly pageId?: projectFormatV1.Id;
  readonly resolveAssetHref?: (assetId: projectFormatV1.Id) => string | undefined;
}

interface OpenContainer {
  readonly depth: number;
  readonly closing: string;
}

const EMPTY_SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>';
const IMPORTED_SVG_ROOT_ID = 'svg-root';

function closeContainersAtDepth(containers: OpenContainer[], depth: number): string {
  let markup = '';

  while (containers.length > 0 && (containers.at(-1)?.depth ?? -1) >= depth) {
    markup += containers.pop()?.closing ?? '';
  }

  return markup;
}

function exportResolvedScene(input: {
  readonly instances: readonly projectFormatV1.ResolvedSceneInstance[];
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly resolveAssetHref: (assetId: projectFormatV1.Id) => string | undefined;
}): string {
  const containers: OpenContainer[] = [];
  let markup = '';

  for (const instance of input.instances) {
    if (!instance.visible) continue;

    // D2's importer-only canvas wrapper is represented by the exported <svg> root itself.
    if (instance.depth === 0 && instance.element.id === IMPORTED_SVG_ROOT_ID && instance.element.name === 'SVG root') {
      continue;
    }

    const exported: ExportedElementMarkup | undefined = exportElementMarkup(instance.element, {
      project: input.project,
      resolveAssetHref: input.resolveAssetHref,
    });

    if (exported === undefined) continue;

    markup += closeContainersAtDepth(containers, instance.depth);
    markup += exported.opening;

    if (exported.closing !== '') containers.push({ depth: instance.depth, closing: exported.closing });
  }

  return markup + closeContainersAtDepth(containers, -1);
}

export function exportSvgStringV1(input: SvgExportInputV1): string {
  try {
    const document: projectFormatV1.BroadsetDocumentV1 | undefined =
      input.project.documents.find(({ id }) => id === input.documentId) ??
      (input.documentId === undefined ? input.project.documents[0] : undefined);

    if (document === undefined) return EMPTY_SVG;

    const page: projectFormatV1.PageDefinition | undefined =
      document.pages.find(({ id }) => id === input.pageId) ??
      (input.pageId === undefined ? document.pages[0] : undefined);

    if (page === undefined) return EMPTY_SVG;

    const instances: readonly projectFormatV1.ResolvedSceneInstance[] = projectFormatV1.resolvePageInstanceTree({
      project: input.project,
      documentId: document.id,
      pageId: page.id,
    });
    const width = svgNumber(document.surface.size[0]);
    const height = svgNumber(document.surface.size[1]);
    const rootAttributes = `${xmlAttribute('xmlns', 'http://www.w3.org/2000/svg')}${xmlAttribute('width', width)}${xmlAttribute('height', height)}${xmlAttribute('viewBox', `0 0 ${width} ${height}`)}`;
    const content = exportResolvedScene({
      instances,
      project: input.project,
      resolveAssetHref: input.resolveAssetHref ?? (() => undefined),
    });

    return `<svg${rootAttributes}>${content}</svg>`;
  } catch {
    return EMPTY_SVG;
  }
}
