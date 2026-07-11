import type { Sha256Digest } from './identity';
import {
  calculateUtf8ByteLength,
  PROJECT_V1_LIMITS,
  ProjectV1LimitError,
  type ProjectV1LimitViolation,
} from './limits';
import type { BroadsetProjectV1 } from './project';

function compareUtf16CodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);

      if (index + 1 >= value.length || trailing < 0xdc00 || trailing > 0xdfff) {
        throw new TypeError('Canonical JSON rejects lone surrogates');
      }

      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError('Canonical JSON rejects lone surrogates');
    }
  }
}

function canonicalStringByteLength(value: string): number {
  let bytes = 2;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit === 0x22 || codeUnit === 0x5c || codeUnit === 0x08 || codeUnit === 0x09 || codeUnit === 0x0a || codeUnit === 0x0c || codeUnit === 0x0d) bytes += 2;
    else if (codeUnit <= 0x1f) bytes += 6;
    else if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;

    if (bytes > PROJECT_V1_LIMITS.maxJsonTextBytes) return bytes;
  }

  return bytes;
}

function canonicalizeString(value: string): string {
  assertUnicodeScalarString(value);

  if (canonicalStringByteLength(value) > PROJECT_V1_LIMITS.maxJsonTextBytes) {
    throwLimit({ code: 'canonical-output-too-large', message: 'Canonical JSON exceeds the maximum byte length' });
  }

  return JSON.stringify(value);
}

type CanonicalFrame =
  | { readonly kind: 'value'; readonly value: unknown; readonly depth: number }
  | { readonly kind: 'array'; readonly value: readonly unknown[]; readonly index: number; readonly depth: number }
  | {
      readonly kind: 'object';
      readonly value: object;
      readonly entries: readonly (readonly [string, unknown])[];
      readonly index: number;
      readonly depth: number;
    };

interface CanonicalState {
  readonly active: WeakSet<object>;
  readonly frames: CanonicalFrame[];
  readonly output: string[];
  outputBytes: number;
  nodes: number;
}

function throwLimit(violation: ProjectV1LimitViolation): never {
  throw new ProjectV1LimitError(violation);
}

function appendCanonical(state: CanonicalState, chunk: string): void {
  state.outputBytes += calculateUtf8ByteLength(chunk);

  if (state.outputBytes > PROJECT_V1_LIMITS.maxJsonTextBytes) {
    throwLimit({ code: 'canonical-output-too-large', message: 'Canonical JSON exceeds the maximum byte length' });
  }

  state.output.push(chunk);
}

function processArrayFrame(state: CanonicalState, frame: Extract<CanonicalFrame, { readonly kind: 'array' }>): void {
  if (frame.index >= frame.value.length) {
    appendCanonical(state, ']');
    state.active.delete(frame.value);

    return;
  }

  const item: unknown = frame.value[frame.index];

  if (frame.index > 0) appendCanonical(state, ',');
  state.frames.push({ ...frame, index: frame.index + 1 });
  state.frames.push({ kind: 'value', value: item, depth: frame.depth + 1 });
}

function processObjectFrame(state: CanonicalState, frame: Extract<CanonicalFrame, { readonly kind: 'object' }>): void {
  const entry = frame.entries[frame.index];

  if (entry === undefined) {
    appendCanonical(state, '}');
    state.active.delete(frame.value);

    return;
  }

  if (frame.index > 0) appendCanonical(state, ',');
  state.frames.push({ ...frame, index: frame.index + 1 });
  appendCanonical(state, `${canonicalizeString(entry[0])}:`);
  state.frames.push({ kind: 'value', value: entry[1], depth: frame.depth + 1 });
}

function assertPlainJsonObject(value: object): asserts value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Canonical JSON accepts only plain JSON objects');
  }

  if (Object.getOwnPropertySymbols(value).some((symbol) => Object.prototype.propertyIsEnumerable.call(value, symbol))) {
    throw new TypeError('Canonical JSON rejects enumerable symbol properties');
  }
}

function beginCollection(state: CanonicalState, value: object, depth: number): void {
  if (state.active.has(value)) throwLimit({ code: 'cyclic-input', message: 'Canonical project contains a cycle' });
  state.active.add(value);

  if (Array.isArray(value)) {
    appendCanonical(state, '[');
    state.frames.push({ kind: 'array', value, index: 0, depth });

    return;
  }

  assertPlainJsonObject(value);

  let propertyCount = 0;

  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    propertyCount += 1;

    if (state.nodes + propertyCount > PROJECT_V1_LIMITS.maxNodes) {
      throwLimit({ code: 'input-too-complex', message: 'Canonical project exceeds the maximum node count' });
    }
  }

  const entries = Object.entries(value).sort(([left], [right]) => compareUtf16CodeUnits(left, right));

  entries.forEach(([key]) => {
    assertUnicodeScalarString(key);
  });
  appendCanonical(state, '{');
  state.frames.push({ kind: 'object', value, entries, index: 0, depth });
}

function processValueFrame(state: CanonicalState, frame: Extract<CanonicalFrame, { readonly kind: 'value' }>): void {
  state.nodes += 1;

  if (state.nodes > PROJECT_V1_LIMITS.maxNodes) {
    throwLimit({ code: 'input-too-complex', message: 'Canonical project exceeds the maximum node count' });
  }

  if (frame.depth > PROJECT_V1_LIMITS.maxDepth) {
    throwLimit({ code: 'input-too-deep', message: 'Canonical project exceeds the maximum nesting depth' });
  }

  const value = frame.value;

  if (value === null) appendCanonical(state, 'null');
  else if (typeof value === 'boolean') appendCanonical(state, value ? 'true' : 'false');
  else if (typeof value === 'string') appendCanonical(state, canonicalizeString(value));
  else if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON accepts only finite numbers');
    appendCanonical(state, JSON.stringify(value));
  } else if (typeof value === 'object') beginCollection(state, value, frame.depth);
  else throw new TypeError('Canonical JSON accepts only JSON values');
}

function canonicalizeJsonValue(input: unknown): string {
  const state: CanonicalState = {
    active: new WeakSet(),
    frames: [{ kind: 'value', value: input, depth: 0 }],
    output: [],
    outputBytes: 0,
    nodes: 0,
  };

  while (state.frames.length > 0) {
    const frame = state.frames.pop();

    if (frame === undefined) break;
    if (frame.kind === 'value') processValueFrame(state, frame);
    else if (frame.kind === 'array') processArrayFrame(state, frame);
    else processObjectFrame(state, frame);
  }

  return state.output.join('');
}

function createSemanticProjection(project: BroadsetProjectV1): unknown {
  const { updatedAt: _updatedAt, generator, ...semanticMetadata } = project.metadata;
  const semanticGenerator = generator === undefined ? undefined : (({ build: _build, ...value }) => value)(generator);

  return {
    ...project,
    metadata: {
      ...semanticMetadata,
      ...(semanticGenerator === undefined ? {} : { generator: semanticGenerator }),
    },
  };
}

export function canonicalizeProjectV1(project: BroadsetProjectV1): string {
  return canonicalizeJsonValue(project);
}

export async function computeProjectSemanticHashV1(project: BroadsetProjectV1): Promise<Sha256Digest> {
  const canonical = canonicalizeJsonValue(createSemanticProjection(project));
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');

  return `sha256:${hexadecimal}`;
}
