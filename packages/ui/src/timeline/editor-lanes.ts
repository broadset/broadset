import type { Keyframe } from '@broadset/model';

interface TimelineLaneKeyframe {
  readonly keyframe: Keyframe;
  readonly sourceIndex: number;
}

interface TimelineLane {
  readonly id: string;
  readonly label: string;
  readonly testIdSegment: string;
  readonly keyframes: readonly TimelineLaneKeyframe[];
}

interface StackPositionPx {
  readonly xPx: number;
  readonly yPx: number;
}

interface KeyframeScopeDescriptor {
  readonly id: string;
  readonly label: string;
  readonly testIdSegment: string;
}

function sanitizeTestIdSegment(value: string): string {
  const sanitized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized.length > 0 ? sanitized : 'unnamed';
}

function getKeyframeScopeDescriptor(
  kf: Keyframe,
  getTargetName: ((targetId: string) => string | undefined) | undefined,
): KeyframeScopeDescriptor {
  const targetId = kf.target?.trim();

  if (targetId === undefined || targetId.length === 0) {
    return { id: 'owner', label: 'Owner', testIdSegment: 'owner' };
  }

  const targetName = getTargetName?.(targetId)?.trim();
  const label = `Target ${targetName !== undefined && targetName.length > 0 ? targetName : targetId}`;
  const targetSegment = sanitizeTestIdSegment(targetId);

  return {
    id: `target:${targetId}`,
    label,
    testIdSegment: targetSegment.startsWith('target-') ? targetSegment : `target-${targetSegment}`,
  };
}

function compareTimelineLanes(a: TimelineLane, b: TimelineLane): number {
  if (a.id === b.id) {
    return 0;
  }

  if (a.id === 'owner') {
    return -1;
  }

  if (b.id === 'owner') {
    return 1;
  }

  return a.id.localeCompare(b.id);
}

export function getKeyframeScopeLabel(
  kf: Keyframe,
  getTargetName: ((targetId: string) => string | undefined) | undefined,
): string {
  return getKeyframeScopeDescriptor(kf, getTargetName).label;
}

export function buildTimelineLanes(
  keyframes: readonly Keyframe[],
  getTargetName: ((targetId: string) => string | undefined) | undefined,
): readonly TimelineLane[] {
  if (keyframes.length === 0) {
    return [{ id: 'owner', label: 'Owner', testIdSegment: 'owner', keyframes: [] }];
  }

  const lanes = new Map<string, TimelineLane & { keyframes: TimelineLaneKeyframe[] }>();

  keyframes.forEach((keyframe, sourceIndex) => {
    const scope = getKeyframeScopeDescriptor(keyframe, getTargetName);
    const existingLane = lanes.get(scope.id);

    if (existingLane !== undefined) {
      existingLane.keyframes.push({ keyframe, sourceIndex });

      return;
    }

    lanes.set(scope.id, {
      id: scope.id,
      label: scope.label,
      testIdSegment: scope.testIdSegment,
      keyframes: [{ keyframe, sourceIndex }],
    });
  });

  return Array.from(lanes.values()).sort(compareTimelineLanes);
}

export function getStackPositionPx(
  keyframes: readonly Keyframe[],
  index: number,
  markerSizePx: number,
  laneHeightPx: number,
): StackPositionPx {
  const keyframe = keyframes[index];

  if (keyframe === undefined) {
    return { xPx: 0, yPx: 0 };
  }

  const sameOffsetCount = keyframes.filter((candidate) => candidate.offsetMs === keyframe.offsetMs).length;

  if (sameOffsetCount <= 1) {
    return { xPx: 0, yPx: 0 };
  }

  const sameOffsetIndex = keyframes
    .slice(0, index)
    .filter((candidate) => candidate.offsetMs === keyframe.offsetMs).length;
  const rotatedMarkerExtentPx = Math.ceil(Math.SQRT2 * markerSizePx);
  const selectedBorderAllowancePx = 2;
  const maxOffset = Math.max(0, (laneHeightPx - rotatedMarkerExtentPx) / 2 - selectedBorderAllowancePx);
  const verticalSlotCount = Math.min(
    sameOffsetCount,
    Math.max(1, Math.floor((maxOffset * 2) / Math.max(markerSizePx * 0.55, 1)) + 1),
  );
  const rowIndex = sameOffsetIndex % verticalSlotCount;
  const columnIndex = Math.floor(sameOffsetIndex / verticalSlotCount);
  const columnCount = Math.ceil(sameOffsetCount / verticalSlotCount);
  const yPx = verticalSlotCount === 1 ? 0 : -maxOffset + (rowIndex / (verticalSlotCount - 1)) * maxOffset * 2;
  const xPx = columnCount === 1 ? 0 : (columnIndex - (columnCount - 1) / 2) * (markerSizePx + 4);

  return { xPx, yPx };
}
