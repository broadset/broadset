import { projectFormatV1 } from '@broadset/model';

import { type RenderContextV1, renderElementV1 } from './element-dom';

type BroadsetProjectV1 = projectFormatV1.BroadsetProjectV1;
type ResolvedSceneInstance = projectFormatV1.ResolvedSceneInstance;
type Id = projectFormatV1.Id;

interface SceneNodeStackEntry {
  readonly depth: number;
  readonly node: HTMLElement;
}

/** Compose a resolved preorder instance list into a detached, nested scene DOM tree. */
export function renderResolvedSceneV1(
  instances: readonly ResolvedSceneInstance[],
  context: RenderContextV1,
): HTMLElement {
  const domDocument = context.document ?? globalThis.document;
  const sceneRoot = domDocument.createElement('div');
  const stack: SceneNodeStackEntry[] = [];

  sceneRoot.dataset['sceneRoot'] = 'true';
  sceneRoot.style.setProperty('position', 'relative');
  sceneRoot.style.setProperty('transform-style', 'preserve-3d');

  for (const instance of instances) {
    let parentEntry = stack.at(-1);

    while (parentEntry !== undefined && parentEntry.depth >= instance.depth) {
      stack.pop();
      parentEntry = stack.at(-1);
    }

    const node = renderElementV1(instance.element, context);

    if (!instance.visible) node.style.setProperty('display', 'none');

    (parentEntry?.node ?? sceneRoot).append(node);
    stack.push({ depth: instance.depth, node });
  }

  return sceneRoot;
}

/** Resolve and render one page as a detached scene DOM tree. */
export function renderPageV1(options: {
  readonly project: BroadsetProjectV1;
  readonly documentId: Id;
  readonly pageId: Id;
  readonly context: RenderContextV1;
}): HTMLElement {
  const instances = projectFormatV1.resolvePageInstanceTree({
    project: options.project,
    documentId: options.documentId,
    pageId: options.pageId,
  });

  return renderResolvedSceneV1(instances, options.context);
}
