import type { projectFormatV1 } from '@broadset/model';

import { loadFormats } from './formats-loader';

const STORAGE_PREFIX_V1 = 'bsp-v1-base64:';
const BASE64_CHUNK_BYTES = 32 * 1024;
const EMPTY_BYTES = new Uint8Array();

interface ProjectStorageV1 {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

interface StoredProjectResultV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly diagnostics: readonly projectFormatV1.Diagnostic[];
  readonly quarantinedBytes?: Uint8Array | undefined;
}

type StoredPackageDecodeResultV1 =
  | { readonly status: 'decoded'; readonly bytes: Uint8Array }
  | {
      readonly status: 'rejected';
      readonly bytes: Uint8Array;
      readonly diagnostics: readonly projectFormatV1.Diagnostic[];
    };

function storageDiagnostic(code: string, message: string): projectFormatV1.Diagnostic {
  return { code, severity: 'error', message };
}

function fallbackResult(options: {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
  readonly diagnostics: readonly projectFormatV1.Diagnostic[];
  readonly quarantinedBytes?: Uint8Array | undefined;
}): StoredProjectResultV1 {
  return {
    project: options.project,
    blobs: options.blobs,
    diagnostics: options.diagnostics,
    ...(options.quarantinedBytes === undefined ? {} : { quarantinedBytes: options.quarantinedBytes }),
  };
}

function isCanonicalBase64(input: string): boolean {
  if (input.length % 4 !== 0) return false;

  let paddingStarted = false;

  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    const isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const isDigit = code >= 48 && code <= 57;

    if (isLetter || isDigit || code === 43 || code === 47) {
      if (paddingStarted) return false;

      continue;
    }

    if (code !== 61 || index < input.length - 2) return false;

    paddingStarted = true;
  }

  return true;
}

function decodeStoredPackage(text: string, maxInputBytes: number): StoredPackageDecodeResultV1 {
  const maxStoredBase64Length = Math.ceil((maxInputBytes * 4) / 3) + 4;
  const encoded = text.startsWith(STORAGE_PREFIX_V1) ? text.slice(STORAGE_PREFIX_V1.length) : null;

  if (encoded === null || encoded.length > maxStoredBase64Length || !isCanonicalBase64(encoded)) {
    const retained = text.length <= maxStoredBase64Length ? new TextEncoder().encode(text) : EMPTY_BYTES;

    return {
      status: 'rejected',
      bytes: retained,
      diagnostics: [storageDiagnostic('bsp.storage.invalid-encoding', 'Stored project is not a bounded BSP package')],
    };
  }

  try {
    const binary = atob(encoded);

    if (binary.length > maxInputBytes) {
      return {
        status: 'rejected',
        bytes: EMPTY_BYTES,
        diagnostics: [storageDiagnostic('bsp.storage.input-size-limit', 'Stored BSP package exceeds the size limit')],
      };
    }

    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);

    return { status: 'decoded', bytes };
  } catch (error: unknown) {
    return {
      status: 'rejected',
      bytes: new TextEncoder().encode(text),
      diagnostics: [
        storageDiagnostic(
          'bsp.storage.invalid-encoding',
          error instanceof Error ? error.message : 'Stored BSP package encoding is invalid',
        ),
      ],
    };
  }
}

function encodeStoredPackage(bytes: Uint8Array): string {
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const end = Math.min(offset + BASE64_CHUNK_BYTES, bytes.length);
    let chunk = '';

    for (let index = offset; index < end; index += 1) chunk += String.fromCharCode(bytes[index] ?? 0);

    chunks.push(chunk);
  }

  return `${STORAGE_PREFIX_V1}${btoa(chunks.join(''))}`;
}

export async function loadStoredProjectV1(options: {
  readonly storage: ProjectStorageV1;
  readonly storageKey: string;
  readonly fallbackProject: projectFormatV1.BroadsetProjectV1;
  readonly fallbackBlobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}): Promise<StoredProjectResultV1> {
  let storedText: string | null;

  try {
    storedText = options.storage.getItem(options.storageKey);
  } catch (error: unknown) {
    return fallbackResult({
      project: options.fallbackProject,
      blobs: options.fallbackBlobs,
      diagnostics: [
        storageDiagnostic(
          'storage-unavailable',
          error instanceof Error ? error.message : 'Project storage is unavailable',
        ),
      ],
    });
  }

  if (storedText === null) {
    return fallbackResult({ project: options.fallbackProject, blobs: options.fallbackBlobs, diagnostics: [] });
  }

  let formats: Awaited<ReturnType<typeof loadFormats>>;

  try {
    formats = await loadFormats();
  } catch (error: unknown) {
    return fallbackResult({
      project: options.fallbackProject,
      blobs: options.fallbackBlobs,
      diagnostics: [
        storageDiagnostic(
          'storage-unavailable',
          error instanceof Error ? error.message : 'Native project package support is unavailable',
        ),
      ],
      quarantinedBytes: EMPTY_BYTES,
    });
  }

  const decoded = decodeStoredPackage(storedText, formats.BSP_PACKAGE_LIMITS_V1.maxInputBytes);

  if (decoded.status === 'rejected') {
    return fallbackResult({
      project: options.fallbackProject,
      blobs: options.fallbackBlobs,
      diagnostics: decoded.diagnostics,
      quarantinedBytes: decoded.bytes,
    });
  }

  const result = await formats.loadBspPackageV1(decoded.bytes, { lastValidProject: options.fallbackProject });

  return result.status === 'loaded' ?
      { project: result.project, blobs: result.blobs, diagnostics: result.diagnostics }
    : fallbackResult({
        project: options.fallbackProject,
        blobs: options.fallbackBlobs,
        diagnostics: result.diagnostics,
        quarantinedBytes: result.originalBytes,
      });
}

export async function saveStoredProjectV1(options: {
  readonly storage: ProjectStorageV1;
  readonly storageKey: string;
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}): Promise<boolean> {
  try {
    const formats = await loadFormats();
    const result = await formats.exportBspPackageV1({ project: options.project, blobs: options.blobs });

    if (result.status !== 'exported') return false;

    options.storage.setItem(options.storageKey, encodeStoredPackage(result.bytes));

    return true;
  } catch {
    return false;
  }
}
