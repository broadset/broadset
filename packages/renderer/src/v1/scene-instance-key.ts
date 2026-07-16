import type { projectFormatV1 } from '@broadset/model';

/** Stable, collision-safe DOM identity for one resolved instance on one page. */
export function sceneInstanceKeyV1(options: {
  readonly pageId: projectFormatV1.Id;
  readonly address: projectFormatV1.ResolvedSceneAddressV1;
}): string {
  return JSON.stringify([
    options.pageId,
    options.address.rootInstanceId,
    options.address.componentInstancePath,
    options.address.elementId,
  ]);
}
