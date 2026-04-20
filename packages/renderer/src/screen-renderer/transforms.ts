import type { BroadsetElement, BroadsetElementStyle } from '@broadset/model';

function toPixelValue(value: number): string {
  return `${String(value)}px`;
}

function toDegreeValue(value: number): string {
  return `${String(value)}deg`;
}

/**
 * Build the CSS transform string for an element host. The same helper is used
 * by the renderer (to transform element DOM nodes) and by the editor's
 * selection transform widget (to stay pixel-aligned with the element under
 * any combination of 2D rotation and 3D transforms). Keeping the string
 * construction in one place is how we guarantee the widget and the element
 * never drift apart.
 */
export function buildElementTransform(element: BroadsetElement, style: BroadsetElementStyle): string {
  const transforms: string[] = [];

  if (element.rotation !== 0) {
    transforms.push(`rotate(${toDegreeValue(element.rotation)})`);
  }

  // 3D tokens that evaluate to no-op (0 degrees / 0px) are omitted: they add
  // noise to the inline style and force the browser to create a 3D rendering
  // context even when the element is effectively flat.
  if (style.rotateX !== undefined && style.rotateX !== 0) {
    transforms.push(`rotateX(${toDegreeValue(style.rotateX)})`);
  }

  if (style.rotateY !== undefined && style.rotateY !== 0) {
    transforms.push(`rotateY(${toDegreeValue(style.rotateY)})`);
  }

  if (style.rotateZ !== undefined && style.rotateZ !== 0) {
    transforms.push(`rotateZ(${toDegreeValue(style.rotateZ)})`);
  }

  if (style.translateZ !== undefined && style.translateZ !== 0) {
    transforms.push(`translateZ(${toPixelValue(style.translateZ)})`);
  }

  return transforms.join(' ');
}
