import { describe, expect, it } from 'vitest';

import type * as PublicTypes from '../index';
import * as packageRoot from '../index';
import {
  broadsetProjectV1Schema,
  canonicalizeProjectV1,
  computeProjectSemanticHashV1,
  loadProjectV1Json,
  parseProjectV1Unknown,
  projectFormatV1,
  validateBroadsetProjectV1Semantics,
} from '../index';
import {
  V1_PUBLIC_NAME_COLLISIONS,
  V1_RUNTIME_COLLISION_NAMES,
  V1_RUNTIME_EXPORT_NAMES,
  V1_TYPE_COLLISION_NAMES,
} from './public-api-inventory.test-support';

type PackageRootV1TypeInventory = readonly [
  PublicTypes.AddressScope,
  PublicTypes.Affine2D,
  PublicTypes.Appearance,
  PublicTypes.ArrowEnding,
  PublicTypes.AssetDerivative,
  PublicTypes.AssetIntrinsicMetadata,
  PublicTypes.AssetLicense,
  PublicTypes.AssetProvenance,
  PublicTypes.AudioElement,
  PublicTypes.Binding,
  PublicTypes.BlendMode,
  PublicTypes.BlobReference,
  PublicTypes.BlobSource,
  PublicTypes.ClipDefinition,
  PublicTypes.ClipRemap,
  PublicTypes.ClockElement,
  PublicTypes.ColorAdjustment,
  PublicTypes.ColorChannel,
  PublicTypes.ColorSpaceDefinition,
  PublicTypes.ColorValue,
  PublicTypes.ComponentDefinition,
  PublicTypes.ComponentElement,
  PublicTypes.ComponentInstanceElement,
  PublicTypes.ConcreteColorValue,
  PublicTypes.Cue,
  PublicTypes.DescendantOverride,
  PublicTypes.Diagnostic,
  PublicTypes.DocumentColorConfiguration,
  PublicTypes.Effect,
  PublicTypes.Element,
  PublicTypes.ElementAccessibility,
  PublicTypes.ElementBase,
  PublicTypes.ElementGeometry,
  PublicTypes.ElementKind,
  PublicTypes.ElementTransform,
  PublicTypes.EntityAddress,
  PublicTypes.ExposedProperty,
  PublicTypes.ExposedPropertyBinding,
  PublicTypes.ExposedPropertyConstraint,
  PublicTypes.ExposedPropertyValue,
  PublicTypes.ExpressionAst,
  PublicTypes.ExpressionFieldContext,
  PublicTypes.ExpressionInferenceContext,
  PublicTypes.ExpressionTargetContext,
  PublicTypes.ExpressionVariableContext,
  PublicTypes.ExtensionEnvelope,
  PublicTypes.FillLayer,
  PublicTypes.FontAxisValue,
  PublicTypes.FontFaceResource,
  PublicTypes.FontFamilyResource,
  PublicTypes.ForeignAsset,
  PublicTypes.ForeignElement,
  PublicTypes.FormatterId,
  PublicTypes.FormatterPipeline,
  PublicTypes.FormatterStep,
  PublicTypes.Gradient,
  PublicTypes.GradientStop,
  PublicTypes.GroupElement,
  PublicTypes.GuideDefinition,
  PublicTypes.Id,
  PublicTypes.ImageElement,
  PublicTypes.Insets,
  PublicTypes.InstanceAddress,
  PublicTypes.InteropDiagnostic,
  PublicTypes.InteropRecord,
  PublicTypes.InteropRegistry,
  PublicTypes.InteropSource,
  PublicTypes.Interpolation,
  PublicTypes.JsonPrimitive,
  PublicTypes.JsonValue,
  PublicTypes.LifecycleDefinition,
  PublicTypes.LineSpacing,
  PublicTypes.LoopDefinition,
  PublicTypes.Marker,
  PublicTypes.MaskDefinition,
  PublicTypes.MotionOutputProfile,
  PublicTypes.NamedPercentageInsets,
  PublicTypes.NormalizedRect,
  PublicTypes.OpenTypeFeatureValue,
  PublicTypes.OutputProfile,
  PublicTypes.PageDefinition,
  PublicTypes.PageRootInstance,
  PublicTypes.Paint,
  PublicTypes.ParagraphProperties,
  PublicTypes.PathPoint,
  PublicTypes.PathSegment,
  PublicTypes.PictureFit,
  PublicTypes.PluginElement,
  PublicTypes.PrintOutputProfile,
  PublicTypes.ProjectLoadOptions,
  PublicTypes.ProjectLoadResult,
  PublicTypes.ProjectMetadata,
  PublicTypes.ProjectParseResult,
  PublicTypes.ProjectResources,
  PublicTypes.ProjectV1LimitError,
  PublicTypes.ProjectV1LimitCode,
  PublicTypes.ProjectV1LimitViolation,
  PublicTypes.PropertyTarget,
  PublicTypes.PropertyTargetContract,
  PublicTypes.QrCodeElement,
  PublicTypes.Rational,
  PublicTypes.ResolvedTargetEntity,
  PublicTypes.RunProperties,
  PublicTypes.SafeFunctionId,
  PublicTypes.SampleDataSet,
  PublicTypes.Sequence,
  PublicTypes.SequenceAction,
  PublicTypes.SequenceClip,
  PublicTypes.Sha256Digest,
  PublicTypes.SharedStyle,
  PublicTypes.State,
  PublicTypes.StateMachine,
  PublicTypes.StateValue,
  PublicTypes.StrokeLayer,
  PublicTypes.StructuredPath,
  PublicTypes.SurfaceDefinition,
  PublicTypes.SwatchColorValue,
  PublicTypes.SwatchProducerAlias,
  PublicTypes.TextDecoration,
  PublicTypes.TextElement,
  PublicTypes.TextLayoutOptions,
  PublicTypes.TextList,
  PublicTypes.TextParagraph,
  PublicTypes.TextRun,
  PublicTypes.TextTab,
  PublicTypes.TickerElement,
  PublicTypes.TickerItem,
  PublicTypes.Timebase,
  PublicTypes.TintColorAdjustment,
  PublicTypes.Track,
  PublicTypes.Transition,
  PublicTypes.TransitionTrigger,
  PublicTypes.TypedOverride,
  PublicTypes.TypedValue,
  PublicTypes.UtcTimestamp,
  PublicTypes.ValueSchema,
  PublicTypes.ValueSchemaField,
  PublicTypes.ValueType,
  PublicTypes.VariableCollection,
  PublicTypes.VariableDefinition,
  PublicTypes.VectorAsset,
  PublicTypes.VectorElement,
  PublicTypes.VectorGeometryData,
  PublicTypes.VideoElement,
  PublicTypes.ViewModel,
  PublicTypes.ViewModelField,
];

