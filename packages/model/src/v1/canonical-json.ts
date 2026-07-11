import type { Sha256Digest } from './identity';
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

      if (trailing < 0xdc00 || trailing > 0xdfff) throw new TypeError('Canonical JSON rejects lone surrogates');
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError('Canonical JSON rejects lone surrogates');
    }
  }
}

function canonicalizeString(value: string): string {
  assertUnicodeScalarString(value);

  return JSON.stringify(value);
}

function canonicalizeJsonValue(value: unknown, ancestors: ReadonlySet<object> = new Set()): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return canonicalizeString(value);

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON accepts only finite numbers');

    return JSON.stringify(value);
  }

  if (typeof value !== 'object') throw new TypeError('Canonical JSON accepts only JSON values');
  if (ancestors.has(value)) throw new TypeError('Canonical JSON rejects cycles');

  const nextAncestors = new Set([...ancestors, value]);

  if (Array.isArray(value)) return `[${value.map((item) => canonicalizeJsonValue(item, nextAncestors)).join(',')}]`;

  return `{${Object.entries(value)
    .sort(([left], [right]) => compareUtf16CodeUnits(left, right))
    .map(([key, item]) => `${canonicalizeString(key)}:${canonicalizeJsonValue(item, nextAncestors)}`)
    .join(',')}}`;
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
