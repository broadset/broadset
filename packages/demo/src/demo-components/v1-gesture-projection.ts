interface V1ProjectionPoint {
  readonly x: number;
  readonly y: number;
}

type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

export interface V1GesturePlaneProjection {
  readonly screenToLocal: Matrix3;
  readonly startLocal: V1ProjectionPoint;
}

function readCell(rows: readonly (readonly number[])[], row: number, column: number): number {
  return rows[row]?.[column] ?? 0;
}

function findPivotRow(rows: readonly (readonly number[])[], column: number, size: number): number {
  let pivotRow = column;

  for (let row = column + 1; row < size; row += 1) {
    if (Math.abs(readCell(rows, row, column)) > Math.abs(readCell(rows, pivotRow, column))) pivotRow = row;
  }

  return pivotRow;
}

function swapRows(rows: number[][], column: number, pivotRow: number): boolean {
  const current = rows[column];
  const pivot = rows[pivotRow];

  if (current === undefined || pivot === undefined) return false;

  rows[column] = pivot;
  rows[pivotRow] = current;

  return true;
}

function normalizeRow(row: number[], column: number, size: number, pivot: number): void {
  for (let entry = column; entry <= size; entry += 1) row[entry] = (row[entry] ?? 0) / pivot;
}

function eliminateColumn(rows: number[][], column: number, size: number): boolean {
  const pivotRow = rows[column];

  if (pivotRow === undefined) return false;

  for (let row = 0; row < size; row += 1) {
    if (row === column) continue;

    const entries = rows[row];

    if (entries === undefined) return false;

    const factor = entries[column] ?? 0;

    for (let entry = column; entry <= size; entry += 1) {
      entries[entry] = (entries[entry] ?? 0) - factor * (pivotRow[entry] ?? 0);
    }
  }

  return true;
}

function solveLinearSystem(
  matrix: readonly (readonly number[])[],
  values: readonly number[],
): readonly number[] | null {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index] ?? 0]);

  for (let column = 0; column < size; column += 1) {
    const pivotRow = findPivotRow(rows, column, size);
    const pivot = readCell(rows, pivotRow, column);

    if (Math.abs(pivot) < 1e-9 || !swapRows(rows, column, pivotRow)) return null;

    const current = rows[column];

    if (current === undefined) return null;

    normalizeRow(current, column, size, pivot);
    if (!eliminateColumn(rows, column, size)) return null;
  }

  return rows.map((row) => row[size] ?? 0);
}

function computeHomography(local: readonly V1ProjectionPoint[], screen: readonly V1ProjectionPoint[]): Matrix3 | null {
  if (local.length !== 4 || screen.length !== 4) return null;

  const rows: number[][] = [];
  const values: number[] = [];

  for (let index = 0; index < 4; index += 1) {
    const source = local[index];
    const target = screen[index];

    if (source === undefined || target === undefined) return null;

    rows.push([source.x, source.y, 1, 0, 0, 0, -target.x * source.x, -target.x * source.y]);
    values.push(target.x);
    rows.push([0, 0, 0, source.x, source.y, 1, -target.y * source.x, -target.y * source.y]);
    values.push(target.y);
  }

  const solved = solveLinearSystem(rows, values);

  return solved === null ? null : (
      [
        solved[0] ?? 0,
        solved[1] ?? 0,
        solved[2] ?? 0,
        solved[3] ?? 0,
        solved[4] ?? 0,
        solved[5] ?? 0,
        solved[6] ?? 0,
        solved[7] ?? 0,
        1,
      ]
    );
}

function invertMatrix3(matrix: Matrix3): Matrix3 | null {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  if (Math.abs(determinant) < 1e-9) return null;

  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

function projectPoint(matrix: Matrix3, point: V1ProjectionPoint): V1ProjectionPoint | null {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];

  if (Math.abs(denominator) < 1e-9) return null;

  const x = (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator;
  const y = (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator;

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function measureScreenPoints(plane: HTMLElement, points: readonly V1ProjectionPoint[]): readonly V1ProjectionPoint[] {
  const probes = points.map((point) => {
    const probe = document.createElement('div');

    probe.style.height = '0px';
    probe.style.left = `${String(point.x)}px`;
    probe.style.pointerEvents = 'none';
    probe.style.position = 'absolute';
    probe.style.top = `${String(point.y)}px`;
    probe.style.width = '0px';
    plane.appendChild(probe);

    return probe;
  });

  try {
    return probes.map((probe) => {
      const bounds = probe.getBoundingClientRect();

      return { x: bounds.left, y: bounds.top };
    });
  } finally {
    probes.forEach((probe) => {
      probe.remove();
    });
  }
}

export function createV1GesturePlaneProjection(
  widget: HTMLElement,
  startPoint: V1ProjectionPoint,
): V1GesturePlaneProjection | null {
  const plane = widget.offsetParent instanceof HTMLElement ? widget.offsetParent : null;
  const width = plane?.offsetWidth ?? 0;
  const height = plane?.offsetHeight ?? 0;

  if (plane === null || width <= 0 || height <= 0) return null;

  const localPoints = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const localToScreen = computeHomography(localPoints, measureScreenPoints(plane, localPoints));
  const screenToLocal = localToScreen === null ? null : invertMatrix3(localToScreen);
  const startLocal = screenToLocal === null ? null : projectPoint(screenToLocal, startPoint);

  return screenToLocal === null || startLocal === null ? null : { screenToLocal, startLocal };
}

export function projectV1GestureDelta(
  projection: V1GesturePlaneProjection | null,
  point: V1ProjectionPoint,
): V1ProjectionPoint | null {
  if (projection === null) return null;

  const projected = projectPoint(projection.screenToLocal, point);

  return projected === null ? null : (
      { x: projected.x - projection.startLocal.x, y: projected.y - projection.startLocal.y }
    );
}

export function projectV1GesturePoint(
  projection: V1GesturePlaneProjection | null,
  point: V1ProjectionPoint,
): V1ProjectionPoint | null {
  return projection === null ? null : projectPoint(projection.screenToLocal, point);
}
