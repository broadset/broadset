import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type CorpusFormat = 'pdf' | 'pptx' | 'psd' | 'svg';

interface CorpusSource {
  readonly repository: string;
  readonly commit: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly fixtureRoot: string;
}

export interface CorpusFixture {
  readonly name: string;
  readonly source: string;
  readonly upstreamName: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly tags: readonly string[];
}

export interface CorpusManifest {
  readonly schemaVersion: 1;
  readonly format: CorpusFormat;
  readonly description: string;
  readonly sources: Readonly<Record<string, CorpusSource>>;
  readonly fixtures: readonly CorpusFixture[];
}

interface CachedCorpusFixture {
  readonly entry: CorpusFixture;
  readonly bytes: Uint8Array;
  readonly absolutePath: string;
  readonly actualSha256: string;
  readonly actualBytes: number;
}

interface LoadedCorpusFixtures {
  readonly manifest: CorpusManifest;
  readonly cached: readonly CachedCorpusFixture[];
}

const ALLOWED_FORMATS = new Set<CorpusFormat>(['pdf', 'pptx', 'psd', 'svg']);
const SHA256_RE = /^[a-f0-9]{64}$/;
const GITHUB_REPO_RE = /^https:\/\/github\.com\/([^/]+)\/([^/.]+?)(?:\.git)?\/?$/;
const GIT_SHA_RE = /^[a-f0-9]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, field: string, issues: string[]): string {
  if (typeof value === 'string' && value.length > 0) return value;

  issues.push(`${field} must be a non-empty string`);

  return '';
}

function requireNonNegativeInteger(value: unknown, field: string, issues: string[]): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;

  issues.push(`${field} must be a non-negative integer`);

  return 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseTags(value: unknown, field: string, issues: string[]): readonly string[] {
  if (Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)) {
    return value.map((tag) => tag);
  }

  issues.push(`${field} must be a non-empty string array`);

  return [];
}

function hasPathTraversal(path: string, options?: { readonly allowRootDot?: boolean }): boolean {
  if (options?.allowRootDot === true && path === '.') return false;
  if (path.length === 0 || path.startsWith('/') || path.includes('\\')) return true;

  return path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}

function isSafeCacheName(path: string): boolean {
  if (path.includes('/') || path.includes('\\')) return false;

  return !hasPathTraversal(path);
}

function validateSource(key: string, value: unknown, issues: string[]): CorpusSource {
  const where = `sources.${key}`;

  if (!isRecord(value)) {
    issues.push(`${where} must be an object`);

    return { repository: '', commit: '', license: '', licenseUrl: '', fixtureRoot: '' };
  }

  const repository = requireString(value['repository'], `${where}.repository`, issues);
  const commit = requireString(value['commit'], `${where}.commit`, issues);
  const license = requireString(value['license'], `${where}.license`, issues);
  const licenseUrl = requireString(value['licenseUrl'], `${where}.licenseUrl`, issues);
  const fixtureRoot = requireString(value['fixtureRoot'], `${where}.fixtureRoot`, issues);

  if (repository !== '' && GITHUB_REPO_RE.exec(repository) === null) {
    issues.push(`${where}.repository must be a https://github.com/owner/repo URL`);
  }

  if (commit !== '' && GIT_SHA_RE.exec(commit) === null) {
    issues.push(`${where}.commit must be a 40-character lowercase git SHA`);
  }

  if (fixtureRoot !== '' && hasPathTraversal(fixtureRoot, { allowRootDot: true })) {
    issues.push(`${where}.fixtureRoot contains path traversal or an absolute path`);
  }

  return { repository, commit, license, licenseUrl, fixtureRoot };
}

function validateFixture(
  index: number,
  value: unknown,
  knownSources: ReadonlySet<string>,
  issues: string[],
): CorpusFixture {
  const where = `fixtures[${String(index)}]`;

  if (!isRecord(value)) {
    issues.push(`${where} must be an object`);

    return { name: '', source: '', upstreamName: '', sha256: '', bytes: 0, tags: [] };
  }

  const name = requireString(value['name'], `${where}.name`, issues);
  const source = requireString(value['source'], `${where}.source`, issues);
  const upstreamName = requireString(value['upstreamName'], `${where}.upstreamName`, issues);
  const sha256 = requireString(value['sha256'], `${where}.sha256`, issues);
  const bytes = requireNonNegativeInteger(value['bytes'], `${where}.bytes`, issues);
  const tags = parseTags(value['tags'], `${where}.tags`, issues);

  if (name !== '' && !isSafeCacheName(name)) {
    issues.push(`${where}.name contains path traversal or a directory separator`);
  }

  if (upstreamName !== '' && hasPathTraversal(upstreamName)) {
    issues.push(`${where}.upstreamName contains path traversal or an absolute path`);
  }

  if (source !== '' && !knownSources.has(source)) {
    issues.push(`${where}.source references unknown source "${source}"`);
  }

  if (sha256 !== '' && SHA256_RE.exec(sha256) === null) {
    issues.push(`${where}.sha256 must be a lowercase SHA-256 hex digest`);
  }

  return { name, source, upstreamName, sha256, bytes, tags };
}

