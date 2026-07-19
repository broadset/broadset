import type { Diagnostic } from './diagnostics';
import type { BroadsetDocumentV1 } from './document';
import type { Element } from './element';
import type { Id } from './identity';
import type { InstanceAddress } from './page';
import type { ResolvedSceneFallbackV1 } from './resolved-scene-types';
import type { Asset } from './resources';

function referencedAssetIds(element: Element): readonly Id[] {
  const ids: Id[] = [];

  if (element.kind === 'image') ids.push(element.image.assetId);
  if (element.kind === 'video') ids.push(element.video.assetId);
  if (element.kind === 'audio') ids.push(element.audio.assetId);
  if (element.kind === 'foreign') ids.push(element.foreign.previewAssetId);
  if (element.kind === 'plugin' && element.plugin.previewAssetId !== undefined) ids.push(element.plugin.previewAssetId);

  for (const layer of [...element.appearance.fills, ...element.appearance.strokes]) {
    if (layer.paint.kind === 'picture' || layer.paint.kind === 'pattern') ids.push(layer.paint.assetId);
  }

  element.appearance.effects.forEach((effect) => {
    if (effect.kind === 'displacement') ids.push(effect.assetId);
  });
  if (element.appearance.mask?.kind === 'asset') ids.push(element.appearance.mask.assetId);

  return [...new Set(ids)];
}

function createMissingResourceFallback(
  assetId: Id,
  address?: InstanceAddress,
): Extract<ResolvedSceneFallbackV1, { readonly kind: 'missing-resource' }> {
  const diagnostic: Diagnostic = {
    code: 'scene.missing-resource',
    severity: 'warning',
    message: `Asset ${assetId} has no available blob source`,
  };

  return address === undefined ?
      { kind: 'missing-resource', assetId, diagnostic }
    : { kind: 'missing-resource', address, assetId, diagnostic };
}

export function appendNodeResourceFallbacks(options: {
  readonly assets: ReadonlyMap<Id, Asset>;
  readonly diagnostics: Diagnostic[];
  readonly fallbacks: ResolvedSceneFallbackV1[];
  readonly address: InstanceAddress;
  readonly element: Element;
}): readonly ResolvedSceneFallbackV1[] {
  const fallbacks: ResolvedSceneFallbackV1[] = [];

  referencedAssetIds(options.element).forEach((assetId) => {
    const asset = options.assets.get(assetId);

    if (asset?.blob.source.kind !== 'missing') return;

    const fallback = createMissingResourceFallback(assetId, options.address);

    options.diagnostics.push(fallback.diagnostic);
    options.fallbacks.push(fallback);
    fallbacks.push(fallback);
  });

  return fallbacks;
}

function sceneContextAssetIds(document: BroadsetDocumentV1): readonly Id[] {
  const ids: Id[] = [];
  const background = document.surface.background;

  if (background.kind === 'picture' || background.kind === 'pattern') ids.push(background.assetId);
  if (document.color.workingSpace.kind === 'icc') ids.push(document.color.workingSpace.iccProfileAssetId);
  if (document.color.outputIntent !== undefined) ids.push(document.color.outputIntent.iccProfileAssetId);

  return [...new Set(ids)];
}

export function appendSceneContextResourceFallbacks(options: {
  readonly document: BroadsetDocumentV1;
  readonly assets: ReadonlyMap<Id, Asset>;
  readonly diagnostics: Diagnostic[];
  readonly fallbacks: ResolvedSceneFallbackV1[];
}): void {
  sceneContextAssetIds(options.document).forEach((assetId) => {
    if (options.assets.get(assetId)?.blob.source.kind !== 'missing') return;

    const fallback = createMissingResourceFallback(assetId);

    options.diagnostics.push(fallback.diagnostic);
    options.fallbacks.push(fallback);
  });
}
