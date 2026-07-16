import type { projectFormatV1 } from '@broadset/model';

export interface BspPackageEntryV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly digest: projectFormatV1.Sha256Digest;
  readonly role: 'project' | 'blob' | 'preview' | 'history';
}

export interface BspPackageToolV1 {
  readonly name: string;
  readonly version: string;
  readonly build?: string | undefined;
}

export interface BspPackageManifestV1 {
  readonly format: 'broadset-project-package';
  readonly version: 1;
  readonly tool: BspPackageToolV1;
  readonly project: BspPackageEntryV1;
  readonly entries: readonly BspPackageEntryV1[];
}

export interface ExportBspPackageOptionsV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
}

export type ExportBspPackageResultV1 =
  | {
      readonly status: 'exported';
      readonly bytes: Uint8Array;
      readonly diagnostics: readonly projectFormatV1.Diagnostic[];
    }
  | { readonly status: 'failed'; readonly diagnostics: readonly projectFormatV1.Diagnostic[] };

export interface LoadBspPackageOptionsV1 {
  readonly lastValidProject?: projectFormatV1.BroadsetProjectV1 | undefined;
}

export type LoadBspPackageResultV1 =
  | {
      readonly status: 'loaded';
      readonly project: projectFormatV1.BroadsetProjectV1;
      readonly blobs: ReadonlyMap<projectFormatV1.Sha256Digest, Uint8Array>;
      readonly diagnostics: readonly projectFormatV1.Diagnostic[];
    }
  | {
      readonly status: 'quarantined';
      readonly diagnostics: readonly projectFormatV1.Diagnostic[];
      readonly originalBytes: Uint8Array;
      readonly lastValidProject?: projectFormatV1.BroadsetProjectV1 | undefined;
    };