function parseFormatField(value: unknown, issues: string[]): CorpusFormat {
  const rawFormat = requireString(value, 'format', issues);

  if (rawFormat !== '' && !ALLOWED_FORMATS.has(rawFormat as CorpusFormat)) {
    issues.push(`format "${rawFormat}" is not supported`);
  }

  return ALLOWED_FORMATS.has(rawFormat as CorpusFormat) ? (rawFormat as CorpusFormat) : 'pdf';
}

function parseSources(value: unknown, issues: string[]): Record<string, CorpusSource> {
  const sources: Record<string, CorpusSource> = {};

  if (!isRecord(value)) {
    issues.push('sources must be an object');

    return sources;
  }

  for (const [key, source] of Object.entries(value)) {
    if (key.length === 0) {
      issues.push('source keys must be non-empty');
      continue;
    }

    sources[key] = validateSource(key, source, issues);
  }

  return sources;
}

function recordFixtureName(name: string, index: number, seenNames: Set<string>, issues: string[]): void {
  if (name === '') return;

  if (seenNames.has(name)) {
    issues.push(`fixtures[${String(index)}].name duplicates "${name}"`);
  }

  seenNames.add(name);
}

function parseFixtures(
  value: unknown,
  sources: Readonly<Record<string, CorpusSource>>,
  issues: string[],
): CorpusFixture[] {
  const fixtures: CorpusFixture[] = [];
  const seenNames = new Set<string>();

  if (!Array.isArray(value)) {
    issues.push('fixtures must be an array');

    return fixtures;
  }

  const knownSources = new Set(Object.keys(sources));
  const values: readonly unknown[] = value;

  for (let index = 0; index < values.length; index += 1) {
    const fixture = values[index];
    const parsed = validateFixture(index, fixture, knownSources, issues);

    recordFixtureName(parsed.name, index, seenNames, issues);
    fixtures.push(parsed);
  }

  return fixtures;
}

export function parseCorpusManifest(value: unknown): CorpusManifest {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new Error('Corpus manifest is invalid: root must be an object');
  }

  if (value['schemaVersion'] !== 1) {
    issues.push('schemaVersion must be 1');
  }

  const format = parseFormatField(value['format'], issues);
  const description = requireString(value['description'], 'description', issues);
  const sources = parseSources(value['sources'], issues);
  const fixtures = parseFixtures(value['fixtures'], sources, issues);

  if (issues.length > 0) {
    throw new Error(`Corpus manifest is invalid:\n  - ${issues.join('\n  - ')}`);
  }

  return { schemaVersion: 1, format, description, sources, fixtures };
}

function repoSlug(repositoryUrl: string): string {
  const match = GITHUB_REPO_RE.exec(repositoryUrl);

  if (match === null) {
    throw new Error(`Unsupported repository URL (expected https://github.com/owner/repo): ${repositoryUrl}`);
  }

  const owner = match[1];
  const repo = match[2];

  if (owner === undefined || repo === undefined) {
    throw new Error(`Unsupported repository URL (expected https://github.com/owner/repo): ${repositoryUrl}`);
  }

  return `${owner}/${repo}`;
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function buildCorpusFixtureUrl(source: CorpusSource | undefined, upstreamName: string): string {
  if (source === undefined) {
    throw new Error('Cannot build corpus fixture URL for an undefined source');
  }

  if (hasPathTraversal(upstreamName)) {
    throw new Error(`Cannot build corpus fixture URL for unsafe upstream path: ${upstreamName}`);
  }

  const slug = repoSlug(source.repository);
  const rootPrefix = source.fixtureRoot === '.' ? '' : `${encodePath(source.fixtureRoot)}/`;

  return `https://raw.githubusercontent.com/${slug}/${source.commit}/${rootPrefix}${encodePath(upstreamName)}`;
}

export function sha256Hex(buffer: Uint8Array): string {
  const hash = createHash('sha256');

  hash.update(buffer);

  return hash.digest('hex');
}

export function loadCachedCorpusFixtures(corpusDir: string): LoadedCorpusFixtures {
  const manifest = parseCorpusManifest(JSON.parse(readFileSync(join(corpusDir, 'manifest.json'), 'utf8')));
  const cacheDir = join(corpusDir, '.cache');
  const cached: CachedCorpusFixture[] = [];

  for (const entry of manifest.fixtures) {
    const absolutePath = join(cacheDir, entry.name);

    if (!existsSync(absolutePath)) continue;

    const info = statSync(absolutePath);

    if (!info.isFile()) continue;

    const bytes = new Uint8Array(readFileSync(absolutePath));

    cached.push({
      entry,
      bytes,
      absolutePath,
      actualSha256: sha256Hex(bytes),
      actualBytes: bytes.byteLength,
    });
  }

  return { manifest, cached };
}
