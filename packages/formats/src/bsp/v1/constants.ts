export const BSP_PROJECT_MIME_V1 = 'application/vnd.broadset.project';
export const BSP_JSON_MIME_V1 = 'application/vnd.broadset.project+json';

export const BSP_MANIFEST_PATH_V1 = 'manifest.json';
export const BSP_PROJECT_PATH_V1 = 'project.json';
export const BSP_BLOB_PATH_PREFIX_V1 = 'blobs/sha256/';

export const BSP_PACKAGE_LIMITS_V1: Readonly<{
  maxInputBytes: number;
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxExpansionRatio: number;
  maxPathDepth: number;
}> = Object.freeze({
  // Fixed browser-memory envelope for the first package codec.
  maxInputBytes: 256 * 1024 * 1024,
  maxEntries: 4096,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxExpansionRatio: 100,
  maxPathDepth: 8,
});

export const BSP_MAX_DIAGNOSTICS_V1 = 64;
