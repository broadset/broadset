import { Unzip, type UnzipFile, UnzipInflate } from 'fflate';

import { parseZipDirectory, type ZipDirectoryEntry } from './zip-directory';

interface BoundedZipLimits {
  readonly maxInputBytes: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  readonly maxExpansionRatio: number;
  readonly maxPathDepth: number;
}

export type BoundedZipIssueCode =
  | 'input-size-limit'
  | 'entry-count-limit'
  | 'entry-size-limit'
  | 'total-size-limit'
  | 'expansion-ratio-limit'
  | 'invalid-path'
  | 'path-depth-limit'
  | 'duplicate-path'
  | 'encrypted-entry'
  | 'unsupported-compression'
  | 'declared-size-mismatch'
  | 'checksum-mismatch'
  | 'malformed-archive';

interface BoundedZipIssue {
  readonly code: BoundedZipIssueCode;
  readonly path: string | undefined;
  readonly declaredBytes: number | undefined;
}

interface BoundedZipReadResult {
  readonly status: 'read' | 'rejected';
  readonly entries: ReadonlyMap<string, Uint8Array>;
  readonly issues: readonly BoundedZipIssue[];
}

interface ExtractionState {
  readonly entries: Map<string, Uint8Array>;
  readonly issues: BoundedZipIssue[];
  readonly seenPaths: Set<string>;
  /** Running retained-output total; mutation is scoped to one extraction. */
  actualTotal: number;
  /** Stops archive input after an actual-output boundary violation. */
  stopped: boolean;
  /** Distinguishes hostile local-record smuggling from an entry-local cap. */
  fatalMalformed: boolean;
}

export function readBoundedZip(input: {
  readonly bytes: Uint8Array;
  readonly limits: BoundedZipLimits;
}): BoundedZipReadResult {
  if (input.bytes.byteLength > input.limits.maxInputBytes) {
    return rejected(issue('input-size-limit', undefined, input.bytes.byteLength));
  }

  const directory = parseZipDirectory(input.bytes);

  if (directory === undefined) return rejected(issue('malformed-archive', undefined, undefined));

  const issues: BoundedZipIssue[] = [];
  const allowed = selectAllowedEntries(directory, input.limits, issues);

  try {
    return extractAllowedEntries({
      bytes: input.bytes,
      limits: input.limits,
      allowed,
      declaredPaths: new Set(directory.map(({ name }) => name.normalize('NFC'))),
      issues,
    });
  } catch {
    return rejected(issue('malformed-archive', undefined, undefined));
  }
}

function selectAllowedEntries(
  directory: readonly ZipDirectoryEntry[],
  limits: BoundedZipLimits,
  issues: BoundedZipIssue[],
): ReadonlyMap<string, ZipDirectoryEntry> {
  const acceptedPaths = new Set<string>();
  const allowed = new Map<string, ZipDirectoryEntry>();
  let declaredTotal = 0;

  for (let index = 0; index < directory.length; index += 1) {
    const entry = directory[index];

    if (entry === undefined) continue;

    const rejection = declaredEntryRejection({ entry, index, declaredTotal, limits, acceptedPaths });

    if (rejection !== undefined) {
      issues.push(issue(rejection, entry.name, entry.originalBytes));
      continue;
    }

    const canonicalPath = entry.name.normalize('NFC');

    acceptedPaths.add(canonicalPath);
    allowed.set(canonicalPath, entry);
    declaredTotal += entry.originalBytes;
  }

  return allowed;
}

function declaredEntryRejection(input: {
  readonly entry: ZipDirectoryEntry;
  readonly index: number;
  readonly declaredTotal: number;
  readonly limits: BoundedZipLimits;
  readonly acceptedPaths: ReadonlySet<string>;
}): BoundedZipIssueCode | undefined {
  if (input.index >= input.limits.maxEntries) return 'entry-count-limit';
  if (input.entry.encrypted) return 'encrypted-entry';
  if (input.entry.symlink) return 'invalid-path';
  if (input.entry.compression !== 0 && input.entry.compression !== 8) return 'unsupported-compression';

  const pathIssue = validatePath(input.entry.name, input.limits.maxPathDepth, input.acceptedPaths);

  if (pathIssue !== undefined) return pathIssue;
  if (input.entry.originalBytes > input.limits.maxEntryBytes) return 'entry-size-limit';
  if (input.declaredTotal > input.limits.maxTotalBytes - input.entry.originalBytes) return 'total-size-limit';

  if (exceedsExpansionRatio(input.entry.originalBytes, input.entry.compressedBytes, input.limits.maxExpansionRatio)) {
    return 'expansion-ratio-limit';
  }

  return undefined;
}

