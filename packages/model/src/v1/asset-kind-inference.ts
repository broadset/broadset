import type { ExpressionAst, ValueSchema } from './data';
import type { Id } from './identity';
import type { AssetKind } from './resources';
import { ASSET_KINDS } from './resources';
import type { DocumentSemanticIndex, SemanticIndexes } from './semantic-index';
import type { PropertyTargetContract } from './target-resolution';
import type { TypedValue } from './typed-value';

type AssetKindProof = readonly AssetKind[] | undefined;

function unionProofs(proofs: readonly AssetKindProof[]): AssetKindProof {
  if (proofs.some((proof) => proof === undefined)) return undefined;

  const possible = new Set(proofs.flatMap((proof) => proof ?? []));

  return ASSET_KINDS.filter((kind) => possible.has(kind));
}

function valueAssetKinds(indexes: SemanticIndexes, value: TypedValue): AssetKindProof {
  if (value.type !== 'asset') return undefined;

  const asset = indexes.assets.get(value.assetId);

  return asset === undefined ? undefined : [asset.kind];
}

function schemaAssetKinds(schema: ValueSchema | undefined): AssetKindProof {
  return schema?.kind === 'asset' ? schema.acceptedAssetKinds : undefined;
}

function expressionSchema(
  document: DocumentSemanticIndex,
  expression: ExpressionAst,
): ValueSchema | undefined {
  if (expression.kind === 'field') {
    return document.document.viewModels
      .find((viewModel) => viewModel.id === expression.viewModelId)
      ?.fields.find((field) => field.id === expression.fieldId)?.schema;
  }

  if (expression.kind === 'get') {
    const source = expressionSchema(document, expression.source);

    return source?.kind === 'object'
      ? source.fields.find((field) => field.id === expression.fieldId)?.schema
      : undefined;
  }

  if (expression.kind === 'index') {
    const source = expressionSchema(document, expression.source);

    return source?.kind === 'array' ? source.items : undefined;
  }

  return undefined;
}

function variableAssetKinds(
  indexes: SemanticIndexes,
  collectionId: Id,
  variableId: Id,
  seen: ReadonlySet<string>,
): AssetKindProof {
  const key = `${collectionId}\u0000${variableId}`;

  if (seen.has(key)) return undefined;

  const variable = indexes.variables.get(collectionId)?.variables.find((candidate) => candidate.id === variableId);

  if (variable === undefined) return undefined;

  const proofs: AssetKindProof[] = Object.values(variable.valuesByMode).map((value) => valueAssetKinds(indexes, value));

  if (variable.aliasOf !== undefined) {
    proofs.push(variableAssetKinds(
      indexes,
      variable.aliasOf.collectionId,
      variable.aliasOf.variableId,
      new Set([...seen, key]),
    ));
  }

  return unionProofs(proofs);
}

function literalGetAssetKinds(
  indexes: SemanticIndexes,
  expression: Extract<ExpressionAst, { readonly kind: 'get' }>,
): AssetKindProof {
  if (expression.source.kind !== 'literal' || expression.source.value.type !== 'object') return undefined;

  const value = expression.source.value.fields[expression.fieldId];

  return value === undefined ? undefined : valueAssetKinds(indexes, value);
}

function literalIndexAssetKinds(
  indexes: SemanticIndexes,
  expression: Extract<ExpressionAst, { readonly kind: 'index' }>,
): AssetKindProof {
  if (expression.source.kind !== 'literal' || expression.source.value.type !== 'list') return undefined;

  const items = expression.source.value.items;

  if (expression.index.kind === 'literal' && expression.index.value.type === 'integer') {
    const item = items[expression.index.value.value];

    return item === undefined ? undefined : valueAssetKinds(indexes, item);
  }

  return unionProofs(items.map((item) => valueAssetKinds(indexes, item)));
}

export function inferExpressionAssetKinds(
  indexes: SemanticIndexes,
  document: DocumentSemanticIndex,
  expression: ExpressionAst,
): AssetKindProof {
  if (expression.kind === 'literal') return valueAssetKinds(indexes, expression.value);
  if (expression.kind === 'field') return schemaAssetKinds(expressionSchema(document, expression));
  if (expression.kind === 'variable') return variableAssetKinds(indexes, expression.collectionId, expression.variableId, new Set());

  if (expression.kind === 'conditional') {
    return unionProofs([
      inferExpressionAssetKinds(indexes, document, expression.whenTrue),
      inferExpressionAssetKinds(indexes, document, expression.whenFalse),
    ]);
  }

  if (expression.kind === 'get') {
    return literalGetAssetKinds(indexes, expression) ?? schemaAssetKinds(expressionSchema(document, expression));
  }

  if (expression.kind === 'index') {
    return literalIndexAssetKinds(indexes, expression) ?? schemaAssetKinds(expressionSchema(document, expression));
  }

  if (expression.kind === 'safe-function' && expression.functionId === 'coalesce') {
    const assetArguments = expression.arguments.filter((argument) =>
      argument.kind !== 'literal' || argument.value.type !== 'null');

    return unionProofs(assetArguments.map((argument) => inferExpressionAssetKinds(indexes, document, argument)));
  }

  return undefined;
}

export function expressionMatchesAssetTargetContract(
  indexes: SemanticIndexes,
  document: DocumentSemanticIndex,
  expression: ExpressionAst,
  contract: PropertyTargetContract,
): boolean {
  if (contract.assetKinds === undefined) return true;

  const targetKinds = contract.assetKinds;
  const possibleKinds = inferExpressionAssetKinds(indexes, document, expression);

  return possibleKinds !== undefined && possibleKinds.length > 0
    && possibleKinds.every((kind) => targetKinds.includes(kind));
}
