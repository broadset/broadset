export interface MutableTransformState {
  translateX?: number | undefined;
  translateY?: number | undefined;
  translateZ?: number | undefined;
  rotation?: number | undefined;
  rotateX?: number | undefined;
  rotateY?: number | undefined;
  rotateZ?: number | undefined;
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
  const translateX = state.translateX ?? 0;
  const translateY = state.translateY ?? 0;
  const translateZ = state.translateZ ?? 0;
  const scaleX = state.scaleX ?? state.scale ?? 1;
  const scaleY = state.scaleY ?? state.scale ?? 1;
  const rotation = state.rotation ?? 0;
  const rotateX = state.rotateX ?? 0;
  const rotateY = state.rotateY ?? 0;
  const rotateZ = state.rotateZ ?? 0;
  const parts: string[] = [];

  if (translateX !== 0 || translateY !== 0) {
    parts.push(`translate(${String(translateX)}px, ${String(translateY)}px)`);
  }

  if (rotation !== 0) {
    parts.push(`rotate(${String(rotation)}deg)`);
  }

  if (rotateX !== 0) {
    parts.push(`rotateX(${String(rotateX)}deg)`);
  }

  if (rotateY !== 0) {
    parts.push(`rotateY(${String(rotateY)}deg)`);
  }

  if (rotateZ !== 0) {
    parts.push(`rotateZ(${String(rotateZ)}deg)`);
  }

  if (translateZ !== 0) {
    parts.push(`translateZ(${String(translateZ)}px)`);
  }

  if (scaleX !== 1 || scaleY !== 1) {
    parts.push(`scale(${String(scaleX)}, ${String(scaleY)})`);
  }

  return parts.join(' ');
}

function parseTransformNumber(value: string): number | undefined {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseTransformArguments(value: string): readonly string[] {
  return value
    .split(/[\s,]+/u)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

const SINGLE_VALUE_TRANSFORM_KEYS: Readonly<Record<string, keyof MutableTransformState>> = {
  rotate: 'rotation',
  rotatex: 'rotateX',
  rotatey: 'rotateY',
  rotatez: 'rotateZ',
  scalex: 'scaleX',
  scaley: 'scaleY',
  translatex: 'translateX',
  translatey: 'translateY',
  translatez: 'translateZ',
};

function applySingleValueTransform(
  state: MutableTransformState,
  functionName: string,
  first: number | undefined,
): boolean {
  const key = SINGLE_VALUE_TRANSFORM_KEYS[functionName];

  if (key === undefined || first === undefined) {
    return false;
  }

  state[key] = first;

  return true;
}

function applyTranslateTransform(
  state: MutableTransformState,
  functionName: string,
  first: number | undefined,
  second: number | undefined,
): boolean {
  if (functionName !== 'translate') {
    return false;
  }

  if (first !== undefined) {
    state.translateX = first;
  }

  if (second !== undefined) {
    state.translateY = second;
  }

  return true;
}

function applyScaleTransform(
  state: MutableTransformState,
  functionName: string,
  first: number | undefined,
  second: number | undefined,
): boolean {
  if (functionName !== 'scale' || first === undefined) {
    return false;
  }

  if (second === undefined) {
    state.scale = first;

    return true;
  }

  state.scaleX = first;
  state.scaleY = second;

  return true;
}

function applyTransformFunction(
  state: MutableTransformState,
  functionName: string,
  args: readonly string[],
): void {
  const first = parseTransformNumber(args[0] ?? '');
  const second = parseTransformNumber(args[1] ?? '');

  if (applySingleValueTransform(state, functionName, first)) return;
  if (applyTranslateTransform(state, functionName, first, second)) return;

  applyScaleTransform(state, functionName, first, second);
}

export function parseTransformValue(value: string): MutableTransformState {
  const state: MutableTransformState = {};
  const transformRegex = /([a-z][a-z0-9]*)\(([^)]*)\)/giu;
  let match: RegExpExecArray | null = transformRegex.exec(value);

  while (match !== null) {
    applyTransformFunction(
      state,
      (match[1] ?? '').toLowerCase(),
      parseTransformArguments(match[2] ?? ''),
    );
    match = transformRegex.exec(value);
  }

  return state;
}

export function isTransformProperty(propertyName: string): boolean {
  return [
    'translateX',
    'translateY',
    'translateZ',
    'rotation',
    'rotateX',
    'rotateY',
    'rotateZ',
    'scale',
    'scaleX',
    'scaleY',
  ].includes(propertyName);
}

export function isTrimPathProperty(propertyName: string): boolean {
  return propertyName === 'trimStart' || propertyName === 'trimEnd' || propertyName === 'trimOffset';
}

export function hasTransformState(state: MutableTransformState): boolean {
  return (
    state.translateX !== undefined ||
    state.translateY !== undefined ||
    state.translateZ !== undefined ||
    state.rotation !== undefined ||
    state.rotateX !== undefined ||
    state.rotateY !== undefined ||
    state.rotateZ !== undefined ||
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