type NamespaceV1CollisionTypeInventory = readonly [
  projectFormatV1.Asset,
  projectFormatV1.AssetBase,
  projectFormatV1.AssetKind,
  projectFormatV1.AudioAsset,
  projectFormatV1.ColorSpace,
  projectFormatV1.DataAsset,
  projectFormatV1.DocumentMetadata,
  projectFormatV1.FontAsset,
  projectFormatV1.IccProfileAsset,
  projectFormatV1.ImageAsset,
  projectFormatV1.Keyframe,
  projectFormatV1.PatternRepeat,
  projectFormatV1.Swatch,
  projectFormatV1.TemplateGroup,
  projectFormatV1.TemplateGroupMember,
  projectFormatV1.TextBody,
  projectFormatV1.VideoAsset,
];

type RootLegacyCollisionTypeInventory = readonly [
  PublicTypes.Asset,
  PublicTypes.AssetBase,
  PublicTypes.AssetKind,
  PublicTypes.AudioAsset,
  PublicTypes.ColorSpace,
  PublicTypes.DataAsset,
  PublicTypes.DocumentMetadata,
  PublicTypes.FontAsset,
  PublicTypes.IccProfileAsset,
  PublicTypes.ImageAsset,
  PublicTypes.Keyframe,
  PublicTypes.PatternRepeat,
  PublicTypes.Swatch,
  PublicTypes.TemplateGroup,
  PublicTypes.TemplateGroupMember,
  PublicTypes.TextBody,
  PublicTypes.VideoAsset,
];

const ROOT_LEGACY_RUNTIME_COLLISIONS = {
  assetSchema: packageRoot.assetSchema,
  elementSchema: packageRoot.elementSchema,
  keyframeSchema: packageRoot.keyframeSchema,
  swatchSchema: packageRoot.swatchSchema,
  templateGroupSchema: packageRoot.templateGroupSchema,
  textBodySchema: packageRoot.textBodySchema,
} as const;

const NAMESPACE_V1_RUNTIME_COLLISIONS = {
  assetSchema: projectFormatV1.assetSchema,
  elementSchema: projectFormatV1.elementSchema,
  keyframeSchema: projectFormatV1.keyframeSchema,
  swatchSchema: projectFormatV1.swatchSchema,
  templateGroupSchema: projectFormatV1.templateGroupSchema,
  textBodySchema: projectFormatV1.textBodySchema,
} as const;

