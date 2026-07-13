import { projectFormatV1 } from '@broadset/model';

interface ProjectStorageV1 {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

interface StoredProjectResultV1 {
  readonly project: projectFormatV1.BroadsetProjectV1;
  readonly diagnostics: readonly projectFormatV1.Diagnostic[];
  readonly quarantinedText?: string | undefined;
}

function storageDiagnostic(message: string): projectFormatV1.Diagnostic {
  return { code: 'storage-unavailable', severity: 'error', message };
}

export async function loadStoredProjectV1(options: {
  readonly storage: ProjectStorageV1;
  readonly storageKey: string;
  readonly fallbackProject: projectFormatV1.BroadsetProjectV1;
}): Promise<StoredProjectResultV1> {
  let originalText: string | null;

  try {
    originalText = options.storage.getItem(options.storageKey);
  } catch (error) {
    return {
      project: options.fallbackProject,
      diagnostics: [storageDiagnostic(error instanceof Error ? error.message : 'Project storage is unavailable')],
    };
  }

  if (originalText === null) return { project: options.fallbackProject, diagnostics: [] };

  const result = await projectFormatV1.loadProjectV1Json(originalText, {
    lastValidProject: options.fallbackProject,
  });

  return result.status === 'loaded' ?
      { project: result.project, diagnostics: result.diagnostics }
    : {
        project: options.fallbackProject,
        diagnostics: result.diagnostics,
        quarantinedText: result.originalText,
      };
}

export function saveStoredProjectV1(options: {
  readonly storage: ProjectStorageV1;
  readonly storageKey: string;
  readonly project: projectFormatV1.BroadsetProjectV1;
}): boolean {
  try {
    options.storage.setItem(options.storageKey, projectFormatV1.canonicalizeProjectV1(options.project));

    return true;
  } catch {
    return false;
  }
}
