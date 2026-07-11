export const PROJECT_V1_LIMITS = {
  maxJsonTextBytes: 32 * 1024 * 1024,
  maxDepth: 256,
  maxNodes: 250_000,
} as const;

export type ProjectV1LimitCode =
  | 'input-too-large'
  | 'input-too-deep'
  | 'input-too-complex'
  | 'cyclic-input'
  | 'canonical-output-too-large';

export interface ProjectV1LimitViolation {
  readonly code: ProjectV1LimitCode;
  readonly message: string;
}

export class ProjectV1LimitError extends Error {
  public readonly code: ProjectV1LimitCode;

  public constructor(violation: ProjectV1LimitViolation) {
    super(violation.message);
    this.name = 'ProjectV1LimitError';
    this.code = violation.code;
  }
}

export function calculateUtf8ByteLength(value: string): number {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const trailing = value.charCodeAt(index + 1);

      if (trailing >= 0xdc00 && trailing <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }

  return bytes;
}

function createViolation(code: ProjectV1LimitCode, message: string): ProjectV1LimitViolation {
  return { code, message };
}

interface JsonTextInspectionState {
  depth: number;
  nodes: number;
  inString: boolean;
  escaped: boolean;
  pendingString: boolean;
  inPrimitive: boolean;
}

function isWhitespace(character: string): boolean {
  return character === ' ' || character === '\n' || character === '\r' || character === '\t';
}

function isPrimitiveStart(character: string): boolean {
  return character === '-' || (character >= '0' && character <= '9') || character === 't' || character === 'f' || character === 'n';
}

function inspectStringCharacter(state: JsonTextInspectionState, character: string): void {
  if (state.escaped) state.escaped = false;
  else if (character === '\\') state.escaped = true;
  else if (character === '"') {
    state.inString = false;
    state.pendingString = true;
  }
}

function inspectJsonToken(state: JsonTextInspectionState, character: string): ProjectV1LimitViolation | undefined {
  if (state.pendingString) {
    if (character !== ':') state.nodes += 1;
    state.pendingString = false;
  }

  if (state.inPrimitive && (character === ',' || character === ']' || character === '}')) state.inPrimitive = false;
  if (state.inPrimitive) return undefined;

  if (character === '"') state.inString = true;
  else if (character === '{' || character === '[') {
    state.depth += 1;
    state.nodes += 1;

    if (state.depth > PROJECT_V1_LIMITS.maxDepth) {
      return createViolation('input-too-deep', 'Project JSON exceeds the maximum nesting depth');
    }
  } else if (character === '}' || character === ']') state.depth -= 1;
  else if (isPrimitiveStart(character)) {
    state.nodes += 1;
    state.inPrimitive = true;
  }

  return state.nodes > PROJECT_V1_LIMITS.maxNodes
    ? createViolation('input-too-complex', 'Project JSON exceeds the maximum node count')
    : undefined;
}

export function inspectProjectV1JsonText(source: string): ProjectV1LimitViolation | undefined {
  if (calculateUtf8ByteLength(source) > PROJECT_V1_LIMITS.maxJsonTextBytes) {
    return createViolation('input-too-large', 'Project JSON exceeds the maximum UTF-8 byte length');
  }

  const state: JsonTextInspectionState = {
    depth: 0,
    nodes: 0,
    inString: false,
    escaped: false,
    pendingString: false,
    inPrimitive: false,
  };

  for (const character of source) {
    if (state.inString) inspectStringCharacter(state, character);
    else if (!isWhitespace(character)) {
      const violation = inspectJsonToken(state, character);

      if (violation !== undefined) return violation;
    }
  }

  if (state.pendingString) state.nodes += 1;

  return state.nodes > PROJECT_V1_LIMITS.maxNodes
    ? createViolation('input-too-complex', 'Project JSON exceeds the maximum node count')
    : undefined;
}

type InspectionFrame =
  | { readonly kind: 'value'; readonly value: unknown; readonly depth: number }
  | { readonly kind: 'exit'; readonly value: object };

function inspectUnknownValueFrame(
  frame: Extract<InspectionFrame, { readonly kind: 'value' }>,
  active: WeakSet<object>,
  frames: InspectionFrame[],
): ProjectV1LimitViolation | undefined {
  if (frame.depth > PROJECT_V1_LIMITS.maxDepth) {
    return createViolation('input-too-deep', 'Project value exceeds the maximum nesting depth');
  }

  if (typeof frame.value !== 'object' || frame.value === null) return undefined;
  if (active.has(frame.value)) return createViolation('cyclic-input', 'Project value contains a cycle');

  active.add(frame.value);
  frames.push({ kind: 'exit', value: frame.value });

  const children = Array.isArray(frame.value) ? frame.value : Object.values(frame.value);

  for (let index = children.length - 1; index >= 0; index -= 1) {
    frames.push({ kind: 'value', value: children[index], depth: frame.depth + 1 });
  }

  return undefined;
}

export function inspectProjectV1Unknown(input: unknown): ProjectV1LimitViolation | undefined {
  const active = new WeakSet();
  const frames: InspectionFrame[] = [{ kind: 'value', value: input, depth: 0 }];
  let nodes = 0;

  while (frames.length > 0) {
    const frame = frames.pop();

    if (frame === undefined) break;

    if (frame.kind === 'exit') {
      active.delete(frame.value);
      continue;
    }

    nodes += 1;

    if (nodes > PROJECT_V1_LIMITS.maxNodes) {
      return createViolation('input-too-complex', 'Project value exceeds the maximum node count');
    }

    const violation = inspectUnknownValueFrame(frame, active, frames);

    if (violation !== undefined) return violation;
  }

  return undefined;
}
