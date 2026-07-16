import type { Diagnostic } from './diagnostics';
import type { DocumentColorConfiguration, SurfaceDefinition } from './document';
import type { Element, ElementGeometry, ElementTransform } from './element';
import type { Id, PropertyTarget } from './identity';
import type { InstanceAddress } from './page';
import type { BroadsetProjectV1, ProjectResources } from './project';
import type { TypedValue } from './typed-value';

export type ResolvedSceneAddressV1 = InstanceAddress;

export interface ResolvedWorldGeometryV1 {
  readonly bounds: ElementGeometry['bounds'];
  readonly origin: ElementGeometry['origin'];
  readonly transform: ElementTransform;
}

export type SceneProvenanceSourceV1 =
  | { readonly kind: 'definition'; readonly documentId: Id; readonly componentId?: Id | undefined }
  | {
      readonly kind: 'component-property';
      readonly componentId: Id;
      readonly instanceAddress: ResolvedSceneAddressV1;
      readonly exposedPropertyId: Id;
      readonly bindingId: Id;
    }
  | { readonly kind: 'page-root'; readonly pageId: Id; readonly rootInstanceId: Id }
  | {
      readonly kind: 'page-override';
      readonly pageId: Id;
      readonly address: ResolvedSceneAddressV1;
      readonly overrideIndex: number;
    }
  | { readonly kind: 'variable'; readonly collectionId: Id; readonly variableId: Id; readonly modeId: Id }
  | { readonly kind: 'binding'; readonly bindingId: Id; readonly usedFallback: boolean }
  | { readonly kind: 'state'; readonly stateMachineId: Id; readonly stateId: Id; readonly stateValueId: Id }
  | {
      readonly kind: 'sequence';
      readonly sequenceId: Id;
      readonly trackId: Id;
      readonly fromKeyframeId: Id;
      readonly toKeyframeId?: Id | undefined;
    };

export interface ResolvedPropertyContributionV1 {
  readonly value: TypedValue;
  readonly source: SceneProvenanceSourceV1;
}

export interface ResolvedScenePropertyV1 {
  readonly target: PropertyTarget;
  readonly contributions: readonly ResolvedPropertyContributionV1[];
  readonly value: TypedValue;
}

export type ResolvedSceneFallbackV1 =
  | {
      readonly kind: 'missing-resource';
      readonly address?: ResolvedSceneAddressV1 | undefined;
      readonly assetId: Id;
      readonly diagnostic: Diagnostic;
    }
  | {
      readonly kind: 'binding-fallback';
      readonly address: ResolvedSceneAddressV1;
      readonly bindingId: Id;
      readonly target: PropertyTarget;
      readonly diagnostic: Diagnostic;
    }
  | {
      readonly kind: 'stale-data';
      readonly viewModelId: Id;
      readonly fieldId: Id;
      readonly policy: 'keep-last' | 'use-default' | 'hide' | 'error';
      readonly diagnostic: Diagnostic;
    }
  | {
      readonly kind: 'foreign-preview';
      readonly address: ResolvedSceneAddressV1;
      readonly sourceAssetId: Id;
      readonly previewAssetId: Id;
      readonly reason: string;
    };

export interface ResolvedSceneNodeV1 {
  readonly address: ResolvedSceneAddressV1;
  readonly parentAddress: ResolvedSceneAddressV1 | null;
  readonly sourceElement: Element;
  readonly element: Element;
  readonly localGeometry: ElementGeometry;
  readonly worldGeometry: ResolvedWorldGeometryV1;
  readonly visible: boolean;
  readonly depth: number;
  readonly properties: readonly ResolvedScenePropertyV1[];
  readonly fallbacks: readonly ResolvedSceneFallbackV1[];
}

export interface ResolvedSceneDataV1 {
  readonly selectedVariableModes: Readonly<Record<Id, Id>>;
  readonly selectedSampleDataSets: Readonly<Record<Id, Id>>;
  readonly values: readonly { readonly viewModelId: Id; readonly fieldId: Id; readonly value: TypedValue }[];
}

interface ResolvedSceneBaseV1 {
  readonly projectId: Id;
  readonly documentId: Id;
  readonly pageId: Id;
  readonly surface: SurfaceDefinition;
  readonly color: DocumentColorConfiguration;
  readonly nodes: readonly ResolvedSceneNodeV1[];
  readonly resources: ProjectResources;
  readonly data: ResolvedSceneDataV1;
  readonly fallbacks: readonly ResolvedSceneFallbackV1[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ResolvedCanonicalSceneV1 extends ResolvedSceneBaseV1 {}

export interface ResolvedSceneSnapshotV1 extends ResolvedSceneBaseV1 {
  readonly tick: number;
}

export interface ResolveCanonicalSceneOptionsV1 {
  readonly project: BroadsetProjectV1;
  readonly documentId: Id;
  readonly pageId: Id;
}

export type ResolvedCanonicalSceneResultV1 =
  | { readonly status: 'resolved'; readonly scene: ResolvedCanonicalSceneV1 }
  | { readonly status: 'invalid'; readonly diagnostics: readonly Diagnostic[] };