function createMinimalProject(): PublicTypes.BroadsetProjectV1 {
  return broadsetProjectV1Schema.parse({
    $schema: 'https://schema.broadset.dev/v1/project.schema.json',
    format: 'broadset-project',
    schemaVersion: 1,
    id: 'project',
    metadata: {
      name: 'Minimal project',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    },
    resources: { assets: [], fonts: [], swatches: [], variables: [], styles: [], outputProfiles: [] },
    documents: [
      {
        id: 'document',
        name: 'Minimal document',
        kind: 'static',
        surface: {
          size: [1920, 1080],
          unit: 'px',
          dpi: 96,
          coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down' },
          background: { kind: 'none' },
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          guides: [],
          broadcastSafeAreas: [],
        },
        color: { workingSpace: { kind: 'named', space: 'srgb' }, compositing: 'linear-premultiplied' },
        elements: [],
        components: [],
        pages: [
          {
            id: 'page',
            name: 'Page 1',
            rootInstances: [],
            descendantOverrides: [],
            selectedVariableModes: {},
            selectedSampleDataSets: {},
            extensions: [],
          },
        ],
        sequences: [],
        stateMachines: [],
        viewModels: [],
        bindings: [],
        selectedVariableModes: {},
        outputProfileIds: [],
        extensions: [],
      },
    ],
    templateGroups: [],
    interop: { sources: [], records: [] },
    extensions: [],
  });
}

describe('v1 package public API', () => {
  it('locks the exact public symbol inventory and legacy collision boundary', () => {
    const compileTimeTypes: PackageRootV1TypeInventory | undefined = undefined;
    const compileTimeNamespacedTypes: NamespaceV1CollisionTypeInventory | undefined = undefined;
    const compileTimeLegacyTypes: RootLegacyCollisionTypeInventory | undefined = undefined;
    const expectedDirectExports = V1_RUNTIME_EXPORT_NAMES.filter(
      (name) => !V1_RUNTIME_COLLISION_NAMES.some((collision) => collision === name),
    );

    expect(compileTimeTypes).toBeUndefined();
    expect(compileTimeNamespacedTypes).toBeUndefined();
    expect(compileTimeLegacyTypes).toBeUndefined();
    expect(Object.keys(projectFormatV1)).toHaveLength(V1_RUNTIME_EXPORT_NAMES.length);
    expect(new Set(Object.keys(projectFormatV1))).toEqual(new Set(V1_RUNTIME_EXPORT_NAMES));
    expect(Object.keys(ROOT_LEGACY_RUNTIME_COLLISIONS)).toEqual(V1_RUNTIME_COLLISION_NAMES);
    expect(Object.keys(NAMESPACE_V1_RUNTIME_COLLISIONS)).toEqual(V1_RUNTIME_COLLISION_NAMES);
    expect([...V1_TYPE_COLLISION_NAMES, ...V1_RUNTIME_COLLISION_NAMES]).toEqual(V1_PUBLIC_NAME_COLLISIONS);
    expect(Object.keys(packageRoot)).toEqual(expect.arrayContaining(expectedDirectExports));

    for (const name of V1_RUNTIME_COLLISION_NAMES) {
      expect(ROOT_LEGACY_RUNTIME_COLLISIONS[name]).not.toBe(NAMESPACE_V1_RUNTIME_COLLISIONS[name]);
    }

    expect('createMinimalProjectV1' in projectFormatV1).toBe(false);
  });

  it('publishes the complete foundation entry points as direct package-root exports', async () => {
    const project: PublicTypes.BroadsetProjectV1 = createMinimalProject();
    const document: PublicTypes.BroadsetDocumentV1 | undefined = project.documents[0];

    expect(document?.id).toBe('document');
    expect(broadsetProjectV1Schema.parse(project)).toEqual(project);
    expect(parseProjectV1Unknown(project)).toEqual({ status: 'loaded', project, diagnostics: [] });
    expect(validateBroadsetProjectV1Semantics(project)).toEqual([]);
    expect(canonicalizeProjectV1(project)).toBe(projectFormatV1.canonicalizeProjectV1(project));
    await expect(computeProjectSemanticHashV1(project)).resolves.toBe(
      await projectFormatV1.computeProjectSemanticHashV1(project),
    );
    await expect(loadProjectV1Json(JSON.stringify(project))).resolves.toEqual({
      status: 'loaded',
      project,
      diagnostics: [],
    });

    expect(broadsetProjectV1Schema).toBe(projectFormatV1.broadsetProjectV1Schema);
    expect(validateBroadsetProjectV1Semantics).toBe(projectFormatV1.validateBroadsetProjectV1Semantics);
    expect(canonicalizeProjectV1).toBe(projectFormatV1.canonicalizeProjectV1);
    expect(computeProjectSemanticHashV1).toBe(projectFormatV1.computeProjectSemanticHashV1);
    expect(loadProjectV1Json).toBe(projectFormatV1.loadProjectV1Json);
    expect(parseProjectV1Unknown).toBe(projectFormatV1.parseProjectV1Unknown);
  });
});
