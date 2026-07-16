import type { ElementTransform } from './element';
import type { TypedValue } from './typed-value';

function replaceMatrixValue(transform: ElementTransform, index: number, value: number): ElementTransform | undefined {
  const at = (matrixIndex: number): number =>
    matrixIndex === index ? value : (transform.matrix[matrixIndex] ?? value);

  if (transform.kind === 'affine2d') {
    if (index < 0 || index > 5) return undefined;

    return {
      kind: 'affine2d',
      matrix: [at(0), at(1), at(2), at(3), at(4), at(5)],
    };
  }

  if (index < 0 || index > 15) return undefined;

  return {
    kind: 'matrix3d',
    matrix: [
      at(0),
      at(1),
      at(2),
      at(3),
      at(4),
      at(5),
      at(6),
      at(7),
      at(8),
      at(9),
      at(10),
      at(11),
      at(12),
      at(13),
      at(14),
      at(15),
    ],
  };
}

function matrixValueType(transform: ElementTransform, index: number): 'number' | 'length' | undefined {
  if (transform.kind === 'affine2d') {
    if (index >= 0 && index <= 3) return 'number';

    return index === 4 || index === 5 ? 'length' : undefined;
  }

  if (index >= 0 && index <= 11) return 'number';
  if (index >= 12 && index <= 14) return 'length';

  return index === 15 ? 'number' : undefined;
}

export function applyResolvedTransformValueV1(
  transform: ElementTransform,
  pointer: string,
  value: TypedValue,
): ElementTransform | undefined {
  const prefix = '/geometry/transform/matrix/';

  if (!pointer.startsWith(prefix)) return undefined;

  const indexText = pointer.slice(prefix.length);

  if (!/^\d{1,2}$/u.test(indexText)) return undefined;

  const index = Number(indexText);

  if (matrixValueType(transform, index) !== value.type || !('value' in value) || typeof value.value !== 'number')
    return undefined;

  return replaceMatrixValue(transform, index, value.value);
}
