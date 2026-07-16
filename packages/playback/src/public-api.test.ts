import { describe, expect, it } from 'vitest';

import type * as PublicTypes from './index';
import * as packageRoot from './index';

const TASK_3_RUNTIME_EXPORTS = [
  'bindingContributionsV1',
  'deriveActiveSequencesV1',
  'deriveStateSnapshotV1',
  'evaluateStateMachineAtTickV1',
  'invalidEvaluationV1',
  'interpolateTrackSegmentV1',
  'mapSequenceTickV1',
  'resolvedEvaluationV1',
  'resolvePropertyMapV1',
  'resolveRuntimeDataV1',
  'resolveSceneSnapshotV1',
  'runtimeFieldKeyV1',
  'sampleSequenceV1',
  'sequenceContributionsV1',
  'stateContributionsV1',
  'propertyTargetKeyV1',
] as const;

type Task3PublicTypeInventory = readonly [
  PublicTypes.PlaybackEvaluationResultV1<unknown>,
  PublicTypes.SequenceTickMappingV1,
  PublicTypes.InterpolatedTrackValueV1,
  PublicTypes.TrackSegmentProvenanceV1,
  PublicTypes.SampledTrackValueV1,
  PublicTypes.SequenceSampleV1,
  PublicTypes.RuntimeStateEventV1,
  PublicTypes.ScheduledSequenceActionV1,
  PublicTypes.DerivedMachineStateV1,
  PublicTypes.DerivedStateSnapshotV1,
  PublicTypes.RuntimeFieldValueV1,
  PublicTypes.ResolvedRuntimeDataV1,
  PublicTypes.ActiveSequenceV1,
  PublicTypes.PropertyTierV1,
  PublicTypes.PropertyProvenanceV1,
  PublicTypes.PropertyContributionV1,
  PublicTypes.ResolvedPropertyV1,
  PublicTypes.SceneFieldValueV1,
  PublicTypes.SceneRuntimeEventV1,
  PublicTypes.ResolveSceneSnapshotOptionsV1,
  PublicTypes.ResolvedSceneResultV1,
];

describe('playback package-root public API', () => {
  it('exports the complete Task 3 runtime and type inventory from the package root', () => {
    const compileTimeTypes: Task3PublicTypeInventory | undefined = undefined;

    expect(compileTimeTypes).toBeUndefined();
    expect(Object.keys(packageRoot)).toEqual(expect.arrayContaining([...TASK_3_RUNTIME_EXPORTS]));
  });
});