function extractAllowedEntries(input: {
  readonly bytes: Uint8Array;
  readonly limits: BoundedZipLimits;
  readonly allowed: ReadonlyMap<string, ZipDirectoryEntry>;
  readonly declaredPaths: ReadonlySet<string>;
  readonly issues: BoundedZipIssue[];
}): BoundedZipReadResult {
  const state: ExtractionState = {
    entries: new Map(),
    issues: input.issues,
    seenPaths: new Set(),
    actualTotal: 0,
    stopped: false,
    fatalMalformed: false,
  };
  const unzip = new Unzip((file): void => {
    handleFile({
      file,
      limits: input.limits,
      allowed: input.allowed,
      declaredPaths: input.declaredPaths,
      state,
    });
  });

  unzip.register(UnzipInflate);

  // Keeping compressed input chunks small also bounds each synchronous
  // DEFLATE emission, so an over-limit stream is stopped without retention.
  const compressedChunkBytes = 1024;
  const unsignedDescriptorOffsets: number[] = [];

  input.allowed.forEach((entry) => {
    if (entry.unsignedDescriptorOffset !== undefined) unsignedDescriptorOffsets.push(entry.unsignedDescriptorOffset);
  });

  pushArchiveBytes({
    unzip,
    bytes: input.bytes,
    chunkBytes: compressedChunkBytes,
    unsignedDescriptorOffsets,
    state,
  });

  if (state.fatalMalformed) return { status: 'rejected', entries: new Map(), issues: state.issues };

  if (!state.stopped && state.entries.size !== input.allowed.size) {
    return rejected(issue('malformed-archive', undefined, undefined));
  }

  return { status: 'read', entries: state.entries, issues: state.issues };
}

function handleFile(input: {
  readonly file: UnzipFile;
  readonly limits: BoundedZipLimits;
  readonly allowed: ReadonlyMap<string, ZipDirectoryEntry>;
  readonly declaredPaths: ReadonlySet<string>;
  readonly state: ExtractionState;
}): void {
  const canonicalPath = input.file.name.normalize('NFC');
  const expected = input.allowed.get(canonicalPath);

  if (input.state.stopped) {
    ignoreFile(input.file);

    return;
  }

  if (expected === undefined && input.declaredPaths.has(canonicalPath)) {
    ignoreFile(input.file);

    return;
  }

  if (expected === undefined || input.state.seenPaths.has(canonicalPath)) {
    input.state.issues.push(issue('malformed-archive', input.file.name, undefined));
    input.state.fatalMalformed = true;
    input.state.stopped = true;
    ignoreFile(input.file);

    return;
  }

  input.state.seenPaths.add(canonicalPath);

  const output = new Uint8Array(expected.originalBytes);
  let entryBytes = 0;
  let checksum = 0xffff_ffff;

  input.file.ondata = (error, chunk, final): void => {
    if (error !== null) throw error;
    if (input.state.stopped) return;

    const nextEntryBytes = entryBytes + chunk.byteLength;

    if (nextEntryBytes > expected.originalBytes) {
      input.state.issues.push(issue('declared-size-mismatch', input.file.name, expected.originalBytes));
      input.state.stopped = true;
      input.file.terminate();

      return;
    }

    const limitIssue = actualEntryRejection({
      nextEntryBytes,
      chunkBytes: chunk.byteLength,
      expected,
      limits: input.limits,
      state: input.state,
    });

    if (limitIssue !== undefined) {
      input.state.issues.push(issue(limitIssue, input.file.name, nextEntryBytes));
      input.state.stopped = true;
      input.file.terminate();

      return;
    }

    output.set(chunk, entryBytes);
    entryBytes = nextEntryBytes;
    input.state.actualTotal += chunk.byteLength;
    checksum = updateCrc32(checksum, chunk);

    if (final) {
      finalizeEntry({ path: input.file.name, output, entryBytes, checksum, expected, state: input.state });
    }
  };

  input.file.start();
}

function pushArchiveBytes(input: {
  readonly unzip: Unzip;
  readonly bytes: Uint8Array;
  readonly chunkBytes: number;
  readonly unsignedDescriptorOffsets: readonly number[];
  readonly state: ExtractionState;
}): void {
  const descriptorSignature = new Uint8Array([0x50, 0x4b, 0x07, 0x08]);
  const offsets = [...input.unsignedDescriptorOffsets].sort((left, right) => left - right);
  let sourceOffset = 0;

  for (const injectionOffset of offsets) {
    if (input.state.stopped) break;

    pushArchiveRange(input, sourceOffset, injectionOffset, false);

    if (isExtractionStopped(input.state)) break;

    input.unzip.push(descriptorSignature, false);
    sourceOffset = injectionOffset;
  }

  if (!isExtractionStopped(input.state)) pushArchiveRange(input, sourceOffset, input.bytes.byteLength, true);
}

