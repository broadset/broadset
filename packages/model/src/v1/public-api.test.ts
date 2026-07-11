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

const LEGACY_RUNTIME_NAME_COLLISIONS = new Set([
  'assetSchema',
  'elementSchema',
  'keyframeSchema',
  'swatchSchema',
  'templateGroupSchema',
  'textBodySchema',
]);

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
  it('directly exports every non-conflicting production runtime symbol', () => {
    const compileTimeTypes: PackageRootV1TypeInventory | undefined = undefined;
    const expectedDirectExports = Object.keys(projectFormatV1).filter(
      (name) => !LEGACY_RUNTIME_NAME_COLLISIONS.has(name),
    );

    expect(compileTimeTypes).toBeUndefined();
    expect(Object.keys(packageRoot)).toEqual(expect.arrayContaining(expectedDirectExports));
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
