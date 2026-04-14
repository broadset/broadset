export interface MutableTransformState {
  x?: number | undefined;
  y?: number | undefined;
  translateX?: number | undefined;
  translateY?: number | undefined;
  rotation?: number | undefined;
  scale?: number | undefined;
  scaleX?: number | undefined;
  scaleY?: number | undefined;
}

export interface MutableTrimPathState {
  trimStart?: number;
  trimEnd?: number;
  trimOffset?: number;
}

export function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

export function composeTransformValue(state: MutableTransformState): string {
  const translateX = (state.x ?? 0) + (state.translateX ?? 0);
  const translateY = (state.y ?? 0) + (state.translateY ?? 0);
  const scaleX = state.scaleX ?? state.scale ?? 1;
  const scaleY = state.scaleY ?? state.scale ?? 1;
  const rotation = state.rotation ?? 0;
  const parts: string[] = [];

  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${String(translateX)}px, ${String(translateY)}px)`);
  }

  if (rotation !== 0) {
    parts.push(`rotate(${String(rotation)}deg)`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${String(scaleX)}, ${String(scaleY)})`);
  }

  return parts.join(' ');
}

export function isTransformProperty(propertyName: string): boolean {
  return ['x', 'y', 'translateX', 'translateY', 'rotation', 'scale', 'scaleX', 'scaleY'].includes(propertyName);
}

export function isTrimPathProperty(propertyName: string): boolean {
  return propertyName === 'trimStart' || propertyName === 'trimEnd' || propertyName === 'trimOffset';
}

export function hasTransformState(state: MutableTransformState): boolean {
  return (
    state.x !== undefined ||
    state.y !== undefined ||
    state.translateX !== undefined ||
    state.translateY !== undefined ||
    state.rotation !== undefined ||
    state.scale !== undefined ||
    state.scaleX !== undefined ||
    state.scaleY !== undefined
  );
}

export function findPathElement(target: HTMLElement): Element | null {
  if (target instanceof SVGElement && target.tagName.toLowerCase() === 'path') {
    return target;
  }

  return target.querySelector('path');
}

export function applyPathValue(target: HTMLElement, value: string): void {
  const pathElement = findPathElement(target);

  if (pathElement !== null) {
    pathElement.setAttribute('d', value);
  }
}

/** Read total path length via duck-typing - returns 0 if the element lacks getTotalLength. */
function getPathTotalLength(element: Element): number {
  const geo = element as unknown as { getTotalLength?: () => number };

  if (typeof geo.getTotalLength === 'function') {
    return geo.getTotalLength();
  }

  return 0;
}

export function applyTrimPathToElement(
  target: HTMLElement,
  state: MutableTrimPathState,
  readBaseline: (target: Element, propertyName: string) => string,
): void {
  const pathElement = findPathElement(target);

  if (pathElement === null) {
    return;
  }

  const trimStart = state.trimStart ?? 0;
  const trimEnd = state.trimEnd ?? 1;
  const trimOffset = state.trimOffset ?? 0;
  const totalLength = getPathTotalLength(pathElement);

  if (totalLength <= 0) {
    return;
  }

  if (trimStart === 0 && trimEnd === 1 && trimOffset === 0) {
    const baselineDasharray = readBaseline(pathElement, 'stroke-dasharray');
    const baselineDashoffset = readBaseline(pathElement, 'stroke-dashoffset');

    if (baselineDasharray !== '') {
      pathElement.setAttribute('stroke-dasharray', baselineDasharray);
    } else {
      pathElement.removeAttribute('stroke-dasharray');
    }

    if (baselineDashoffset !== '') {
      pathElement.setAttribute('stroke-dashoffset', baselineDashoffset);
    } else {
      pathElement.removeAttribute('stroke-dashoffset');
    }

    return;
  }

  const visibleFraction = Math.max(0, trimEnd - trimStart);
  const visibleLength = visibleFraction * totalLength;

  if (visibleLength <= 0) {
    pathElement.setAttribute('stroke-dasharray', `0 ${String(totalLength)}`);
    pathElement.setAttribute('stroke-dashoffset', '0');

    return;
  }

  const gapLength = totalLength - visibleLength;
  const offsetLength = (trimStart + trimOffset) * totalLength;

  pathElement.setAttribute('stroke-dasharray', `${String(visibleLength)} ${String(gapLength)}`);
  pathElement.setAttribute('stroke-dashoffset', String(-offsetLength));
}

export function hasTrimPathState(state: MutableTrimPathState): boolean {
  return state.trimStart !== undefined || state.trimEnd !== undefined || state.trimOffset !== undefined;
}
