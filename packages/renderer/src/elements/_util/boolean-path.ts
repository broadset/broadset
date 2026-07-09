import type { BroadsetElement } from '@broadset/model';
import { resolveContentAsPlainString } from '@broadset/model';
import { FillRule, pathBoolean, PathBooleanOperation, pathFromPathData, pathToPathData } from 'path-bool';

const BOOLEAN_OP_MAP: Readonly<Record<string, PathBooleanOperation>> = {
  union: PathBooleanOperation.Union,
  subtract: PathBooleanOperation.Difference,
  intersect: PathBooleanOperation.Intersection,
  exclude: PathBooleanOperation.Exclusion,
};

/**
 * Compute a combined SVG path string by applying a boolean operation to child
 * paths. Returns `null` if fewer than 2 children have usable path data or the
 * operation is not supported.
 */
export function computeBooleanPath(children: readonly BroadsetElement[], operation: string): string | null {
  const op = BOOLEAN_OP_MAP[operation];

  if (op === undefined) {
    return null;
  }

  const pathChildren = children.filter((child) => child.type === 'path');
  const pathDataEntries = pathChildren
    .map((child) => resolveContentAsPlainString(child.content).trim())
    .filter((d) => d.length > 0);

  if (pathDataEntries.length < 2) {
    return null;
  }

  const firstEntry = pathDataEntries[0];

  if (firstEntry === undefined) {
    return null;
  }

  try {
    let resultPath = pathFromPathData(firstEntry);

    for (let i = 1; i < pathDataEntries.length; i += 1) {
      const entry = pathDataEntries[i];

      if (entry === undefined) {
        continue;
      }

      const nextPath = pathFromPathData(entry);
      const combined = pathBoolean(resultPath, FillRule.NonZero, nextPath, FillRule.NonZero, op);
      const firstCombined = combined[0];

      resultPath = firstCombined ?? [];
    }

    return pathToPathData(resultPath);
  } catch {
    return null;
  }
}