function isExtractionStopped(state: ExtractionState): boolean {
  return state.stopped;
}

function pushArchiveRange(
  input: {
    readonly unzip: Unzip;
    readonly bytes: Uint8Array;
    readonly chunkBytes: number;
    readonly state: ExtractionState;
  },
  start: number,
  end: number,
  finalRange: boolean,
): void {
  for (let offset = start; offset < end && !input.state.stopped; offset += input.chunkBytes) {
    const chunkEnd = Math.min(end, offset + input.chunkBytes);

    input.unzip.push(input.bytes.subarray(offset, chunkEnd), finalRange && chunkEnd === input.bytes.byteLength);
  }
}

function actualEntryRejection(input: {
  readonly nextEntryBytes: number;
  readonly chunkBytes: number;
  readonly expected: ZipDirectoryEntry;
  readonly limits: BoundedZipLimits;
  readonly state: ExtractionState;
}): BoundedZipIssueCode | undefined {
  if (input.nextEntryBytes > input.limits.maxEntryBytes) return 'entry-size-limit';
  if (input.state.actualTotal > input.limits.maxTotalBytes - input.chunkBytes) return 'total-size-limit';

  if (exceedsExpansionRatio(input.nextEntryBytes, input.expected.compressedBytes, input.limits.maxExpansionRatio)) {
    return 'expansion-ratio-limit';
  }

  return undefined;
}

function finalizeEntry(input: {
  readonly path: string;
  readonly output: Uint8Array;
  readonly entryBytes: number;
  readonly checksum: number;
  readonly expected: ZipDirectoryEntry;
  readonly state: ExtractionState;
}): void {
  if (input.entryBytes !== input.expected.originalBytes) {
    input.state.issues.push(issue('declared-size-mismatch', input.path, input.expected.originalBytes));
    input.state.actualTotal -= input.entryBytes;

    return;
  }

  if ((input.checksum ^ 0xffff_ffff) >>> 0 !== input.expected.crc32) {
    input.state.issues.push(issue('checksum-mismatch', input.path, input.expected.originalBytes));
    input.state.actualTotal -= input.entryBytes;

    return;
  }

  input.state.entries.set(input.path, input.output);
}

function validatePath(
  path: string,
  maxDepth: number,
  acceptedPaths: ReadonlySet<string>,
): 'invalid-path' | 'path-depth-limit' | 'duplicate-path' | undefined {
  if (path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return 'invalid-path';
  if (isDriveAbsolutePath(path)) return 'invalid-path';

  const segments = path.split('/');
  const normalizedPath = path.normalize('NFC');

  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) return 'invalid-path';
  if (segments.length > maxDepth) return 'path-depth-limit';
  if (acceptedPaths.has(normalizedPath)) return 'duplicate-path';
  if (path !== normalizedPath) return 'invalid-path';

  return undefined;
}

function isDriveAbsolutePath(path: string): boolean {
  if (path.length < 3 || path.charAt(1) !== ':' || path.charAt(2) !== '/') return false;

  const code = path.charCodeAt(0);

  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
}

function exceedsExpansionRatio(originalBytes: number, compressedBytes: number, maxRatio: number): boolean {
  if (originalBytes === 0) return false;
  if (compressedBytes === 0) return true;

  return originalBytes / compressedBytes > maxRatio;
}

function ignoreFile(file: UnzipFile): void {
  file.ondata = (error): void => {
    if (error !== null) throw error;
  };
}

function updateCrc32(current: number, bytes: Uint8Array): number {
  let checksum = current;

  for (let index = 0; index < bytes.byteLength; index += 1) {
    checksum ^= bytes[index] ?? 0;

    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb8_8320 : 0);
    }
  }

  return checksum >>> 0;
}

function issue(
  code: BoundedZipIssueCode,
  path: string | undefined,
  declaredBytes: number | undefined,
): BoundedZipIssue {
  return { code, path, declaredBytes };
}

function rejected(singleIssue: BoundedZipIssue): BoundedZipReadResult {
  return { status: 'rejected', entries: new Map(), issues: [singleIssue] };
}
