import type { Diagnostic } from './diagnostics';
import type { Id } from './identity';
import type { BroadsetProjectV1 } from './project';
import type { SemanticIndexes } from './semantic-index';
import { createSemanticError } from './semantic-validation-helpers';

interface ValidateAssetReferenceOptions {
  readonly indexes: SemanticIndexes;
  readonly assetId: Id;
  readonly kinds: readonly BroadsetProjectV1['resources']['assets'][number]['kind'][];
  readonly pointer: string;
  readonly diagnostics: Diagnostic[];
}

export function validateAssetReference({
  indexes,
  assetId,
  kinds,
  pointer,
  diagnostics,
}: ValidateAssetReferenceOptions): void {
  const asset = indexes.assets.get(assetId);

  if (asset === undefined) {
    diagnostics.push(createSemanticError('resource.missing-reference', 'Asset does not resolve', pointer));
  } else if (!kinds.includes(asset.kind)) {
    diagnostics.push(createSemanticError('resource.wrong-kind', `Expected ${kinds.join(' or ')} asset`, pointer));
  }
}

export function validateMissingBlobSource(
  source: BroadsetProjectV1['resources']['assets'][number]['blob']['source'],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (source.kind === 'missing') {
    diagnostics.push({
      code: 'resource.missing-source',
      severity: 'warning',
      message: 'Blob source is explicitly missing',
      pointer,
    });
  }
}

export function validateForeignElementSource(
  element: BroadsetProjectV1['documents'][number]['elements'][number],
  pointer: string,
  diagnostics: Diagnostic[],
): void {
  if (element.kind === 'foreign') {
    validateMissingBlobSource(element.foreign.sourceBlob.source, `${pointer}/foreign/sourceBlob/source`, diagnostics);
  }
}
